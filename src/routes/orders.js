const express = require('express');
const { body, validationResult } = require('express-validator');
const axios = require('axios');
const Order = require('../models/Order');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
const PRODUCT_SERVICE_URL = process.env.PRODUCT_SERVICE_URL || 'http://localhost:3002';

/**
 * @swagger
 * /orders:
 *   post:
 *     summary: Create a new order
 *     description: Validates the user token via user-service and validates each product via product-service.
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [items]
 *             properties:
 *               items:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required: [productId, quantity]
 *                   properties:
 *                     productId:
 *                       type: string
 *                     quantity:
 *                       type: integer
 *                       minimum: 1
 *               shippingAddress:
 *                 type: object
 *                 properties:
 *                   street:
 *                     type: string
 *                   city:
 *                     type: string
 *                   country:
 *                     type: string
 *                   postalCode:
 *                     type: string
 *               notes:
 *                 type: string
 *     responses:
 *       201:
 *         description: Order created successfully
 *       400:
 *         description: Validation error or product not found/out of stock
 *       401:
 *         description: Unauthorized
 *       503:
 *         description: Product service unavailable
 */
router.post(
  '/',
  authenticate,
  [
    body('items').isArray({ min: 1 }).withMessage('At least one item is required'),
    body('items.*.productId').notEmpty().withMessage('Product ID is required'),
    body('items.*.quantity').isInt({ min: 1 }).withMessage('Quantity must be at least 1'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    try {
      // Validate each product via product-service (inter-service call)
      const resolvedItems = [];
      let totalAmount = 0;

      for (const item of req.body.items) {
        let productData;
        try {
          const { data } = await axios.get(`${PRODUCT_SERVICE_URL}/products/${item.productId}`, { timeout: 5000 });
          productData = data.product;
        } catch (err) {
          if (err.response?.status === 404) {
            return res.status(400).json({ error: `Product not found: ${item.productId}` });
          }
          return res.status(503).json({ error: 'Product service unavailable' });
        }

        if (productData.stock < item.quantity) {
          return res.status(400).json({ error: `Insufficient stock for product: ${productData.name}` });
        }

        const linePrice = productData.price * item.quantity;
        totalAmount += linePrice;
        resolvedItems.push({
          productId: productData._id,
          productName: productData.name,
          price: productData.price,
          quantity: item.quantity,
        });
      }

      const order = await Order.create({
        userId: req.user.userId,
        userEmail: req.user.email,
        items: resolvedItems,
        totalAmount,
        shippingAddress: req.body.shippingAddress || {},
        notes: req.body.notes || '',
      });

      res.status(201).json({ message: 'Order created successfully', order });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to create order' });
    }
  }
);

/**
 * @swagger
 * /orders:
 *   get:
 *     summary: Get all orders for the authenticated user
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of user orders
 */
router.get('/', authenticate, async (req, res) => {
  try {
    const orders = await Order.find({ userId: req.user.userId }).sort({ createdAt: -1 });
    res.json({ orders });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

/**
 * @swagger
 * /orders/{id}:
 *   get:
 *     summary: Get a single order by ID
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Order details
 *       403:
 *         description: Not your order
 *       404:
 *         description: Order not found
 */
router.get('/:id', authenticate, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (order.userId !== req.user.userId && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied' });
    }
    res.json({ order });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch order' });
  }
});

/**
 * @swagger
 * /orders/{id}/status:
 *   put:
 *     summary: Update order status (admin only)
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [status]
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [pending, confirmed, processing, shipped, delivered, cancelled]
 *     responses:
 *       200:
 *         description: Status updated
 */
router.put(
  '/:id/status',
  authenticate,
  [body('status').isIn(['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'])],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    try {
      const order = await Order.findById(req.params.id);
      if (!order) return res.status(404).json({ error: 'Order not found' });

      // Allow owner to cancel their own order; only admin can set other statuses
      if (req.body.status === 'cancelled' && order.userId === req.user.userId) {
        order.status = 'cancelled';
      } else if (req.user.role === 'admin') {
        order.status = req.body.status;
      } else {
        return res.status(403).json({ error: 'Only admins can update order status' });
      }

      await order.save();
      res.json({ message: 'Order status updated', order });
    } catch (err) {
      res.status(500).json({ error: 'Failed to update order status' });
    }
  }
);

module.exports = router;

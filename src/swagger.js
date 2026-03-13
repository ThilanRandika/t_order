const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Order Service API',
      version: '1.0.0',
      description:
        'Manages ShopEase orders. Calls user-service to authenticate users and product-service to validate products and stock before creating orders.',
    },
    servers: [{ url: 'http://localhost:3003', description: 'Local development' }],
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      },
    },
    tags: [{ name: 'Orders', description: 'Order management endpoints' }],
  },
  apis: ['./src/routes/*.js'],
};

module.exports = { swaggerSpec: swaggerJsdoc(options) };

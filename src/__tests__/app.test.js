jest.mock('mongoose', () => {
  const actual = jest.requireActual('mongoose');
  return {
    ...actual,
    connect: jest.fn().mockResolvedValue(true),
  };
});

jest.mock('../models/Order', () => {
  return {
    find: jest.fn().mockReturnThis(),
    sort: jest.fn().mockResolvedValue([{ _id: 'ord1', totalAmount: 150, status: 'pending' }]),
    findById: jest.fn().mockResolvedValue({ _id: 'ord1', userId: 'user1', totalAmount: 150, status: 'pending' }),
  };
});

// Mock axios for inter-service calls (auth verify and product check)
jest.mock('axios', () => {
  return {
    get: jest.fn().mockImplementation((url) => {
      if (url.includes('/auth/verify')) {
        return Promise.resolve({ data: { user: { userId: 'user1', role: 'customer' } } });
      }
      return Promise.resolve({ data: {} });
    }),
  };
});

console.log = jest.fn();

const request = require('supertest');
const app = require('../index');

describe('Order Service APIs', () => {
  it('GET /health - should return 200 and health status', async () => {
    const res = await request(app).get('/health');
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.service).toBe('order-service');
  });

  it('GET /orders - should return list of orders for authenticated user', async () => {
    const res = await request(app)
      .get('/orders')
      .set('Authorization', 'Bearer dummy_token');
    
    expect(res.statusCode).toBe(200);
    expect(res.body.orders).toBeDefined();
    expect(res.body.orders.length).toBe(1);
    expect(res.body.orders[0]._id).toBe('ord1');
  });

  it('POST /orders - should return 401 if unauthorized', async () => {
    const res = await request(app).post('/orders').send({});
    expect(res.statusCode).toBe(401);
  });
});

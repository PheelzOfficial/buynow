import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import request from 'supertest';
import bcrypt from 'bcryptjs';

process.env.JWT_SECRET = 'test-secret-with-at-least-32-characters-only';
const { app } = await import('../app.js');
const { User, Category, Product, Address, Order, Cart } = await import('../src/database/models.js');
const { token } = await import('../src/modules/auth/token.service.js');

let db, buyer, admin, address;
const as = (user) => ({ Authorization: `Bearer ${token(user)}` });
const image = 'https://res.cloudinary.com/demo/image/upload/sample.jpg';

before(async () => {
  db = await MongoMemoryReplSet.create({
    binary: process.env.MONGOMS_SYSTEM_BINARY
      ? { systemBinary: process.env.MONGOMS_SYSTEM_BINARY, version: '6.0.18' }
      : undefined,
    replSet: { count: 1, storageEngine: 'wiredTiger' },
  });
  await mongoose.connect(db.getUri());
  await Promise.all([User.init(), Order.init(), Cart.init()]);
  const password = await bcrypt.hash('SecureTestPass123', 4);
  buyer = await User.create({
    username: 'Buyer',
    email: 'b@example.com',
    password,
    verified: true,
  });
  admin = await User.create({
    username: 'Admin',
    email: 'a@example.com',
    password,
    verified: true,
    role: 'admin',
  });
  await Category.create({ _id: 'footwear', name: 'Footwear', image });
  address = await Address.create({
    userId: buyer._id,
    name: 'Buyer',
    phone: '+2348012345678',
    line1: '12 Admiralty Way',
    city: 'Lekki',
    state: 'Lagos',
    postalCode: '106104',
    country: 'NG',
  });
});
after(async () => {
  await mongoose.disconnect();
  await db?.stop();
});

const shoe = {
  id: 'SHOE01',
  categoryId: 'footwear',
  name: 'Runner',
  description: 'A running shoe in EU sizes',
  images: [image],
  price: 20000,
  sizes: [
    { size: '38', stock: 10 },
    { size: '39', stock: 5 },
    { size: '40', stock: 1 },
  ],
};
const sizeStock = async (size) =>
  (await Product.findById('SHOE01')).sizes.find((s) => s.size === size)?.stock;
const total = async () => (await Product.findById('SHOE01')).stock;
const setCart = (items, user = buyer) =>
  request(app).put('/api/v1/cart').set(as(user)).send({ items });
const placeOrder = (user = buyer) =>
  request(app).post('/api/v1/orders').set(as(user)).send({
    addressId: address.id,
    paymentMethod: 'cash_on_delivery',
    idempotencyKey: crypto.randomUUID(),
  });

beforeEach(async () => {
  await Promise.all([Product.deleteMany({}), Order.deleteMany({}), Cart.deleteMany({})]);
  await request(app).post('/api/v1/admin/products').set(as(admin)).send(shoe).expect(201);
});

test('admin creates a sized product; total stock is the sum of its sizes', async () => {
  const r = await request(app).get('/api/v1/products/SHOE01').expect(200);
  assert.equal(r.body.data.stock, 16);
  assert.deepEqual(
    r.body.data.sizes.map((s) => [s.size, s.stock]),
    [
      ['38', 10],
      ['39', 5],
      ['40', 1],
    ],
  );

  const both = await request(app)
    .post('/api/v1/admin/products')
    .set(as(admin))
    .send({ ...shoe, id: 'SHOE02', stock: 99 })
    .expect(422);
  assert.equal(both.body.error.details[0].field, 'stock');
  await request(app)
    .post('/api/v1/admin/products')
    .set(as(admin))
    .send({
      ...shoe,
      id: 'SHOE03',
      sizes: [
        { size: '38', stock: 1 },
        { size: '38', stock: 2 },
      ],
    })
    .expect(422);
});

test('cart requires a valid size with enough stock for sized products', async () => {
  let r = await setCart([{ productId: 'SHOE01', quantity: 1 }]).expect(422);
  assert.equal(r.body.error.code, 'SIZE_REQUIRED');
  r = await setCart([{ productId: 'SHOE01', size: '47', quantity: 1 }]).expect(422);
  assert.equal(r.body.error.code, 'INVALID_SIZE');
  r = await setCart([{ productId: 'SHOE01', size: '39', quantity: 6 }]).expect(409);
  assert.equal(r.body.error.code, 'INSUFFICIENT_STOCK', '39 has only 5 even though 38 has 10');

  // The same shoe in two sizes is two separate lines.
  r = await setCart([
    { productId: 'SHOE01', size: '38', quantity: 2 },
    { productId: 'SHOE01', size: '39', quantity: 1 },
  ]).expect(200);
  const cart = await request(app).get('/api/v1/cart').set(as(buyer)).expect(200);
  assert.deepEqual(
    cart.body.data.items.map((i) => [i.size, i.quantity]),
    [
      ['38', 2],
      ['39', 1],
    ],
  );
  await setCart([
    { productId: 'SHOE01', size: '38', quantity: 1 },
    { productId: 'SHOE01', size: '38', quantity: 1 },
  ]).expect(422);
});

test('checkout takes stock from the chosen size, and cancelling puts it back there', async () => {
  await setCart([
    { productId: 'SHOE01', size: '38', quantity: 2 },
    { productId: 'SHOE01', size: '39', quantity: 1 },
  ]).expect(200);
  const order = (await placeOrder().expect(201)).body.data;
  assert.deepEqual(
    order.items.map((i) => [i.size, i.quantity]),
    [
      ['38', 2],
      ['39', 1],
    ],
  );
  assert.equal(await sizeStock('38'), 8);
  assert.equal(await sizeStock('39'), 4);
  assert.equal(await sizeStock('40'), 1);
  assert.equal(await total(), 13);

  await request(app).post(`/api/v1/orders/${order.id}/cancel`).set(as(buyer)).send({}).expect(200);
  assert.equal(await sizeStock('38'), 10);
  assert.equal(await sizeStock('39'), 5);
  assert.equal(await total(), 16);
});

test('two buyers cannot both get the last unit of a size', async () => {
  const second = await User.create({
    username: 'Second',
    email: `s-${crypto.randomUUID()}@example.com`,
    password: await bcrypt.hash('SecureTestPass123', 4),
    verified: true,
  });
  await Address.create({ ...address.toObject(), _id: undefined, userId: second._id });
  const secondAddress = await Address.findOne({ userId: second._id });
  await setCart([{ productId: 'SHOE01', size: '40', quantity: 1 }]).expect(200);
  await setCart([{ productId: 'SHOE01', size: '40', quantity: 1 }], second).expect(200);
  const results = await Promise.all([
    placeOrder(),
    request(app).post('/api/v1/orders').set(as(second)).send({
      addressId: secondAddress.id,
      paymentMethod: 'cash_on_delivery',
      idempotencyKey: crypto.randomUUID(),
    }),
  ]);
  assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
  assert.equal(await sizeStock('40'), 0);
  assert.equal(await total(), 15);
});

test('admin restocks sizes; stock cannot be set directly on a sized product', async () => {
  const r = await request(app)
    .patch('/api/v1/admin/products/SHOE01')
    .set(as(admin))
    .send({ stock: 50 })
    .expect(422);
  assert.equal(r.body.error.code, 'SIZED_PRODUCT_STOCK');

  const updated = await request(app)
    .patch('/api/v1/admin/products/SHOE01')
    .set(as(admin))
    .send({
      sizes: [
        { size: '38', stock: 3 },
        { size: '41', stock: 7 },
      ],
    })
    .expect(200);
  assert.equal(updated.body.data.stock, 10);
  assert.deepEqual(
    updated.body.data.sizes.map((s) => s.size),
    ['38', '41'],
  );
});

test('products without sizes keep working and reject a size', async () => {
  await request(app)
    .post('/api/v1/admin/products')
    .set(as(admin))
    .send({ ...shoe, id: 'BAG01', name: 'Bag', sizes: undefined, stock: 4 })
    .expect(201);
  const r = await setCart([{ productId: 'BAG01', size: 'M', quantity: 1 }]).expect(422);
  assert.equal(r.body.error.code, 'INVALID_SIZE');
  await setCart([{ productId: 'BAG01', quantity: 2 }]).expect(200);
  await placeOrder().expect(201);
  assert.equal((await Product.findById('BAG01')).stock, 2);
});

test('a cart line saved before sizes were added cannot check out without a size', async () => {
  await request(app)
    .post('/api/v1/admin/products')
    .set(as(admin))
    .send({ ...shoe, id: 'LATE01', sizes: undefined, stock: 4 })
    .expect(201);
  await setCart([{ productId: 'LATE01', quantity: 1 }]).expect(200);
  await request(app)
    .patch('/api/v1/admin/products/LATE01')
    .set(as(admin))
    .send({ sizes: [{ size: '42', stock: 4 }] })
    .expect(200);
  const r = await placeOrder().expect(422);
  assert.equal(r.body.error.code, 'SIZE_REQUIRED');
  assert.equal((await Product.findById('LATE01')).stock, 4, 'nothing was taken');
});

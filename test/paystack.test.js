import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import request from 'supertest';
import bcrypt from 'bcryptjs';

process.env.JWT_SECRET = 'test-secret-with-at-least-32-characters-only';
const SECRET = 'sk_test_fake_secret_for_unit_tests';
process.env.PAYSTACK_SECRET_KEY = SECRET;
const { app } = await import('../app.js');
const { User, Category, Product, Address, Order, Cart } = await import('../src/database/models.js');
const { token } = await import('../src/modules/auth/token.service.js');
const { expireUnpaidOrders } = await import('../src/modules/orders/order-payments.service.js');

let db, user, access, address;
const auth = () => ({ Authorization: `Bearer ${access}` });

// --- Fake Paystack -------------------------------------------------------------------------
const paystack = { calls: [], transactions: new Map(), failInit: false };
const realFetch = globalThis.fetch;
const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
function fakePaystack(url, options = {}) {
  const { pathname } = new URL(url);
  const body = options.body ? JSON.parse(options.body) : undefined;
  paystack.calls.push({ path: pathname, body, auth: options.headers?.Authorization });
  if (pathname === '/transaction/initialize') {
    if (paystack.failInit) return json(500, { status: false, message: 'down' });
    paystack.transactions.set(body.reference, {
      status: 'abandoned',
      amount: body.amount,
      currency: body.currency,
    });
    return json(200, {
      status: true,
      data: {
        authorization_url: `https://checkout.paystack.com/${body.reference}`,
        access_code: `ac_${body.reference}`,
        reference: body.reference,
      },
    });
  }
  const reference = decodeURIComponent(pathname.replace('/transaction/verify/', ''));
  const tx = paystack.transactions.get(reference);
  if (!tx) return json(400, { status: false, message: 'Transaction reference not found' });
  return json(200, {
    status: true,
    data: { ...tx, reference, paid_at: '2026-11-24T10:00:00.000Z', channel: 'card' },
  });
}
const payCustomer = (reference, overrides = {}) =>
  Object.assign(paystack.transactions.get(reference), { status: 'success', ...overrides });

// --- Fixtures ------------------------------------------------------------------------------
before(async () => {
  db = await MongoMemoryReplSet.create({
    binary: process.env.MONGOMS_SYSTEM_BINARY
      ? { systemBinary: process.env.MONGOMS_SYSTEM_BINARY, version: '6.0.18' }
      : undefined,
    replSet: { count: 1, storageEngine: 'wiredTiger' },
  });
  await mongoose.connect(db.getUri());
  await Promise.all([User.init(), Order.init(), Cart.init()]);
  user = await User.create({
    username: 'Payer',
    email: 'payer@example.com',
    password: await bcrypt.hash('SecureTestPass123', 4),
    verified: true,
  });
  access = token(user);
  await Category.create({
    _id: 'pay',
    name: 'Pay',
    image: 'https://res.cloudinary.com/demo/image/upload/sample.jpg',
  });
  address = await Address.create({
    userId: user._id,
    name: 'Payer',
    phone: '+2348012345678',
    line1: '12 Admiralty Way',
    city: 'Lekki',
    state: 'Lagos',
    postalCode: '106104',
    country: 'NG',
  });
  globalThis.fetch = fakePaystack;
});
after(async () => {
  globalThis.fetch = realFetch;
  await mongoose.disconnect();
  await db?.stop();
});
beforeEach(async () => {
  paystack.calls.length = 0;
  paystack.failInit = false;
  await Order.deleteMany({});
  await Product.deleteMany({});
  await Product.create({
    _id: 'PAY001',
    categoryId: 'pay',
    name: 'Paid Product',
    description: 'A product bought online',
    images: ['https://res.cloudinary.com/demo/image/upload/sample.jpg'],
    price: 1234.5,
    stock: 5,
  });
  await request(app)
    .put('/api/v1/cart')
    .set(auth())
    .send({ items: [{ productId: 'PAY001', quantity: 2 }] })
    .expect(200);
});

const checkout = (key = crypto.randomUUID()) =>
  request(app)
    .post('/api/v1/orders')
    .set(auth())
    .send({ addressId: address.id, paymentMethod: 'paystack', idempotencyKey: key });
const stock = async () => (await Product.findById('PAY001')).stock;
const sign = (raw) => crypto.createHmac('sha512', SECRET).update(raw).digest('hex');

// --- Tests ---------------------------------------------------------------------------------
test('paystack checkout reserves stock and returns a checkout URL for the exact amount', async () => {
  const key = crypto.randomUUID();
  const r = await checkout(key).expect(201);
  const order = r.body.data;
  assert.equal(order.paymentMethod, 'paystack');
  assert.equal(order.paymentStatus, 'unpaid');
  assert.match(order.payment.authorizationUrl, /^https:\/\/checkout\.paystack\.com\//);
  assert.ok(order.payment.reference && order.payment.accessCode && order.payment.expiresAt);
  assert.equal(await stock(), 3);

  const init = paystack.calls.find((c) => c.path === '/transaction/initialize');
  assert.equal(init.body.amount, 246900, '2 × ₦1,234.50 in kobo');
  assert.equal(init.body.email, 'payer@example.com');
  assert.equal(init.body.currency, 'NGN');
  assert.equal(init.auth, `Bearer ${SECRET}`);

  // Replaying the same key returns the same order and checkout without a second Paystack call.
  const replay = await checkout(key).expect(201);
  assert.equal(replay.body.data.id, order.id);
  assert.equal(replay.body.data.payment.reference, order.payment.reference);
  assert.equal(paystack.calls.filter((c) => c.path === '/transaction/initialize').length, 1);
});

test('verify marks paid only after Paystack confirms, and is idempotent', async () => {
  const order = (await checkout().expect(201)).body.data;
  const verify = () =>
    request(app).post(`/api/v1/orders/${order.id}/payment/verify`).set(auth()).send({});

  let r = await verify().expect(200);
  assert.equal(r.body.data.paymentStatus, 'unpaid', 'abandoned checkout is not paid');

  payCustomer(order.payment.reference);
  r = await verify().expect(200);
  assert.equal(r.body.data.paymentStatus, 'paid');
  assert.equal(r.body.data.payment.channel, 'card');
  assert.equal(r.body.message, 'Payment confirmed');

  r = await verify().expect(200);
  assert.equal(r.body.data.paymentStatus, 'paid');
  await request(app).post(`/api/v1/orders/${order.id}/cancel`).set(auth()).send({}).expect(409);
  assert.equal(await stock(), 3, 'paid orders keep their stock');
});

test('an underpayment is never accepted', async () => {
  const order = (await checkout().expect(201)).body.data;
  payCustomer(order.payment.reference, { amount: 100 });
  const r = await request(app)
    .post(`/api/v1/orders/${order.id}/payment/verify`)
    .set(auth())
    .send({})
    .expect(409);
  assert.equal(r.body.error.code, 'PAYMENT_MISMATCH');
  assert.equal((await Order.findById(order.id)).paymentStatus, 'unpaid');
});

test('webhook rejects bad signatures and confirms payment with a valid one', async () => {
  const order = (await checkout().expect(201)).body.data;
  payCustomer(order.payment.reference);
  const raw = JSON.stringify({
    event: 'charge.success',
    data: { reference: order.payment.reference },
  });
  const hook = (signature) =>
    request(app)
      .post('/api/v1/payments/paystack/webhook')
      .set({ 'Content-Type': 'application/json', 'x-paystack-signature': signature })
      .send(raw);

  const bad = await hook('0'.repeat(128)).expect(401);
  assert.equal(bad.body.error.code, 'INVALID_SIGNATURE');
  assert.equal((await Order.findById(order.id)).paymentStatus, 'unpaid');

  await hook(sign(raw)).expect(200);
  assert.equal((await Order.findById(order.id)).paymentStatus, 'paid');
  await hook(sign(raw)).expect(200); // Paystack retries are harmless
});

test('expired unpaid orders are cancelled and their stock released', async () => {
  const order = (await checkout().expect(201)).body.data;
  assert.equal(await stock(), 3);
  assert.equal(await expireUnpaidOrders(new Date()), 0, 'not expired yet');

  const later = new Date(Date.now() + 31 * 60000);
  assert.equal(await expireUnpaidOrders(later), 1);
  const saved = await Order.findById(order.id);
  assert.equal(saved.status, 'cancelled');
  assert.equal(await stock(), 5);

  const pay = await request(app).post(`/api/v1/orders/${order.id}/payment`).set(auth()).send({});
  assert.equal(pay.status, 409);
  assert.equal(pay.body.error.code, 'ORDER_NOT_PAYABLE');
});

test('expiry records a payment that did go through instead of cancelling', async () => {
  const order = (await checkout().expect(201)).body.data;
  payCustomer(order.payment.reference);
  await expireUnpaidOrders(new Date(Date.now() + 31 * 60000));
  const saved = await Order.findById(order.id);
  assert.equal(saved.status, 'pending');
  assert.equal(saved.paymentStatus, 'paid');
  assert.equal(await stock(), 3);
});

test('payment arriving after expiry is flagged for refund, not silently accepted', async () => {
  const order = (await checkout().expect(201)).body.data;
  await expireUnpaidOrders(new Date(Date.now() + 31 * 60000));
  payCustomer(order.payment.reference);
  const r = await request(app)
    .post(`/api/v1/orders/${order.id}/payment/verify`)
    .set(auth())
    .send({});
  assert.equal(r.body.data.paymentStatus, 'refund_due');
  assert.equal(r.body.data.status, 'cancelled');
});

test('admin cannot start fulfilment of an unpaid online order', async () => {
  const admin = await User.create({
    username: 'Boss',
    email: `boss-${crypto.randomUUID()}@example.com`,
    password: await bcrypt.hash('SecureTestPass123', 4),
    verified: true,
    role: 'admin',
  });
  const order = (await checkout().expect(201)).body.data;
  const advance = () =>
    request(app)
      .patch(`/api/v1/admin/orders/${order.id}/status`)
      .set({ Authorization: `Bearer ${token(admin)}` })
      .send({ status: 'processing' });
  const r = await advance().expect(409);
  assert.equal(r.body.error.code, 'PAYMENT_REQUIRED');
  payCustomer(order.payment.reference);
  await request(app).post(`/api/v1/orders/${order.id}/payment/verify`).set(auth()).send({});
  await advance().expect(200);
});

test('provider outage keeps the order and can be retried with the same key', async () => {
  const key = crypto.randomUUID();
  paystack.failInit = true;
  const failed = await checkout(key).expect(502);
  assert.equal(failed.body.error.code, 'PAYMENT_PROVIDER_ERROR');
  paystack.failInit = false;
  const retried = await checkout(key).expect(201);
  assert.ok(retried.body.data.payment.authorizationUrl);
  assert.equal(await Order.countDocuments({}), 1);
});

test('without a Paystack key, checkout fails before reserving stock', async () => {
  delete process.env.PAYSTACK_SECRET_KEY;
  try {
    const r = await checkout().expect(503);
    assert.equal(r.body.error.code, 'PAYMENT_UNAVAILABLE');
    assert.equal(await stock(), 5);
  } finally {
    process.env.PAYSTACK_SECRET_KEY = SECRET;
  }
});

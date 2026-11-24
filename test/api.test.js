import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import sharp from 'sharp';
process.env.JWT_SECRET = 'test-secret-with-at-least-32-characters-only';
const { app } = await import('../app.js');
const { User, Category, Product, Cart, Address, Order } = await import('../src/database/models.js');
const { token } = await import('../src/modules/auth/token.service.js');
const { validatedImage } = await import('../src/modules/media/media.service.js');
let db, user, access;
const pass = 'SecureTestPass123';
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
    username: 'Tester',
    email: 'test@example.com',
    password: await bcrypt.hash(pass, 4),
    verified: true,
  });
  access = token(user);
  await Category.create({
    _id: 'test',
    name: 'Test',
    image: 'https://res.cloudinary.com/demo/image/upload/sample.jpg',
  });
  await Product.create({
    _id: 'TEST001',
    categoryId: 'test',
    name: 'Test Product',
    description: 'Test product description',
    images: ['https://res.cloudinary.com/demo/image/upload/sample.jpg'],
    price: 12.34,
    stock: 3,
  });
});
after(async () => {
  await mongoose.disconnect();
  await db?.stop();
});
const auth = () => ({ Authorization: `Bearer ${access}` });
function envelope(body, success) {
  assert.equal(body.success, success);
  assert.deepEqual(
    Object.keys(body).sort(),
    ['success', 'message', 'data', 'error', 'meta', 'requestId'].sort(),
  );
  assert.ok(body.requestId);
}
test('malformed JSON, unknown fields and missing authentication have uniform errors', async () => {
  let r = await request(app)
    .post('/api/v1/auth/login')
    .set('Content-Type', 'application/json')
    .send('{');
  assert.equal(r.status, 400);
  envelope(r.body, false);
  r = await request(app)
    .post('/api/v1/auth/register')
    .send({ username: 'Test', email: 'other@example.com', password: pass, role: 'admin' });
  assert.equal(r.status, 422);
  r = await request(app).get('/api/v1/me');
  assert.equal(r.status, 401);
  envelope(r.body, false);
});
test('catalog paginates, filters, escapes search and rejects invalid parameters', async () => {
  let r = await request(app).get(
    '/api/v1/products?categoryId=test&minPrice=12&maxPrice=13&inStock=true&limit=1',
  );
  assert.equal(r.status, 200);
  envelope(r.body, true);
  assert.equal(r.body.meta.total, 1);
  assert.equal(r.body.data[0].id, 'TEST001');
  r = await request(app).get('/api/v1/products?q=%28');
  assert.equal(r.status, 200);
  assert.equal(r.body.meta.total, 0);
  r = await request(app).get('/api/v1/products?limit=0');
  assert.equal(r.status, 422);
  r = await request(app).get('/api/v1/products?minPrice=20&maxPrice=1');
  assert.equal(r.status, 422);
});
test('registration cannot expose secrets or overwrite an account', async () => {
  let r = await request(app)
    .post('/api/v1/auth/register')
    .send({ username: 'New User', email: 'new@example.com', password: pass });
  assert.equal(r.status, 201);
  assert.equal(r.body.data.user.password, undefined);
  assert.equal(r.body.data.user.role, 'customer');
  r = await request(app)
    .post('/api/v1/auth/register')
    .send({ username: 'Again', email: 'new@example.com', password: pass });
  assert.equal(r.status, 409);
  envelope(r.body, false);
});
test('profile ownership and admin authorization are enforced', async () => {
  let r = await request(app).patch('/api/v1/me').set(auth()).send({ role: 'admin' });
  assert.equal(r.status, 422);
  r = await request(app).post('/api/v1/admin/categories').set(auth()).send({});
  assert.equal(r.status, 403);
  const a = await Address.create({ userId: new mongoose.Types.ObjectId(), name: 'Someone else' });
  r = await request(app).delete(`/api/v1/addresses/${a.id}`).set(auth()).send({});
  assert.equal(r.status, 404);
  assert.ok(await Address.exists({ _id: a._id }));
});
test('checkout calculates totals, prevents replay and cancellation restores stock once', async () => {
  const a = await Address.create({ userId: user._id, name: 'Tester', line1: '123 Test Street' });
  let r = await request(app)
    .put('/api/v1/cart')
    .set(auth())
    .send({ items: [{ productId: 'TEST001', quantity: 2 }] });
  assert.equal(r.status, 200);
  const body = {
    addressId: a.id,
    paymentMethod: 'cash_on_delivery',
    idempotencyKey: crypto.randomUUID(),
  };
  r = await request(app).post('/api/v1/orders').set(auth()).send(body);
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.data.total, 24.68);
  const orderId = r.body.data.id;
  assert.equal((await Product.findById('TEST001')).stock, 1);
  r = await request(app).post('/api/v1/orders').set(auth()).send(body);
  assert.equal(r.body.data.id, orderId);
  assert.equal(await Order.countDocuments(), 1);
  r = await request(app).post(`/api/v1/orders/${orderId}/cancel`).set(auth()).send({});
  assert.equal(r.status, 200);
  assert.equal((await Product.findById('TEST001')).stock, 3);
  r = await request(app).post(`/api/v1/orders/${orderId}/cancel`).set(auth()).send({});
  assert.equal(r.status, 409);
  assert.equal((await Product.findById('TEST001')).stock, 3);
});
test('insufficient stock rolls back the entire checkout', async () => {
  const a = await Address.findOne({ userId: user._id });
  await Cart.updateOne(
    { userId: user._id },
    { $set: { items: [{ productId: 'TEST001', quantity: 4 }] } },
  );
  const r = await request(app).post('/api/v1/orders').set(auth()).send({
    addressId: a.id,
    paymentMethod: 'cash_on_delivery',
    idempotencyKey: crypto.randomUUID(),
  });
  assert.equal(r.status, 409);
  assert.equal((await Product.findById('TEST001')).stock, 3);
  assert.equal((await Cart.findOne({ userId: user._id })).items.length, 1);
});
test('reset rejects wrong or mismatched OTP requests, consumes code and revokes sessions', async () => {
  const otp = '123456';
  await User.updateOne(
    { _id: user._id },
    {
      $set: {
        otpHash: crypto.createHmac('sha256', process.env.JWT_SECRET).update(otp).digest('hex'),
        otpPurpose: 'reset',
        otpExpires: new Date(Date.now() + 600000),
        otpAttempts: 0,
      },
    },
  );
  const body = {
    email: user.email,
    otp,
    newPassword: 'ChangedPassword123',
    confirmPassword: 'ChangedPassword123',
  };
  let r = await request(app)
    .post('/api/v1/auth/reset-password')
    .send({ ...body, confirmPassword: pass });
  assert.equal(r.status, 422);
  r = await request(app)
    .post('/api/v1/auth/reset-password')
    .send({ ...body, otp: '000000' });
  assert.equal(r.status, 400);
  assert.equal(r.body.error.code, 'INVALID_OTP');
  r = await request(app).post('/api/v1/auth/reset-password').send(body);
  assert.equal(r.status, 200);
  r = await request(app).post('/api/v1/auth/reset-password').send(body);
  assert.equal(r.status, 400);
  r = await request(app).get('/api/v1/me').set(auth());
  assert.equal(r.status, 401);
  const u = await User.findById(user._id).select('+password +otpHash');
  assert.equal(u.otpHash, undefined);
  assert.ok(await bcrypt.compare(body.newPassword, u.password));
});
test('image validation rejects fake images and normalizes real images', async () => {
  await assert.rejects(
    () => validatedImage(Buffer.from('<html>not an image</html>')),
    (e) => e.code === 'INVALID_IMAGE',
  );
  const buffer = await sharp({
    create: { width: 100, height: 100, channels: 3, background: '#00ff00' },
  })
    .png()
    .toBuffer();
  assert.equal((await sharp(await validatedImage(buffer)).metadata()).format, 'webp');
});

test('the fifth wrong OTP locks further attempts and expired codes cannot reset', async () => {
  const otp = '654321',
    hash = crypto.createHmac('sha256', process.env.JWT_SECRET).update(otp).digest('hex');
  const body = {
    email: user.email,
    otp,
    newPassword: 'AnotherPassword123',
    confirmPassword: 'AnotherPassword123',
  };
  await User.updateOne(
    { _id: user._id },
    {
      $set: {
        otpHash: hash,
        otpPurpose: 'reset',
        otpExpires: new Date(Date.now() + 600000),
        otpAttempts: 4,
      },
    },
  );
  let r = await request(app)
    .post('/api/v1/auth/reset-password')
    .send({ ...body, otp: '000000' });
  assert.equal(r.status, 400);
  r = await request(app).post('/api/v1/auth/reset-password').send(body);
  assert.equal(r.status, 400);
  await User.updateOne(
    { _id: user._id },
    { $set: { otpExpires: new Date(Date.now() - 1000), otpAttempts: 0 } },
  );
  r = await request(app).post('/api/v1/auth/reset-password').send(body);
  assert.equal(r.status, 400);
});
test('verification purpose is separate and successful email verification clears the OTP', async () => {
  const otp = '654321',
    hash = crypto.createHmac('sha256', process.env.JWT_SECRET).update(otp).digest('hex');
  await User.updateOne(
    { _id: user._id },
    {
      $set: {
        verified: false,
        otpHash: hash,
        otpPurpose: 'reset',
        otpExpires: new Date(Date.now() + 600000),
        otpAttempts: 0,
      },
    },
  );
  let r = await request(app).post('/api/v1/auth/verify').send({ email: user.email, otp });
  assert.equal(r.status, 400);
  await User.updateOne({ _id: user._id }, { $set: { otpPurpose: 'verify' } });
  r = await request(app).post('/api/v1/auth/verify').send({ email: user.email, otp });
  assert.equal(r.status, 200);
  const u = await User.findById(user._id).select('+otpHash');
  assert.equal(u.verified, true);
  assert.equal(u.otpHash, undefined);
});
test('password change checks current password and revokes the new session', async () => {
  const u = await User.findById(user._id),
    headers = { Authorization: `Bearer ${token(u)}` };
  let r = await request(app).post('/api/v1/me/change-password').set(headers).send({
    currentPassword: 'wrong',
    newPassword: 'ThirdPassword123',
    confirmPassword: 'ThirdPassword123',
  });
  assert.equal(r.status, 400);
  r = await request(app).post('/api/v1/me/change-password').set(headers).send({
    currentPassword: 'ChangedPassword123',
    newPassword: 'ThirdPassword123',
    confirmPassword: 'ThirdPassword123',
  });
  assert.equal(r.status, 200);
  r = await request(app).get('/api/v1/me').set(headers);
  assert.equal(r.status, 401);
});
test('unknown routes and missing Brevo configuration return safe standard errors', async () => {
  let r = await request(app).get('/api/v1/not-a-route');
  assert.equal(r.status, 404);
  envelope(r.body, false);
  const key = process.env.BREVO_API_KEY;
  delete process.env.BREVO_API_KEY;
  try {
    r = await request(app)
      .post('/api/v1/auth/forgot-password')
      .send({ email: 'unknown@example.com' });
    assert.equal(r.status, 503);
    envelope(r.body, false);
  } finally {
    if (key !== undefined) process.env.BREVO_API_KEY = key;
  }
});

test('concurrent buyers cannot oversell the last unit', async () => {
  await Product.create({
    _id: 'LAST',
    categoryId: 'test',
    name: 'Last unit',
    description: 'Only one unit remains',
    images: ['https://res.cloudinary.com/demo/image/upload/sample.jpg'],
    price: 99,
    stock: 1,
  });
  const buyers = await User.create(
    [0, 1].map((i) => ({
      username: `Buyer ${i}`,
      email: `buyer${i}@example.com`,
      password: 'not-used-for-login',
      verified: true,
    })),
  );
  const requests = [];
  for (const buyer of buyers) {
    const address = await Address.create({
      userId: buyer._id,
      name: 'Buyer',
      line1: '123 Test Street',
    });
    await Cart.create({ userId: buyer._id, items: [{ productId: 'LAST', quantity: 1 }] });
    requests.push(
      request(app)
        .post('/api/v1/orders')
        .set({ Authorization: `Bearer ${token(buyer)}` })
        .send({
          addressId: address.id,
          paymentMethod: 'cash_on_delivery',
          idempotencyKey: crypto.randomUUID(),
        }),
    );
  }
  const results = await Promise.all(requests);
  assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
  assert.equal((await Product.findById('LAST')).stock, 0);
  assert.equal(await Order.countDocuments({ 'items.productId': 'LAST' }), 1);
});

test('forgot-password delivers a code through the mail adapter without exposing it in JSON', async () => {
  const original = globalThis.fetch;
  const saved = { key: process.env.BREVO_API_KEY, from: process.env.BREVO_SENDER_EMAIL };
  let delivered;
  globalThis.fetch = async (url, options) => {
    assert.equal(url, 'https://api.brevo.com/v3/smtp/email');
    assert.equal(options.headers['api-key'], 'test-brevo-key');
    delivered = JSON.parse(options.body);
    return new Response(JSON.stringify({ messageId: 'test-message' }), { status: 201 });
  };
  process.env.BREVO_API_KEY = 'test-brevo-key';
  process.env.BREVO_SENDER_EMAIL = 'no-reply@example.com';
  try {
    await User.updateOne({ _id: user._id }, { $unset: { otpSentAt: 1 } });
    const response = await request(app)
      .post('/api/v1/auth/forgot-password')
      .send({ email: user.email });
    assert.equal(response.status, 200);
    assert.equal(delivered.to[0].email, user.email);
    assert.equal(delivered.sender.email, 'no-reply@example.com');
    const otp = delivered.textContent.match(/\b\d{6}\b/)[0];
    assert.equal(JSON.stringify(response.body).includes(otp), false);
    const stored = await User.findById(user._id).select('+otpHash +otpPurpose');
    assert.equal(stored.otpPurpose, 'reset');
    assert.notEqual(stored.otpHash, otp);
    assert.equal(
      stored.otpHash,
      crypto.createHmac('sha256', process.env.JWT_SECRET).update(otp).digest('hex'),
    );
  } finally {
    globalThis.fetch = original;
    for (const [key, value] of [
      ['BREVO_API_KEY', saved.key],
      ['BREVO_SENDER_EMAIL', saved.from],
    ]) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test('failed Brevo delivery clears the undelivered OTP and allows requesting a new one', async () => {
  const { sendOtp } = await import('../src/modules/auth/otp.service.js');
  const original = globalThis.fetch;
  const saved = { key: process.env.BREVO_API_KEY, sender: process.env.BREVO_SENDER_EMAIL };
  process.env.BREVO_API_KEY = 'test-key';
  process.env.BREVO_SENDER_EMAIL = 'sender@example.com';
  globalThis.fetch = async () => new Response('provider failure', { status: 503 });
  try {
    await User.updateOne({ _id: user._id }, { $unset: { otpSentAt: 1 } });
    await assert.rejects(sendOtp(user, 'reset'), { code: 'EMAIL_DELIVERY_FAILED' });
    const stored = await User.findById(user._id).select(
      '+otpHash +otpPurpose +otpExpires +otpSentAt',
    );
    for (const field of ['otpHash', 'otpPurpose', 'otpExpires', 'otpSentAt'])
      assert.equal(stored[field], undefined);
  } finally {
    globalThis.fetch = original;
    for (const [key, value] of [
      ['BREVO_API_KEY', saved.key],
      ['BREVO_SENDER_EMAIL', saved.sender],
    ]) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

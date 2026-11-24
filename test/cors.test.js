import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';

process.env.JWT_SECRET ??= 'test-secret-with-at-least-32-characters-only';
process.env.CORS_ORIGINS = 'https://allowed.example';
const { app } = await import('../app.js');

// POST /auth/login with an empty body fails validation (422) before touching the database,
// so a 422 proves the request got past CORS.
const login = (headers) => request(app).post('/api/v1/auth/login').set(headers).send({});

test('requests without an Origin header (mobile apps, curl) are allowed', async () => {
  await login({}).expect(422);
});

test('same-origin browser requests (Swagger UI) are allowed without configuration', async () => {
  await login({ Host: 'api.example.com', Origin: 'https://api.example.com' }).expect(422);
});

test('configured cross-origin requests are allowed and get CORS headers', async () => {
  const res = await login({ Origin: 'https://allowed.example' }).expect(422);
  assert.equal(res.headers['access-control-allow-origin'], 'https://allowed.example');
});

test('other origins are rejected, including a lookalike host', async () => {
  for (const origin of ['https://evil.example', 'https://api.example.com.evil.example', 'null']) {
    const res = await login({ Host: 'api.example.com', Origin: origin }).expect(403);
    assert.equal(res.body.error.code, 'CORS_DENIED');
  }
});

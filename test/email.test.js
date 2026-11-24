import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sendEmail } from '../src/integrations/email/email.service.js';

function configure(t, fetchImplementation) {
  const saved = {
    key: process.env.BREVO_API_KEY,
    sender: process.env.BREVO_SENDER_EMAIL,
    fetch: globalThis.fetch,
  };
  process.env.BREVO_API_KEY = 'test-key';
  process.env.BREVO_SENDER_EMAIL = 'sender@example.com';
  globalThis.fetch = fetchImplementation;
  t.after(() => {
    globalThis.fetch = saved.fetch;
    for (const [key, value] of [
      ['BREVO_API_KEY', saved.key],
      ['BREVO_SENDER_EMAIL', saved.sender],
    ]) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
}

test('Brevo receives the configured sender, key, text and escaped HTML', async (t) => {
  configure(t, async (url, options) => {
    assert.equal(url, 'https://api.brevo.com/v3/smtp/email');
    assert.equal(options.method, 'POST');
    assert.equal(options.headers['api-key'], 'test-key');
    assert.equal(options.redirect, 'error');
    assert.ok(options.signal instanceof AbortSignal);
    const body = JSON.parse(options.body);
    assert.equal(body.sender.email, 'sender@example.com');
    assert.deepEqual(body.to, [{ email: 'customer@example.com' }]);
    assert.equal(body.textContent, '<code> & 123456');
    assert.ok(body.htmlContent.includes('&lt;code&gt; &amp; 123456'));
    return new Response(JSON.stringify({ messageId: 'accepted' }), { status: 201 });
  });
  assert.deepEqual(
    await sendEmail({ to: 'customer@example.com', subject: 'OTP', text: '<code> & 123456' }),
    { messageId: 'accepted' },
  );
});

test('Brevo provider errors and network failures are sanitized', async (t) => {
  configure(t, async () => new Response('private provider details', { status: 401 }));
  for (const status of [400, 401, 403, 429, 500]) {
    globalThis.fetch = async () => new Response('private provider details', { status });
    await assert.rejects(
      sendEmail({ to: 'customer@example.com', subject: 'OTP', text: '123456' }),
      (error) => {
        assert.equal(error.status, 502);
        assert.equal(error.code, 'EMAIL_DELIVERY_FAILED');
        assert.ok(!error.message.includes('private'));
        return true;
      },
    );
  }
  globalThis.fetch = async () => {
    throw new DOMException('private timeout detail', 'TimeoutError');
  };
  await assert.rejects(sendEmail({ to: 'customer@example.com', subject: 'OTP', text: '123456' }), {
    code: 'EMAIL_DELIVERY_FAILED',
  });
});

test('missing key or invalid sender fails before making a network request', async (t) => {
  configure(t, async () => {
    assert.fail('No request should be made');
  });
  delete process.env.BREVO_API_KEY;
  await assert.rejects(sendEmail({}), { status: 503, code: 'EMAIL_UNAVAILABLE' });
  process.env.BREVO_API_KEY = 'test-key';
  process.env.BREVO_SENDER_EMAIL = 'invalid';
  await assert.rejects(sendEmail({}), { status: 503, code: 'EMAIL_UNAVAILABLE' });
});

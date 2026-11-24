import { z } from 'zod';

import { ApiError } from '../../common/errors/api-error.js';
import { env } from '../../config/env.js';

export function assertEmailConfigured() {
  const { apiKey, senderEmail } = env.brevo;
  if (!apiKey?.trim() || !z.email().safeParse(senderEmail).success) {
    throw new ApiError(
      503,
      'EMAIL_UNAVAILABLE',
      'Brevo API key and a valid sender email must be configured',
    );
  }
}

export async function sendEmail({ to, subject, text }) {
  assertEmailConfigured();
  const { apiKey, senderEmail, senderName } = env.brevo;
  // Escape the text before supplying the HTML alternative required by the provider.
  const escaped = text.replace(
    /[&<>"']/g,
    (character) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[character],
  );
  try {
    const providerResponse = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': apiKey,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        sender: { email: senderEmail, name: senderName },
        to: [{ email: to }],
        subject,
        textContent: text,
        htmlContent: `<html><body><p>${escaped.replace(/\n/g, '<br>')}</p></body></html>`,
      }),
      signal: AbortSignal.timeout(20000),
      redirect: 'error',
    });
    if (!providerResponse.ok) {
      await providerResponse.body?.cancel();
      throw new Error('Brevo rejected the email');
    }
    return await providerResponse.json();
  } catch {
    // Provider responses may contain private account/recipient details. Never expose them.
    throw new ApiError(502, 'EMAIL_DELIVERY_FAILED', 'Could not send email. Please try again.');
  }
}

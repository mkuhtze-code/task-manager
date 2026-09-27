/**
 * Transactional email via Resend (https://resend.com).
 * Configure:
 *   RESEND_API_KEY
 *   EMAIL_FROM          e.g. "Dokkit <noreply@dokkit.space>"
 *   CONTACT_INBOX       e.g. support@dokkit.space (receives contact form)
 *
 * Failures are logged; callers should not block the user on email errors.
 */

import { logError } from '@/lib/logError';

export type SendEmailParams = {
  to: string | string[];
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
  tags?: { name: string; value: string }[];
};

export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

export function contactInbox(): string {
  return (
    process.env.CONTACT_INBOX ||
    process.env.SUPPORT_EMAIL ||
    'support@dokkit.space'
  );
}

export function emailFrom(): string {
  return process.env.EMAIL_FROM || 'Dokkit <noreply@dokkit.space>';
}

export async function sendEmail(
  params: SendEmailParams
): Promise<{ ok: true; id?: string } | { ok: false; error: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return { ok: false, error: 'RESEND_API_KEY is not configured' };
  }

  const to = Array.isArray(params.to) ? params.to : [params.to];
  if (to.length === 0) {
    return { ok: false, error: 'No recipients' };
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: emailFrom(),
        to,
        subject: params.subject,
        html: params.html,
        text: params.text,
        reply_to: params.replyTo,
        tags: params.tags,
      }),
    });

    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg =
        typeof body?.message === 'string'
          ? body.message
          : `Resend HTTP ${res.status}`;
      await logError('server', 'email:resend', new Error(msg), {
        status: res.status,
        subject: params.subject,
      });
      return { ok: false, error: msg };
    }

    return { ok: true, id: typeof body?.id === 'string' ? body.id : undefined };
  } catch (err) {
    await logError('server', 'email:resend', err, { subject: params.subject });
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Send failed',
    };
  }
}


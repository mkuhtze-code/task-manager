
/** Plain, calm transactional templates — no marketing noise. */

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function wrap(bodyHtml: string): string {
  return `<!DOCTYPE html>
<html>
<body style="font-family: system-ui, -apple-system, Segoe UI, sans-serif; line-height: 1.5; color: #1a1a1a; max-width: 560px; margin: 0 auto; padding: 24px;">
${bodyHtml}
<p style="margin-top: 32px; font-size: 12px; color: #666;">Dokkit · <a href="https://dokkit.space">dokkit.space</a></p>
</body>
</html>`;
}

export function contactReceivedUser(params: {
  name?: string | null;
  messagePreview: string;
}): { subject: string; html: string; text: string } {
  const subject = 'We received your message';
  const greet = params.name ? `Hi ${params.name},` : 'Hi,';
  const text = `${greet}

Thanks for contacting Dokkit. We’ve received your message and will get back to you as soon as we can.

— Dokkit
support@dokkit.space`;
  const html = wrap(`
<p>${escapeHtml(greet)}</p>
<p>Thanks for contacting Dokkit. We’ve received your message and will get back to you as soon as we can.</p>
<p style="font-size:13px;color:#555;">If you need to add detail, reply to this email or write again from the app.</p>
`);
  return { subject, html, text };
}

export function contactNotifyTeam(params: {
  fromEmail: string | null;
  fromName?: string | null;
  subjectLine: string;
  message: string;
  userId?: string | null;
  pageContext?: string | null;
  anonymous: boolean;
}): { subject: string; html: string; text: string } {
  const who = params.anonymous
    ? 'Anonymous'
    : params.fromEmail || 'Unknown';
  const subject = `[Dokkit contact] ${params.subjectLine.slice(0, 80)}`;
  const text = `New contact message

From: ${who}${params.fromName ? ` (${params.fromName})` : ''}
User id: ${params.userId || '—'}
Page: ${params.pageContext || '—'}
Anonymous: ${params.anonymous ? 'yes' : 'no'}

${params.message}
`;
  const html = wrap(`
<h2 style="font-size:16px;font-weight:600;">New contact message</h2>
<p><strong>From:</strong> ${escapeHtml(who)}${params.fromName ? ` (${escapeHtml(params.fromName)})` : ''}<br/>
<strong>User id:</strong> ${escapeHtml(params.userId || '—')}<br/>
<strong>Page:</strong> ${escapeHtml(params.pageContext || '—')}<br/>
<strong>Anonymous:</strong> ${params.anonymous ? 'yes' : 'no'}</p>
<pre style="white-space:pre-wrap;font-size:14px;background:#f6f5f1;padding:12px;border-radius:8px;">${escapeHtml(params.message)}</pre>
`);
  return { subject, html, text };
}

export function billingPaymentFailedUser(params: {
  email: string;
}): { subject: string; html: string; text: string } {
  const subject = 'Payment issue with your Dokkit plan';
  const text = `Hi,

We couldn’t process a payment for your Dokkit plan. Please update your payment method so your access continues without interruption.

Manage billing: open Dokkit → Account → Billing

— Dokkit
support@dokkit.space`;
  const html = wrap(`
<p>Hi,</p>
<p>We couldn’t process a payment for your Dokkit plan. Please update your payment method so your access continues without interruption.</p>
<p><strong>Manage billing:</strong> Dokkit → Account → Billing</p>
`);
  return { subject, html, text };
}

export function billingWelcomeUser(): {
  subject: string;
  html: string;
  text: string;
} {
  const subject = 'Your Dokkit plan is active';
  const text = `Hi,

Thanks for subscribing. Your Dokkit plan is active — Jobs, Meetings, and Travel are available on your account.

Manage billing anytime from Account → Billing.

— Dokkit`;
  const html = wrap(`
<p>Hi,</p>
<p>Thanks for subscribing. Your Dokkit plan is active — Jobs, Meetings, and Travel are available on your account.</p>
<p>Manage billing anytime from <strong>Account → Billing</strong>.</p>
`);
  return { subject, html, text };
}

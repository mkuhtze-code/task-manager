[ops-email-stripe.md](https://github.com/user-attachments/files/32693572/ops-email-stripe.md)# Email (Resend) + Stripe — production setup

## Resend

1. Create account at resend.com and verify domain **dokkit.space** (SPF, DKIM, DMARC).
2. Create API key → Vercel (task-manager) env:
   - `RESEND_API_KEY`
   - `EMAIL_FROM` = `Dokkit <noreply@dokkit.space>` (or `support@…` if preferred)
   - `CONTACT_INBOX` = `support@dokkit.space`
3. Contact form (`POST /api/contact`) will:
   - Store row in `feedback` table (existing)
   - Email inbox + optional acknowledgement to the user

## Stripe (finalize)

### Env (task-manager Vercel)

- `STRIPE_SECRET_KEY` (live when ready)
- `STRIPE_WEBHOOK_SECRET` (from webhook endpoint signing secret)
- `STRIPE_PRICE_MONTHLY` (price id for USD $6/month)
- `NEXT_PUBLIC_APP_URL` = app origin **without** trailing slash (e.g. `https://your-app.vercel.app`)

### Webhook endpoint

URL: `https://<app-host>/api/billing/webhook`

Events:

- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.paid` / `invoice.payment_succeeded`
- `invoice.payment_failed`

### Customer portal

Stripe Dashboard → Settings → Billing → Customer portal:

- Allow cancel at period end
- Allow update payment method
- Invoice history on

### Receipts

Stripe sends payment receipts. Dokkit sends:

- Welcome email after successful checkout (Resend)
- Payment-failed notice (Resend)

### Checkout URLs

Success/cancel: `{NEXT_PUBLIC_APP_URL}/account/billing?checkout=…`  
Do **not** prefix with `/app` unless the Next app itself is mounted under `/app`.

## Contact vs Feedback

- User-facing route: **`/contact`**
- Legacy **`/feedback`** redirects to `/contact`
- Database tables remain `feedback` / `feedback_replies` (no migration)
- Admin inbox continues to use the same tables



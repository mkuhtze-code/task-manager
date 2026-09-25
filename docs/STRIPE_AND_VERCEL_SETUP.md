[Uploading STRIPE_AND_VERCEL_SETUP.md…]()

# Stripe + Vercel setup (Dokkit billing)

## 1. Stripe Dashboard (test mode first)

1. Sign in at https://dashboard.stripe.com → toggle **Test mode** ON.
2. **Product catalog → Add product**
   - Name: `Dokkit`
   - Pricing: **Recurring**, **Monthly**, amount e.g. `NZD 6.00` (or your currency)
   - Save → copy the **Price ID** (`price_...`)
3. **Developers → Webhooks → Add endpoint**
   - Endpoint URL: `https://YOUR_APP_HOST/api/billing/webhook`
     (example: `https://task-manager-xxx.vercel.app/api/billing/webhook` or custom domain)
   - Events to send:
     - `checkout.session.completed`
     - `customer.subscription.created`
     - `customer.subscription.updated`
     - `customer.subscription.deleted`
   - Add endpoint → **Reveal** signing secret → copy `whsec_...`
4. **Settings → Billing → Customer portal**
   - Enable portal
   - Allow: update payment method, cancel subscription, view invoices
5. **Developers → API keys**
   - Secret key `sk_test_...`
   - Publishable key `pk_test_...` (optional until Elements)

## 2. Vercel environment variables

Project → **Settings → Environment Variables** → add for **Production** (and Preview if you want):

| Name | Value |
|------|--------|
| `STRIPE_SECRET_KEY` | `sk_test_...` (later `sk_live_...`) |
| `STRIPE_WEBHOOK_SECRET` | `whsec_...` |
| `STRIPE_PRICE_MONTHLY` | `price_...` |
| `NEXT_PUBLIC_APP_URL` | `https://your-app-domain` (no trailing slash) |

Optional: `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` = `pk_test_...`

**Redeploy** after saving env vars (Deployments → … → Redeploy).

## 3. Local webhook testing (optional)

```bash
stripe listen --forward-to localhost:3000/api/billing/webhook
```
Use the CLI `whsec_...` as `STRIPE_WEBHOOK_SECRET` in `.env.local`.

## 4. Smoke test

1. Sign in to the app as a **free** user (`account_tier = free`).
2. Open **Meetings** → should see calm “Dokkit plan” panel.
3. **Account → Billing & plan → Upgrade to Dokkit** → Stripe Checkout (test card `4242 4242 4242 4242`).
4. Complete checkout → return to `/account/billing`.
5. Confirm `user_settings.account_tier` is `premium` (webhook).
6. Meetings unlocks.
7. **Manage billing** opens Customer Portal.

## 5. Go live

1. Stripe: turn off Test mode; create **live** product/price; new live webhook to same URL.
2. Vercel: replace env with `sk_live_`, live `whsec_`, live `price_`.
3. Redeploy.

## Trusted testers

Set in Supabase (bypasses Stripe):

```sql
UPDATE public.user_settings
SET account_tier = 'trusted_tester'
WHERE user_id = '<uuid>';
```

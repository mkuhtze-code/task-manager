[BILLING_AND_TEAMS.md](https://github.com/user-attachments/files/32643162/BILLING_AND_TEAMS.md)

# Billing & Teams — implementation notes

## Defaults (until product changes them)

| Tier | DB `account_tier` | Meetings | Create team |
|------|-------------------|----------|-------------|
| Free | `free` | No | No |
| Dokkit | `premium` | Yes | No (until Team SKU) |
| Trusted tester | `trusted_tester` | Yes | No |

Teams tables exist (T0). Invite/UI/seats come in later phases. Admins never receive RLS paths to other users’ personal tasks.

## Env (app)

```
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PRICE_MONTHLY=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=   # optional until Elements
NEXT_PUBLIC_APP_URL=https://app.dokkit.space
```

## Stripe

1. Create Product + monthly Price → set `STRIPE_PRICE_MONTHLY`
2. Webhook → `https://<app>/api/billing/webhook`
   - `checkout.session.completed`
   - `customer.subscription.created|updated|deleted`
3. Enable Customer Portal (invoices, cancel, payment method)

## Apply migration

Run `supabase/migrations/20260925_billing_and_teams.sql` in Supabase SQL editor.

## npm

```bash
npm install stripe
```

Use a Stripe API version compatible with the installed SDK (adjust `apiVersion` in `lib/billing/stripe.ts` if needed).

## Next phases

- B3: Gate Meetings UI with `resolveEntitlements`
- B4: dokkit-site pricing page
- T1–T4: team invite, capabilities, team jobs, task offers
- T5: seat billing

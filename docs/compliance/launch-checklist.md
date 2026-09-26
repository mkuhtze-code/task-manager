[launch-checklist.md](https://github.com/user-attachments/files/32687647/launch-checklist.md)# Launch checklist

Check items before broad public promotion. Operator initials + date.

## Security & data

- [ ] P0 SQL applied: billing schema + Pro RLS (`20260926_billing_schema_and_pro_rls.sql` or equivalent)
- [ ] Storage hard quota SQL applied (`20260926_storage_hard_quota.sql`)
- [ ] Free user cannot insert Jobs / Meetings / Travel (API + RLS)
- [ ] Cross-user SELECT fails for tasks, media, billing
- [ ] Account delete cancels Stripe subscription (test mode proven)
- [ ] Checkout blocked when already subscribed
- [ ] No service role key in client or public repo

## Billing

- [ ] Live Stripe price = USD $6/month matches site and Terms
- [ ] Webhook events: checkout.session.completed, customer.subscription.*, invoice.payment_failed, invoice.paid
- [ ] Portal cancel → end of period → Free
- [ ] Failed payment → past_due visible in Admin

## Product

- [ ] Signup → onboarding → Today
- [ ] Task create / complete / Reality Check
- [ ] Free paywall → Billing → Pro unlocks Jobs/Meetings/Travel/Calendar
- [ ] Privacy + Terms live on dokkit.space (not placeholders)
- [ ] support@dokkit.space monitored

## Ops

- [ ] Admin Business metrics load
- [ ] Error log visible for unresolved issues
- [ ] Vercel + Supabase access limited
- [ ] Backup retention confirmed in Supabase plan
- [ ] This compliance folder reviewed once

## Explicitly deferred

Teams, Google Calendar, vertical integrations, AI chat, gamification.



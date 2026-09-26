[security-policy.md](https://github.com/user-attachments/files/32687681/security-policy.md)
# Information security policy (operational)

**Scope:** Dokkit application (`task-manager`), marketing site (`dokkit-site`), production infrastructure.

**Objectives:** Protect customer personal information and service integrity; support trustworthy paid use; prepare for formal ISMS later without over-claiming today.

## Principles

1. **Least privilege** — production secrets and admin access limited to people who need them.
2. **Server-side authorization** — UI gates are UX only; APIs, RLS, and service role boundaries enforce access.
3. **Data minimisation** — collect what the product needs; no ad-profile selling.
4. **Defence in depth** — Auth + RLS + entitlement checks + Stripe webhook verification.
5. **Honest transparency** — Privacy Policy and Terms describe real processors and practices.

## Controls (current)

- Authentication via Supabase Auth (email/password, magic link, Google where enabled).
- Row Level Security on user-owned tables; Pro write gates for Jobs/Meetings/Travel.
- Stripe webhooks signature-verified; billing events idempotent.
- Storage private bucket; per-user path prefix; hard quota on media inserts.
- Admin routes require admin membership + audited sensitive actions where implemented.
- Secrets in Vercel/environment only — not in client bundles or git.

## Non-goals (today)

- Formal ISO 27001 / SOC 2 certification.
- 24/7 SOC monitoring.
- Enterprise SSO / SCIM (unless later productised).

## Exceptions

Security exceptions are recorded in the risk register and reviewed by the operator.

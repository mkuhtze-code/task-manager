[access-control.md](https://github.com/user-attachments/files/32687559/access-control.md)[Uploadi# Access control

## Production access (fill names as roles change)

| System | Access | Principle |
|--------|--------|-----------|
| GitHub repos | Operator (+ limited collaborators) | Branch protection preferred on `main` |
| Vercel | Operator | Env vars only for those who deploy |
| Supabase | Operator (dashboard + service role) | Service role **never** in browser |
| Stripe | Operator | Live keys restricted |
| Domain DNS | Operator | |
| Dokkit Admin (`/admin`) | Rows in `admins` table | App-level admin only |

## Application roles

| Role | Capabilities |
|------|----------------|
| End user (Free) | Today, tasks, Reality Check, account |
| End user (Pro / trusted_tester) | + Jobs, Meetings, Travel, Calendar |
| Admin | Ops dashboard; not other users’ personal task content via normal RLS |

## Secrets

- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, Supabase **service role**, OAuth client secrets: **server-only**.
- `NEXT_PUBLIC_*` keys are public by design (publishable / URL only).
- Rotate compromised secrets immediately; revoke sessions if Auth impact suspected.

## Review

Revisit this document when anyone gains or loses production access.
ng access-control.md…]()


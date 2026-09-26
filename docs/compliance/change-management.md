[change-management.md](https://github.com/user-attachments/files/32687595/change-management.md)
# Change management

## Path to production

```
development branch / local
    → tests (npm test)
    → typecheck (npm run typecheck)
    → build (npm run build)
    → review
    → merge to main
    → Vercel production deploy
    → smoke test
    → monitor Admin / errors / Stripe
```

## Database changes

- All schema changes should live under `supabase/migrations/`.
- Apply to production via Supabase SQL editor or CLI **after** code that depends on them is ready (or in coordinated order).
- Prefer idempotent migrations (`IF NOT EXISTS`, `CREATE OR REPLACE`).

## Rollback

- Vercel: redeploy previous deployment.
- DB: forward-fix preferred; keep irreversible data migrations rare and documented.
- Stripe: price/webhook changes documented in `docs/STRIPE_AND_VERCEL_SETUP.md`.

## Who can deploy

Operator (and explicitly authorized collaborators only).


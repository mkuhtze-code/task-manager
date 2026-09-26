[backup-recovery.md](https://github.com/user-attachments/files/32687575/backup-recovery.md)
# Backup and recovery

## Current assumptions (verify in provider dashboards)

| Component | Backup mechanism | Notes |
|-----------|------------------|-------|
| Supabase Postgres | Provider automated backups (plan-dependent) | Confirm PITR / daily backup retention in project settings |
| Supabase Storage | Provider durability | Object versioning not assumed |
| GitHub | Source of truth for code | |
| Vercel env vars | Manual export / password manager | Document critical keys offline securely |
| Stripe | Stripe-hosted billing history | Customer/sub ids also in Dokkit tables |

## Targets (launch stage — not enterprise SLA)

| Metric | Target |
|--------|--------|
| RPO | ≤ 24 hours (confirm against Supabase plan) |
| RTO | ≤ 8 hours for core Auth + Today (best effort, single-operator) |

## Restore drill (do at least once before heavy marketing)

1. Confirm latest backup exists in Supabase.
2. Document restore steps from Supabase docs for your plan.
3. After any restore: verify Auth login, one task CRUD, billing summary, webhook health.

## If production DB disappeared tonight

1. Restore Postgres from Supabase backup.
2. Redeploy app from GitHub `main` on Vercel.
3. Confirm env vars present.
4. Reconcile Stripe → `billing_*` / `user_settings` if drift (webhook replay / support tools).
5. Notify users only if data loss window is material.


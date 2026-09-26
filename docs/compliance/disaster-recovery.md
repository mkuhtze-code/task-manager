[disaster-recovery.md](https://github.com/user-attachments/files/32687620/disaster-recovery.md)

# Disaster recovery (outline)

## Scenarios

1. **Vercel outage** — Wait / status page; DNS remains; data safe in Supabase.
2. **Supabase outage** — App read-only or down; communicate status; no destructive “fixes”.
3. **Stripe outage** — Existing entitlements from last webhook state; new checkout may fail.
4. **Credential leak** — Rotate all affected secrets; force sign-out if Auth secret compromised.
5. **Ransomware / account compromise of cloud admin** — Isolate, rotate, restore from clean backup.

## Communication

support@dokkit.space and, for prolonged outages, a short status note on the marketing site if feasible.

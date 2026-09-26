[incident-response.md](https://github.com/user-attachments/files/32687630/incident-response.md)

# Incident response (lightweight)

## Severity

| Level | Examples |
|-------|----------|
| P0 | Confirmed data breach; billing charging after delete; Auth fully down |
| P1 | Pro entitlements wrong at scale; webhook broken; major feature outage |
| P2 | Partial degradation; single-provider flapping |
| P3 | Minor defect; cosmetic |

## Process

1. **Detect** — Admin error log, Stripe dashboard, user report to support@dokkit.space, Vercel/Supabase alerts.
2. **Contain** — Revoke keys if leaked; disable broken webhook endpoint only if safe; rate-limit abuse.
3. **Investigate** — Preserve logs; do not destroy evidence; note timeline.
4. **Communicate** — Affected users if personal data at risk (NZ Privacy Act notification duties may apply); honest status.
5. **Recover** — Fix, deploy, verify; restore from backup if needed.
6. **Review** — Post-incident notes in this folder or private ops log within 14 days for P0/P1.

## Contacts

- Operator / on-call: (fill)
- support@dokkit.space
- Stripe support / Supabase support as needed

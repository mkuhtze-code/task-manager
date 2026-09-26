[README.md](https://github.com/user-attachments/files/32687665/README.md)

# Dokkit compliance & operations readiness

This folder supports **audit readiness** for ISO 27001 and SOC 2 later.  
It does **not** claim certification.

Documents describe how Dokkit actually works today (Supabase, Vercel, Stripe, Firebase where configured, Microsoft/Google OAuth).

| Document | Purpose |
|----------|---------|
| [security-policy.md](./security-policy.md) | High-level information security stance |
| [asset-inventory.md](./asset-inventory.md) | Systems and data stores |
| [access-control.md](./access-control.md) | Who can access production |
| [risk-register.md](./risk-register.md) | Key risks and treatments |
| [incident-response.md](./incident-response.md) | Detect → contain → recover |
| [change-management.md](./change-management.md) | How code reaches production |
| [backup-recovery.md](./backup-recovery.md) | RPO/RTO and restore path |
| [supplier-register.md](./supplier-register.md) | Third parties |
| [data-retention.md](./data-retention.md) | Keep / delete practices |
| [privacy-controls.md](./privacy-controls.md) | Privacy Act + AU/US/CA notes |
| [disaster-recovery.md](./disaster-recovery.md) | Major outage playbook |
| [launch-checklist.md](./launch-checklist.md) | Pre-launch verification |

Owner: Dokkit operator (Miles / support@dokkit.space).  
Review cadence: at least quarterly, and after major architecture changes.

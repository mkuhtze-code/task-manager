[data-retention.md](https://github.com/user-attachments/files/32687604/data-retention.md)

# Data retention

| Data | Retention |
|------|-----------|
| Active account content | While account exists |
| Account deletion | Cascade user-owned rows; cancel Stripe subs; best-effort Storage cleanup |
| Feedback | May remain anonymised (user_id null) after delete |
| billing_events | Operational / audit; retain for dispute window (e.g. 12–24 months) |
| error_logs | Operational; prune old resolved noise as needed |
| Stripe records | Per Stripe + accounting needs |

Default storage quota: **30 GiB** hosted files per account (hard enforced).

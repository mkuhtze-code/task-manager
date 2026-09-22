# Storage quota and compliance notes

## Product model

- Each account has a **total Dokkit-hosted storage ceiling** (default **30 GiB**).
- Usage is the sum of `meeting_media.size_bytes` (and future hosted file tables).
- When full: user must **free space** (delete media) or **export then delete**, or later **pay for more**.
- No third-party drive integration in v1.

## Security / compliance posture (SOC 2 / ISO 27001-oriented)

These are engineering controls to make future certification easier. They are not a claim of certification.

| Control theme | How we implement it |
|---------------|---------------------|
| **Least privilege** | Users read own `storage_*` via RLS on `user_settings`. Usage/limit columns are not client-writable (BEFORE UPDATE trigger). Counters updated only via SECURITY DEFINER trigger path. |
| **Integrity of metering** | `meeting_media` AFTER triggers adjust `storage_used_bytes`. Backfill on migration. |
| **Access control (admin)** | System storage metrics only via `/api/admin/*` + `requireAdmin`. Aggregates only — no per-user media listing in admin storage snapshot. |
| **Audit logging** | Admin views of storage snapshot write `admin_audit_events` (action `storage_snapshot.view`). |
| **Data minimization** | Admin UI shows totals and distributions (counts/percentiles), not file contents or user emails. |
| **User control** | Account page shows usage; export existing data paths; delete frees quota. |
| **Availability / abuse** | Hard stop on upload when quota exceeded; clear user messaging. |

## Future work (remember for all media features)

1. Enforce quota on **every** path that accepts hosted bytes (API routes preferred over client-only checks).
2. Prefer **server-side** upload endpoints when cloud Storage is added; never trust client-reported size alone without measuring the blob.
3. Log security-relevant admin actions; do not log media content or unnecessary PII.
4. Retention: user-initiated delete removes DB rows and (when cloud-backed) object storage objects.
5. Keep admin dashboards aggregate-first unless a support workflow explicitly requires a single-user lookup with audit.

## Ops

Apply migration: `supabase/migrations/20260923_storage_quota.sql`

# Job-centric files

## Model

| Kind | Stored on | Purpose |
|------|-----------|---------|
| **Job files** (`job_media`) | Job | PDFs, documents, photos shared across the job; system of record |
| **Meeting observations** (`meeting_media`) | Meeting | Photos/voice/text evidence unique to that meeting |

Meetings **linked to a job** can add and list job files. Observations remain meeting-only.

## Capture UX

| Surface | Mobile | Desktop |
|---------|--------|---------|
| **Jobs** | Photo + File buttons | Drag-and-drop zone + Upload file |
| **Meetings** (with `job_id`) | Same, compact “Job files” panel | Same |

Component: `components/JobFilesPanel.tsx`  
Capture helper: `hooks/useDeviceFileCapture.ts`  
Cloud: `lib/mediaCloud.syncJobMediaToCloud` → path `{userId}/jobs/{jobId}/{mediaId}`

## Quota

`job_media.size_bytes` counts toward the same account storage ceiling as meeting media.

## SQL

- `20260923_media_cloud_sync.sql` — `job_media` table + storage
- `20260923_job_media_original_name.sql` — `original_name` column

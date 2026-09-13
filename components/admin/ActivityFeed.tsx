import Link from 'next/link';
import type { ActivityEvent } from '@/lib/admin/types';
import { formatRelative } from './format';
import AdminPanel from './AdminPanel';

const TYPE_LABELS: Record<ActivityEvent['type'], string> = {
  account: 'New account',
  account_status: 'Account status',
  feedback: 'Feedback',
  feedback_reply: 'Reply sent',
  error: 'Error',
  task_created: 'Task created',
  task_completed: 'Task completed',
  job_created: 'Job created',
  meeting_created: 'Meeting',
  trip_created: 'Trip',
};

export default function ActivityFeed({ events }: { events: ActivityEvent[] }) {
  return (
    <AdminPanel
      title="Recent activity"
      subtitle="Chronological events from real data sources"
      action={<Link href="/admin/activity" className="adm-action-link">Activity →</Link>}
    >
      {events.length === 0 ? (
        <div className="adm-empty-note">No recent activity recorded yet.</div>
      ) : (
        <ul className="adm-feed">
          {events.map((e) => (
            <li key={e.id} className="adm-feed-item">
              <span className={`adm-feed-dot adm-feed-dot-${e.type}`} aria-hidden />
              <div className="adm-feed-body">
                <div className="adm-feed-title">{e.title}</div>
                {e.detail && <div className="adm-feed-detail">{e.detail}</div>}
                <div className="adm-feed-meta">
                  <span className="adm-feed-type">{TYPE_LABELS[e.type]}</span>
                  <span>{formatRelative(e.timestamp)}</span>
                </div>
              </div>
              {e.href && (
                <Link href={e.href} className="adm-feed-link" aria-label={`Open ${TYPE_LABELS[e.type]}`}>
                  →
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}
    </AdminPanel>
  );
}
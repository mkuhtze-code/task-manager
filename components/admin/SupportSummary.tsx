import Link from 'next/link';
import type { OverviewPayload } from '@/lib/admin/types';
import { truncate } from './format';
import AdminPanel from './AdminPanel';

export default function SupportSummary({ feedback }: { feedback: OverviewPayload['feedback'] }) {
  return (
    <AdminPanel
      title="Feedback / support"
      subtitle="Current messaging workload"
      action={<Link href="/admin/feedback" className="adm-action-link">Feedback →</Link>}
    >
      <div className="adm-stat-row">
        <div className="adm-stat">
          <div className="adm-stat-value">{feedback.total}</div>
          <div className="adm-stat-label">Total messages</div>
        </div>
        <div className="adm-stat">
          <div className="adm-stat-value adm-stat-warn">{feedback.open}</div>
          <div className="adm-stat-label">Awaiting reply</div>
        </div>
        <div className="adm-stat">
          <div className="adm-stat-value">{feedback.replied}</div>
          <div className="adm-stat-label">Replied</div>
        </div>
      </div>

      {feedback.recent.length > 0 && (
        <ul className="adm-rows">
          {feedback.recent.map((f) => (
            <li key={f.id} className="adm-row adm-row-stack">
              <Link href="/admin/feedback" className="adm-row-primary">
                {f.label}
                {f.numberOfReplies > 0 && <span className="adm-row-badge adm-row-badge-ok">replied · {f.numberOfReplies}</span>}
              </Link>
              <span className="adm-row-sub">{truncate(f.message, 110)}</span>
            </li>
          ))}
        </ul>
      )}
    </AdminPanel>
  );
}
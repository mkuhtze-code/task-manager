import Link from 'next/link';
import type { AttentionItem } from '@/lib/admin/types';
import AdminPanel from './AdminPanel';

export default function AttentionPanel({ items }: { items: AttentionItem[] }) {
  return (
    <AdminPanel
      title="What needs my attention"
      subtitle="Real, actionable conditions surfaced from current data"
      action={
        items.length > 0 ? (
          <span className={`adm-count adm-count-${items.some((i) => i.severity === 'critical') ? 'critical' : 'warning'}`}>
            {items.length}
          </span>
        ) : undefined
      }
    >
      {items.length === 0 ? (
        <div className="adm-empty-note">Nothing currently needs your attention.</div>
      ) : (
        <ul className="adm-attention-list">
          {items.map((item, i) => (
            <li key={`${item.severity}-${item.title}`} className="adm-attention-item">
              <span className={`adm-attention-marker adm-attention-marker-${item.severity}`} aria-hidden />
              <div className="adm-attention-body">
                <div className="adm-attention-title">{item.title}</div>
                <div className="adm-attention-detail">{item.detail}</div>
              </div>
              <Link href={item.href} className="adm-attention-link">
                Open →
              </Link>
            </li>
          ))}
        </ul>
      )}
    </AdminPanel>
  );
}
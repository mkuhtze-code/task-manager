import Link from 'next/link';
import type { InfrastructureItem } from '@/lib/admin/types';
import AdminPanel from './AdminPanel';
import StatusIndicator from './StatusIndicator';

export default function InfrastructureSummary({ items }: { items: InfrastructureItem[] }) {
  return (
    <AdminPanel
      wide
      title="Infrastructure"
      subtitle="External footprint and configuration"
      action={<Link href="/admin/infrastructure" className="adm-action-link">Infrastructure →</Link>}
    >
      <ul className="adm-infra-grid">
        {items.map((item) => (
          <li key={item.key} className="adm-infra-item">
            <div className="adm-infra-top">
              {item.href ? (
                <Link href={item.href} className="adm-infra-label">{item.label} →</Link>
              ) : (
                <span className="adm-infra-label">{item.label}</span>
              )}
              <StatusIndicator state={item.state} compact />
            </div>
            <div className="adm-infra-detail">{item.detail}</div>
          </li>
        ))}
      </ul>
    </AdminPanel>
  );
}
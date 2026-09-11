import Link from 'next/link';
import type { ProductAreaSummary } from '@/lib/admin/types';
import AdminPanel from './AdminPanel';

// Compact at-a-glance tiles for the six product areas. One headline number
// per area; every tile is a drill-down into that area's admin page.
export default function ProductSummary({ areas }: { areas: ProductAreaSummary[] }) {
  return (
    <AdminPanel
      title="Product snapshot"
      subtitle="Current state of each Dokkit surface"
      action={<Link href="/admin/usage" className="adm-action-link">Usage →</Link>}
    >
      <div className="adm-product-grid">
        {areas.map((area) => (
          <Link key={area.key} href={area.href} className="adm-product-tile">
            <div className="adm-product-name">{area.name}</div>
            <div className="adm-product-value">{area.headline}</div>
            <div className="adm-product-label">{area.headlineLabel}</div>
          </Link>
        ))}
      </div>
    </AdminPanel>
  );
}
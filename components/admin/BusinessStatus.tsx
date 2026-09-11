import Link from 'next/link';
import type { OverviewPayload } from '@/lib/admin/types';
import AdminPanel from './AdminPanel';
import StatusIndicator from './StatusIndicator';

// Stripe is not implemented. This panel is honest about that and lays the
// groundwork for the future Business section — connection state, MRR,
// revenue, subscriptions, trials, churn, failed payments, customer lookup
// and plan management. No revenue or customer figures are ever invented.
export default function BusinessStatus({ business }: { business: OverviewPayload['business'] }) {
  return (
    <AdminPanel
      title="Business"
      subtitle="Payments and subscriptions"
      action={<Link href="/admin/stripe" className="adm-action-link">Stripe →</Link>}
    >
      <div className="adm-business">
        <div className="adm-business-row">
          <span className="adm-business-name">Stripe</span>
          <StatusIndicator state={business.stripe.state} compact />
        </div>
        <p className="adm-business-detail">{business.stripe.detail}</p>
        <div className="adm-subheading">Planned for the Business section</div>
        <div className="adm-chip-row">
          {business.planned.map((p) => (
            <span key={p} className="adm-chip">{p}</span>
          ))}
        </div>
      </div>
    </AdminPanel>
  );
}
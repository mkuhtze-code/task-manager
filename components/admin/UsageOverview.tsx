import type { ProductAreaSummary } from '@/lib/admin/types';
import AdminPanel from './AdminPanel';
import MetricGrid from './MetricGrid';

// Detailed per-area read-out. Rows are the six product areas; each shows
// every metric that exists in the database for that surface. Anything not
// measurable at system level is called out in a per-area note instead of
// being invented.
export default function UsageOverview({
  areas,
  surfaces,
}: {
  areas: ProductAreaSummary[];
  surfaces: { today: number; jobs: number; travel: number };
}) {
  return (
    <AdminPanel
      title="Usage"
      subtitle="Real metrics drawn from activity data"
    >
      <div className="adm-usage">
        {areas.map((area) => (
          <div key={area.key} className="adm-usage-block">
            <div className="adm-usage-head">
              <span className="adm-usage-name">{area.name}</span>
              {area.note && <span className="adm-usage-note">{area.note}</span>}
            </div>
            <MetricGrid metrics={area.metrics} cols={4} />
          </div>
        ))}

        <div className="adm-usage-block">
          <div className="adm-usage-head">
            <span className="adm-usage-name">Surface activity</span>
            <span className="adm-usage-note">Deliberate navigation logged in the last 14 days</span>
          </div>
          <MetricGrid
            cols={3}
            metrics={[
              { key: 's-today', label: 'Today visits', value: surfaces.today, display: String(surfaces.today) },
              { key: 's-jobs', label: 'Jobs visits', value: surfaces.jobs, display: String(surfaces.jobs) },
              { key: 's-travel', label: 'Travel visits', value: surfaces.travel, display: String(surfaces.travel) },
            ]}
          />
        </div>
      </div>
    </AdminPanel>
  );
}
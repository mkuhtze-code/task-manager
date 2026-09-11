import type { OverviewMetric } from '@/lib/admin/types';

// Dense label/value chip used inside panels (accounts, product usage).
// Not clickable — these are detail read-outs, not navigation.
export default function MetricGrid({ metrics, cols = 4 }: { metrics: OverviewMetric[]; cols?: number }) {
  return (
    <div className="adm-metric-grid" style={{ '--adm-cols': cols } as React.CSSProperties}>
      {metrics.map((m) => (
        <div key={m.key} className="adm-stat" title={m.note}>
          <div className="adm-stat-value">
            {m.display}
            {m.note && <span className="adm-stat-note" title={m.note}>ⓘ</span>}
          </div>
          <div className="adm-stat-label">{m.label}</div>
        </div>
      ))}
    </div>
  );
}
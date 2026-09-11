import Link from 'next/link';
import type { OverviewMetric } from '@/lib/admin/types';

// A single headline number in the metric band. Clickable when the metric
// has a destination. Deltas appear only when a comparable prior period
// genuinely exists in the data — they are never manufactured.
export default function AdminMetric({ metric }: { metric: OverviewMetric }) {
  const inner = (
    <div className={`adm-metric${metric.state === 'attention' ? ' adm-metric-attention' : ''}${metric.state === 'critical' ? ' adm-metric-critical' : ''}`}>
      <div className="adm-metric-value">
        {metric.display}
        {metric.deltaLabel && metric.deltaDirection && (
          <span
            className={`adm-metric-delta adm-metric-delta-${metric.deltaDirection}`}
            title={metric.deltaGoodWhen && metric.deltaDirection !== 'flat' ? `${metric.deltaLabel} — ${metric.deltaGoodWhen === 'up' ? 'up' : 'down'} is better` : metric.deltaLabel}
          >
            {metric.deltaDirection === 'up' ? '▲' : metric.deltaDirection === 'down' ? '▼' : '•'} {metric.deltaLabel}
          </span>
        )}
      </div>
      <div className="adm-metric-label">{metric.label}</div>
      {metric.note && <div className="adm-metric-note">{metric.note}</div>}
    </div>
  );

  return metric.href ? (
    <Link href={metric.href} className="adm-metric-link" title={metric.note}>
      {inner}
    </Link>
  ) : (
    inner
  );
}
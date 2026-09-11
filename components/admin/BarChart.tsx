import { useId, useState } from 'react';
import { formatDayLabel } from './format';
import type { ChartSeries } from '@/lib/admin/types';

// Dependency-free SVG bar chart. One bar per data point with a hover
// tooltip; renders empty (zero-height baseline) when there is no data.
// `tone` maps onto CSS variables so the same chart works for signs and
// errors without hardcoding colour names in the component.
export default function BarChart({
  series,
  tone = 'steel',
  height = 72,
  emptyLabel = 'No data in this window',
}: {
  series: ChartSeries[];
  tone?: 'steel' | 'hazard' | 'moss';
  height?: number;
  emptyLabel?: string;
}) {
  const uid = useId().replace(/:/g, '');
  const max = Math.max(1, ...series.map((s) => s.value));
  const barWidth = 100 / Math.max(series.length, 1);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  return (
    <div className={`adm-chart adm-chart-${tone}`}>
      {series.length === 0 ? (
        <div className="adm-chart-empty">{emptyLabel}</div>
      ) : (
        <svg
          viewBox={`0 0 ${series.length} 100`}
          preserveAspectRatio="none"
          style={{ height, width: '100%' }}
          onMouseMove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const x = (e.clientX - rect.left) / Math.max(rect.width, 1);
            const index = Math.min(series.length - 1, Math.max(0, Math.floor(x * series.length)));
            setHoverIndex(index);
          }}
          onMouseLeave={() => setHoverIndex(null)}
        >
          {series.map((s, i) => {
            const h = Math.max((s.value / max) * 100, s.value > 0 ? 3 : 0);
            return (
              <g key={s.date}>
                <rect
                  id={`${uid}-bar-${i}`}
                  x={i + 0.12}
                  y={100 - h}
                  width={0.76}
                  height={h}
                  rx={0.5}
                  className="adm-chart-bar"
                />
              </g>
            );
          })}
        </svg>
      )}
      {series.length > 0 && (
        <>
          <div className="adm-chart-tags">
            <span>{formatDayLabel(series[0].date)}</span>
            <span>{series.length === 1 ? formatDayLabel(series[0].date) : formatDayLabel(series[series.length - 1].date)}</span>
          </div>
          {series.length <= 80 && hoverIndex !== null && (
            <div className="adm-chart-tooltips">
              <span className="adm-chart-tip" style={{ left: `${(hoverIndex + 0.5) * barWidth}%` }}>
                {formatDayLabel(series[hoverIndex].date)} · {series[hoverIndex].value}
              </span>
            </div>
          )}
        </>
      )}
    </div>
  );
}
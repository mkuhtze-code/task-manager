export type MetricCell = {
  label: string;
  value: string;
  note?: string;
};

export default function MetricGrid({ cells }: { cells: MetricCell[] }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
        gap: 12,
      }}
    >
      {cells.map((c) => (
        <div
          key={c.label}
          className="settings-panel"
          style={{ margin: 0, padding: '12px 14px' }}
        >
          <div style={{ fontSize: 11, color: 'var(--ink-faint)', marginBottom: 4 }}>{c.label}</div>
          <div style={{ fontSize: 22, fontWeight: 600, color: 'var(--ink)' }}>{c.value}</div>
          {c.note && (
            <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginTop: 4 }}>{c.note}</div>
          )}
        </div>
      ))}
    </div>
  );
}

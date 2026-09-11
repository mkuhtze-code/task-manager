// Consistent panel wrapper for the Admin dashboard. Title on the left,
// optional action slot on the right (refresh, links, filters).
export default function AdminPanel({
  title,
  subtitle,
  action,
  children,
  className = '',
  wide = false,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  wide?: boolean;
}) {
  return (
    <section className={`adm-panel${wide ? ' adm-panel-wide' : ''} ${className}`}>
      <div className="adm-panel-head">
        <div>
          <h2 className="adm-panel-title">{title}</h2>
          {subtitle && <p className="adm-panel-subtitle">{subtitle}</p>}
        </div>
        {action && <div className="adm-panel-action">{action}</div>}
      </div>
      {children}
    </section>
  );
}
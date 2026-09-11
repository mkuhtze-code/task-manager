import Link from 'next/link';

// Clearly-labelled "not yet implemented" state for Admin sections that do
// not have a page yet. Intentional: never looks like live production data.
export default function NotYetImplemented({
  title,
  group,
  description,
}: {
  title: string;
  group?: string;
  description: string;
}) {
  return (
    <div className="adm-page">
      <div className="adm-page-head">
        <div>
          <div className="adm-page-title">{title}</div>
          <p className="adm-page-description">{description}</p>
        </div>
        {group && <span className="adm-page-group">{group}</span>}
      </div>

      <section className="adm-panel adm-notimpl">
        <div className="adm-notimpl-badge">Not yet implemented</div>
        <p className="adm-notimpl-copy">
          This Admin section is part of the planned navigation but doesn&apos;t have a page yet.
          No data is shown here, so nothing here should be read as live.
        </p>
        <Link href="/admin" className="adm-action-link">← Back to Overview</Link>
      </section>
    </div>
  );
}
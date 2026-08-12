'use client';

import Link from 'next/link';
import GearMenu from './GearMenu';
import { BackIcon } from './icons';

export default function AppHeader({
  title,
  dateLabel,
  backHref,
}: {
  title?: string;
  dateLabel?: string;
  backHref?: string;
}) {
  return (
    <div className="app-header">
      <div className="app-header-left">
        {backHref && (
          <Link href={backHref} className="back-link" aria-label="Back">
            <BackIcon />
          </Link>
        )}
        {title && <h1 className="app-title">{title}</h1>}
      </div>
      <div className="app-header-right">
        {dateLabel && <div className="app-date">{dateLabel}</div>}
        <GearMenu />
      </div>
    </div>
  );
}

'use client';

import Link from 'next/link';
import GearMenu from './GearMenu';
import UtilityDone from '@/components/instrument/nav/UtilityDone';
import UpLink from '@/components/instrument/nav/UpLink';
import { BackIcon } from './icons';

export default function AppHeader({
  title,
  dateLabel,
  backHref,
  utilityDoneHref,
  upHref,
  upLabel,
}: {
  title?: string;
  dateLabel?: string;
  backHref?: string;
  utilityDoneHref?: string;
  upHref?: string;
  upLabel?: string;
}) {
  return (
    <div className="app-header">
      <div className="app-header-left">
        {utilityDoneHref ? (
          <UtilityDone href={utilityDoneHref} />
        ) : upHref && upLabel ? (
          <UpLink href={upHref} label={upLabel} />
        ) : backHref ? (
          <Link href={backHref} className="back-link" aria-label="Back">
            <BackIcon />
          </Link>
        ) : null}
        {title && <h1 className="app-title">{title}</h1>}
      </div>
      <div className="app-header-right">
        {dateLabel && <div className="app-date">{dateLabel}</div>}
        <GearMenu />
      </div>
    </div>
  );
}

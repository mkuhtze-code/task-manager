'use client';

import type { KeyboardEvent, ReactNode } from 'react';
import Link from 'next/link';

type ObjectRowProps = {
  state: string; identity?: ReactNode; glance?: ReactNode; context?: ReactNode;
  leading?: ReactNode; trailing?: ReactNode; children?: ReactNode; href?: string;
  onOpen?: () => void; className?: string; objectType?: 'task' | 'job' | 'meeting' | 'trip';
  ariaLabel?: string; id?: string; entityId?: string; part?: string;
};

/** Shared presentational scan-row owner; domain data and mutations stay in adapters. */
export default function ObjectRow({ state, identity, glance, context, leading, trailing, children, href, onOpen, className = '', objectType, ariaLabel, id, entityId, part }: ObjectRowProps) {
  const content = children ?? <>
    {leading ? <span className="ins-object-row__leading">{leading}</span> : null}
    <span className="ins-object-row__main">
      <span className="ins-object-row__top">
        <span className="ins-object-row__identity" data-experience-part="title">{identity}</span>
        {glance != null && glance !== '' ? <span className="ins-object-row__glance" data-experience-part="glance">{glance}</span> : null}
      </span>
      {context != null && context !== '' ? <div className="ins-object-row__context" data-experience-part="context">{context}</div> : null}
    </span>
    {trailing ? <span className="ins-object-row__trailing">{trailing}</span> : null}
  </>;
  const shared = {
    className: ['ins-object-row', children ? 'ins-object-row--bridge' : '', className].filter(Boolean).join(' '),
    'data-instrument-object': 'row',
    'data-object-state': state,
    ...(part ? { 'data-experience-part': part } : {}),
    ...(objectType ? { 'data-experience-object': objectType } : {}),
    ...(entityId && objectType === 'task' ? { 'data-task-id': entityId } : {}),
    ...(entityId && objectType === 'job' ? { 'data-job-id': entityId } : {}),
    ...(entityId && objectType === 'meeting' ? { 'data-meeting-id': entityId } : {}),
    ...(entityId && objectType === 'trip' ? { 'data-trip-id': entityId } : {}),
    ...(id ? { id } : {}),
    ...(ariaLabel ? { 'aria-label': ariaLabel } : {}),
  };
  if (href) return <Link href={href} {...shared}>{content}</Link>;
  return <div {...shared} {...(onOpen ? { role: 'button', tabIndex: 0, onClick: onOpen, onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onOpen(); }
  } } : {})}>{content}</div>;
}

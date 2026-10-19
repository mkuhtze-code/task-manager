'use client';

import ObjectRow from '@/components/instrument/ObjectRow';
import type { Meeting } from '@/lib/meetingTypes';
import ContextLine from '@/components/ContextLine';

type MeetingPressure = 'now' | 'soon' | 'done' | 'later' | 'open';

type MeetingObjectLinkProps = {
  meeting: Meeting;
  jobName: string | null;
  pressure: MeetingPressure;
  openActionCount: number;
  timeWindow: string;
  relativeLine?: string | null;
  hasNotes?: boolean;
  hasSummary?: boolean;
};

export default function MeetingObjectLink({
  meeting,
  jobName,
  pressure,
  openActionCount,
  timeWindow,
  relativeLine,
  hasNotes = false,
  hasSummary = false,
}: MeetingObjectLinkProps) {
  const stateLabel =
    pressure === 'now' ? 'live' :
    pressure === 'soon' ? 'soon' :
    pressure === 'done' ? 'past' : 'upcoming';
  const accessibleState = openActionCount > 0
    ? ', ' + openActionCount + ' open actions'
    : hasNotes || hasSummary ? ', captured' : '';

  return (
    <ObjectRow
      href={'/meetings/' + meeting.id}
      ariaLabel={meeting.text + ', ' + stateLabel + ', ' + timeWindow + accessibleState}
      className={'meeting-row surface-object pressure-' + pressure}
      objectType="meeting"
      entityId={meeting.id}
      state={stateLabel}
      identity={meeting.text}
      glance={<span title={relativeLine || undefined}>{timeWindow}{openActionCount > 0 ? ' · ' + openActionCount + ' open' : ''}</span>}
      context={jobName || meeting.location_text ? <ContextLine className="meeting-row-context" items={[
        ...(jobName ? [{ label: jobName, href: meeting.job_id ? '/jobs/' + meeting.job_id : undefined }] : []),
        ...(meeting.location_text ? [{ label: meeting.location_text }] : []),
      ]} /> : null}
      trailing={meeting.source === 'outlook' ? <span className="meeting-source-tag" title="Outlook calendar" aria-label="From Outlook">Outlook</span> : null}
    />
  );
}

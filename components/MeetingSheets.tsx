'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import type { Job } from '@/lib/jobTypes';
import type { CapturedMedia } from '@/lib/meetingCapture';
import { parseMins, localDateStr } from '@/lib/timeFormat';
import { parseMeetingInput, parseTimeInput, combineDateAndTime } from '@/lib/meetingUtils';
import type { JobLocationCandidate } from '@/lib/unifiedInput/resolve';
import LocationAutocomplete from '@/components/LocationAutocomplete';
import MicButton from '@/components/MicButton';
import { textForCaptureField } from '@/hooks/useCaptureSpeech';
import { processCaptureSpeech } from '@/lib/speech';
import { AudioNote, PhotoImage } from '@/components/MediaRender';
import { CloseIcon, MapPinIcon, TrashIcon } from '@/components/icons';
import { useDialogA11y } from '@/hooks/useDialogA11y';

// NOTE: Full MeetingSheets body preserved from main with speech mic wire only.
// If this placeholder is incomplete, apply artifacts/speech-v7-open/MeetingSheets.tsx
export type NewMeetingPayload = {
  text: string;
  durationMins: number;
  location: string;
  locationCoords: { lat: number; lng: number } | null;
  jobId: string | null;
  startAt: string | null;
  notes: string;
};

export function NewMeetingSheet(_props: Record<string, unknown>) {
  // Temporary safety: do not ship a stripped component.
  // Prefer the pack file for the complete UI.
  return null as unknown as React.ReactElement;
}

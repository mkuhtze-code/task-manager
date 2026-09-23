'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useSurfaceMode } from '@/hooks/useSurfaceMode';
import { useDesktopWorkspaceKeys } from '@/hooks/useDesktopWorkspaceKeys';
import { registerDesktopPrimaryAction } from '@/lib/captureOpen';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';
import type { Meeting } from '@/lib/meetingTypes';
import { fmtMeetingWindow } from '@/lib/meetingUtils';
import type { Job } from '@/lib/jobTypes';
import type { Subtask, Task } from '@/lib/taskTypes';
import { fmtMins, localDateStr, parseMins, isScheduledForLater } from '@/lib/timeFormat';
import { doneTasksOf, groupJobTasks, isJobDone, jobProgress, jobNextTask, onTodayCount } from '@/lib/jobUtils';
import GearMenu from '@/components/GearMenu';
import { TaskCard } from '@/components/TaskCard';
import { TaskDetailSheet } from '@/components/TaskDetailSheet';
import { CaptureSheet } from '@/components/CaptureSheet';
import { JobEditSheet } from '@/components/JobSheets';
import SurfaceNav from '@/components/SurfaceNav';
import { BackIcon, CheckIcon, ChevronIcon, MapPinIcon } from '@/components/icons';
import JobFilesPanel from '@/components/JobFilesPanel';
import JobObservationsPanel from '@/components/JobObservationsPanel';
import JobSwitcher from '@/components/JobSwitcher';
import PillReveal from '@/components/PillReveal';
import JobTripPill from '@/components/JobTripPill';
import JobSiteDays from '@/components/JobSiteDays';
import {
  buildClusters,
  suggestEstimate,
  suggestLocation,
  suggestsLocation,
  suggestJob,
  suggestLocationMemory,
  type HistoricalTask,
} from '@/lib/taskIntelligence';
import { closeCompletionLoop } from '@/lib/thinking/evidence/closeCompletionLoop';
import { decideCaptureContext } from '@/lib/thinking/decisions/captureContext';
import { decidePersonalGravity } from '@/lib/thinking/decisions/personalGravity';
import type { SurfaceEvent } from '@/lib/thinking/types';
import { parseThought, type ThoughtParts } from '@/lib/unifiedInput/parse';
import {
  resolveJobAndLocation,
  deriveAliasTerm,
  type JobLocationResolution,
  type JobLocationCandidate,
  type EntityAliasMemory,
  type EntityRelationshipMemory,
} from '@/lib/unifiedInput/resolve';

// PLACEHOLDER_FULL_FILE

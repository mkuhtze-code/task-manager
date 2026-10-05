'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useSurfaceMode } from '@/hooks/useSurfaceMode';
import { useEntitlements } from '@/hooks/useEntitlements';
import { useProRedirect } from '@/hooks/useProRedirect';
import ProPlanGate from '@/components/ProPlanGate';
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
import { closeCompletionLoop, historyRowFromCompletion } from '@/lib/thinking/evidence/closeCompletionLoop';
import { isStarterTask } from '@/lib/starterPack';
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

// The Job detail page is a LENS over the same Tasks Today shows.

export default function JobDetailPage() {
  const router = useRouter();
  const params = useParams<{ jobId: string }>();
  const jobId = params.jobId;
  const { isDesktop } = useSurfaceMode();

  const [session, setSession] = useState<any>(null);
  const { entitlements, loading: entLoading } = useEntitlements(session?.user?.id);
  const canJobs = entitlements.canUseJobs;
  useProRedirect(!entLoading && Boolean(session), canJobs, 'jobs');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [jobMeetings, setJobMeetings] = useState<Meeting[]>([]);
  const [subtasksByTask, setSubtasksByTask] = useState<Record<string, Subtask[]>>({});
  const [jobs, setJobs] = useState<Job[]>([]);
  const [editOpen, setEditOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [doneOpen, setDoneOpen] = useState(false);
  /** Mobile-only section focus: tasks | evidence | more */
  const [mobileTab, setMobileTab] = useState<'tasks' | 'evidence' | 'more'>('tasks');
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [subDraftText, setSubDraftText] = useState<Record<string, string>>({});
  const [subDraftTime, setSubDraftTime] = useState<Record<string, string>>({});

  const [captureOpen, setCaptureOpen] = useState(false);
  const [captureText, setCaptureText] = useState('');
  const [captureTime, setCaptureTime] = useState('');
  const [captureLocation, setCaptureLocation] = useState('');
  const [captureLocationCoords, setCaptureLocationCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [manualLocationToggle, setManualLocationToggle] = useState(false);
  const [showReminderField, setShowReminderField] = useState(false);
  const [captureSurfaceDate, setCaptureSurfaceDate] = useState('');
  const [captureJobId, setCaptureJobId] = useState<string | null>(null);
  const [captureError, setCaptureError] = useState('');

  const [thought, setThought] = useState<ThoughtParts | null>(null);
  const [locationResolution, setLocationResolution] = useState<JobLocationResolution | null>(null);
  const [intendedTime, setIntendedTime] = useState('');
  const [confirmedJobId, setConfirmedJobId] = useState<string | null>(null);
  const [confirmedLocation, setConfirmedLocation] = useState<{ text: string; lat: number | null; lng: number | null } | null>(null);
  const [declinedResolution, setDeclinedResolution] = useState(false);
  // Confirmation/skip decisions belong to the exact capture text that
  // produced them. Resolver refreshes must not erase an explicit decision,
  // but changing the text must invalidate the old decision.
  const confirmedInputRef = useRef<string | null>(null);
  const [entityAliases, setEntityAliases] = useState<EntityAliasMemory[]>([]);

  const [history, setHistory] = useState<HistoricalTask[]>([]);
  const clusters = useMemo(() => buildClusters(history), [history]);
  const [surfaceEvents, setSurfaceEvents] = useState<SurfaceEvent[]>([]);
  const gravityDecision = useMemo(
    () => decidePersonalGravity(surfaceEvents),
    [surfaceEvents]
  );

  const activeEntityIds = useMemo(() => new Set(jobs.map((j) => j.id)), [jobs]);

  const entityMemory = useMemo<EntityRelationshipMemory>(
    () => ({
      aliases: entityAliases.filter((a) => a.active),
      activeEntityIds,
    }),
    [entityAliases, activeEntityIds]
  );

  useEffect(() => {
    const raw = captureText.trim();
    if (raw.length === 0) {
      setThought(null);
      setLocationResolution(null);
      setIntendedTime('');
      confirmedInputRef.current = null;
      setConfirmedJobId(null);
      setConfirmedLocation(null);
      setDeclinedResolution(false);
      return;
    }
    const parsed = parseThought(raw);
    setThought(parsed);
    const resolution = resolveJobAndLocation(parsed, jobs, entityMemory);
    setLocationResolution(resolution);
    setIntendedTime(parsed.time ? parsed.time.label : '');

    // An explicit Yes/Skip decision belongs to this exact capture text.
    // Re-running the resolver must not silently undo that decision.
    const sameConfirmedInput = confirmedInputRef.current === raw;

    if (!sameConfirmedInput) {
      confirmedInputRef.current = null;
      setConfirmedJobId(null);
      setConfirmedLocation(null);
      setDeclinedResolution(false);
    }

    if (resolution.state === 'known' && !sameConfirmedInput) {
      const c = resolution.candidate;
      setConfirmedJobId(c.jobId);
      setConfirmedLocation({
        text: c.matchedField === 'location' && c.locationText ? c.locationText : c.jobName,
        lat: c.lat,
        lng: c.lng,
      });
    }
    if (resolution.state === 'none' && parsed.locationHint && parsed.locationHint.length > 0) {
      setCaptureLocation((prev) => (prev.trim().length > 0 ? prev : parsed.locationHint!));
      setManualLocationToggle(true);
    }
  }, [captureText, jobs, entityMemory]);

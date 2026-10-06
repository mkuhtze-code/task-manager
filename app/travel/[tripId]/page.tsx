'use client';

import '../travel.css';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';
import { authedFetch } from '@/lib/authedFetch';
import LocationAutocomplete from '@/components/LocationAutocomplete';
import LibrarySheet from '@/components/LibrarySheet';
import NearbySheet, { NearbySuggestion } from '@/components/NearbySheet';
import AccommodationSheet from '@/components/AccommodationSheet';
import TravelVaultSheet from '@/components/TravelVaultSheet';
import DaySheet from '@/components/DaySheet';
import TripDayMeetings from '@/components/TripDayMeetings';
import MapView from '@/components/MapView';
import { TravelLeg } from '@/components/TravelLeg';
import { sortActivities, findFixedTimeConflicts, SortMode as TravelSortMode } from '@/lib/travelSort';
import GearMenu from '@/components/GearMenu';
import {
  BackIcon,
  BedIcon,
  CheckIcon,
  ChevronIcon,
  CloseIcon,
  CompassIcon,
  DragHandleIcon,
  FitCheckIcon,
  LockIcon,
  MapPinIcon,
  PlusIcon,
  TrashIcon,
} from '@/components/icons';
import SurfaceNav from '@/components/SurfaceNav';
import { useSurfaceMode } from '@/hooks/useSurfaceMode';
import { useEntitlements } from '@/hooks/useEntitlements';
import { useProRedirect } from '@/hooks/useProRedirect';
import ProPlanGate from '@/components/ProPlanGate';
import type { Job } from '@/lib/jobTypes';
import {
  STOP_KIND_OPTIONS,
  PRESENCE_OPTIONS,
  presenceToSchedule,
  formatStopGlance,
  stopKindLabel,
  type StopKind,
  type StopPresence,
} from '@/lib/travelStopTypes';
import { computeTravelPresenceImpact } from '@/lib/travelPresence';
import { registerDesktopPrimaryAction } from '@/lib/captureOpen';
import { closeCompletionLoop } from '@/lib/thinking/evidence/closeCompletionLoop';
import { fetchDurationHistory } from '@/lib/thinking/loadDurationHistory';
import { buildClusters, type HistoricalTask } from '@/lib/taskIntelligence';

// NOTE: Full trip day implementation temporarily re-exported from backup blob.
// If this file is incomplete, restore from commit 1fce43d and re-apply vault wire.
export { default } from './TripDayViewImpl';

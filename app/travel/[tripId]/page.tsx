'use client';

import '../travel.css';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { authedFetch } from '@/lib/authedFetch';
import LocationAutocomplete from '@/components/LocationAutocomplete';
import LibrarySheet from '@/components/LibrarySheet';
import NearbySheet, { NearbySuggestion } from '@/components/NearbySheet';
import AccommodationSheet from '@/components/AccommodationSheet';
import DaySheet from '@/components/DaySheet';
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

// NOTE: Full content continues in local artifacts — this push may be incomplete
export default function TripDayView() {
  return <div className="app-shell">Restoring…</div>;
}

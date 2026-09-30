/**
 * Quiet surface language — profile-aware, never marketing.
 */

import type { UserProfile } from '@/lib/userProfile';

export type SurfaceKey = 'today' | 'jobs' | 'travel' | 'meetings';

export function todayEmptyCopy(profile: UserProfile): {
  title: string;
  sub: string;
} {
  if (profile.role === 'student') {
    return {
      title: 'Clear day.',
      sub: 'Add study or admin when it shows up.',
    };
  }
  if (profile.role === 'personal') {
    return {
      title: 'Clear day.',
      sub: 'Capture only what needs remembering.',
    };
  }
  if (profile.travelEmphasis) {
    return {
      title: 'Clear day.',
      sub: 'Add work as it lands. Places count when you set them.',
    };
  }
  if (profile.jobsEmphasis === 'heavy' || profile.jobsEmphasis === 'medium') {
    return {
      title: 'Clear day.',
      sub: 'Capture a task, or open a job when a project needs a home.',
    };
  }
  return {
    title: 'Clear day.',
    sub: 'Add what needs doing when it lands.',
  };
}

export function jobsEmptyCopy(profile: UserProfile): {
  title: string;
  sub: string;
} {
  if (profile.jobsEmphasis === 'off') {
    return {
      title: 'Jobs stay optional.',
      sub: 'Keep everything on Today if that is simpler.',
    };
  }
  if (profile.jobsEmphasis === 'heavy') {
    return {
      title: 'No jobs yet.',
      sub: 'Projects live here. Due work still appears on Today.',
    };
  }
  return {
    title: 'No jobs yet.',
    sub: 'Group related work only when it helps.',
  };
}

export function orderedNavSurfaces(profile: UserProfile): SurfaceKey[] {
  const base: SurfaceKey[] = ['today', 'jobs', 'travel', 'meetings'];
  const weight: Record<SurfaceKey, number> = {
    today: 100,
    jobs:
      profile.jobsEmphasis === 'heavy'
        ? 90
        : profile.jobsEmphasis === 'medium'
          ? 70
          : profile.jobsEmphasis === 'off'
            ? 20
            : 50,
    travel: profile.travelEmphasis ? 85 : 40,
    meetings: profile.meetingsEmphasis ? 80 : 35,
  };
  return [...base].sort((a, b) => weight[b] - weight[a]);
}

export function firstSessionLine(profile: UserProfile): string | null {
  if (profile.role === 'trades' || profile.workType === 'trades_field') {
    return 'Add the next job or stop. Lists first; structure only if you need it.';
  }
  if (profile.role === 'personal') {
    return 'Add anything you need to remember. One place is enough.';
  }
  if (profile.meetingsEmphasis) {
    return 'Add work for the gaps around meetings — they already count.';
  }
  if (profile.role === 'knowledge_worker') {
    return 'Add what should fit today. Dokkit learns from finish and carry.';
  }
  return 'Add what needs doing. Ordinary use is enough — no setup homework.';
}

export function surfacePurpose(key: SurfaceKey): string {
  switch (key) {
    case 'today':
      return 'What can fit today';
    case 'jobs':
      return 'Work that spans days';
    case 'meetings':
      return 'Capture the moment';
    case 'travel':
      return 'Trips that reshape the day';
    default:
      return '';
  }
}

export function surfaceEmptyPurpose(key: Exclude<SurfaceKey, 'today'>): {
  title: string;
  sub: string;
} {
  switch (key) {
    case 'jobs':
      return {
        title: 'No jobs yet.',
        sub: 'A home for work that spans days — optional until a project needs one.',
      };
    case 'meetings':
      return {
        title: 'No meetings recorded.',
        sub: 'Capture who, when, and which job — while it is still fresh.',
      };
    case 'travel':
      return {
        title: 'No trips yet.',
        sub: 'Block the days you are away so Today stays honest.',
      };
  }
}

/**
 * List order framing — plain language, cold-start honest.
 * Never invent certainty.
 */
export function dayOrderHint(opts: {
  sortMode: string;
  personalEvidenceCount?: number | null;
}): string | null {
  const n = opts.personalEvidenceCount ?? 0;
  const cold = n < 5;
  if (opts.sortMode === 'capacity_first') {
    return cold
      ? 'Order improves as you work'
      : 'Likely to fit, first';
  }
  if (opts.sortMode === 'geo_aware') {
    return cold
      ? 'Travel-aware · still learning durations'
      : 'Travel-aware order';
  }
  return null;
}

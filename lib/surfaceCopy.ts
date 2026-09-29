/**
 * Quiet first-session / empty-state copy from onboarding profile.
 * Not marketing — just less generic language.
 */

import type { UserProfile } from '@/lib/userProfile';

export type SurfaceKey = 'today' | 'jobs' | 'travel' | 'meetings';

export function todayEmptyCopy(profile: UserProfile): {
  title: string;
  sub: string;
} {
  if (profile.role === 'student') {
    return {
      title: 'Nothing on the plate.',
      sub: 'Add study or admin when it lands. Capacity will keep it honest.',
    };
  }
  if (profile.role === 'personal') {
    return {
      title: 'Nothing waiting.',
      sub: 'Capture when something needs remembering. No need to fill the day.',
    };
  }
  if (profile.travelEmphasis) {
    return {
      title: 'Nothing waiting.',
      sub: 'Add work as it comes up. Locations and travel will count when you set them.',
    };
  }
  if (profile.jobsEmphasis === 'heavy' || profile.jobsEmphasis === 'medium') {
    return {
      title: 'Nothing waiting.',
      sub: 'Capture a task or open a job. What fits today stays clear.',
    };
  }
  return {
    title: 'Nothing waiting.',
    sub: "Capture when something lands. You're good to go.",
  };
}

export function jobsEmptyCopy(profile: UserProfile): {
  title: string;
  sub: string;
} {
  if (profile.jobsEmphasis === 'off') {
    return {
      title: 'Jobs are optional.',
      sub: 'You can keep everything on Today. Open a job only if a project needs a home.',
    };
  }
  if (profile.jobsEmphasis === 'heavy') {
    return {
      title: 'No jobs yet.',
      sub: 'Sites and projects live here. Tasks still show on Today when they are due.',
    };
  }
  return {
    title: 'No jobs yet.',
    sub: 'Group related work when it helps — not required.',
  };
}

/** Order nav surfaces so emphasized products sit earlier (still all available). */
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
  // UX-2: always give a calm first-session cue when profile is known
  if (profile.role === 'professional' && profile.travelEmphasis) {
    return 'Add what needs doing — locations and capacity matter more on field-style days.';
  }
  if (profile.role === 'professional' && profile.jobsEmphasis === 'heavy') {
    return 'Add a task for today. Jobs can wait until a project needs a home.';
  }
  if (profile.role === 'student') {
    return 'Add what is on your plate — lists first, light structure.';
  }
  if (profile.role === 'personal') {
    return 'Add anything you need to remember. One calm place is enough.';
  }
  if (profile.meetingsEmphasis) {
    return 'Add work for the gaps around meetings — they already count against the day.';
  }
  if (profile.role === 'knowledge_worker') {
    return 'Add what should fit today. Dokkit learns from what you finish and carry.';
  }
  return 'Add what needs doing. Reality Check later is how Dokkit learns — no extra homework.';
}

/** One-line purpose for nav menu / empty states — why this surface exists. */
export function surfacePurpose(key: SurfaceKey): string {
  switch (key) {
    case 'today':
      return 'What can fit today';
    case 'jobs':
      return 'Work that spans days, in one place';
    case 'meetings':
      return 'Capture the moment; structure it later';
    case 'travel':
      return 'Trips that reshape what fits';
    default:
      return '';
  }
}

/** Short empty-state purpose (Pro surfaces, when list is empty). */
export function surfaceEmptyPurpose(key: Exclude<SurfaceKey, 'today'>): {
  title: string;
  sub: string;
} {
  switch (key) {
    case 'jobs':
      return {
        title: 'No jobs yet.',
        sub: 'A job is a home for work that spans days — tasks, places, and evidence stay together. Optional until a project needs one.',
      };
    case 'meetings':
      return {
        title: 'No meetings recorded.',
        sub: 'Capture who met, when, and around which job — while it is still fresh. Structure can wait.',
      };
    case 'travel':
      return {
        title: 'Where to next?',
        sub: 'Block the days you are away. Dokkit uses the trip so Today reflects what can still fit.',
      };
  }
}

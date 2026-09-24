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
  if (profile.role === 'professional' && profile.travelEmphasis) {
    return 'Set up for field-style days — locations and capacity matter more.';
  }
  if (profile.role === 'student') {
    return 'Set up for study — lists first, light structure.';
  }
  if (profile.role === 'personal') {
    return 'Kept simple — one place for what you need to remember.';
  }
  if (profile.meetingsEmphasis) {
    return 'Meetings will count clearly against the day.';
  }
  return null;
}

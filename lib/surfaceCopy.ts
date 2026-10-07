/**
 * Shared Dokkit language for the four time projections.
 * The surfaces remain distinct; their relationship to the whole stays explicit.
 */
import type { UserProfile } from '@/lib/userProfile';

export type SurfaceKey = 'today' | 'jobs' | 'travel' | 'meetings';

export function todayEmptyCopy(profile: UserProfile): { title: string; sub: string } {
  if (profile.role === 'student') return { title: 'Clear day.', sub: 'Add study or admin when it shows up.' };
  if (profile.role === 'personal') return { title: 'Clear day.', sub: 'Capture only what needs remembering.' };
  if (profile.travelEmphasis) return { title: 'Clear day.', sub: 'Add work as it lands. Places count when you set them.' };
  if (profile.jobsEmphasis === 'heavy' || profile.jobsEmphasis === 'medium') return { title: 'Clear day.', sub: 'Capture a task, or open a job when a project needs a home.' };
  return { title: 'Clear day.', sub: 'Add what needs doing when it lands.' };
}

export function jobsEmptyCopy(profile: UserProfile): { title: string; sub: string } {
  if (profile.jobsEmphasis === 'off') return { title: 'Jobs stay optional.', sub: 'Keep everything on Today if that is simpler.' };
  if (profile.jobsEmphasis === 'heavy') return { title: 'No jobs yet.', sub: 'Projects live here. Their work still belongs to the same time you see on Today.' };
  return { title: 'No jobs yet.', sub: 'Group related work when it helps. The work still lives in your day.' };
}

export function orderedNavSurfaces(_profile: UserProfile): SurfaceKey[] {
  // Personalisation may change what Dokkit emphasises inside a surface.
  // It must not change the user's map of the product: four stable lenses.
  return ['today', 'jobs', 'meetings', 'travel'];
}

export function firstSessionLine(profile: UserProfile): string | null {
  if (profile.role === 'trades' || profile.workType === 'trades_field') return 'Add the next job or stop. Lists first; structure only if you need it.';
  if (profile.role === 'personal') return 'Add anything you need to remember. One place is enough.';
  if (profile.meetingsEmphasis) return 'Add work for the gaps around meetings — they already count.';
  if (profile.role === 'knowledge_worker') return 'Add what should fit today. Dokkit learns from finish and carry.';
  return 'Add what needs doing. Ordinary use is enough — no setup homework.';
}

export function surfacePurpose(key: SurfaceKey): string {
  switch (key) {
    case 'today': return 'Your whole day — what fits, what is fixed, and what needs attention';
    case 'jobs': return 'Your work across days — the same work that can occupy Today';
    case 'meetings': return 'Your conversations in time — commitments, context, and what they leave behind';
    case 'travel': return 'Your movement through time and place — changing what the day can hold';
    default: return '';
  }
}

export function surfaceEmptyPurpose(key: Exclude<SurfaceKey, 'today'>): { title: string; sub: string } {
  switch (key) {
    case 'jobs': return { title: 'No jobs yet.', sub: 'A home for work that spans days. When work lands on Today, it remains the same work here.' };
    case 'meetings': return { title: 'No meetings recorded.', sub: 'Conversations become part of the same day, with their context and follow-through.' };
    case 'travel': return { title: 'No trips yet.', sub: 'Movement changes available time. Plan it here so Today can account for it.' };
  }
}

export function dayOrderHint(opts: { sortMode: string; personalEvidenceCount?: number | null }): string | null {
  const n = opts.personalEvidenceCount ?? 0;
  if (opts.sortMode === 'capacity_first') {
    if (n < 3) return 'Order improves as you work';
    if (n < 15) return 'Ordered by what tends to fit';
    return 'Likely to fit, first';
  }
  if (opts.sortMode === 'geo_aware') {
    if (n < 3) return 'Travel-aware · still learning';
    if (n < 15) return 'Travel-aware order';
    return 'Route and fit';
  }
  return null;
}
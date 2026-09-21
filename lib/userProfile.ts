/**
 * User profile derived from onboarding (and later from observed behaviour).
 *
 * Onboarding seeds priors. Observed durations and carry outcomes override
 * them. This module is the single place the app reads those priors so the
 * thinking engine can start adapted on day one.
 */

import type { OnboardingAnswers, OnboardingDefaults } from '@/lib/onboardingTypes';
import { getOnboardingDefaults } from '@/lib/onboardingDefaults';
import type { SortMode } from '@/lib/taskTypes';
import { BASE_SOFT_FLOOR_MINS } from '@/lib/thinking/calibration';

export type SameDayProtection = 'low' | 'medium' | 'high';
export type JobsEmphasis = 'off' | 'light' | 'medium' | 'heavy';

/** Runtime profile used by capacity, carry, and UI emphasis. */
export type UserProfile = {
  role: string | null;
  workType: string | null;
  carryStyle: string | null;
  dayShape: string | null;
  softCostScale: number;
  sameDayProtection: SameDayProtection;
  jobsEmphasis: JobsEmphasis;
  travelEmphasis: boolean;
  meetingsEmphasis: boolean;
  /** Soft floor for untimed tasks before calibration has enough samples. */
  softFloorBaseMins: number;
  /** Suggested sort mode when travel is central to the day. */
  suggestedSortMode: SortMode;
  /** Thresholds for urgency / carry protection. */
  anchorSameDayRate: number;
  flexibleSameDayRate: number;
};

const DEFAULT_PROFILE: UserProfile = {
  role: null,
  workType: null,
  carryStyle: null,
  dayShape: null,
  softCostScale: 1,
  sameDayProtection: 'medium',
  jobsEmphasis: 'light',
  travelEmphasis: false,
  meetingsEmphasis: false,
  softFloorBaseMins: BASE_SOFT_FLOOR_MINS,
  suggestedSortMode: 'capacity_first',
  anchorSameDayRate: 0.55,
  flexibleSameDayRate: 0.4,
};

/** Map same-day protection to behaviour thresholds used by dayFit. */
export function thresholdsForProtection(p: SameDayProtection): {
  anchorSameDayRate: number;
  flexibleSameDayRate: number;
} {
  switch (p) {
    case 'high':
      // Prefer protecting items — fewer things auto-carry.
      return { anchorSameDayRate: 0.4, flexibleSameDayRate: 0.25 };
    case 'low':
      // Prefer flexible carry — only strong same-day pattern protects.
      return { anchorSameDayRate: 0.7, flexibleSameDayRate: 0.5 };
    default:
      return { anchorSameDayRate: 0.55, flexibleSameDayRate: 0.4 };
  }
}

export function softFloorFromScale(scale: number): number {
  const mins = Math.round(BASE_SOFT_FLOOR_MINS * (scale > 0 ? scale : 1));
  return Math.min(45, Math.max(15, mins));
}

export function profileFromDefaults(
  defaults: OnboardingDefaults,
  answers?: OnboardingAnswers | null
): UserProfile {
  const thresholds = thresholdsForProtection(defaults.sameDayProtection);
  const travel = defaults.travelEmphasis;
  return {
    role: answers?.role ?? null,
    workType: answers?.workType ?? null,
    carryStyle: answers?.carryStyle ?? null,
    dayShape: answers?.dayShape ?? answers?.dayFeel ?? null,
    softCostScale: defaults.softCostScale,
    sameDayProtection: defaults.sameDayProtection,
    jobsEmphasis: defaults.jobsEmphasis,
    travelEmphasis: travel,
    meetingsEmphasis: defaults.meetingsEmphasis,
    softFloorBaseMins: softFloorFromScale(defaults.softCostScale),
    suggestedSortMode: travel ? 'geo_aware' : 'capacity_first',
    ...thresholds,
  };
}

export function profileFromAnswers(answers: OnboardingAnswers): UserProfile {
  return profileFromDefaults(getOnboardingDefaults(answers), answers);
}

/**
 * Build a profile from persisted user_settings columns.
 * Falls back to defaults when columns are null (pre-onboarding users).
 */
export function profileFromSettings(row: {
  role?: string | null;
  work_type?: string | null;
  carry_style?: string | null;
  day_shape?: string | null;
  soft_cost_scale?: number | null;
  same_day_protection?: string | null;
  jobs_emphasis?: string | null;
  travel_emphasis?: boolean | null;
  meetings_emphasis?: boolean | null;
  onboarding_answers?: OnboardingAnswers | null;
}): UserProfile {
  // Prefer full answers when present (richest source).
  if (row.onboarding_answers && row.onboarding_answers.role) {
    const fromAnswers = profileFromAnswers(row.onboarding_answers);
    // Allow column overrides if they were later tuned.
    if (row.soft_cost_scale != null && row.soft_cost_scale > 0) {
      fromAnswers.softCostScale = row.soft_cost_scale;
      fromAnswers.softFloorBaseMins = softFloorFromScale(row.soft_cost_scale);
    }
    if (
      row.same_day_protection === 'low' ||
      row.same_day_protection === 'medium' ||
      row.same_day_protection === 'high'
    ) {
      fromAnswers.sameDayProtection = row.same_day_protection;
      const t = thresholdsForProtection(row.same_day_protection);
      fromAnswers.anchorSameDayRate = t.anchorSameDayRate;
      fromAnswers.flexibleSameDayRate = t.flexibleSameDayRate;
    }
    return fromAnswers;
  }

  const protection: SameDayProtection =
    row.same_day_protection === 'low' ||
    row.same_day_protection === 'high' ||
    row.same_day_protection === 'medium'
      ? row.same_day_protection
      : 'medium';

  const scale =
    typeof row.soft_cost_scale === 'number' && row.soft_cost_scale > 0
      ? row.soft_cost_scale
      : 1;

  const jobs: JobsEmphasis =
    row.jobs_emphasis === 'off' ||
    row.jobs_emphasis === 'light' ||
    row.jobs_emphasis === 'medium' ||
    row.jobs_emphasis === 'heavy'
      ? row.jobs_emphasis
      : 'light';

  const travel = Boolean(row.travel_emphasis);
  const thresholds = thresholdsForProtection(protection);

  return {
    role: row.role ?? null,
    workType: row.work_type ?? null,
    carryStyle: row.carry_style ?? null,
    dayShape: row.day_shape ?? null,
    softCostScale: scale,
    sameDayProtection: protection,
    jobsEmphasis: jobs,
    travelEmphasis: travel,
    meetingsEmphasis: Boolean(row.meetings_emphasis),
    softFloorBaseMins: softFloorFromScale(scale),
    suggestedSortMode: travel ? 'geo_aware' : 'capacity_first',
    ...thresholds,
  };
}

export function defaultUserProfile(): UserProfile {
  return { ...DEFAULT_PROFILE };
}

/** Columns to write on completeOnboarding so the next session loads the same priors. */
export function settingsPatchFromProfile(profile: UserProfile): Record<string, unknown> {
  return {
    soft_cost_scale: profile.softCostScale,
    same_day_protection: profile.sameDayProtection,
    jobs_emphasis: profile.jobsEmphasis,
    travel_emphasis: profile.travelEmphasis,
    meetings_emphasis: profile.meetingsEmphasis,
    sort_mode: profile.suggestedSortMode,
  };
}

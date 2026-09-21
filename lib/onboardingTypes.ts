/**
 * Onboarding questionnaire answers.
 * Used to seed initial defaults (capacity, Jobs emphasis, carry behaviour,
 * starter content) so Dokkit feels tailored from the first day.
 * Observed behaviour quickly overrides these priors.
 */

export type UserRole =
  | 'professional'
  | 'student'
  | 'knowledge_worker'
  | 'personal'
  | 'other';

export type ProfessionalWorkType =
  | 'trades_field'
  | 'client_services'
  | 'creative'
  | 'operations'
  | 'other_professional';

export type DayShape =
  | 'mostly_on_the_move'
  | 'mix_base_and_sites'
  | 'one_location_interruptions'
  | 'fairly_structured'
  | 'other';

export type CarryStyle =
  | 'mostly_moves'
  | 'mixed'
  | 'prefer_same_day'
  | 'unsure';

export type StudentLevel =
  | 'high_school'
  | 'undergraduate'
  | 'postgraduate'
  | 'professional_course'
  | 'other';

export type DayEater =
  | 'travel'
  | 'meetings'
  | 'unexpected_jobs'
  | 'admin'
  | 'waiting'
  | 'deep_work_interruptions'
  | 'none';

export type StudentPressure =
  | 'assignments'
  | 'exams'
  | 'classes_plus_work'
  | 'research'
  | 'group_projects'
  | 'staying_on_top';

export type DayFeel =
  | 'structured_flexible'
  | 'interrupt_driven'
  | 'project_based'
  | 'mix'
  | 'other';

export type HelpWith =
  | 'mental_load'
  | 'what_fits_today'
  | 'rolling_over'
  | 'work_life_balance'
  | 'one_calm_place';

export interface OnboardingAnswers {
  // Q1
  role: UserRole;

  // Professional path
  workType?: ProfessionalWorkType;
  dayShape?: DayShape;
  dayEaters?: DayEater[];

  // Student path
  studentLevel?: StudentLevel;
  studentPressures?: StudentPressure[];
  hasFixedCommitments?: 'yes' | 'sometimes' | 'rarely';

  // Knowledge / Personal path
  dayFeel?: DayFeel;
  helpWith?: HelpWith[];

  // Shared
  carryStyle: CarryStyle;
  notes?: string;
}

/** Defaults derived from answers — applied once at end of onboarding. */
export type OnboardingDefaults = {
  /** Soft-cost multiplier for untimed tasks (1.0 = baseline). */
  softCostScale: number;
  /** How aggressively same-day anchors are protected. */
  sameDayProtection: 'low' | 'medium' | 'high';
  /** Whether Jobs should be emphasised in the UI. */
  jobsEmphasis: 'off' | 'light' | 'medium' | 'heavy';
  /** Whether Travel / location features should be elevated. */
  travelEmphasis: boolean;
  /** Whether Meetings should be treated as first-class. */
  meetingsEmphasis: boolean;
  /** Short human-readable summary for the confirmation screen. */
  summaryLines: string[];
};

import type {
  OnboardingAnswers,
  OnboardingDefaults,
  ProfessionalWorkType,
  UserRole,
} from './onboardingTypes';

/**
 * Derive initial product defaults from onboarding answers.
 * These are priors only — observed durations and carry behaviour
 * override them as the user works.
 */
export function getOnboardingDefaults(answers: OnboardingAnswers): OnboardingDefaults {
  const role = answers.role;
  const workType = answers.workType;
  const carry = answers.carryStyle;
  const dayEaters = answers.dayEaters ?? [];
  const dayShape = answers.dayShape;

  // ── Soft cost scale (untimed tasks) ─────────────────────────────
  let softCostScale = 1.0;
  if (role === 'professional' && (workType === 'trades_field' || workType === 'operations')) {
    softCostScale = 1.25;
  } else if (role === 'student') {
    softCostScale = 0.95;
  } else if (role === 'personal') {
    softCostScale = 0.85;
  }

  // ── Same-day protection ─────────────────────────────────────────
  let sameDayProtection: OnboardingDefaults['sameDayProtection'] = 'medium';
  if (carry === 'prefer_same_day') sameDayProtection = 'high';
  else if (carry === 'mostly_moves') sameDayProtection = 'low';
  else if (role === 'personal') sameDayProtection = 'low';

  // ── Jobs emphasis ───────────────────────────────────────────────
  let jobsEmphasis: OnboardingDefaults['jobsEmphasis'] = 'light';
  if (role === 'professional') {
    if (workType === 'trades_field') jobsEmphasis = 'heavy';
    else if (workType === 'client_services' || workType === 'operations') jobsEmphasis = 'medium';
    else if (workType === 'creative') jobsEmphasis = 'medium';
  } else if (role === 'student' || role === 'personal') {
    jobsEmphasis = 'off';
  } else if (role === 'knowledge_worker') {
    jobsEmphasis = 'light';
  }

  // ── Travel & Meetings ───────────────────────────────────────────
  const highTravel =
    dayShape === 'mostly_on_the_move' ||
    dayShape === 'mix_base_and_sites' ||
    dayEaters.includes('travel') ||
    workType === 'trades_field' ||
    workType === 'operations';

  const highMeetings =
    dayEaters.includes('meetings') ||
    workType === 'client_services' ||
    role === 'knowledge_worker';

  // ── Summary lines for confirmation screen ───────────────────────
  const summaryLines = buildSummaryLines(answers, {
    jobsEmphasis,
    highTravel,
    highMeetings,
    sameDayProtection,
  });

  return {
    softCostScale,
    sameDayProtection,
    jobsEmphasis,
    travelEmphasis: highTravel,
    meetingsEmphasis: highMeetings,
    summaryLines,
  };
}

function buildSummaryLines(
  answers: OnboardingAnswers,
  flags: {
    jobsEmphasis: OnboardingDefaults['jobsEmphasis'];
    highTravel: boolean;
    highMeetings: boolean;
    sameDayProtection: OnboardingDefaults['sameDayProtection'];
  }
): string[] {
  const lines: string[] = [];
  const { role, workType } = answers;

  if (role === 'professional' && workType === 'trades_field') {
    lines.push('Jobs are front and centre — multi-day work stays visible without heavy project structure.');
    lines.push('Capacity includes realistic room for travel and the way site work actually unfolds.');
  } else if (role === 'professional' && workType === 'client_services') {
    lines.push('Jobs are available for client work, but you’re not forced into heavy structure.');
    lines.push('Capacity protects focus time while still leaving room for calls and changes.');
  } else if (role === 'professional' && workType === 'creative') {
    lines.push('Larger pieces of work can live as Jobs so they don’t get lost.');
    lines.push('Capacity tries to protect deeper blocks while still accounting for admin.');
  } else if (role === 'student') {
    lines.push('Simple task lists first. Subjects can be light containers if helpful.');
    lines.push('Capacity protects study blocks and treats fixed classes as anchors.');
  } else if (role === 'personal') {
    lines.push('No heavy structure — just one calm place for the things you need to remember.');
    lines.push('Capacity is gentle. The goal is clarity, not packing the day.');
  } else {
    lines.push('Jobs are available but not pushed. You can keep things simple.');
    lines.push('Capacity tries to protect focused work while remaining honest about interruptions.');
  }

  if (flags.sameDayProtection === 'high') {
    lines.push('Same-day work is protected more strongly; other items can still move cleanly.');
  } else if (flags.sameDayProtection === 'low') {
    lines.push('Things that usually move will carry forward without friction.');
  } else {
    lines.push('Some work stays same-day; other work can move without friction.');
  }

  if (flags.highTravel) {
    lines.push('Travel and locations are given more weight in the plan.');
  }
  if (flags.highMeetings) {
    lines.push('Meetings count clearly against the day.');
  }

  return lines.slice(0, 4);
}

/** Short label for the confirmation header. */
export function getOnboardingHeadline(answers: OnboardingAnswers): string {
  const map: Record<UserRole, string> = {
    professional: 'Here’s how Dokkit is set up for your work',
    student: 'Here’s how Dokkit is set up for study',
    knowledge_worker: 'Here’s how Dokkit is set up for you',
    personal: 'Here’s how Dokkit is set up for you',
    other: 'Here’s how Dokkit is set up for you',
  };
  return map[answers.role] ?? map.other;
}

export function workTypeLabel(t?: ProfessionalWorkType): string {
  switch (t) {
    case 'trades_field': return 'trades / field work';
    case 'client_services': return 'client services';
    case 'creative': return 'creative work';
    case 'operations': return 'operations / logistics';
    default: return 'professional work';
  }
}

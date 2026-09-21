'use client';

import { useMemo, useState } from 'react';
import { DAY_OPTIONS } from '@/lib/taskTypes';
import LocationAutocomplete from '@/components/LocationAutocomplete';
import type {
  CarryStyle,
  DayEater,
  DayFeel,
  DayShape,
  HelpWith,
  OnboardingAnswers,
  ProfessionalWorkType,
  StudentLevel,
  StudentPressure,
  UserRole,
} from '@/lib/onboardingTypes';
import {
  getOnboardingDefaults,
  getOnboardingHeadline,
} from '@/lib/onboardingDefaults';

type Step =
  | 'role'
  | 'professional_work'
  | 'professional_day'
  | 'professional_eaters'
  | 'student_level'
  | 'student_pressures'
  | 'student_fixed'
  | 'knowledge_day'
  | 'knowledge_help'
  | 'carry'
  | 'hours'
  | 'summary';

const ROLE_OPTIONS: { value: UserRole; label: string }[] = [
  { value: 'professional', label: 'Professional / self-employed / trades / field work' },
  { value: 'student', label: 'Student / studying' },
  { value: 'knowledge_worker', label: 'Knowledge worker / office / remote' },
  { value: 'personal', label: 'Just organising my own life better' },
  { value: 'other', label: 'Other / Prefer not to say' },
];

const WORK_TYPE_OPTIONS: { value: ProfessionalWorkType; label: string }[] = [
  { value: 'trades_field', label: 'Trades / construction / field service / site-based' },
  { value: 'client_services', label: 'Client services / consulting / freelance' },
  { value: 'creative', label: 'Creative / production / making things' },
  { value: 'operations', label: 'Operations / logistics / delivery' },
  { value: 'other_professional', label: 'Other professional' },
];

const DAY_SHAPE_OPTIONS: { value: DayShape; label: string }[] = [
  { value: 'mostly_on_the_move', label: 'Mostly on the move / different locations every day' },
  { value: 'mix_base_and_sites', label: 'Mix of base + jobs/sites' },
  { value: 'one_location_interruptions', label: 'Mostly one location but lots of interruptions' },
  { value: 'fairly_structured', label: 'Fairly structured but still shifts a lot' },
  { value: 'other', label: 'Other' },
];

const DAY_EATER_OPTIONS: { value: DayEater; label: string }[] = [
  { value: 'travel', label: 'Travel between places' },
  { value: 'meetings', label: 'Client calls / meetings' },
  { value: 'unexpected_jobs', label: 'Unexpected jobs or changes' },
  { value: 'admin', label: 'Admin / quotes / follow-ups' },
  { value: 'waiting', label: 'Waiting on other people or materials' },
  { value: 'deep_work_interruptions', label: 'Deep focus work that gets interrupted' },
  { value: 'none', label: 'None of these really' },
];

const STUDENT_LEVEL_OPTIONS: { value: StudentLevel; label: string }[] = [
  { value: 'high_school', label: 'High school / secondary' },
  { value: 'undergraduate', label: 'Undergraduate / bachelor\'s' },
  { value: 'postgraduate', label: 'Postgraduate / master\'s / PhD' },
  { value: 'professional_course', label: 'Professional / vocational course' },
  { value: 'other', label: 'Other' },
];

const STUDENT_PRESSURE_OPTIONS: { value: StudentPressure; label: string }[] = [
  { value: 'assignments', label: 'Assignments / essays' },
  { value: 'exams', label: 'Exams' },
  { value: 'classes_plus_work', label: 'Classes + part-time work' },
  { value: 'research', label: 'Research / thesis' },
  { value: 'group_projects', label: 'Group projects' },
  { value: 'staying_on_top', label: 'Just staying on top of everything' },
];

const DAY_FEEL_OPTIONS: { value: DayFeel; label: string }[] = [
  { value: 'structured_flexible', label: 'Fairly structured with some flexibility' },
  { value: 'interrupt_driven', label: 'Interrupt-driven — things keep changing' },
  { value: 'project_based', label: 'Project-based — longer pieces of work' },
  { value: 'mix', label: 'Mix of fixed and fluid' },
  { value: 'other', label: 'Other' },
];

const HELP_WITH_OPTIONS: { value: HelpWith; label: string }[] = [
  { value: 'mental_load', label: 'Not carrying everything in my head' },
  { value: 'what_fits_today', label: 'Knowing what still fits today' },
  { value: 'rolling_over', label: 'Stopping things from rolling over endlessly' },
  { value: 'work_life_balance', label: 'Balancing work and the rest of life' },
  { value: 'one_calm_place', label: 'Just having one calm place for everything' },
];

const CARRY_OPTIONS: { value: CarryStyle; label: string }[] = [
  { value: 'mostly_moves', label: 'It almost always moves to the next day' },
  { value: 'mixed', label: 'Some things move, some must finish same day' },
  { value: 'prefer_same_day', label: 'I try hard to finish most things the same day' },
  { value: 'unsure', label: 'Not sure yet' },
];

export function OnboardingScreen(props: {
  workStart: string;
  setWorkStart: (v: string) => void;
  workEnd: string;
  setWorkEnd: (v: string) => void;
  workDays: number[];
  onToggleWorkDay: (day: number) => void;
  homeLocation: string;
  setHomeLocation: (value: string) => void;
  onHomeSelected: (result: { formattedAddress: string; lat: number; lng: number }) => void;
  workLocation: string;
  setWorkLocation: (value: string) => void;
  onWorkSelected: (result: { formattedAddress: string; lat: number; lng: number }) => void;
  onboardSaving: boolean;
  onComplete: (answers: OnboardingAnswers) => void;
}) {
  const {
    workStart, setWorkStart, workEnd, setWorkEnd, workDays, onToggleWorkDay,
    homeLocation, setHomeLocation, onHomeSelected,
    workLocation, setWorkLocation, onWorkSelected,
    onboardSaving, onComplete,
  } = props;

  const [step, setStep] = useState<Step>('role');
  const [role, setRole] = useState<UserRole | null>(null);
  const [workType, setWorkType] = useState<ProfessionalWorkType | null>(null);
  const [dayShape, setDayShape] = useState<DayShape | null>(null);
  const [dayEaters, setDayEaters] = useState<DayEater[]>([]);
  const [studentLevel, setStudentLevel] = useState<StudentLevel | null>(null);
  const [studentPressures, setStudentPressures] = useState<StudentPressure[]>([]);
  const [hasFixedCommitments, setHasFixedCommitments] = useState<'yes' | 'sometimes' | 'rarely' | null>(null);
  const [dayFeel, setDayFeel] = useState<DayFeel | null>(null);
  const [helpWith, setHelpWith] = useState<HelpWith[]>([]);
  const [carryStyle, setCarryStyle] = useState<CarryStyle | null>(null);

  const answers: OnboardingAnswers | null = useMemo(() => {
    if (!role || !carryStyle) return null;
    return {
      role,
      workType: workType ?? undefined,
      dayShape: dayShape ?? undefined,
      dayEaters: dayEaters.length ? dayEaters : undefined,
      studentLevel: studentLevel ?? undefined,
      studentPressures: studentPressures.length ? studentPressures : undefined,
      hasFixedCommitments: hasFixedCommitments ?? undefined,
      dayFeel: dayFeel ?? undefined,
      helpWith: helpWith.length ? helpWith : undefined,
      carryStyle,
    };
  }, [
    role, workType, dayShape, dayEaters, studentLevel, studentPressures,
    hasFixedCommitments, dayFeel, helpWith, carryStyle,
  ]);

  const defaults = answers ? getOnboardingDefaults(answers) : null;

  function goNextFromRole(r: UserRole) {
    setRole(r);
    if (r === 'professional') setStep('professional_work');
    else if (r === 'student') setStep('student_level');
    else if (r === 'knowledge_worker' || r === 'personal') setStep('knowledge_day');
    else setStep('carry');
  }

  function toggleMulti<T>(list: T[], value: T, max?: number): T[] {
    if (list.includes(value)) return list.filter((x) => x !== value);
    if (max && list.length >= max) return list;
    return [...list, value];
  }

  function ChoiceButton(props: {
    selected: boolean;
    onClick: () => void;
    children: React.ReactNode;
  }) {
    return (
      <button
        type="button"
        className={props.selected ? 'onboard-choice selected' : 'onboard-choice'}
        onClick={props.onClick}
      >
        {props.children}
      </button>
    );
  }

  return (
    <div className="auth-shell">
      <div className="auth-card onboard-card">
        <div className="auth-eyebrow">Welcome to Dokkit</div>

        {step === 'role' && (
          <>
            <h1 className="auth-title">What best describes you right now?</h1>
            <p className="auth-sub">This helps Dokkit start with defaults that fit how your days usually work.</p>
            <div className="onboard-choices">
              {ROLE_OPTIONS.map((o) => (
                <ChoiceButton key={o.value} selected={role === o.value} onClick={() => goNextFromRole(o.value)}>
                  {o.label}
                </ChoiceButton>
              ))}
            </div>
          </>
        )}

        {step === 'professional_work' && (
          <>
            <h1 className="auth-title">What kind of work?</h1>
            <p className="auth-sub">Different work shapes the day differently.</p>
            <div className="onboard-choices">
              {WORK_TYPE_OPTIONS.map((o) => (
                <ChoiceButton
                  key={o.value}
                  selected={workType === o.value}
                  onClick={() => {
                    setWorkType(o.value);
                    setStep('professional_day');
                  }}
                >
                  {o.label}
                </ChoiceButton>
              ))}
            </div>
            <button type="button" className="btn-text" style={{ marginTop: 16 }} onClick={() => setStep('role')}>
              Back
            </button>
          </>
        )}

        {step === 'professional_day' && (
          <>
            <h1 className="auth-title">How do your days usually unfold?</h1>
            <div className="onboard-choices">
              {DAY_SHAPE_OPTIONS.map((o) => (
                <ChoiceButton
                  key={o.value}
                  selected={dayShape === o.value}
                  onClick={() => {
                    setDayShape(o.value);
                    setStep('professional_eaters');
                  }}
                >
                  {o.label}
                </ChoiceButton>
              ))}
            </div>
            <button type="button" className="btn-text" style={{ marginTop: 16 }} onClick={() => setStep('professional_work')}>
              Back
            </button>
          </>
        )}

        {step === 'professional_eaters' && (
          <>
            <h1 className="auth-title">What most often eats the day?</h1>
            <p className="auth-sub">Pick up to three.</p>
            <div className="onboard-choices">
              {DAY_EATER_OPTIONS.map((o) => (
                <ChoiceButton
                  key={o.value}
                  selected={dayEaters.includes(o.value)}
                  onClick={() => setDayEaters(toggleMulti(dayEaters, o.value, 3))}
                >
                  {o.label}
                </ChoiceButton>
              ))}
            </div>
            <button
              type="button"
              className="btn btn-steel"
              style={{ width: '100%', marginTop: 20 }}
              disabled={dayEaters.length === 0}
              onClick={() => setStep('carry')}
            >
              Continue
            </button>
            <button type="button" className="btn-text" style={{ marginTop: 12 }} onClick={() => setStep('professional_day')}>
              Back
            </button>
          </>
        )}

        {step === 'student_level' && (
          <>
            <h1 className="auth-title">What are you studying?</h1>
            <div className="onboard-choices">
              {STUDENT_LEVEL_OPTIONS.map((o) => (
                <ChoiceButton
                  key={o.value}
                  selected={studentLevel === o.value}
                  onClick={() => {
                    setStudentLevel(o.value);
                    setStep('student_pressures');
                  }}
                >
                  {o.label}
                </ChoiceButton>
              ))}
            </div>
            <button type="button" className="btn-text" style={{ marginTop: 16 }} onClick={() => setStep('role')}>
              Back
            </button>
          </>
        )}

        {step === 'student_pressures' && (
          <>
            <h1 className="auth-title">Biggest sources of pressure right now?</h1>
            <p className="auth-sub">Pick any that apply.</p>
            <div className="onboard-choices">
              {STUDENT_PRESSURE_OPTIONS.map((o) => (
                <ChoiceButton
                  key={o.value}
                  selected={studentPressures.includes(o.value)}
                  onClick={() => setStudentPressures(toggleMulti(studentPressures, o.value))}
                >
                  {o.label}
                </ChoiceButton>
              ))}
            </div>
            <button
              type="button"
              className="btn btn-steel"
              style={{ width: '100%', marginTop: 20 }}
              disabled={studentPressures.length === 0}
              onClick={() => setStep('student_fixed')}
            >
              Continue
            </button>
            <button type="button" className="btn-text" style={{ marginTop: 12 }} onClick={() => setStep('student_level')}>
              Back
            </button>
          </>
        )}

        {step === 'student_fixed' && (
          <>
            <h1 className="auth-title">Do you have fixed commitments the rest of the day has to move around?</h1>
            <p className="auth-sub">Lectures, labs, shifts, etc.</p>
            <div className="onboard-choices">
              {(['yes', 'sometimes', 'rarely'] as const).map((v) => (
                <ChoiceButton
                  key={v}
                  selected={hasFixedCommitments === v}
                  onClick={() => {
                    setHasFixedCommitments(v);
                    setStep('carry');
                  }}
                >
                  {v === 'yes' ? 'Yes' : v === 'sometimes' ? 'Sometimes' : 'Rarely / no'}
                </ChoiceButton>
              ))}
            </div>
            <button type="button" className="btn-text" style={{ marginTop: 16 }} onClick={() => setStep('student_pressures')}>
              Back
            </button>
          </>
        )}

        {step === 'knowledge_day' && (
          <>
            <h1 className="auth-title">How do most of your days feel?</h1>
            <div className="onboard-choices">
              {DAY_FEEL_OPTIONS.map((o) => (
                <ChoiceButton
                  key={o.value}
                  selected={dayFeel === o.value}
                  onClick={() => {
                    setDayFeel(o.value);
                    setStep('knowledge_help');
                  }}
                >
                  {o.label}
                </ChoiceButton>
              ))}
            </div>
            <button type="button" className="btn-text" style={{ marginTop: 16 }} onClick={() => setStep('role')}>
              Back
            </button>
          </>
        )}

        {step === 'knowledge_help' && (
          <>
            <h1 className="auth-title">What do you most want help with?</h1>
            <p className="auth-sub">Pick any that apply.</p>
            <div className="onboard-choices">
              {HELP_WITH_OPTIONS.map((o) => (
                <ChoiceButton
                  key={o.value}
                  selected={helpWith.includes(o.value)}
                  onClick={() => setHelpWith(toggleMulti(helpWith, o.value))}
                >
                  {o.label}
                </ChoiceButton>
              ))}
            </div>
            <button
              type="button"
              className="btn btn-steel"
              style={{ width: '100%', marginTop: 20 }}
              disabled={helpWith.length === 0}
              onClick={() => setStep('carry')}
            >
              Continue
            </button>
            <button type="button" className="btn-text" style={{ marginTop: 12 }} onClick={() => setStep('knowledge_day')}>
              Back
            </button>
          </>
        )}

        {step === 'carry' && (
          <>
            <h1 className="auth-title">When something doesn’t get finished, what usually happens?</h1>
            <div className="onboard-choices">
              {CARRY_OPTIONS.map((o) => (
                <ChoiceButton
                  key={o.value}
                  selected={carryStyle === o.value}
                  onClick={() => {
                    setCarryStyle(o.value);
                    setStep('hours');
                  }}
                >
                  {o.label}
                </ChoiceButton>
              ))}
            </div>
            <button
              type="button"
              className="btn-text"
              style={{ marginTop: 16 }}
              onClick={() => {
                if (role === 'professional') setStep('professional_eaters');
                else if (role === 'student') setStep('student_fixed');
                else if (role === 'knowledge_worker' || role === 'personal') setStep('knowledge_help');
                else setStep('role');
              }}
            >
              Back
            </button>
          </>
        )}

        {step === 'hours' && (
          <>
            <h1 className="auth-title">Work / study hours</h1>
            <p className="auth-sub">So Dokkit knows the shape of the day. You can change these anytime.</p>

            <div className="settings-panel-title" style={{ marginBottom: 'var(--space-2)' }}>Hours</div>
            <div className="settings-row">
              <input type="time" value={workStart} onChange={(e) => setWorkStart(e.target.value)} />
              <span>to</span>
              <input type="time" value={workEnd} onChange={(e) => setWorkEnd(e.target.value)} />
            </div>

            <span className="settings-label" style={{ display: 'block', marginTop: 'var(--space-3)' }}>Days</span>
            <div className="day-toggle-row" style={{ marginTop: 'var(--space-2)' }}>
              {DAY_OPTIONS.map((d) => (
                <button
                  key={d.value}
                  type="button"
                  className={workDays.includes(d.value) ? 'day-toggle-btn active' : 'day-toggle-btn'}
                  onClick={() => onToggleWorkDay(d.value)}
                  aria-label={d.label}
                >
                  {d.label}
                </button>
              ))}
            </div>

            <div className="settings-panel-title" style={{ marginTop: 'var(--space-5)', marginBottom: 'var(--space-2)' }}>
              Base locations <span style={{ color: 'var(--ink-faint)', fontWeight: 400 }}>(optional)</span>
            </div>
            <span className="settings-label">Home</span>
            <LocationAutocomplete
              value={homeLocation}
              placeholder="Home address"
              onChange={setHomeLocation}
              onPlaceSelected={onHomeSelected}
            />
            <span className="settings-label" style={{ display: 'block', marginTop: 'var(--space-3)' }}>Work / base</span>
            <LocationAutocomplete
              value={workLocation}
              placeholder="Work address"
              onChange={setWorkLocation}
              onPlaceSelected={onWorkSelected}
            />

            <button
              type="button"
              className="btn btn-steel"
              style={{ width: '100%', marginTop: 'var(--space-5)' }}
              onClick={() => setStep('summary')}
            >
              Continue
            </button>
            <button type="button" className="btn-text" style={{ marginTop: 12 }} onClick={() => setStep('carry')}>
              Back
            </button>
          </>
        )}

        {step === 'summary' && answers && defaults && (
          <>
            <h1 className="auth-title">{getOnboardingHeadline(answers)}</h1>
            <ul className="onboard-summary">
              {defaults.summaryLines.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            <p className="auth-sub" style={{ marginTop: 12 }}>
              Dokkit will keep learning from what you actually finish and carry. You can change any of this later in Preferences.
            </p>
            <button
              type="button"
              className="btn btn-steel"
              style={{ width: '100%', marginTop: 'var(--space-5)' }}
              onClick={() => onComplete(answers)}
              disabled={onboardSaving}
            >
              {onboardSaving ? 'Setting up…' : 'Start using Dokkit'}
            </button>
            <button type="button" className="btn-text" style={{ marginTop: 12 }} onClick={() => setStep('hours')}>
              Back
            </button>
          </>
        )}
      </div>

      <style jsx>{`
        .onboard-card {
          max-width: 420px;
        }
        .onboard-choices {
          display: flex;
          flex-direction: column;
          gap: 8px;
          margin-top: 8px;
        }
        .onboard-choice {
          text-align: left;
          padding: 12px 14px;
          border-radius: 10px;
          border: 1px solid var(--border, #e5e5e5);
          background: var(--surface, #fff);
          color: var(--ink, #1a1a1a);
          font-size: 14px;
          line-height: 1.35;
          cursor: pointer;
          transition: border-color 0.12s, background 0.12s;
        }
        .onboard-choice:hover {
          border-color: var(--steel, #5b6b7c);
        }
        .onboard-choice.selected {
          border-color: var(--steel, #5b6b7c);
          background: color-mix(in srgb, var(--steel, #5b6b7c) 8%, transparent);
        }
        .onboard-summary {
          margin: 12px 0 0;
          padding-left: 1.1em;
          color: var(--ink, #1a1a1a);
          font-size: 14px;
          line-height: 1.45;
        }
        .onboard-summary li {
          margin-bottom: 8px;
        }
      `}</style>
    </div>
  );
}

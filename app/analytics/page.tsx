'use client';

import './patterns.css';
import { useEffect, useState, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import GearMenu from '@/components/GearMenu';
import { BackIcon } from '@/components/icons';
import {
  runObservationPipeline,
  topActionableObservations,
  type CompletedTaskFacts,
  type StructuredObservation,
} from '@/lib/thinking';
import {
  buildPatternSurfaceModel,
  type PatternCard,
  type PatternVisual,
  type RecurringWorkItem,
} from '@/lib/thinking/patternSurface';
import type { Confidence } from '@/lib/thinking/types';

type CompletedTask = {
  id: string;
  text: string;
  status: 'done';
  source: 'planned' | 'came_up';
  estimate_mins: number;
  actual_mins: number | null;
  logged_mins: number;
  created_at: string;
  completed_at: string | null;
  started_at: string | null;
  surface_date: string | null;
  location_text: string | null;
  lat: number | null;
  lng: number | null;
  job_id: string | null;
  info: string | null;
};

type SubtaskItem = {
  id: string;
  task_id: string;
  mins: number;
  done: boolean;
};

function fmtMins(mins: number): string {
  mins = Math.round(mins);
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function confScore(c: Confidence): number {
  return c === 'high' ? 1 : c === 'medium' ? 0.55 : 0.2;
}

/** Overall strength 0–1 from confidence dimensions */
function overallStrength(v: PatternVisual): number {
  return (
    (confScore(v.dims.sampleStrength) +
      confScore(v.dims.effectStrength) +
      confScore(v.dims.consistencyStrength)) /
    3
  );
}

function typeKind(card: PatternCard): {
  kind: string;
  icon: string;
  color: string;
} {
  const t = `${card.type} ${card.semanticType}`.toLowerCase();
  if (t.includes('estimate') || t.includes('calibration') || t.includes('duration'))
    return { kind: 'estimate', icon: '⏱', color: 'var(--pk-est)' };
  if (t.includes('carry') || t.includes('overnight') || t.includes('persistence'))
    return { kind: 'carry', icon: '→', color: 'var(--pk-carry)' };
  if (t.includes('time_of_day') || t.includes('temporal') || t.includes('period'))
    return { kind: 'time', icon: '◷', color: 'var(--pk-time)' };
  if (t.includes('lifecycle') || t.includes('stale'))
    return { kind: 'lifecycle', icon: '↺', color: 'var(--pk-life)' };
  if (t.includes('cluster') || t.includes('context'))
    return { kind: 'cluster', icon: '◎', color: 'var(--pk-cluster)' };
  return { kind: 'other', icon: '·', color: 'var(--pk-other)' };
}

/* ── Strength ring (SVG) ── */
function StrengthRing({
  value,
  size = 44,
  color,
}: {
  value: number;
  size?: number;
  color: string;
}) {
  const r = (size - 6) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.min(1, Math.max(0, value));
  const dash = pct * c;
  return (
    <svg
      className="pk-ring"
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      aria-hidden="true"
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="var(--pk-track)"
        strokeWidth={5}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={5}
        strokeLinecap="round"
        strokeDasharray={`${dash} ${c - dash}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </svg>
  );
}

/* ── Dim bars (sample / effect / consistency) ── */
function DimBars({ visual }: { visual: PatternVisual }) {
  const items: { key: string; level: Confidence; label: string }[] = [
    { key: 'n', level: visual.dims.sampleStrength, label: 'n' },
    { key: 'fx', level: visual.dims.effectStrength, label: 'fx' },
    { key: 'c', level: visual.dims.consistencyStrength, label: 'c' },
  ];
  return (
    <div className="pk-dims" aria-label="Evidence dimensions">
      {items.map((it) => (
        <div key={it.key} className="pk-dim">
          <div className="pk-dim-track">
            <div
              className={`pk-dim-fill is-${it.level}`}
              style={{ height: `${confScore(it.level) * 100}%` }}
            />
          </div>
          <span className="pk-dim-lbl">{it.label}</span>
        </div>
      ))}
    </div>
  );
}

/* ── Ratio gauge for calibration ── */
function RatioGauge({ ratio, bias }: { ratio: number; bias: string | null }) {
  const clamped = Math.min(2, Math.max(0.25, ratio));
  const pct = ((clamped - 0.25) / 1.75) * 100;
  return (
    <div className="pk-ratio" aria-label={`Ratio ${ratio.toFixed(2)}`}>
      <div className="pk-ratio-track">
        <span className="pk-ratio-zone left" />
        <span className="pk-ratio-zone mid" />
        <span className="pk-ratio-zone right" />
        <span className="pk-ratio-center" />
        <span
          className={`pk-ratio-dot bias-${bias ?? 'balanced'}`}
          style={{ left: `${pct}%` }}
        />
      </div>
      <div className="pk-ratio-nums">
        <span>½</span>
        <span className="pk-ratio-val">{ratio.toFixed(2)}×</span>
        <span>2×</span>
      </div>
    </div>
  );
}

/* ── Proportion arc / bar ── */
function PropGauge({ value, label }: { value: number; label: string | null }) {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <div className="pk-prop" aria-label={`${pct}%`}>
      <div className="pk-prop-track">
        <div className="pk-prop-fill" style={{ width: `${pct}%` }} />
      </div>
      <span className="pk-prop-pct">{pct}%</span>
      {label ? <span className="pk-prop-lbl">{label}</span> : null}
    </div>
  );
}

/* ── Period distribution as equal-height columns ── */
function PeriodCols({
  periods,
}: {
  periods: { label: string; ratio: number }[];
}) {
  const top = periods.slice(0, 4);
  const max = Math.max(...top.map((p) => p.ratio), 0.01);
  return (
    <div className="pk-periods" aria-label="Period distribution">
      {top.map((p) => (
        <div key={p.label} className="pk-period-col" title={`${p.label}: ${Math.round(p.ratio * 100)}%`}>
          <div className="pk-period-bar-wrap">
            <div
              className="pk-period-bar"
              style={{ height: `${(p.ratio / max) * 100}%` }}
            />
          </div>
          <span className="pk-period-pct">{Math.round(p.ratio * 100)}</span>
          <span className="pk-period-name">{shortPeriod(p.label)}</span>
        </div>
      ))}
    </div>
  );
}

function shortPeriod(label: string): string {
  const l = label.toLowerCase();
  if (l.includes('morning') || l === 'am') return 'AM';
  if (l.includes('afternoon') || l === 'pm') return 'PM';
  if (l.includes('evening') || l.includes('night')) return 'Eve';
  if (l.includes('midday') || l.includes('noon')) return 'Noon';
  return label.slice(0, 4);
}

/* ── Status dots ── */
function StatusDots({ card }: { card: PatternCard }) {
  const dots: { key: string; tone: string; title: string }[] = [];
  if (card.staleness === 'stale')
    dots.push({ key: 'stale', tone: 'warn', title: 'May be out of date' });
  if (card.visual.contradictionStatus === 'partial')
    dots.push({ key: 'cp', tone: 'warn', title: 'Some conflict' });
  if (card.visual.contradictionStatus === 'full')
    dots.push({ key: 'cf', tone: 'alert', title: 'Contradicted' });
  if (card.visual.recencyDays != null && card.visual.recencyDays <= 7)
    dots.push({ key: 'fresh', tone: 'ok', title: 'Recent evidence' });
  if (dots.length === 0) return null;
  return (
    <div className="pk-status-dots">
      {dots.map((d) => (
        <span key={d.key} className={`pk-dot tone-${d.tone}`} title={d.title} />
      ))}
    </div>
  );
}

/* ── Card ── */
function PatternCardView({
  card,
  expanded,
  onToggle,
}: {
  card: PatternCard;
  expanded: boolean;
  onToggle: () => void;
}) {
  const { kind, icon, color } = typeKind(card);
  const strength = overallStrength(card.visual);
  const v = card.visual;
  const hasRatio = v.medianRatio != null && v.medianRatio > 0;
  const hasProp = v.proportion != null;
  const hasPeriods = v.periods != null && v.periods.length > 0;

  return (
    <article
      className={[
        'pk-card',
        `kind-${kind}`,
        card.bucket === 'emerging' ? 'is-emerging' : 'is-established',
        expanded ? 'is-expanded' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={{ ['--pk-accent' as string]: color }}
    >
      <button type="button" className="pk-card-hit" onClick={onToggle} aria-expanded={expanded}>
        <div className="pk-card-left">
          <div className="pk-ring-wrap">
            <StrengthRing value={strength} color={color} />
            <span className="pk-type-icon">{icon}</span>
          </div>
          <DimBars visual={v} />
        </div>

        <div className="pk-card-body">
          <div className="pk-card-top">
            <h3 className="pk-statement">{card.statement}</h3>
            <StatusDots card={card} />
          </div>

          <div className="pk-card-metrics">
            {card.sampleSize > 0 ? (
              <span className="pk-metric">
                <span className="pk-metric-num">{card.sampleSize}</span>
                <span className="pk-metric-unit">n</span>
              </span>
            ) : null}
            {card.medianMins != null && card.medianMins > 0 ? (
              <span className="pk-metric">
                <span className="pk-metric-num">{fmtMins(card.medianMins)}</span>
              </span>
            ) : null}
            {v.recencyDays != null ? (
              <span className="pk-metric muted">
                <span className="pk-metric-num">
                  {v.recencyDays < 1 ? '0' : Math.round(v.recencyDays)}
                </span>
                <span className="pk-metric-unit">d</span>
              </span>
            ) : null}
          </div>

          <div className="pk-card-viz">
            {hasRatio ? (
              <RatioGauge ratio={v.medianRatio!} bias={v.directionBias} />
            ) : null}
            {hasProp && !hasRatio ? (
              <PropGauge value={v.proportion!} label={v.proportionLabel} />
            ) : null}
            {hasPeriods ? <PeriodCols periods={v.periods!} /> : null}
          </div>
        </div>
      </button>

      {expanded ? (
        <div className="pk-card-detail">
          <div className="pk-think-block">
            <div className="pk-think-label">Evidence weight</div>
            <div className="pk-dim-rows">
              {(
                [
                  ['Sample', v.dims.sampleStrength],
                  ['Effect', v.dims.effectStrength],
                  ['Consistency', v.dims.consistencyStrength],
                ] as const
              ).map(([name, level]) => {
                const pct =
                  level === 'high' ? 100 : level === 'medium' ? 58 : 22;
                return (
                  <div key={name} className="pk-dim-row">
                    <span className="pk-dim-name">{name}</span>
                    <div className="pk-dim-track">
                      <div
                        className={`pk-dim-fill is-${level}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="pk-dim-val">{level}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <p className="pk-detail-line">{card.confidenceDetail}</p>
          {card.detail ? <p className="pk-detail-line">{card.detail}</p> : null}

          <div className="pk-detail-grid">
            <div>
              <span className="pk-dg-lbl">n</span>
              <span className="pk-dg-val">{card.sampleSize}</span>
            </div>
            {v.effectMagnitude != null ? (
              <div>
                <span className="pk-dg-lbl">effect</span>
                <span className="pk-dg-val">
                  {(v.effectMagnitude * 100).toFixed(0)}%
                </span>
              </div>
            ) : null}
            {v.consistency != null ? (
              <div>
                <span className="pk-dg-lbl">consist</span>
                <span className="pk-dg-val">
                  {(v.consistency * 100).toFixed(0)}%
                </span>
              </div>
            ) : null}
            {card.medianMins != null ? (
              <div>
                <span className="pk-dg-lbl">typical</span>
                <span className="pk-dg-val">{fmtMins(card.medianMins)}</span>
              </div>
            ) : null}
            {card.clusterLabel ? (
              <div>
                <span className="pk-dg-lbl">cluster</span>
                <span className="pk-dg-val">{card.clusterLabel}</span>
              </div>
            ) : null}
            {card.location ? (
              <div>
                <span className="pk-dg-lbl">place</span>
                <span className="pk-dg-val">{card.location}</span>
              </div>
            ) : null}
          </div>
          <p className="pk-detail-use">{card.consequence}</p>
        </div>
      ) : null}
    </article>
  );
}

/* ── Recurring cluster row ── */
function RecurringItem({ item }: { item: RecurringWorkItem }) {
  return (
    <li className="pk-rec-item">
      <div className="pk-rec-bar-bg">
        <div
          className="pk-rec-bar"
          style={{ width: `${Math.round(item.relativeStrength * 100)}%` }}
        />
      </div>
      <div className="pk-rec-content">
        <span className="pk-rec-label">{item.label}</span>
        <div className="pk-rec-nums">
          {item.medianMins != null && item.medianMins > 0 ? (
            <span className="pk-rec-time">{fmtMins(item.medianMins)}</span>
          ) : null}
          <span className="pk-rec-n">{item.sampleSize}</span>
          {item.location ? (
            <span className="pk-rec-place">{item.location}</span>
          ) : null}
        </div>
      </div>
    </li>
  );
}

/* ── Model health rings in aside ── */
function ModelHealth({ model }: { model: ReturnType<typeof buildPatternSurfaceModel> }) {
  const total = model.modelStatus.establishedCount + model.modelStatus.emergingCount;
  const estPct = total > 0 ? model.modelStatus.establishedCount / total : 0;
  return (
    <div className="pk-health">
      <div className="pk-health-rings">
        <div className="pk-health-item">
          <StrengthRing value={estPct || 0.05} size={52} color="var(--pk-est)" />
          <span className="pk-health-num">{model.modelStatus.establishedCount}</span>
          <span className="pk-health-lbl">solid</span>
        </div>
        <div className="pk-health-item">
          <StrengthRing
            value={total > 0 ? model.modelStatus.emergingCount / Math.max(total, 1) : 0.05}
            size={52}
            color="var(--pk-time)"
          />
          <span className="pk-health-num">{model.modelStatus.emergingCount}</span>
          <span className="pk-health-lbl">rising</span>
        </div>
        <div className="pk-health-item">
          <StrengthRing
            value={Math.min(1, model.modelStatus.completedTasks / 40)}
            size={52}
            color="var(--pk-cluster)"
          />
          <span className="pk-health-num">{model.modelStatus.completedTasks}</span>
          <span className="pk-health-lbl">done</span>
        </div>
      </div>
    </div>
  );
}

export default function Analytics() {
  const router = useRouter();
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [allTasks, setAllTasks] = useState<CompletedTask[]>([]);
  const [allSubtasks, setAllSubtasks] = useState<SubtaskItem[]>([]);
  const [userTimezone, setUserTimezone] = useState<string | null>(null);
  const [evidenceScope, setEvidenceScope] = useState<'recent' | 'all'>('all');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
  }, []);

  useEffect(() => {
    if (session) void loadData();
  }, [session]);

  async function loadData() {
    setLoading(true);
    setError(null);
    const userId = session.user.id;

    const { data: taskData, error: taskErr } = await supabase
      .from('tasks')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'done')
      .order('completed_at', { ascending: false });

    if (taskErr) {
      console.error(taskErr);
      setError("Couldn't load — tap to retry");
      setLoading(false);
      return;
    }

    const loadedTasks: CompletedTask[] = (taskData as CompletedTask[]) || [];
    const taskIds = loadedTasks.map((t) => t.id);

    let loadedSubtasks: SubtaskItem[] = [];
    if (taskIds.length > 0) {
      const { data: subtaskData } = await supabase
        .from('subtasks')
        .select('id, task_id, mins, done')
        .in('task_id', taskIds);
      loadedSubtasks = (subtaskData as SubtaskItem[]) || [];
    }

    let timezone: string | null = null;
    try {
      const { data: settings } = await supabase
        .from('user_settings')
        .select('timezone')
        .eq('user_id', userId)
        .maybeSingle();
      timezone = settings?.timezone ?? null;
    } catch {
      /* optional */
    }

    setAllTasks(loadedTasks);
    setAllSubtasks(loadedSubtasks);
    setUserTimezone(timezone);
    setLoading(false);
  }

  const subtasksByTaskId = useMemo(() => {
    const map: Record<string, SubtaskItem[]> = {};
    for (const s of allSubtasks) {
      (map[s.task_id] ||= []).push(s);
    }
    return map;
  }, [allSubtasks]);

  const createFact = useCallback(
    (t: CompletedTask): CompletedTaskFacts => {
      const subs = subtasksByTaskId[t.id] || [];
      const subtaskDone = subs.filter((s) => s.done);
      return {
        text: t.text,
        status: 'done',
        source: t.source || 'planned',
        estimate_mins: t.estimate_mins || 0,
        actual_mins: t.actual_mins ?? null,
        logged_mins: t.logged_mins || 0,
        created_at: t.created_at || new Date().toISOString(),
        completed_at: t.completed_at,
        started_at: t.started_at,
        surface_date: t.surface_date,
        location_text: t.location_text,
        lat: t.lat,
        lng: t.lng,
        job_id: t.job_id,
        info: t.info,
        subtaskCount: subs.length,
        subtaskDoneCount: subtaskDone.length,
        subtaskTotalMins: subs.reduce((sum, s) => sum + (s.mins || 0), 0),
      };
    },
    [subtasksByTaskId]
  );

  const scopeTasks = useMemo(() => {
    if (evidenceScope === 'all') return allTasks;
    const cutoff = Date.now() - 60 * 24 * 60 * 60 * 1000;
    return allTasks.filter((t) => {
      if (!t.completed_at) return false;
      return new Date(t.completed_at).getTime() >= cutoff;
    });
  }, [allTasks, evidenceScope]);

  const scopeFacts = useMemo(
    () => scopeTasks.map(createFact),
    [scopeTasks, createFact]
  );

  const actionable: StructuredObservation[] = useMemo(
    () =>
      topActionableObservations(scopeFacts, {
        timezone: userTimezone || 'UTC',
        limit: 10,
      }),
    [scopeFacts, userTimezone]
  );

  const clusterObs: StructuredObservation[] = useMemo(
    () =>
      runObservationPipeline(scopeFacts, {
        timezone: userTimezone || 'UTC',
      }).filter(
        (o) => o.type === 'cluster' || (o.type || '').includes('cluster')
      ),
    [scopeFacts, userTimezone]
  );

  const model = useMemo(
    () =>
      buildPatternSurfaceModel({
        actionable,
        clusterObservations: clusterObs,
        completedTasks: allTasks.length,
        evidenceWindowDays: evidenceScope === 'recent' ? 60 : null,
      }),
    [actionable, clusterObs, allTasks.length, evidenceScope]
  );

  function toggleExpanded(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (!session) {
    return (
      <div className="app-shell patterns-shell">
        <div className="app-header">
          <div className="app-header-left">
            <button className="back-link" onClick={() => router.push('/')} aria-label="Back">
              <BackIcon />
            </button>
            <h1 className="app-title">Patterns</h1>
          </div>
        </div>
        <p className="pk-sign-in">Sign in to see patterns.</p>
      </div>
    );
  }

  const hasAny =
    model.established.length > 0 ||
    model.emerging.length > 0 ||
    model.recurringWork.length > 0;

  return (
    <div className="app-shell patterns-shell">
      <header className="pk-header">
        <div className="pk-header-row">
          <button
            type="button"
            className="back-link pk-back"
            onClick={() => router.push('/')}
            aria-label="Back to Today"
          >
            <BackIcon />
          </button>
          <div className="pk-title-block">
            <span className="pk-kicker">Understanding</span>
            <h1 className="pk-title">Patterns</h1>
          </div>
          <div className="pk-header-right">
            <div className="pk-scope">
              <button
                type="button"
                className={evidenceScope === 'all' ? 'pk-scope-btn active' : 'pk-scope-btn'}
                onClick={() => setEvidenceScope('all')}
              >
                All
              </button>
              <button
                type="button"
                className={evidenceScope === 'recent' ? 'pk-scope-btn active' : 'pk-scope-btn'}
                onClick={() => setEvidenceScope('recent')}
              >
                60d
              </button>
            </div>
            <GearMenu userId={session?.user.id ?? null} />
          </div>
        </div>
      </header>

      {!loading && hasAny ? (
        <>
          <div className="pk-instrument" aria-label="Pattern model">
            <div className="pk-inst-metric is-accent">
              <strong className="mono">{model.modelStatus.establishedCount}</strong>
              <span>established in the model</span>
            </div>
            <div className="pk-inst-metric">
              <strong className="mono">{model.modelStatus.emergingCount}</strong>
              <span>still taking shape</span>
            </div>
            <div className="pk-inst-metric">
              <strong className="mono">{model.modelStatus.completedTasks}</strong>
              <span>
                completed tasks
                {evidenceScope === 'recent' ? ' · last 60d' : ' · all time'}
              </span>
            </div>
          </div>

          <div className="pk-engine" aria-label="How Dokkit thinks">
            <div className="pk-engine-head">
              <span className="pk-engine-kicker">Under the hood</span>
              <span className="pk-engine-live">
                <i aria-hidden />
                Live model
              </span>
            </div>
            <div className="pk-engine-flow">
              <div className="pk-engine-step">
                <div className="pk-engine-step-num">01 Observe</div>
                <strong>Completed work</strong>
                <span>
                  {model.modelStatus.completedTasks} tasks feed evidence —
                  estimates, places, timing, carry.
                </span>
              </div>
              <div className="pk-engine-step">
                <div className="pk-engine-step-num">02 Weigh</div>
                <strong>Sample · effect · consistency</strong>
                <span>
                  Each pattern is scored on how often it shows up, how strong
                  the signal is, and how steady it stays.
                </span>
              </div>
              <div className="pk-engine-step">
                <div className="pk-engine-step-num">03 Decide</div>
                <strong>
                  {model.modelStatus.establishedCount} strong ·{' '}
                  {model.modelStatus.emergingCount} rising
                </strong>
                <span>
                  Only well-backed patterns drive estimates, fit, and capture
                  suggestions.
                </span>
              </div>
              <div className="pk-engine-step">
                <div className="pk-engine-step-num">04 Apply</div>
                <strong>Today · Capture · fit</strong>
                <span>
                  Quiet in the day — visible here. Open a pattern to see its
                  evidence weight.
                </span>
              </div>
            </div>
          </div>
        </>
      ) : null}

      {error ? (
        <button type="button" className="recalc-error" onClick={() => void loadData()} disabled={loading}>
          {error}
        </button>
      ) : null}

      {loading ? (
        <div className="pk-loading" aria-busy="true">
          <div className="pk-skel" />
          <div className="pk-skel short" />
          <div className="pk-skel" />
        </div>
      ) : (
        <div className="pk-layout">
          <div className="pk-main">
            {!hasAny ? (
              <section className="pk-empty">
                <div className="pk-empty-rings">
                  <StrengthRing value={0.08} size={64} color="var(--pk-track)" />
                </div>
                <p>Still gathering evidence. Keep completing work.</p>
              </section>
            ) : null}

            {model.established.length > 0 ? (
              <section className="pk-section">
                <div className="pk-sec-head">
                  <span className="pk-sec-dot solid" />
                  <h2 className="pk-sec-title">Established</h2>
                  <span className="pk-sec-count">{model.established.length}</span>
                </div>
                <div className="pk-card-list">
                  {model.established.map((card) => (
                    <PatternCardView
                      key={card.id}
                      card={card}
                      expanded={expandedIds.has(card.id)}
                      onToggle={() => toggleExpanded(card.id)}
                    />
                  ))}
                </div>
              </section>
            ) : null}

            {model.emerging.length > 0 ? (
              <section className="pk-section">
                <div className="pk-sec-head">
                  <span className="pk-sec-dot rising" />
                  <h2 className="pk-sec-title">Emerging</h2>
                  <span className="pk-sec-count">{model.emerging.length}</span>
                </div>
                <div className="pk-card-list">
                  {model.emerging.map((card) => (
                    <PatternCardView
                      key={card.id}
                      card={card}
                      expanded={expandedIds.has(card.id)}
                      onToggle={() => toggleExpanded(card.id)}
                    />
                  ))}
                </div>
              </section>
            ) : null}

            {model.recurringWork.length > 0 ? (
              <section className="pk-section">
                <div className="pk-sec-head">
                  <span className="pk-sec-dot cluster" />
                  <h2 className="pk-sec-title">Repeats</h2>
                  <span className="pk-sec-count">{model.recurringWork.length}</span>
                </div>
                <ul className="pk-rec-list">
                  {model.recurringWork.map((item) => (
                    <RecurringItem key={item.id} item={item} />
                  ))}
                </ul>
              </section>
            ) : null}
          </div>

          <aside className="pk-aside">
            <ModelHealth model={model} />
            <div className="pk-legend">
              <div className="pk-leg-row">
                <span className="pk-leg-icon" style={{ color: 'var(--pk-est)' }}>⏱</span>
                <span>estimates</span>
              </div>
              <div className="pk-leg-row">
                <span className="pk-leg-icon" style={{ color: 'var(--pk-carry)' }}>→</span>
                <span>carry</span>
              </div>
              <div className="pk-leg-row">
                <span className="pk-leg-icon" style={{ color: 'var(--pk-time)' }}>◷</span>
                <span>timing</span>
              </div>
              <div className="pk-leg-row">
                <span className="pk-leg-icon" style={{ color: 'var(--pk-life)' }}>↺</span>
                <span>lifecycle</span>
              </div>
              <div className="pk-leg-row">
                <span className="pk-leg-icon" style={{ color: 'var(--pk-cluster)' }}>◎</span>
                <span>clusters</span>
              </div>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}

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

function dimClass(level: Confidence): string {
  return `patterns-dim is-${level}`;
}

/** Three-segment confidence indicator: sample · effect · consistency */
function ConfidenceStrip({ visual }: { visual: PatternVisual }) {
  const { dims } = visual;
  return (
    <div className="patterns-conf-strip" aria-label="Evidence strength">
      <span className={dimClass(dims.sampleStrength)} title="Sample size">
        n
      </span>
      <span className={dimClass(dims.effectStrength)} title="Effect size">
        fx
      </span>
      <span className={dimClass(dims.consistencyStrength)} title="Consistency">
        c
      </span>
    </div>
  );
}

/** Horizontal ratio scale for estimate calibration (0.5 ← 1.0 → 1.5+) */
function RatioScale({ ratio, bias }: { ratio: number; bias: string | null }) {
  // Map ratio onto 0–100% where 1.0 sits at 50%
  const clamped = Math.min(2, Math.max(0.25, ratio));
  const pct = ((clamped - 0.25) / 1.75) * 100;
  return (
    <div className="patterns-ratio" aria-label={`Median ratio ${ratio.toFixed(2)}`}>
      <div className="patterns-ratio-track">
        <span className="patterns-ratio-mid" />
        <span
          className={`patterns-ratio-marker bias-${bias ?? 'balanced'}`}
          style={{ left: `${pct}%` }}
        />
      </div>
      <div className="patterns-ratio-labels">
        <span>0.5×</span>
        <span className="patterns-ratio-value mono">{ratio.toFixed(2)}×</span>
        <span>2×</span>
      </div>
    </div>
  );
}

/** Simple filled proportion bar */
function ProportionBar({
  value,
  label,
}: {
  value: number;
  label: string | null;
}) {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <div className="patterns-prop" aria-label={`${pct}% ${label ?? ''}`}>
      <div className="patterns-prop-track">
        <div className="patterns-prop-fill" style={{ width: `${pct}%` }} />
      </div>
      <span className="patterns-prop-meta mono">
        {pct}%{label ? ` ${label}` : ''}
      </span>
    </div>
  );
}

/** Time-of-day / period distribution as proportional segments */
function PeriodStrip({ periods }: { periods: { label: string; ratio: number }[] }) {
  const top = periods.slice(0, 4);
  return (
    <div className="patterns-periods" aria-label="Period distribution">
      <div className="patterns-periods-bar">
        {top.map((p) => (
          <span
            key={p.label}
            className="patterns-period-seg"
            style={{ flexGrow: Math.max(0.04, p.ratio) }}
            title={`${p.label}: ${Math.round(p.ratio * 100)}%`}
          />
        ))}
      </div>
      <div className="patterns-periods-legend">
        {top.map((p) => (
          <span key={p.label} className="patterns-period-legend-item">
            <span className="mono">{Math.round(p.ratio * 100)}%</span> {p.label}
          </span>
        ))}
      </div>
    </div>
  );
}

function StatusBadges({ card }: { card: PatternCard }) {
  const badges: { key: string; label: string; tone: string }[] = [];
  if (card.staleness === 'stale') {
    badges.push({ key: 'stale', label: 'May be out of date', tone: 'warn' });
  }
  if (card.visual.contradictionStatus === 'partial') {
    badges.push({ key: 'contra-p', label: 'Some conflict', tone: 'warn' });
  } else if (card.visual.contradictionStatus === 'full') {
    badges.push({ key: 'contra-f', label: 'Contradicted', tone: 'alert' });
  }
  if (card.visual.directionBias && card.visual.directionBias !== 'balanced') {
    badges.push({
      key: 'bias',
      label: card.visual.directionBias === 'over' ? 'Over' : 'Under',
      tone: 'info',
    });
  }
  if (card.visual.recencyDays != null && card.visual.recencyDays <= 7) {
    badges.push({ key: 'fresh', label: 'Recent', tone: 'ok' });
  }
  if (badges.length === 0) return null;
  return (
    <div className="patterns-badges">
      {badges.map((b) => (
        <span key={b.key} className={`patterns-badge tone-${b.tone}`}>
          {b.label}
        </span>
      ))}
    </div>
  );
}

function PatternVisuals({ card }: { card: PatternCard }) {
  const v = card.visual;
  const hasRatio = v.medianRatio != null && v.medianRatio > 0;
  const hasProp = v.proportion != null;
  const hasPeriods = v.periods != null && v.periods.length > 0;

  return (
    <div className="patterns-visuals">
      <ConfidenceStrip visual={v} />
      {hasRatio ? (
        <RatioScale ratio={v.medianRatio!} bias={v.directionBias} />
      ) : null}
      {hasProp && !hasRatio ? (
        <ProportionBar value={v.proportion!} label={v.proportionLabel} />
      ) : null}
      {hasPeriods ? <PeriodStrip periods={v.periods!} /> : null}
      <StatusBadges card={card} />
    </div>
  );
}

function PatternCardView({
  card,
  expanded,
  onToggle,
}: {
  card: PatternCard;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <article
      className={[
        'patterns-card',
        card.bucket === 'emerging' ? 'is-emerging' : 'is-established',
        expanded ? 'is-expanded' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="patterns-card-main">
        <h3 className="patterns-card-statement">{card.statement}</h3>
        <p className="patterns-card-meta">
          {card.sampleSize > 0 ? (
            <span>
              {card.sampleSize} example{card.sampleSize === 1 ? '' : 's'}
            </span>
          ) : null}
          {card.sampleSize > 0 ? <span className="patterns-dot">·</span> : null}
          <span>{card.confidenceLabel}</span>
          {card.medianMins != null && card.medianMins > 0 ? (
            <>
              <span className="patterns-dot">·</span>
              <span className="mono">~{fmtMins(card.medianMins)}</span>
            </>
          ) : null}
        </p>

        <PatternVisuals card={card} />

        <p className="patterns-card-consequence">{card.consequence}</p>
      </div>

      <button
        type="button"
        className="patterns-card-why"
        aria-expanded={expanded}
        onClick={onToggle}
      >
        {expanded ? 'Hide evidence' : 'Why I think this'}
      </button>

      {expanded ? (
        <div className="patterns-card-evidence" id={`pattern-ev-${card.id}`}>
          <h4 className="patterns-evidence-title">Why I think this</h4>
          <p className="patterns-evidence-detail">{card.confidenceDetail}</p>
          {card.detail ? (
            <p className="patterns-evidence-detail">{card.detail}</p>
          ) : null}
          <dl className="patterns-evidence-dl">
            {card.sampleSize > 0 ? (
              <div>
                <dt>Observed examples</dt>
                <dd className="mono">{card.sampleSize}</dd>
              </div>
            ) : null}
            {card.visual.effectMagnitude != null ? (
              <div>
                <dt>Effect magnitude</dt>
                <dd className="mono">
                  {(card.visual.effectMagnitude * 100).toFixed(0)}%
                </dd>
              </div>
            ) : null}
            {card.visual.consistency != null ? (
              <div>
                <dt>Consistency</dt>
                <dd className="mono">
                  {(card.visual.consistency * 100).toFixed(0)}%
                </dd>
              </div>
            ) : null}
            {card.visual.recencyDays != null ? (
              <div>
                <dt>Last supporting data</dt>
                <dd className="mono">
                  {card.visual.recencyDays < 1
                    ? 'today'
                    : `${Math.round(card.visual.recencyDays)}d ago`}
                </dd>
              </div>
            ) : null}
            {card.medianMins != null && card.medianMins > 0 ? (
              <div>
                <dt>Typical actual time</dt>
                <dd className="mono">~{fmtMins(card.medianMins)}</dd>
              </div>
            ) : null}
            <div>
              <dt>Pattern</dt>
              <dd>
                {card.staleness === 'stale'
                  ? 'May be out of date'
                  : card.bucket === 'established'
                    ? 'Stable enough to rely on'
                    : 'Still developing'}
              </dd>
            </div>
            {card.clusterLabel ? (
              <div>
                <dt>Related work</dt>
                <dd>{card.clusterLabel}</dd>
              </div>
            ) : null}
            {card.location ? (
              <div>
                <dt>Place</dt>
                <dd>{card.location}</dd>
              </div>
            ) : null}
          </dl>
          <h4 className="patterns-evidence-title">What Dokkit does with it</h4>
          <p className="patterns-evidence-detail">{card.consequence}</p>
        </div>
      ) : null}
    </article>
  );
}

function RecurringItem({ item }: { item: RecurringWorkItem }) {
  return (
    <li className="patterns-recurring-item">
      <div className="patterns-recurring-top">
        <span className="patterns-recurring-label">{item.label}</span>
        <span className="patterns-recurring-meta">
          {item.medianMins != null && item.medianMins > 0 ? (
            <span className="mono">Usually ~{fmtMins(item.medianMins)}</span>
          ) : null}
          <span className="mono">
            {item.sampleSize} example{item.sampleSize === 1 ? '' : 's'}
          </span>
          {item.location ? (
            <span className="patterns-recurring-place">{item.location}</span>
          ) : null}
        </span>
      </div>
      <div className="patterns-recurring-bar" aria-hidden="true">
        <div
          className="patterns-recurring-fill"
          style={{ width: `${Math.round(item.relativeStrength * 100)}%` }}
        />
      </div>
    </li>
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
  /** 'recent' = last 60 days for ranking context; 'all' = full history */
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
      setError("Patterns couldn't load — tap to retry");
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
            <button
              className="back-link"
              onClick={() => router.push('/')}
              aria-label="Back"
            >
              <BackIcon />
            </button>
            <h1 className="app-title">Patterns</h1>
          </div>
        </div>
        <p className="patterns-sign-in">Sign in to see your patterns.</p>
      </div>
    );
  }

  const hasAny =
    model.established.length > 0 ||
    model.emerging.length > 0 ||
    model.recurringWork.length > 0;

  return (
    <div className="app-shell patterns-shell">
      <header className="patterns-header surface-header">
        <div className="patterns-header-bar">
          <div className="patterns-header-orient">
            <button
              type="button"
              className="back-link patterns-back"
              onClick={() => router.push('/')}
              aria-label="Back to Today"
            >
              <BackIcon />
            </button>
            <div className="surface-identity">
              <span className="surface-kicker">Understanding</span>
              <h1 className="surface-title">Patterns</h1>
            </div>
          </div>
          <div className="patterns-header-lede">
            <p className="patterns-lede-title">How Dokkit learns from reality</p>
            <p className="patterns-lede-body">
              Dokkit looks for repeatable patterns in the work you actually do. It
              only relies strongly on a pattern when there is enough evidence to
              make it useful.
            </p>
          </div>
          <div className="patterns-header-actions">
            <GearMenu userId={session?.user.id ?? null} />
          </div>
        </div>

        <div className="patterns-model-strip" aria-label="Dokkit understanding">
          <span>
            Based on{' '}
            <strong className="mono">{model.modelStatus.completedTasks}</strong>{' '}
            completed task
            {model.modelStatus.completedTasks === 1 ? '' : 's'}
          </span>
          {model.modelStatus.establishedCount + model.modelStatus.emergingCount >
          0 ? (
            <>
              <span className="patterns-dot">·</span>
              <span>
                <strong className="mono">
                  {model.modelStatus.establishedCount}
                </strong>{' '}
                established
              </span>
              <span className="patterns-dot">·</span>
              <span>
                <strong className="mono">
                  {model.modelStatus.emergingCount}
                </strong>{' '}
                emerging
              </span>
            </>
          ) : null}
          <span className="patterns-scope">
            <button
              type="button"
              className={
                evidenceScope === 'all'
                  ? 'patterns-scope-btn active'
                  : 'patterns-scope-btn'
              }
              onClick={() => setEvidenceScope('all')}
            >
              All evidence
            </button>
            <button
              type="button"
              className={
                evidenceScope === 'recent'
                  ? 'patterns-scope-btn active'
                  : 'patterns-scope-btn'
              }
              onClick={() => setEvidenceScope('recent')}
            >
              Last 60 days
            </button>
          </span>
        </div>
      </header>

      {error ? (
        <button
          type="button"
          className="recalc-error"
          onClick={() => void loadData()}
          disabled={loading}
        >
          {error}
        </button>
      ) : null}

      {loading ? (
        <div className="patterns-loading" aria-busy="true">
          <div className="patterns-skeleton" />
          <div className="patterns-skeleton short" />
          <div className="patterns-skeleton" />
        </div>
      ) : (
        <div className="patterns-layout">
          <div className="patterns-primary">
            {!hasAny ? (
              <section className="patterns-empty">
                <h2 className="patterns-section-title">
                  I&apos;m still learning how your work behaves
                </h2>
                <p>
                  You don&apos;t need to configure anything. Keep using Dokkit
                  normally — complete work, capture what comes up — and patterns
                  appear when there is enough evidence.
                </p>
              </section>
            ) : null}

            {model.established.length > 0 ? (
              <section className="patterns-section" aria-labelledby="noticed-h">
                <h2 id="noticed-h" className="patterns-section-title">
                  What Dokkit has noticed
                </h2>
                <div className="patterns-card-list">
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
              <section className="patterns-section" aria-labelledby="emerging-h">
                <h2 id="emerging-h" className="patterns-section-title">
                  Still emerging
                </h2>
                <p className="patterns-section-note">
                  Interesting signals — not strong enough to materially change
                  decisions yet.
                </p>
                <div className="patterns-card-list">
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
              <section className="patterns-section" aria-labelledby="repeat-h">
                <h2 id="repeat-h" className="patterns-section-title">
                  Work that repeats
                </h2>
                <ul className="patterns-recurring">
                  {model.recurringWork.map((item) => (
                    <RecurringItem key={item.id} item={item} />
                  ))}
                </ul>
              </section>
            ) : null}
          </div>

          <aside className="patterns-aside" aria-label="Dokkit's understanding">
            <div className="patterns-trust-panel">
              <h2 className="patterns-section-title">Dokkit&apos;s understanding</h2>
              <dl className="patterns-trust-dl">
                <div>
                  <dt>Established patterns</dt>
                  <dd className="mono">{model.modelStatus.establishedCount}</dd>
                </div>
                <div>
                  <dt>Emerging signals</dt>
                  <dd className="mono">{model.modelStatus.emergingCount}</dd>
                </div>
                <div>
                  <dt>Completed work</dt>
                  <dd className="mono">{model.modelStatus.completedTasks}</dd>
                </div>
              </dl>
              <p className="patterns-trust-note">
                Based on what you&apos;ve completed and changed in Dokkit. Weak
                evidence stays weak — Dokkit does not invent certainty.
              </p>
              <div className="patterns-legend">
                <span className="patterns-legend-title">Evidence dims</span>
                <div className="patterns-legend-row">
                  <span className="patterns-dim is-high">n</span> sample
                  <span className="patterns-dim is-high">fx</span> effect
                  <span className="patterns-dim is-high">c</span> consistency
                </div>
              </div>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}

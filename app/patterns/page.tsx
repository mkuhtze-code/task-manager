'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import GearMenu from '@/components/GearMenu';
import AppHeader from '@/components/AppHeader';
import { BackIcon, ChevronRightIcon } from '@/components/icons';
import { buildClusters, type HistoricalTask, type TaskCluster } from '@/lib/taskIntelligence';
import {
  observePlanning,
  observeLifecycle,
  observeDecomposition,
  observeAllClusters,
  buildAllActivityProfiles,
  buildUserPatterns,
  summarizeAccuracy,
  observeEstimateAccuracy,
} from '@/lib/thinking';
import type {
  CompletedTaskFacts,
  PlanningObservation,
  LifecycleObservation,
  DecompositionObservation,
  ActivityProfile,
  UserPatterns,
  EstimateAccuracyObservation,
  DurationMemoryObservation,
} from '@/lib/thinking/types';

/* ── Helpers ────────────────────────────────────────────────── */

function fmtMins(mins: number): string {
  mins = Math.round(mins);
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function pct(r: number): string {
  return `${Math.round(r * 100)}%`;
}

/* ── Component ──────────────────────────────────────────────── */

export default function Patterns() {
  const router = useRouter();
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const [facts, setFacts] = useState<CompletedTaskFacts[]>([]);
  const [clusters, setClusters] = useState<TaskCluster[]>([]);
  const [profiles, setProfiles] = useState<ActivityProfile[]>([]);
  const [planning, setPlanning] = useState<PlanningObservation | null>(null);
  const [lifecycle, setLifecycle] = useState<LifecycleObservation | null>(null);
  const [decomposition, setDecomposition] = useState<DecompositionObservation | null>(null);
  const [durationMemories, setDurationMemories] = useState<DurationMemoryObservation[]>([]);
  const [userPatterns, setUserPatterns] = useState<UserPatterns | null>(null);
  const [estimateSummary, setEstimateSummary] = useState<{
    total: number;
    averageRatio: number;
    accuracyPercent: number;
    medianRatio: number;
    examples: { text: string; estimated: number; actual: number; ratio: number }[];
  } | null>(null);
  const [gravitySurface, setGravitySurface] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
  }, []);

  useEffect(() => {
    if (session) loadData();
  }, [session]);

  async function loadData() {
    setLoading(true);
    const userId = session.user.id;

    const [taskRows, subtaskRows, predictionRows, surfaceRows] = await Promise.all([
      supabase
        .from('tasks')
        .select('id, text, status, source, estimate_mins, actual_mins, logged_mins, created_at, completed_at, started_at, surface_date, location_text, lat, lng, job_id, info')
        .eq('user_id', userId)
        .eq('status', 'done')
        .not('actual_mins', 'is', null)
        .order('completed_at', { ascending: false })
        .limit(500),
      supabase
        .from('subtasks')
        .select('task_id, mins, done')
        .eq('user_id', userId),
      supabase
        .from('prediction_log')
        .select('task_text, cluster_label, cluster_count, estimated_mins, suggested_mins, confidence, actual_mins, completed_at')
        .eq('user_id', userId)
        .not('actual_mins', 'is', null)
        .not('completed_at', 'is', null)
        .order('completed_at', { ascending: false })
        .limit(200),
      supabase
        .from('surface_events')
        .select('surface, active, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(200),
    ]);

    const rows: any[] = taskRows.data || [];

    const subtaskMap = new Map<string, { count: number; doneCount: number; totalMins: number }>();
    for (const s of subtaskRows.data || []) {
      const existing = subtaskMap.get(s.task_id) || { count: 0, doneCount: 0, totalMins: 0 };
      existing.count++;
      if (s.done) existing.doneCount++;
      existing.totalMins += s.mins || 0;
      subtaskMap.set(s.task_id, existing);
    }

    const allFacts: CompletedTaskFacts[] = rows.map((r) => {
      const sub = subtaskMap.get(r.id) || { count: 0, doneCount: 0, totalMins: 0 };
      return {
        text: r.text,
        status: 'done' as const,
        source: (r.source || 'planned') as 'planned' | 'came_up',
        estimate_mins: r.estimate_mins ?? 0,
        actual_mins: r.actual_mins,
        logged_mins: r.logged_mins ?? 0,
        created_at: r.created_at || '',
        completed_at: r.completed_at || null,
        started_at: r.started_at || null,
        surface_date: r.surface_date || null,
        location_text: r.location_text || null,
        lat: r.lat ?? null,
        lng: r.lng ?? null,
        job_id: r.job_id || null,
        info: r.info || null,
        subtaskCount: sub.count,
        subtaskDoneCount: sub.doneCount,
        subtaskTotalMins: sub.totalMins,
      };
    });

    setFacts(allFacts);

    const hist: HistoricalTask[] = allFacts.map((f) => ({
      text: f.text,
      actual_mins: f.actual_mins ?? f.estimate_mins,
      location_text: f.location_text ?? undefined,
      lat: f.lat ?? undefined,
      lng: f.lng ?? undefined,
      job_id: f.job_id ?? undefined,
      created_at: f.created_at,
    }));

    const c = buildClusters(hist);
    setClusters(c);

    if (allFacts.length >= 1) {
      setPlanning(observePlanning(allFacts));
      setLifecycle(observeLifecycle(allFacts));
      setDecomposition(observeDecomposition(allFacts));
      setUserPatterns(buildUserPatterns(allFacts));
    }

    const clusterMap = new Map<string, number[]>();
    for (const cluster of c) {
      const actuals: number[] = [];
      for (const f of allFacts) {
        const tokens = f.text.toLowerCase().split(/\s+/);
        if (cluster.tokens.size > 0) {
          for (const t of tokens) {
            if (cluster.tokens.has(t)) {
              if (f.actual_mins != null && f.actual_mins > 0) actuals.push(f.actual_mins);
              break;
            }
          }
        }
      }
      if (actuals.length >= 2) clusterMap.set(cluster.label, actuals);
    }
    setDurationMemories(observeAllClusters(clusterMap));

    const ap = buildAllActivityProfiles(
      allFacts,
      (f) => {
        for (const cluster of c) {
          const tokens = f.text.toLowerCase().split(/\s+/);
          for (const t of tokens) {
            if (cluster.tokens.has(t)) return cluster.label;
          }
        }
        return f.text.toLowerCase().split(/\s+/)[0] || 'other';
      }
    );
    setProfiles(ap);

    const predEntries: EstimateAccuracyObservation[] = (predictionRows.data || []).map((p: any) =>
      observeEstimateAccuracy({
        taskText: p.task_text,
        clusterLabel: p.cluster_label,
        clusterCount: p.cluster_count,
        estimatedMins: p.estimated_mins,
        actualMins: p.actual_mins,
      })
    );
    const accSummary = summarizeAccuracy(predEntries);
    const examples = predEntries.slice(0, 8).map((o) => ({
      text: o.taskText,
      estimated: o.estimatedMins,
      actual: o.actualMins,
      ratio: o.ratio,
    }));
    if (predEntries.length > 0) {
      setEstimateSummary({ ...accSummary, examples });
    }

    const events = surfaceRows.data || [];
    if (events.length >= 8) {
      const counts: Record<string, { active: number; passive: number }> = {};
      for (const e of events) {
        if (!counts[e.surface]) counts[e.surface] = { active: 0, passive: 0 };
        if (e.active) counts[e.surface].active++;
        else counts[e.surface].passive++;
      }
      const scored = Object.entries(counts).map(([surface, c]) => ({
        surface,
        score: c.active * 3 + c.passive,
      }));
      scored.sort((a, b) => b.score - a.score);
      if (scored.length >= 2 && scored[0].score - scored[1].score > 2) {
        setGravitySurface(scored[0].surface);
      }
    }

    setLoading(false);
  }

  function toggle(key: string) {
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  /* ── Compute all sections ─────────────────────────────────── */

  const workload = useMemo(() => {
    if (facts.length === 0) return null;
    const totalMins = facts.reduce((s, f) => s + (f.actual_mins ?? 0), 0);
    const avgMins = totalMins / facts.length;
    const dateSet = new Set<string>();
    for (const f of facts) {
      if (f.completed_at) dateSet.add(f.completed_at.slice(0, 10));
    }
    const distinctDays = dateSet.size || 1;
    return {
      count: facts.length,
      totalMins,
      avgMins,
      dailyAvgMins: totalMins / distinctDays,
    };
  }, [facts]);

  const timePatterns = useMemo(() => {
    return durationMemories.slice(0, 6).map((dm) => {
      const trendWord =
        dm.trend === 'improving' ? 'getting faster' : dm.trend === 'worsening' ? 'taking longer' : 'consistent';
      return {
        label: dm.clusterLabel,
        avgMins: dm.avgMins,
        count: dm.clusterCount,
        trend: trendWord,
        expandable: dm.clusterCount >= 3,
        detail: (
          <div className="pe-detail">
            <div className="pe-detail-row">
              <span className="pe-detail-label">Completed</span>
              <span className="pe-detail-value">{dm.clusterCount} times</span>
            </div>
            <div className="pe-detail-row">
              <span className="pe-detail-label">Trend</span>
              <span className="pe-detail-value">{trendWord}</span>
            </div>
          </div>
        ),
      };
    });
  }, [durationMemories]);

  const estimation = useMemo(() => {
    if (!estimateSummary || estimateSummary.total === 0) return null;
    const ratio = estimateSummary.averageRatio;
    let headline: string;
    if (ratio < 0.9) headline = 'Your estimates tend to be generous — tasks usually finish quicker.';
    else if (ratio > 1.1) headline = 'Tasks often take a little longer than expected.';
    else headline = 'Your estimates are usually close.';
    return {
      headline,
      total: estimateSummary.total,
      examples: estimateSummary.examples,
    };
  }, [estimateSummary]);

  const rhythm = useMemo(() => {
    const rows: { text: string; expandable: boolean; detail?: React.ReactNode }[] = [];
    if (lifecycle) {
      if (lifecycle.sameDayRate >= 0.6) {
        rows.push({ text: 'Most tasks clear the same day.', expandable: false });
      }
      if (lifecycle.carryoverRate >= 0.3) {
        rows.push({
          text: 'Some work regularly carries over across days.',
          expandable: true,
          detail: (
            <div className="pe-detail">
              <div className="pe-detail-row">
                <span className="pe-detail-label">Carry over</span>
                <span className="pe-detail-value">{pct(lifecycle.carryoverRate)} of tasks</span>
              </div>
              <div className="pe-detail-row">
                <span className="pe-detail-label">Avg age</span>
                <span className="pe-detail-value">{lifecycle.avgAgeDays.toFixed(1)} days</span>
              </div>
            </div>
          ),
        });
      }
    }
    if (planning) {
      if (planning.cameUpRate > 0.25) {
        rows.push({ text: 'Work often appears during the day rather than being planned ahead.', expandable: false });
      }
      if (planning.scheduledRate > 0.5) {
        rows.push({ text: 'You usually schedule work for specific days.', expandable: false });
      }
      if (planning.timerUsedRate > 0.5) {
        rows.push({ text: 'You usually time your work.', expandable: false });
      }
    }
    if (decomposition && decomposition.sampleCount >= 5 && decomposition.decomposeRate > 0.2) {
      rows.push({
        text: 'You tend to break larger tasks into subtasks.',
        expandable: true,
        detail: (
          <div className="pe-detail">
            <div className="pe-detail-row">
              <span className="pe-detail-label">Decomposed</span>
              <span className="pe-detail-value">{pct(decomposition.decomposeRate)} of tasks</span>
            </div>
            <div className="pe-detail-row">
              <span className="pe-detail-label">Avg subtasks</span>
              <span className="pe-detail-value">{decomposition.avgSubtaskCount.toFixed(1)}</span>
            </div>
          </div>
        ),
      });
    }
    return rows;
  }, [lifecycle, planning, decomposition]);

  const context = useMemo(() => {
    const rows: { text: string; expandable: boolean; detail?: React.ReactNode }[] = [];
    if (userPatterns) {
      if (userPatterns.jobAttachedRate > 0.35) {
        rows.push({
          text: 'You usually attach work to a Job.',
          expandable: true,
          detail: (
            <div className="pe-detail">
              <div className="pe-detail-row">
                <span className="pe-detail-label">Job linked</span>
                <span className="pe-detail-value">{pct(userPatterns.jobAttachedRate)} of tasks</span>
              </div>
            </div>
          ),
        });
      }
      if (userPatterns.locatedRate > 0.3) {
        rows.push({
          text: 'Location is usually recorded with your work.',
          expandable: true,
          detail: (
            <div className="pe-detail">
              <div className="pe-detail-row">
                <span className="pe-detail-label">Located</span>
                <span className="pe-detail-value">{pct(userPatterns.locatedRate)} of tasks</span>
              </div>
            </div>
          ),
        });
      }
      if (userPatterns.infoUsageRate > 0.3) {
        rows.push({ text: 'You often add notes to your tasks.', expandable: false });
      }
    }
    const locCount = new Map<string, number>();
    for (const f of facts) {
      if (f.location_text) {
        const key = f.location_text.trim().toLowerCase();
        locCount.set(key, (locCount.get(key) || 0) + 1);
      }
    }
    const topLocs = Array.from(locCount.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);
    if (topLocs.length > 0 && topLocs[0][1] >= 3) {
      rows.push({
        text: `You often work from ${topLocs[0][0]}.`,
        expandable: topLocs.length > 1,
        detail: (
          <div className="pe-detail-tags">
            {topLocs.map(([loc, count]) => (
              <span key={loc} className="pe-tag">
                {loc} · {count}×
              </span>
            ))}
          </div>
        ),
      });
    }
    return rows;
  }, [facts, userPatterns]);

  const memories = useMemo(() => {
    return profiles
      .filter((p) => p.count >= 2)
      .slice(0, 8)
      .map((profile) => {
        const trendWord =
          profile.trend === 'improving'
            ? 'getting faster'
            : profile.trend === 'worsening'
            ? 'taking longer'
            : 'consistent';

        const traits: string[] = [];
        if (profile.sameDayRate >= 0.7) traits.push('usually same day');
        if (profile.carryoverRate >= 0.4) traits.push('often carries over');
        if (profile.cameUpRate >= 0.4) traits.push('often unplanned');
        if (profile.jobRate >= 0.6) traits.push('usually attached to a job');
        if (profile.locatedRate >= 0.6) traits.push('usually located');
        if (profile.decomposeRate >= 0.3) traits.push('often broken down');

        return {
          label: profile.clusterLabel,
          count: profile.count,
          avgMins: profile.avgMins,
          trend: trendWord,
          traits,
        };
      });
  }, [profiles]);

  /* ── Render ────────────────────────────────────────────────── */

  const hasContent = !loading && (facts.length > 0 || clusters.length > 0);

  if (!session) {
    return (
      <div className="app-shell">
        <AppHeader title="Patterns" backHref="/" />
        <p style={{ color: 'var(--ink-soft)', fontSize: 14, marginTop: 20 }}>
          Sign in to see your patterns.
        </p>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <div className="app-header">
        <div className="app-header-left">
          <button className="back-link" onClick={() => router.push('/')} aria-label="Back">
            <BackIcon />
          </button>
          <h1 className="app-title">Patterns</h1>
        </div>
        <div className="app-header-right">
          <GearMenu />
        </div>
      </div>

      <p className="patterns-subtitle">What Dokkit has learned from the way you work.</p>

      {loading ? (
        <div className="empty-state">Loading…</div>
      ) : !hasContent ? (
        <div className="patterns-empty">
          <p>Dokkit is getting to know how you work.</p>
          <p>As you use it, things you do regularly will begin to appear here.</p>
        </div>
      ) : (
        <div className="patterns-body">

          {/* ── Workload ──────────────────────────────────── */}
          {workload && (
            <div className="pw-section">
              <div className="pw-section-title">Workload</div>
              <div className="pw-stats">
                <div className="pw-stat">
                  <span className="pw-stat-value">{workload.count}</span>
                  <span className="pw-stat-label">tasks</span>
                </div>
                <div className="pw-stat">
                  <span className="pw-stat-value">{fmtMins(workload.totalMins)}</span>
                  <span className="pw-stat-label">completed</span>
                </div>
                <div className="pw-stat">
                  <span className="pw-stat-value">~{fmtMins(workload.dailyAvgMins)}</span>
                  <span className="pw-stat-label">typical day</span>
                </div>
                <div className="pw-stat">
                  <span className="pw-stat-value">~{fmtMins(workload.avgMins)}</span>
                  <span className="pw-stat-label">per task</span>
                </div>
              </div>
            </div>
          )}

          {/* ── Time ──────────────────────────────────────── */}
          {timePatterns.length > 0 && (
            <div className="pw-section">
              <div className="pw-section-title">Time</div>
              {timePatterns.map((tp, i) => {
                const key = `time-${i}`;
                const isOpen = !!expanded[key];
                return (
                  <div key={key} className="pw-activity">
                    <button
                      className="pw-activity-btn"
                      onClick={() => tp.expandable && toggle(key)}
                    >
                      <span className="pw-activity-name">{tp.label}</span>
                      <span className="pw-activity-meta">
                        <span className="pw-activity-duration">~{fmtMins(tp.avgMins)}</span>
                        {tp.expandable && (
                          <ChevronRightIcon className={`pw-chevron${isOpen ? ' open' : ''}`} />
                        )}
                      </span>
                    </button>
                    {tp.expandable && isOpen && tp.detail}
                  </div>
                );
              })}
            </div>
          )}

          {/* ── Estimation ────────────────────────────────── */}
          {estimation && (
            <div className="pw-section">
              <div className="pw-section-title">Estimation</div>
              <div className="pw-observation">
                <button
                  className="pw-observation-btn"
                  onClick={() => toggle('est')}
                >
                  <span>{estimation.headline}</span>
                  <ChevronRightIcon className={`pw-chevron${expanded['est'] ? ' open' : ''}`} />
                </button>
                {expanded['est'] && (
                  <div className="pe-detail">
                    <div className="pe-detail-row">
                      <span className="pe-detail-label">Based on</span>
                      <span className="pe-detail-value">{estimation.total} estimated tasks</span>
                    </div>
                    {estimation.examples.length > 0 && (
                      <div className="pe-examples">
                        {estimation.examples.map((ex, i) => (
                          <span key={i} className="pe-example">
                            {fmtMins(ex.estimated)} → {fmtMins(ex.actual)}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Your rhythm ───────────────────────────────── */}
          {rhythm.length > 0 && (
            <div className="pw-section">
              <div className="pw-section-title">Your rhythm</div>
              {rhythm.map((r, i) => {
                const key = `rhythm-${i}`;
                const isOpen = !!expanded[key];
                return (
                  <div key={key} className="pw-observation">
                    <button
                      className="pw-observation-btn"
                      onClick={() => r.expandable && toggle(key)}
                    >
                      <span>{r.text}</span>
                      {r.expandable && (
                        <ChevronRightIcon className={`pw-chevron${isOpen ? ' open' : ''}`} />
                      )}
                    </button>
                    {r.expandable && isOpen && r.detail}
                  </div>
                );
              })}
            </div>
          )}

          {/* ── Context ───────────────────────────────────── */}
          {context.length > 0 && (
            <div className="pw-section">
              <div className="pw-section-title">Context</div>
              {context.map((c, i) => {
                const key = `ctx-${i}`;
                const isOpen = !!expanded[key];
                return (
                  <div key={key} className="pw-observation">
                    <button
                      className="pw-observation-btn"
                      onClick={() => c.expandable && toggle(key)}
                    >
                      <span>{c.text}</span>
                      {c.expandable && (
                        <ChevronRightIcon className={`pw-chevron${isOpen ? ' open' : ''}`} />
                      )}
                    </button>
                    {c.expandable && isOpen && c.detail}
                  </div>
                );
              })}
            </div>
          )}

          {/* ── What Dokkit remembers ─────────────────────── */}
          {memories.length > 0 && (
            <div className="pw-section">
              <div className="pw-section-title">What Dokkit remembers</div>
              <div className="pw-memories">
                {memories.map((m, i) => (
                  <div key={i} className="pw-memory">
                    <div className="pw-memory-head">
                      <span className="pw-memory-name">{m.label}</span>
                      <span className="pw-memory-meta">
                        {m.count} completed · ~{fmtMins(m.avgMins)}
                      </span>
                    </div>
                    <div className="pw-memory-detail">
                      <span className="pw-memory-trend">{m.trend}</span>
                    </div>
                    {m.traits.length > 0 && (
                      <div className="pw-memory-traits">
                        {m.traits.map((t) => (
                          <span key={t} className="pw-trait">{t}</span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── How you use Dokkit ────────────────────────── */}
          {gravitySurface && (
            <div className="pw-section pw-section--quiet">
              <div className="pw-observation pw-observation--standalone">
                {gravitySurface === 'today'
                  ? 'You tend to start from Today.'
                  : gravitySurface === 'jobs'
                  ? 'You tend to start from Jobs.'
                  : 'You tend to start from Travel.'}
              </div>
            </div>
          )}

          <div className="patterns-footer">
            Dokkit learns from the way you work.
          </div>
        </div>
      )}
    </div>
  );
}

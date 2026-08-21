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

function ratioWord(ratio: number): string {
  if (ratio < 0.9) return 'faster than expected';
  if (ratio > 1.1) return 'longer than expected';
  return 'close to your estimate';
}

/* ── Types ──────────────────────────────────────────────────── */

type Pattern = {
  text: string;
  expandable?: boolean;
  detail?: React.ReactNode;
};

type Section = {
  title: string;
  patterns: Pattern[];
};

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

    const [taskRows, subtaskRows, predictionRows, surfaceRows, settingsRow] = await Promise.all([
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
      supabase
        .from('user_settings')
        .select('work_start, work_end, work_days')
        .eq('user_id', userId)
        .single(),
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

    const settings = settingsRow.data;
    if (settings) {
      const workStart = settings.work_start || 8;
      const workEnd = settings.work_end || 17;
      const hoursAvailable = workEnd - workStart;
    }

    setLoading(false);
  }

  function toggle(key: string) {
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  const sections = useMemo(() => {
    const result: Section[] = [];

    if (facts.length === 0) return result;

    const totalMins = facts.reduce((s, f) => s + (f.actual_mins ?? 0), 0);
    const avgMins = facts.length > 0 ? totalMins / facts.length : 0;

    const dateSet = new Set<string>();
    for (const f of facts) {
      if (f.completed_at) dateSet.add(f.completed_at.slice(0, 10));
    }
    const distinctDays = dateSet.size || 1;
    const dailyAvgMins = totalMins / distinctDays;

    const workload: Pattern[] = [
      { text: `${facts.length} tasks completed.`, expandable: false },
      { text: `${fmtMins(totalMins)} of completed work.`, expandable: false },
      { text: `Typical day · ~${fmtMins(dailyAvgMins)}.`, expandable: false },
      { text: `Average task · ~${fmtMins(avgMins)}.`, expandable: false },
    ];
    result.push({ title: 'Workload', patterns: workload });

    const timePatterns: Pattern[] = [];
    for (const dm of durationMemories.slice(0, 6)) {
      const trendWord =
        dm.trend === 'improving' ? 'getting faster' : dm.trend === 'worsening' ? 'taking longer' : 'consistent';
      timePatterns.push({
        text: `${dm.clusterLabel} usually takes about ${fmtMins(dm.avgMins)}.`,
        expandable: dm.clusterCount >= 3,
        detail: (
          <div className="pattern-detail">
            <div className="pattern-detail-row">
              <span className="pattern-detail-label">Completed</span>
              <span className="pattern-detail-value">{dm.clusterCount} times</span>
            </div>
            <div className="pattern-detail-row">
              <span className="pattern-detail-label">Trend</span>
              <span className="pattern-detail-value">{trendWord}</span>
            </div>
          </div>
        ),
      });
    }
    if (timePatterns.length > 0) result.push({ title: 'Time', patterns: timePatterns });

    const estPatterns: Pattern[] = [];
    if (estimateSummary && estimateSummary.total > 0) {
      const ratio = estimateSummary.averageRatio;
      let headline: string;
      if (ratio < 0.9) headline = 'Your estimates tend to be generous — tasks usually finish quicker.';
      else if (ratio > 1.1) headline = 'Tasks often take a little longer than expected.';
      else headline = 'Your estimates are usually close.';

      estPatterns.push({
        text: headline,
        expandable: estimateSummary.examples.length > 0,
        detail: (
          <div className="pattern-detail">
            <div className="pattern-detail-row">
              <span className="pattern-detail-label">Based on</span>
              <span className="pattern-detail-value">{estimateSummary.total} estimated tasks</span>
            </div>
            {estimateSummary.examples.length > 0 && (
              <div className="pattern-examples">
                {estimateSummary.examples.map((ex, i) => (
                  <span key={i} className="pattern-example">
                    {fmtMins(ex.estimated)} → {fmtMins(ex.actual)}
                  </span>
                ))}
              </div>
            )}
          </div>
        ),
      });
    }
    if (estPatterns.length > 0) result.push({ title: 'Estimation', patterns: estPatterns });

    const rhythmPatterns: Pattern[] = [];
    if (lifecycle) {
      if (lifecycle.sameDayRate >= 0.6) {
        rhythmPatterns.push({
          text: 'Most tasks clear the same day.',
          expandable: true,
          detail: (
            <div className="pattern-detail">
              <div className="pattern-detail-row">
                <span className="pattern-detail-label">Same day</span>
                <span className="pattern-detail-value">{pct(lifecycle.sameDayRate)}</span>
              </div>
              <div className="pattern-detail-row">
                <span className="pattern-detail-label">Carry over</span>
                <span className="pattern-detail-value">{pct(lifecycle.carryoverRate)}</span>
              </div>
            </div>
          ),
        });
      }
      if (lifecycle.carryoverRate >= 0.3) {
        rhythmPatterns.push({
          text: 'Some work regularly carries over across days.',
          expandable: true,
          detail: (
            <div className="pattern-detail">
              <div className="pattern-detail-row">
                <span className="pattern-detail-label">Carry over</span>
                <span className="pattern-detail-value">{pct(lifecycle.carryoverRate)} of tasks</span>
              </div>
              <div className="pattern-detail-row">
                <span className="pattern-detail-label">Avg age</span>
                <span className="pattern-detail-value">{lifecycle.avgAgeDays.toFixed(1)} days</span>
              </div>
            </div>
          ),
        });
      }
    }
    if (planning) {
      if (planning.cameUpRate > 0.25) {
        rhythmPatterns.push({
          text: 'Work often appears during the day rather than being planned ahead.',
          expandable: true,
          detail: (
            <div className="pattern-detail">
              <div className="pattern-detail-row">
                <span className="pattern-detail-label">Came up</span>
                <span className="pattern-detail-value">{pct(planning.cameUpRate)} of tasks</span>
              </div>
            </div>
          ),
        });
      }
      if (planning.scheduledRate > 0.5) {
        rhythmPatterns.push({
          text: 'You usually schedule work for specific days.',
          expandable: true,
          detail: (
            <div className="pattern-detail">
              <div className="pattern-detail-row">
                <span className="pattern-detail-label">Scheduled</span>
                <span className="pattern-detail-value">{pct(planning.scheduledRate)} of tasks</span>
              </div>
            </div>
          ),
        });
      }
      if (planning.timerUsedRate > 0.5) {
        rhythmPatterns.push({
          text: 'You usually time your work.',
          expandable: true,
          detail: (
            <div className="pattern-detail">
              <div className="pattern-detail-row">
                <span className="pattern-detail-label">Timer used</span>
                <span className="pattern-detail-value">{pct(planning.timerUsedRate)} of tasks</span>
              </div>
            </div>
          ),
        });
      }
    }
    if (decomposition && decomposition.sampleCount >= 5 && decomposition.decomposeRate > 0.2) {
      rhythmPatterns.push({
        text: 'You tend to break larger tasks into subtasks.',
        expandable: true,
        detail: (
          <div className="pattern-detail">
            <div className="pattern-detail-row">
              <span className="pattern-detail-label">Decomposed</span>
              <span className="pattern-detail-value">{pct(decomposition.decomposeRate)} of tasks</span>
            </div>
            <div className="pattern-detail-row">
              <span className="pattern-detail-label">Avg subtasks</span>
              <span className="pattern-detail-value">{decomposition.avgSubtaskCount.toFixed(1)}</span>
            </div>
          </div>
        ),
      });
    }
    if (rhythmPatterns.length > 0) result.push({ title: 'Your rhythm', patterns: rhythmPatterns });

    const contextPatterns: Pattern[] = [];
    if (userPatterns) {
      if (userPatterns.jobAttachedRate > 0.35) {
        contextPatterns.push({
          text: 'You usually attach work to a Job.',
          expandable: true,
          detail: (
            <div className="pattern-detail">
              <div className="pattern-detail-row">
                <span className="pattern-detail-label">Job linked</span>
                <span className="pattern-detail-value">{pct(userPatterns.jobAttachedRate)} of tasks</span>
              </div>
            </div>
          ),
        });
      }
      if (userPatterns.locatedRate > 0.3) {
        contextPatterns.push({
          text: 'Location is usually recorded with your work.',
          expandable: true,
          detail: (
            <div className="pattern-detail">
              <div className="pattern-detail-row">
                <span className="pattern-detail-label">Located</span>
                <span className="pattern-detail-value">{pct(userPatterns.locatedRate)} of tasks</span>
              </div>
            </div>
          ),
        });
      }
      if (userPatterns.infoUsageRate > 0.3) {
        contextPatterns.push({
          text: 'You often add notes to your tasks.',
          expandable: true,
          detail: (
            <div className="pattern-detail">
              <div className="pattern-detail-row">
                <span className="pattern-detail-label">With notes</span>
                <span className="pattern-detail-value">{pct(userPatterns.infoUsageRate)} of tasks</span>
              </div>
            </div>
          ),
        });
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
      contextPatterns.push({
        text: `You often work from ${topLocs[0][0]}.`,
        expandable: topLocs.length > 1,
        detail: (
          <div className="pattern-detail-tags">
            {topLocs.map(([loc, count]) => (
              <span key={loc} className="pattern-tag">
                {loc} · {count}×
              </span>
            ))}
          </div>
        ),
      });
    }
    const jobCount = new Map<string, number>();
    for (const f of facts) {
      if (f.job_id) jobCount.set(f.job_id, (jobCount.get(f.job_id) || 0) + 1);
    }
    if (contextPatterns.length > 0) result.push({ title: 'Context', patterns: contextPatterns });

    const memoryPatterns: Pattern[] = [];
    for (const profile of profiles.slice(0, 8)) {
      if (profile.count < 2) continue;
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

      memoryPatterns.push({
        text: `${profile.clusterLabel} · ${profile.count} completed · ~${fmtMins(profile.avgMins)}`,
        expandable: true,
        detail: (
          <div className="pattern-detail">
            <div className="pattern-detail-row">
              <span className="pattern-detail-label">Duration</span>
              <span className="pattern-detail-value">
                ~{fmtMins(profile.avgMins)} · {trendWord}
              </span>
            </div>
            {traits.length > 0 && (
              <div className="pattern-detail-tags">
                {traits.map((t) => (
                  <span key={t} className="pattern-tag">{t}</span>
                ))}
              </div>
            )}
          </div>
        ),
      });
    }
    if (memoryPatterns.length > 0) result.push({ title: 'What Dokkit remembers', patterns: memoryPatterns });

    if (gravitySurface) {
      const surfaceLabel =
        gravitySurface === 'today' ? 'Today' : gravitySurface === 'jobs' ? 'Jobs' : 'Travel';
      result.push({
        title: 'How you use Dokkit',
        patterns: [
          {
            text: `You tend to start from ${surfaceLabel}.`,
            expandable: false,
          },
        ],
      });
    }

    return result;
  }, [facts, clusters, profiles, planning, lifecycle, decomposition, durationMemories, userPatterns, estimateSummary, gravitySurface]);

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
        <div className="patterns-content">
          {sections.map((section) => (
            <div key={section.title} className="patterns-section">
              <div className="patterns-section-title">{section.title}</div>
              {section.patterns.map((pattern, i) => {
                const key = `${section.title}-${i}`;
                const isOpen = !!expanded[key];
                return (
                  <div key={key} className="pattern-row">
                    <button
                      className="pattern-text"
                      onClick={() => pattern.expandable && toggle(key)}
                    >
                      <span>{pattern.text}</span>
                      {pattern.expandable && (
                        <ChevronRightIcon className={`pattern-chevron${isOpen ? ' open' : ''}`} />
                      )}
                    </button>
                    {pattern.expandable && isOpen && pattern.detail}
                  </div>
                );
              })}
            </div>
          ))}

          <div className="patterns-footer">
            Dokkit learns from the way you work.
          </div>
        </div>
      )}
    </div>
  );
}

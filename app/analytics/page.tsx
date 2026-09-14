'use client';

import './patterns.css';
import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import GearMenu from '@/components/GearMenu';
import { BackIcon } from '@/components/icons';
import {
  buildUserPatterns,
  summarizeAccuracy,
  runObservationPipeline,
  type CompletedTaskFacts,
  type EstimateAccuracyObservation,
  type Confidence,
  type UserPatterns,
  type StructuredObservation,
} from '@/lib/thinking';

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

type PredictionEntry = {
  task_text: string;
  estimated_mins: number;
  actual_mins: number | null;
  confidence: string;
  completed_at: string | null;
};

type PatternInsight = {
  label: string;
  count: number;
  avgMins: number;
  placeAssoc?: string;
  confidence: Confidence;
};

function fmtMins(mins: number): string {
  mins = Math.round(mins);
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function ratePct(rate: number): number {
  return Math.round(Math.min(1, Math.max(0, rate)) * 100);
}

function calibrationLabel(medianRatio: number): { short: string; detail: string } {
  if (medianRatio >= 0.9 && medianRatio <= 1.15) {
    return { short: 'On track', detail: 'Estimates land close to actual time' };
  }
  if (medianRatio > 1.15) {
    return { short: 'Runs long', detail: 'Work often takes longer than estimated' };
  }
  return { short: 'Runs short', detail: 'Work often finishes under estimate' };
}

function RateBar({ label, rate }: { label: string; rate: number }) {
  const pct = ratePct(rate);
  return (
    <div className="patterns-rate-row">
      <div className="patterns-rate-label">{label}</div>
      <div className="patterns-rate-track" aria-hidden>
        <div className="patterns-rate-fill" style={{ width: `${pct}%` }} />
      </div>
      <div className="patterns-rate-pct mono">{pct}%</div>
    </div>
  );
}

export default function Analytics() {
  const router = useRouter();
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [allTasks, setAllTasks] = useState<CompletedTask[]>([]);
  const [allSubtasks, setAllSubtasks] = useState<SubtaskItem[]>([]);
  const [predictions, setPredictions] = useState<PredictionEntry[]>([]);
  const [timePeriod, setTimePeriod] = useState<'today' | 'week' | 'month'>('week');
  const [userTimezone, setUserTimezone] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
  }, []);

  useEffect(() => {
    if (session) {
      loadData();
    }
  }, [session]);

  async function loadData() {
    setLoading(true);
    const userId = session.user.id;

    const { data: taskData } = await supabase
      .from('tasks')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'done')
      .order('completed_at', { ascending: false });

    const loadedTasks: CompletedTask[] = taskData || [];
    const taskIds = loadedTasks.map((t) => t.id);

    let loadedSubtasks: SubtaskItem[] = [];
    if (taskIds.length > 0) {
      const { data: subtaskData } = await supabase
        .from('subtasks')
        .select('id, task_id, mins, done')
        .in('task_id', taskIds);
      loadedSubtasks = subtaskData || [];
    }

    const { data: predictionData } = await supabase
      .from('prediction_log')
      .select('task_text, estimated_mins, actual_mins, confidence, completed_at')
      .eq('user_id', userId)
      .order('logged_at', { ascending: false })
      .limit(200);

    let timezone: string | null = null;
    try {
      const { data: settings } = await supabase
        .from('user_settings')
        .select('timezone')
        .eq('user_id', userId)
        .maybeSingle();
      timezone = settings?.timezone || null;
    } catch {
      timezone = null;
    }
    setUserTimezone(timezone);

    setAllTasks(loadedTasks);
    setAllSubtasks(loadedSubtasks);
    setPredictions(predictionData || []);
    setLoading(false);
  }

  const subtasksByTaskId = useMemo(() => {
    const map = new Map<string, SubtaskItem[]>();
    for (const sub of allSubtasks) {
      const existing = map.get(sub.task_id) || [];
      existing.push(sub);
      map.set(sub.task_id, existing);
    }
    return map;
  }, [allSubtasks]);

  const createFact = (t: CompletedTask): CompletedTaskFacts => {
    const subs = subtasksByTaskId.get(t.id) || [];
    const subtaskDone = subs.filter((s) => s.done);
    const totalSubMins = subs.reduce((sum, s) => sum + (s.mins || 0), 0);

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
      subtaskTotalMins: totalSubMins,
    };
  };

  const allFacts = useMemo(() => allTasks.map(createFact), [allTasks, subtasksByTaskId]);

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const filteredTasks = useMemo(() => {
    return allTasks.filter((t) => {
      if (!t.completed_at) return false;
      const compDate = new Date(t.completed_at);
      if (timePeriod === 'today') return compDate >= todayStart;
      if (timePeriod === 'week') return compDate >= weekStart;
      return compDate >= monthStart;
    });
  }, [allTasks, timePeriod]);

  const filteredFacts = useMemo(
    () => filteredTasks.map(createFact),
    [filteredTasks, subtasksByTaskId]
  );

  const periodUserPatterns: UserPatterns | null = useMemo(
    () => buildUserPatterns(filteredFacts),
    [filteredFacts]
  );

  const completedPredictions = useMemo(
    () => predictions.filter((p) => p.actual_mins !== null),
    [predictions]
  );

  const accuracySummary = useMemo(() => {
    const accuracyObs: EstimateAccuracyObservation[] = completedPredictions.map((p) => ({
      kind: 'estimate_accuracy' as const,
      taskText: p.task_text,
      clusterLabel: null,
      clusterCount: 0,
      estimatedMins: p.estimated_mins,
      actualMins: p.actual_mins!,
      ratio: p.actual_mins! / Math.max(p.estimated_mins, 1),
      confidence: (p.confidence as Confidence) || 'low',
      observedAt: p.completed_at || new Date().toISOString(),
    }));
    return summarizeAccuracy(accuracyObs);
  }, [completedPredictions]);

  const v2Observations: StructuredObservation[] = useMemo(
    () => runObservationPipeline(allFacts, { timezone: userTimezone || 'UTC' }),
    [allFacts, userTimezone]
  );

  const clusterInsights: PatternInsight[] = useMemo(() => {
    const byCluster = new Map<string, PatternInsight>();
    for (const obs of v2Observations) {
      if (obs.type !== 'cluster') continue;
      const label = obs.affectedContext.clusterLabel ?? 'Pattern';
      const current = byCluster.get(label) ?? {
        label,
        count: 0,
        avgMins: 0,
        placeAssoc: undefined,
        confidence: obs.confidence,
      };
      current.count = Math.max(current.count, obs.evidence.sampleSize);
      current.confidence = obs.confidence;
      if (obs.affectedContext.location) {
        current.placeAssoc = obs.affectedContext.location;
      }
      for (const m of obs.evidence.measurements) {
        const rec = m as { medianMins?: number };
        if (typeof rec.medianMins === 'number') {
          current.avgMins = rec.medianMins;
        }
      }
      byCluster.set(label, current);
    }
    return [...byCluster.values()]
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);
  }, [v2Observations]);

  // Top signals for the period — skip cluster types already shown above
  const topSignals = useMemo(() => {
    return v2Observations
      .filter((o) => o.type !== 'cluster')
      .slice(0, 6);
  }, [v2Observations]);

  if (!session) {
    return (
      <div className="app-shell">
        <div className="app-header">
          <div className="app-header-left">
            <button className="back-link" onClick={() => router.push('/')} aria-label="Back">
              <BackIcon />
            </button>
            <h1 className="app-title">Patterns</h1>
          </div>
        </div>
        <p style={{ color: 'var(--ink-soft)', fontSize: 14, marginTop: 20 }}>
          Sign in to see your patterns.
        </p>
      </div>
    );
  }

  const totalCompleted = filteredTasks.length;
  const totalActualMins = filteredTasks.reduce((sum, t) => sum + (t.actual_mins || 0), 0);
  const hoursLabel =
    totalActualMins >= 60
      ? `${Math.round(totalActualMins / 60)}h`
      : totalActualMins > 0
        ? fmtMins(totalActualMins)
        : '—';
  const cal =
    completedPredictions.length > 0
      ? calibrationLabel(accuracySummary.medianRatio)
      : null;

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
          <GearMenu userId={session?.user.id ?? null} />
        </div>
      </div>

      <div className="segmented" style={{ marginTop: 'var(--space-4)', marginBottom: 'var(--space-4)' }}>
        <button
          className={`segmented-btn ${timePeriod === 'today' ? 'active' : ''}`}
          onClick={() => setTimePeriod('today')}
        >
          Today
        </button>
        <button
          className={`segmented-btn ${timePeriod === 'week' ? 'active' : ''}`}
          onClick={() => setTimePeriod('week')}
        >
          Week
        </button>
        <button
          className={`segmented-btn ${timePeriod === 'month' ? 'active' : ''}`}
          onClick={() => setTimePeriod('month')}
        >
          Month
        </button>
      </div>

      {loading ? (
        <div className="empty-state">Loading patterns...</div>
      ) : (
        <>
          {/* Glance metrics */}
          <div className="patterns-glance">
            <div className="patterns-stat">
              <div className="patterns-stat-value mono">{totalCompleted}</div>
              <div className="patterns-stat-label">Done</div>
            </div>
            <div className="patterns-stat">
              <div className="patterns-stat-value mono">{hoursLabel}</div>
              <div className="patterns-stat-label">Logged</div>
            </div>
            <div className="patterns-stat">
              <div className="patterns-stat-value mono">
                {cal ? cal.short : '—'}
              </div>
              <div className="patterns-stat-label">Estimates</div>
            </div>
          </div>

          {/* How you capture */}
          {periodUserPatterns && periodUserPatterns.totalCompleted > 0 && (
            <div className="settings-panel patterns-panel">
              <div className="settings-panel-title">How you capture</div>
              <div className="patterns-rates">
                <RateBar label="Came up mid-day" rate={periodUserPatterns.cameUpRate} />
                <RateBar label="With estimate" rate={periodUserPatterns.estimatedRate} />
                <RateBar label="With location" rate={periodUserPatterns.locatedRate} />
                <RateBar label="On a job" rate={periodUserPatterns.jobAttachedRate} />
                <RateBar label="Broken into subtasks" rate={periodUserPatterns.subtaskUsageRate} />
                <RateBar label="Timer used" rate={periodUserPatterns.timerUsageRate} />
              </div>
            </div>
          )}

          {totalCompleted === 0 && (
            <p className="settings-help" style={{ marginTop: 'var(--space-2)' }}>
              No completed work in this window yet.
            </p>
          )}

          {/* Repeating work */}
          {clusterInsights.length > 0 && (
            <div className="settings-panel patterns-panel">
              <div className="settings-panel-title">Repeating work</div>
              <div className="patterns-chips">
                {clusterInsights.map((p) => (
                  <div key={p.label} className="patterns-chip">
                    <div className="patterns-chip-main">
                      <span className="patterns-chip-label">{p.label}</span>
                      {p.avgMins > 0 && (
                        <span className="patterns-chip-meta mono">~{fmtMins(p.avgMins)}</span>
                      )}
                    </div>
                    <div className="patterns-chip-foot">
                      <span className="mono">×{p.count}</span>
                      {p.placeAssoc && (
                        <span className="patterns-chip-place">{p.placeAssoc}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Calibration strip */}
          {completedPredictions.length > 0 && cal && (
            <div className="settings-panel patterns-panel">
              <div className="settings-panel-title">Estimate feel</div>
              <div className="patterns-cal-row">
                <div className="patterns-cal-gauge" aria-hidden>
                  <div
                    className="patterns-cal-needle"
                    style={{
                      left: `${Math.min(100, Math.max(0, (accuracySummary.medianRatio / 2) * 100))}%`,
                    }}
                  />
                  <div className="patterns-cal-center" />
                </div>
                <div className="patterns-cal-copy">
                  <div className="patterns-cal-title">{cal.short}</div>
                  <div className="patterns-cal-detail">{cal.detail}</div>
                  <div className="analytics-evidence mono">
                    {completedPredictions.length} prediction
                    {completedPredictions.length === 1 ? '' : 's'} · median{' '}
                    {accuracySummary.medianRatio.toFixed(2)}×
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Signals — short cards, not essays */}
          {topSignals.length > 0 && (
            <div className="settings-panel patterns-panel">
              <div className="settings-panel-title">Signals</div>
              <div className="patterns-signals">
                {topSignals.map((obs) => (
                  <div key={obs.id} className="patterns-signal">
                    <div className="patterns-signal-top">
                      <span className={`patterns-conf patterns-conf-${obs.confidence}`} title={`${obs.confidence} confidence`} />
                      <span className="patterns-signal-title">{obs.title}</span>
                    </div>
                    {obs.affectedContext.location && (
                      <div className="patterns-signal-meta">
                        {obs.affectedContext.location}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {!loading &&
            totalCompleted === 0 &&
            clusterInsights.length === 0 &&
            topSignals.length === 0 && (
              <p className="settings-help">
                Keep completing tasks — patterns show up once there is enough history.
              </p>
            )}
        </>
      )}
    </div>
  );
}

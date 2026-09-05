'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import AppHeader from '@/components/AppHeader';
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
  jobAssoc?: string;
  confidence: Confidence;
  trend?: 'stable' | 'improving' | 'worsening';
};

function fmtMins(mins: number): string {
  mins = Math.round(mins);
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
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

    // Load the user's IANA timezone so the V2 pipeline reasons in local
    // calendar time (carryover, lifecycle, staleness, time-of-day) rather
    // than silently defaulting to UTC.
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

  // Pre-index subtasks by task_id
  const subtasksByTaskId = useMemo(() => {
    const map = new Map<string, SubtaskItem[]>();
    for (const sub of allSubtasks) {
      const existing = map.get(sub.task_id) || [];
      existing.push(sub);
      map.set(sub.task_id, existing);
    }
    return map;
  }, [allSubtasks]);

  // Convert DB tasks to CompletedTaskFacts with accurate subtask facts
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

  // Period-specific user interaction habits
  const periodUserPatterns: UserPatterns | null = useMemo(
    () => buildUserPatterns(filteredFacts),
    [filteredFacts]
  );

  // Overall estimation prediction calibration
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

  // Thinking Engine V2: evidence-based structured observations
  const v2Observations: StructuredObservation[] = useMemo(
    () => runObservationPipeline(allFacts, { timezone: userTimezone || 'UTC' }),
    [allFacts, userTimezone]
  );

  // Long-term recurring pattern insights. The evidence and confidence here
  // come directly from the structured V2 cluster observations — the page does
  // NOT independently recalculate evidence/confidence.
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
        jobAssoc: undefined,
        confidence: obs.confidence,
      };
      current.count = Math.max(current.count, obs.evidence.sampleSize);
      current.confidence = obs.confidence;
      if (obs.affectedContext.location) {
        current.placeAssoc = `Usually at ${obs.affectedContext.location}`;
      }
      // Extract a representative median duration if the observation carries one.
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

  const totalCompleted = filteredTasks.length;
  const totalActualMins = filteredTasks.reduce((sum, t) => sum + (t.actual_mins || 0), 0);

  // Generate quiet, non-percentage observations based on UserPatterns
  const habitObservations: string[] = [];
  if (periodUserPatterns) {
    if (periodUserPatterns.cameUpRate > 0.5) {
      habitObservations.push('You often capture tasks dynamically as they arise during the day.');
    } else if (periodUserPatterns.cameUpRate < 0.2 && periodUserPatterns.totalCompleted >= 3) {
      habitObservations.push('Most tasks were planned in advance rather than added dynamically.');
    }

    if (periodUserPatterns.estimatedRate > 0.5) {
      habitObservations.push('You consistently add duration estimates when capturing tasks.');
    }

    if (periodUserPatterns.locatedRate > 0.3) {
      habitObservations.push('Many of your tasks include specific locations for travel awareness.');
    }

    if (periodUserPatterns.jobAttachedRate > 0.3) {
      habitObservations.push('You frequently attach tasks to ongoing jobs.');
    }

    if (periodUserPatterns.subtaskUsageRate > 0.2) {
      habitObservations.push('You tend to break complex tasks down into subtasks.');
    }

    if (periodUserPatterns.infoUsageRate > 0.2) {
      habitObservations.push('You regularly record notes and details on your tasks.');
    }

    if (periodUserPatterns.timerUsageRate > 0.3) {
      habitObservations.push('You frequently use active timers to track focus time.');
    }
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
          <GearMenu userId={session?.user.id ?? null} />
        </div>
      </div>

      <p className="settings-help" style={{ marginTop: 'var(--space-4)' }}>
        Quiet observations about how you work — not a productivity scoreboard.
      </p>

      <div className="segmented" style={{ marginTop: 'var(--space-4)', marginBottom: 'var(--space-5)' }}>
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
          {/* Section 1: Period-Scoped Summary & Habits */}
          <div className="settings-panel">
            <div className="settings-panel-title">
              {timePeriod === 'today' ? 'Today' : timePeriod === 'week' ? 'This week' : 'This month'}
            </div>
            {totalCompleted === 0 ? (
              <p className="settings-help">
                No completed work recorded in this window yet.
              </p>
            ) : (
              <>
                <p className="settings-help">
                  {totalCompleted} completed task{totalCompleted === 1 ? '' : 's'}
                  {totalActualMins >= 60 ? ` · roughly ${Math.round(totalActualMins / 60)}h of finished work` : ''}.
                </p>

                {habitObservations.length > 0 && (
                  <div className="pattern-list compact">
                    {habitObservations.map((obs, i) => (
                      <div key={i} className="analytics-task-item">
                        <span className="analytics-task-text">{obs}</span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Section 2: Long-Term Historical Task Patterns */}
          {clusterInsights.length > 0 && (
            <div className="settings-panel">
              <div className="settings-panel-title">Learned task patterns</div>
              <p className="settings-help">
                Long-term observations from tasks you repeat across all work history.
              </p>
              <div className="pattern-list">
                {clusterInsights.map((p) => (
                  <div key={p.label} className="analytics-task-row">
                    <div className="analytics-task-info">
                      <div className="analytics-task-name">{p.label}</div>
                      <div className="analytics-task-time mono">usually ~{fmtMins(p.avgMins)}</div>
                      {(p.placeAssoc || p.jobAssoc) && (
                        <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 2 }}>
                          {[p.placeAssoc, p.jobAssoc].filter(Boolean).join(' · ')}
                        </div>
                      )}
                    </div>
                    <span className="analytics-evidence mono">seen {p.count} times</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Section 2b: Evidence-Based Observations (Thinking Engine V2) */}
          <div className="settings-panel">
            <div className="settings-panel-title">Things I&apos;ve noticed</div>
            <p className="settings-help">
              Quiet observations grounded in your task history. Not a scoreboard — just patterns worth knowing.
            </p>
            {v2Observations.length === 0 ? (
              <p className="settings-help">
                Not enough history to form confident observations yet.
              </p>
            ) : (
              <div className="pattern-list">
                {v2Observations.map((obs) => (
                  <div key={obs.id} className="analytics-task-row">
                    <div className="analytics-task-info">
                      <div className="analytics-task-name">{obs.title}</div>
                      <div className="analytics-task-time">{obs.description}</div>
                      {(obs.affectedContext.location || obs.confidence !== 'low') && (
                        <div className="analytics-evidence mono" style={{ marginTop: 2 }}>
                          {[obs.affectedContext.location ? `usually at ${obs.affectedContext.location}` : null, obs.confidence !== 'low' ? `${obs.confidence} confidence` : null]
                            .filter(Boolean)
                            .join(' · ')}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Section 3: Overall Estimate Calibration */}
          {completedPredictions.length > 0 && (
            <div className="settings-panel">
              <div className="settings-panel-title">Estimate calibration</div>
              <p className="settings-help">
                Duration estimates are weighed against how long similar completed work actually took, so future suggestions stay realistic.
              </p>
              <p className="analytics-evidence mono">
                Based on {completedPredictions.length} recorded prediction{completedPredictions.length === 1 ? '' : 's'}.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import AppHeader from '@/components/AppHeader';
import GearMenu from '@/components/GearMenu';
import { BackIcon } from '@/components/icons';
import { buildClusters, groupTasksByCluster, type HistoricalTask } from '@/lib/taskIntelligence';
import {
  buildUserPatterns,
  buildAllActivityProfiles,
  findClusterPlaceAssociations,
  findClusterJobAssociations,
  summarizeAccuracy,
  type CompletedTaskFacts,
  type EstimateAccuracyObservation,
  type Confidence,
  type UserPatterns,
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

function fmtHours(mins: number): string {
  const hours = (mins / 60).toFixed(1);
  return `${hours}h`;
}

export default function Analytics() {
  const router = useRouter();
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [allTasks, setAllTasks] = useState<CompletedTask[]>([]);
  const [allSubtasks, setAllSubtasks] = useState<SubtaskItem[]>([]);
  const [predictions, setPredictions] = useState<PredictionEntry[]>([]);
  const [timePeriod, setTimePeriod] = useState<'today' | 'week' | 'month'>('week');

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

  // Historical task clustering (uses actual_mins || 0 without substituting estimates)
  const historyForClustering: HistoricalTask[] = useMemo(
    () =>
      allTasks.map((t) => ({
        text: t.text,
        actual_mins: t.actual_mins || 0,
        location_text: t.location_text,
        lat: t.lat,
        lng: t.lng,
        job_id: t.job_id,
        created_at: t.created_at,
      })),
    [allTasks]
  );

  const clusters = useMemo(() => buildClusters(historyForClustering), [historyForClustering]);

  // Group facts by fuzzy cluster membership to preserve consistent cluster evidence everywhere
  const groupedFacts = useMemo(() => {
    return groupTasksByCluster(allFacts, clusters);
  }, [allFacts, clusters]);

  const labelFn = (fact: CompletedTaskFacts) => {
    for (const [label, memberFacts] of groupedFacts) {
      if (memberFacts.includes(fact)) return label;
    }
    return fact.text.trim();
  };

  const activityProfiles = useMemo(
    () => buildAllActivityProfiles(allFacts, labelFn, now),
    [allFacts, clusters, groupedFacts]
  );

  // Long-term recurring pattern insights derived directly from thinking modules
  const clusterInsights: PatternInsight[] = useMemo(() => {
    return clusters
      .filter((c) => c.count >= 2)
      .sort((a, b) => b.count - a.count)
      .slice(0, 6)
      .map((c) => {
        const clusterTasks = groupedFacts.get(c.label) || [];

        const placeAssocs = findClusterPlaceAssociations(c.label, clusterTasks);
        const jobAssocs = findClusterJobAssociations(c.label, clusterTasks);

        let placeText: string | undefined;
        if (placeAssocs.length > 0) {
          placeText = `Usually at ${placeAssocs[0].locationText}`;
        }

        let jobText: string | undefined;
        if (jobAssocs.length > 0) {
          jobText = `Linked to recurring job context`;
        }

        const profile = activityProfiles.find(
          (p) => p.clusterLabel.toLowerCase() === c.label.toLowerCase()
        );

        return {
          label: c.label,
          count: c.count,
          avgMins: c.avgMins,
          placeAssoc: placeText,
          jobAssoc: jobText,
          confidence: profile?.confidence || 'low',
          trend: profile?.trend,
        };
      });
  }, [clusters, groupedFacts, activityProfiles]);

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
              <p style={{ color: 'var(--ink-soft)', fontSize: 13, margin: 0 }}>
                No completed work recorded in this window yet.
              </p>
            ) : (
              <>
                <div className="hero-stat-row">
                  <div className="hero-stat-number mono">{fmtHours(totalActualMins)}</div>
                  <div className="hero-stat-sub">
                    across {totalCompleted} completed task{totalCompleted === 1 ? '' : 's'}
                  </div>
                </div>

                {habitObservations.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', marginTop: 'var(--space-3)' }}>
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
              <p style={{ color: 'var(--ink-soft)', fontSize: 12, lineHeight: 1.5, margin: '-4px 0 var(--space-3)' }}>
                Long-term observations from tasks you repeat across all work history.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
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
                    <div className="confidence-tag">{p.count} completions</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Section 3: Overall Estimate Calibration */}
          {completedPredictions.length > 0 && (
            <div className="settings-panel">
              <div className="settings-panel-title">Estimate calibration</div>
              <p style={{ color: 'var(--ink-soft)', fontSize: 12, lineHeight: 1.5, margin: '-4px 0 var(--space-3)' }}>
                Long-term history of how initial duration estimates match completed work.
              </p>
              <div style={{ fontSize: 13, color: 'var(--ink)', lineHeight: 1.5 }}>
                <p>
                  Your duration estimates are being compared with completed work over time to help guide future planning.
                </p>
                <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 6 }}>
                  Based on {completedPredictions.length} recorded prediction{completedPredictions.length === 1 ? '' : 's'}.
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import AppHeader from '@/components/AppHeader';
import GearMenu from '@/components/GearMenu';
import { BackIcon } from '@/components/icons';
import { buildClusters, type HistoricalTask } from '@/lib/taskIntelligence';
import {
  buildUserPatterns,
  buildAllActivityProfiles,
  findClusterTimeAssociations,
  findClusterPlaceAssociations,
  findClusterJobAssociations,
  summarizeAccuracy,
  type CompletedTaskFacts,
  type EstimateAccuracyObservation,
  type Confidence,
  type ActivityProfile,
  type UserPatterns,
  type ClusterTimeAssociation,
  type ClusterPlaceAssociation,
  type ClusterJobAssociation,
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
  timeAssoc?: string;
  placeAssoc?: string;
  jobAssoc?: string;
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

function confidenceLabel(count: number): string {
  if (count >= 5) return 'Well known';
  if (count >= 3) return 'Fairly confident';
  return 'Just noticed';
}

function periodToText(period: string): string {
  switch (period) {
    case 'morning':
      return 'mornings';
    case 'afternoon':
      return 'afternoons';
    case 'evening':
      return 'evenings';
    case 'night':
      return 'nights';
    default:
      return period;
  }
}

export default function Analytics() {
  const router = useRouter();
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [allTasks, setAllTasks] = useState<CompletedTask[]>([]);
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

    const { data: predictionData } = await supabase
      .from('prediction_log')
      .select('task_text, estimated_mins, actual_mins, confidence, completed_at')
      .eq('user_id', userId)
      .order('logged_at', { ascending: false })
      .limit(200);

    setAllTasks(taskData || []);
    setPredictions(predictionData || []);
    setLoading(false);
  }

  if (!session) {
    return (
      <div className="app-shell">
        <AppHeader title="Patterns" backHref="/" />
        <p style={{ color: 'var(--ink-soft)', fontSize: 14, marginTop: 20 }}>Sign in to see your patterns.</p>
      </div>
    );
  }

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const filteredTasks = allTasks.filter((t) => {
    if (!t.completed_at) return false;
    const compDate = new Date(t.completed_at);
    if (timePeriod === 'today') return compDate >= todayStart;
    if (timePeriod === 'week') return compDate >= weekStart;
    return compDate >= monthStart;
  });

  // Convert to CompletedTaskFacts for thinking engine modules
  const facts: CompletedTaskFacts[] = filteredTasks.map((t) => ({
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
    subtaskCount: 0,
    subtaskDoneCount: 0,
    subtaskTotalMins: 0,
  }));

  const allFacts: CompletedTaskFacts[] = allTasks.map((t) => ({
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
    subtaskCount: 0,
    subtaskDoneCount: 0,
    subtaskTotalMins: 0,
  }));

  // User patterns across filtered period
  const userPatterns: UserPatterns | null = buildUserPatterns(facts);

  // Clusters and Activity Profiles
  const historyForClustering: HistoricalTask[] = allTasks.map((t) => ({
    text: t.text,
    actual_mins: t.actual_mins || t.estimate_mins || 0,
    location_text: t.location_text,
    lat: t.lat,
    lng: t.lng,
    job_id: t.job_id,
    created_at: t.created_at,
  }));

  const clusters = buildClusters(historyForClustering);

  // Map each task to cluster label
  const labelFn = (fact: CompletedTaskFacts) => {
    for (const c of clusters) {
      if (c.label.toLowerCase() === fact.text.trim().toLowerCase()) return c.label;
    }
    return fact.text.trim();
  };

  const activityProfiles = buildAllActivityProfiles(allFacts, labelFn, now);

  // Derive recurring pattern insights
  const clusterInsights: PatternInsight[] = clusters
    .filter((c) => c.count >= 2)
    .sort((a, b) => b.count - a.count)
    .slice(0, 6)
    .map((c) => {
      const clusterTasks = allFacts.filter(
        (f) => labelFn(f).toLowerCase() === c.label.toLowerCase()
      );

      const timeAssocs = findClusterTimeAssociations(c.label, clusterTasks);
      const placeAssocs = findClusterPlaceAssociations(c.label, clusterTasks);
      const jobAssocs = findClusterJobAssociations(c.label, clusterTasks);

      let timeText: string | undefined;
      if (timeAssocs.length > 0) {
        const primary = timeAssocs[0];
        timeText =
          primary.dimension === 'period'
            ? `Usually in the ${periodToText(primary.value)}`
            : `Usually on ${primary.value}s`;
      }

      let placeText: string | undefined;
      if (placeAssocs.length > 0) {
        placeText = `Often at ${placeAssocs[0].locationText}`;
      }

      let jobText: string | undefined;
      if (jobAssocs.length > 0) {
        jobText = `Connected to recurring job context`;
      }

      const profile = activityProfiles.find(
        (p) => p.clusterLabel.toLowerCase() === c.label.toLowerCase()
      );

      return {
        label: c.label,
        count: c.count,
        avgMins: c.avgMins,
        timeAssoc: timeText,
        placeAssoc: placeText,
        jobAssoc: jobText,
        trend: profile?.trend,
      };
    });

  // Prediction accuracy observations
  const completedPredictions = predictions.filter((p) => p.actual_mins !== null);
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
  const accuracySummary = summarizeAccuracy(accuracyObs);

  const totalCompleted = filteredTasks.length;
  const totalActualMins = filteredTasks.reduce((sum, t) => sum + (t.actual_mins || 0), 0);

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
      ) : totalCompleted === 0 ? (
        <div className="empty-state">Nothing wrapped up in this window yet.</div>
      ) : (
        <>
          {/* Section 1: Overview & Interaction Habits */}
          <div className="settings-panel">
            <div className="settings-panel-title">Time & interaction style</div>
            <div className="hero-stat-row">
              <div className="hero-stat-number mono">{fmtHours(totalActualMins)}</div>
              <div className="hero-stat-sub">
                spent across {totalCompleted} task{totalCompleted === 1 ? '' : 's'}
              </div>
            </div>

            {userPatterns && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', marginTop: 'var(--space-4)' }}>
                {userPatterns.cameUpRate > 0.4 ? (
                  <div className="analytics-task-item">
                    <span className="analytics-task-text">
                      {Math.round(userPatterns.cameUpRate * 100)}% of tasks came up dynamically during the day.
                    </span>
                  </div>
                ) : (
                  <div className="analytics-task-item">
                    <span className="analytics-task-text">
                      Most tasks were captured in advance rather than as reactive carryover.
                    </span>
                  </div>
                )}

                {userPatterns.estimatedRate > 0 ? (
                  <div className="analytics-task-item">
                    <span className="analytics-task-text">
                      {Math.round(userPatterns.estimatedRate * 100)}% of tasks had an estimated duration attached.
                    </span>
                  </div>
                ) : null}

                {userPatterns.locatedRate > 0 ? (
                  <div className="analytics-task-item">
                    <span className="analytics-task-text">
                      {Math.round(userPatterns.locatedRate * 100)}% of tasks were location-based.
                    </span>
                  </div>
                ) : null}
              </div>
            )}
          </div>

          {/* Section 2: Observed Task Patterns */}
          {clusterInsights.length > 0 && (
            <div className="settings-panel">
              <div className="settings-panel-title">What Dokkit has noticed</div>
              <p style={{ color: 'var(--ink-soft)', fontSize: 12, lineHeight: 1.5, margin: '-4px 0 var(--space-3)' }}>
                Quiet patterns learned from tasks you repeat.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                {clusterInsights.map((p) => (
                  <div key={p.label} className="analytics-task-row">
                    <div className="analytics-task-info">
                      <div className="analytics-task-name">{p.label}</div>
                      <div className="analytics-task-time mono">usually ~{fmtMins(p.avgMins)}</div>
                      {(p.timeAssoc || p.placeAssoc || p.jobAssoc) && (
                        <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 2 }}>
                          {[p.timeAssoc, p.placeAssoc, p.jobAssoc].filter(Boolean).join(' · ')}
                        </div>
                      )}
                    </div>
                    <div className="confidence-tag">{confidenceLabel(p.count)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Section 3: Estimation Guidance */}
          {completedPredictions.length > 0 && (
            <div className="settings-panel">
              <div className="settings-panel-title">Estimate calibration</div>
              <p style={{ color: 'var(--ink-soft)', fontSize: 12, lineHeight: 1.5, margin: '-4px 0 var(--space-3)' }}>
                Observations on how planned estimates align with actual time spent.
              </p>
              <div style={{ fontSize: 13, color: 'var(--ink)', lineHeight: 1.5 }}>
                {accuracySummary.averageRatio < 0.85 ? (
                  <p>Tasks frequently take slightly less time than planned.</p>
                ) : accuracySummary.averageRatio > 1.15 ? (
                  <p>Tasks often require a bit more time than initial estimates.</p>
                ) : (
                  <p>Your duration estimates consistently reflect actual completion times.</p>
                )}
                <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 6 }}>
                  Based on {completedPredictions.length} completed prediction{completedPredictions.length === 1 ? '' : 's'}.
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

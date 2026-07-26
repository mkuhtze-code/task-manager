'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import AppHeader from '@/components/AppHeader';

type CompletedTask = {
  id: string;
  text: string;
  estimate_mins: number;
  actual_mins: number;
  completed_at: string;
  source: 'planned' | 'came_up';
  status: 'done';
};

type AnalyticsData = {
  todayTasks: CompletedTask[];
  weekTasks: CompletedTask[];
  monthTasks: CompletedTask[];
  allTasks: CompletedTask[];
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
  const [session, setSession] = useState<any>(null);
  const [analytics, setAnalytics] = useState<AnalyticsData>({
    todayTasks: [],
    weekTasks: [],
    monthTasks: [],
    allTasks: [],
  });
  const [loading, setLoading] = useState(true);
  const [timePeriod, setTimePeriod] = useState<'today' | 'week' | 'month'>('week');

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
  }, []);

  useEffect(() => {
    if (session) {
      loadAnalytics();
    }
  }, [session]);

  async function loadAnalytics() {
    setLoading(true);
    const userId = session.user.id;
    const now = new Date();

    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const { data: allData } = await supabase
      .from('tasks')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'done')
      .order('completed_at', { ascending: false });

    const allTasks = allData || [];

    const todayTasks = allTasks.filter((t) => new Date(t.completed_at) >= todayStart);
    const weekTasks = allTasks.filter((t) => new Date(t.completed_at) >= weekStart);
    const monthTasks = allTasks.filter((t) => new Date(t.completed_at) >= monthStart);

    setAnalytics({ todayTasks, weekTasks, monthTasks, allTasks });
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

  const currentData = analytics[`${timePeriod}Tasks` as keyof AnalyticsData];

  const totalCompleted = currentData.length;
  const totalActualMins = currentData.reduce((sum, t) => sum + (t.actual_mins || 0), 0);
  const totalEstimateMins = currentData.reduce((sum, t) => sum + t.estimate_mins, 0);
  const avgEstimate = totalCompleted > 0 ? totalEstimateMins / totalCompleted : 0;
  const avgActual = totalCompleted > 0 ? totalActualMins / totalCompleted : 0;

  const plannedTasks = currentData.filter((t) => t.source === 'planned');
  const cameUpTasks = currentData.filter((t) => t.source === 'came_up');
  const plannedMins = plannedTasks.reduce((sum, t) => sum + (t.actual_mins || 0), 0);
  const cameUpMins = cameUpTasks.reduce((sum, t) => sum + (t.actual_mins || 0), 0);

  // Tasks where the estimate and the actual time diverged meaningfully —
  // this is what actually helps: next time you write "quote reroof: 30m",
  // you have a quiet reference point instead of guessing cold.
  const taskDeltas = currentData.map((t) => ({
    ...t,
    ratio: (t.actual_mins || 0) / Math.max(t.estimate_mins, 1),
  }));
  const ranShorter = taskDeltas.filter((t) => t.ratio < 0.8).sort((a, b) => a.ratio - b.ratio).slice(0, 3);
  const ranLonger = taskDeltas.filter((t) => t.ratio > 1.2).sort((a, b) => b.ratio - a.ratio).slice(0, 3);

  const currentTasks =
    timePeriod === 'today' ? analytics.todayTasks : timePeriod === 'week' ? analytics.weekTasks : analytics.monthTasks;

  const plannedSharePercent = totalActualMins > 0 ? Math.round((plannedMins / totalActualMins) * 100) : 0;

  return (
    <div className="app-shell">
      <AppHeader title="Patterns" backHref="/" />

      <p style={{ color: 'var(--ink-soft)', fontSize: 13, lineHeight: 1.5, marginTop: 'var(--space-4)', marginBottom: 0 }}>
        A quiet look at how your time actually went — not a scoreboard.
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

      {totalCompleted === 0 ? (
        <div className="empty-state">Nothing wrapped up in this window yet.</div>
      ) : (
        <>
          {/* Time logged */}
          <div className="settings-panel">
            <div className="settings-panel-title">Time logged</div>
            <div className="analytics-grid">
              <div className="analytics-card">
                <div className="analytics-label">Wrapped up</div>
                <div className="analytics-number">{totalCompleted}</div>
              </div>
              <div className="analytics-card">
                <div className="analytics-label">Time spent</div>
                <div className="analytics-number">{fmtHours(totalActualMins)}</div>
              </div>
              <div className="analytics-card">
                <div className="analytics-label">Avg per task</div>
                <div className="analytics-number">{fmtMins(avgActual)}</div>
              </div>
            </div>
          </div>

          {/* Estimate sense */}
          <div className="settings-panel">
            <div className="settings-panel-title">Estimate sense</div>
            <div className="analytics-grid">
              <div className="analytics-card">
                <div className="analytics-label">You usually estimate</div>
                <div className="analytics-number">{fmtMins(avgEstimate)}</div>
              </div>
              <div className="analytics-card">
                <div className="analytics-label">Things usually take</div>
                <div className="analytics-number">{fmtMins(avgActual)}</div>
              </div>
            </div>

            {ranShorter.length > 0 && (
              <div style={{ marginTop: 'var(--space-4)' }}>
                <div style={{ fontSize: 12, color: 'var(--ink-soft)', fontWeight: 600, marginBottom: 'var(--space-2)' }}>
                  Ran shorter than expected:
                </div>
                {ranShorter.map((t) => (
                  <div key={t.id} className="analytics-task-item">
                    <span className="analytics-task-text">{t.text}</span>
                    <span className="analytics-task-badge" style={{ color: 'var(--ink-soft)' }}>
                      {fmtMins(t.estimate_mins)} → {fmtMins(t.actual_mins || 0)}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {ranLonger.length > 0 && (
              <div style={{ marginTop: 'var(--space-3)' }}>
                <div style={{ fontSize: 12, color: 'var(--ink-soft)', fontWeight: 600, marginBottom: 'var(--space-2)' }}>
                  Ran longer than expected:
                </div>
                {ranLonger.map((t) => (
                  <div key={t.id} className="analytics-task-item">
                    <span className="analytics-task-text">{t.text}</span>
                    <span className="analytics-task-badge" style={{ color: 'var(--ink-soft)' }}>
                      {fmtMins(t.estimate_mins)} → {fmtMins(t.actual_mins || 0)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Where time came from */}
          <div className="settings-panel">
            <div className="settings-panel-title">Where time came from</div>
            <div className="analytics-grid">
              <div className="analytics-card">
                <div className="analytics-label">Planned</div>
                <div className="analytics-number">{fmtHours(plannedMins)}</div>
                <div className="analytics-sublabel">{plannedTasks.length} tasks</div>
              </div>
              <div className="analytics-card">
                <div className="analytics-label">Came up</div>
                <div className="analytics-number">{fmtHours(cameUpMins)}</div>
                <div className="analytics-sublabel">{cameUpTasks.length} tasks</div>
              </div>
              <div className="analytics-card">
                <div className="analytics-label">Planned share</div>
                <div className="analytics-number">{plannedSharePercent}%</div>
              </div>
            </div>
          </div>

          {/* Recently completed */}
          <div className="settings-panel">
            <div className="settings-panel-title">Recently completed</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              {currentTasks.slice(0, 5).map((task) => (
                <div key={task.id} className="analytics-task-row">
                  <div className="analytics-task-info">
                    <div className="analytics-task-name">{task.text}</div>
                    <div className="analytics-task-time mono">
                      {fmtMins(task.estimate_mins)} → {fmtMins(task.actual_mins || 0)}
                    </div>
                  </div>
                  <div className={`analytics-task-source ${task.source}`}>
                    {task.source === 'planned' ? 'Planned' : 'Came up'}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

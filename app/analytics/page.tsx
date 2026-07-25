'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
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
  const router = useRouter();
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

    // Calculate date ranges
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    // Fetch all completed tasks
    const { data: allData } = await supabase
      .from('tasks')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'done')
      .order('completed_at', { ascending: false });

    const allTasks = allData || [];

    // Filter by time periods
    const todayTasks = allTasks.filter(
      (t) => new Date(t.completed_at) >= todayStart
    );

    const weekTasks = allTasks.filter(
      (t) => new Date(t.completed_at) >= weekStart
    );

    const monthTasks = allTasks.filter(
      (t) => new Date(t.completed_at) >= monthStart
    );

    setAnalytics({
      todayTasks,
      weekTasks,
      monthTasks,
      allTasks,
    });
    setLoading(false);
  }

  if (!session) {
    return (
      <div className="app-shell">
        <AppHeader title="Analytics" backHref="/" />
        <p style={{ color: 'var(--ink-soft)', fontSize: 14, marginTop: 20 }}>Sign in to view analytics.</p>
      </div>
    );
  }

  const currentData = analytics[`${timePeriod}Tasks` as keyof AnalyticsData];

  // Calculate metrics
  const totalCompleted = currentData.length;
  const totalActualMins = currentData.reduce((sum, t) => sum + (t.actual_mins || 0), 0);
  const totalEstimateMins = currentData.reduce((sum, t) => sum + t.estimate_mins, 0);
  const avgEstimate = totalCompleted > 0 ? totalEstimateMins / totalCompleted : 0;
  const avgActual = totalCompleted > 0 ? totalActualMins / totalCompleted : 0;
  const accuracyPercent = totalEstimateMins > 0 ? ((totalActualMins / totalEstimateMins) * 100).toFixed(0) : '0';

  const plannedTasks = currentData.filter((t) => t.source === 'planned');
  const cameUpTasks = currentData.filter((t) => t.source === 'came_up');
  const plannedMins = plannedTasks.reduce((sum, t) => sum + (t.actual_mins || 0), 0);
  const cameUpMins = cameUpTasks.reduce((sum, t) => sum + (t.actual_mins || 0), 0);

  // Find tasks user tends to over/underestimate
  const taskAccuracies = currentData.map((t) => ({
    ...t,
    accuracyRatio: (t.actual_mins || 0) / Math.max(t.estimate_mins, 1),
  }));
  const overestimated = taskAccuracies.filter((t) => t.accuracyRatio < 0.8).sort((a, b) => a.accuracyRatio - b.accuracyRatio).slice(0, 3);
  const underestimated = taskAccuracies.filter((t) => t.accuracyRatio > 1.2).sort((a, b) => b.accuracyRatio - a.accuracyRatio).slice(0, 3);

  // Day of week analysis
  const dayStats: Record<number, { count: number; mins: number }> = {};
  currentData.forEach((t) => {
    const day = new Date(t.completed_at).getDay();
    if (!dayStats[day]) dayStats[day] = { count: 0, mins: 0 };
    dayStats[day].count += 1;
    dayStats[day].mins += t.actual_mins || 0;
  });

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const mostProductiveDay = Object.entries(dayStats).reduce(
    (best, [day, stats]) =>
      stats.mins > (best?.[1]?.mins || 0) ? [Number(day), stats] : best,
    null as [number, { count: number; mins: number }] | null
  );

  // Work streak
  const now = new Date();
  let streak = 0;
  let checkDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const hasTaskOnDate = (date: Date) => {
    const dateStr = date.toISOString().split('T')[0];
    return analytics.allTasks.some(
      (t) => t.completed_at.split('T')[0] === dateStr
    );
  };

  while (hasTaskOnDate(checkDate)) {
    streak += 1;
    checkDate = new Date(checkDate.getTime() - 24 * 60 * 60 * 1000);
  }

  // Weekly consistency
  const weekDates: Record<string, number> = {};
  for (let i = 0; i < 7; i++) {
    const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    const dateStr = date.toISOString().split('T')[0];
    weekDates[dateStr] = analytics.allTasks
      .filter((t) => t.completed_at.split('T')[0] === dateStr)
      .reduce((sum, t) => sum + (t.actual_mins || 0), 0);
  }
  const daysWorkedThisWeek = Object.values(weekDates).filter((m) => m > 0).length;

  const currentTasks = timePeriod === 'today' ? analytics.todayTasks : 
                       timePeriod === 'week' ? analytics.weekTasks : 
                       analytics.monthTasks;

  return (
    <div className="app-shell">
      <AppHeader title="Analytics" backHref="/" />

      {/* Time Period Selector */}
      <div className="segmented" style={{ marginTop: 'var(--space-5)', marginBottom: 'var(--space-5)' }}>
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

      {/* Completed Tasks Metrics */}
      <div className="settings-panel">
        <div className="settings-panel-title">Completed Tasks</div>
        <div className="analytics-grid">
          <div className="analytics-card">
            <div className="analytics-label">Total Completed</div>
            <div className="analytics-number">{totalCompleted}</div>
          </div>
          <div className="analytics-card">
            <div className="analytics-label">Time Logged</div>
            <div className="analytics-number">{fmtHours(totalActualMins)}</div>
          </div>
          <div className="analytics-card">
            <div className="analytics-label">Avg Per Task</div>
            <div className="analytics-number">{fmtMins(avgActual)}</div>
          </div>
        </div>
      </div>

      {/* Time Estimate Accuracy */}
      <div className="settings-panel">
        <div className="settings-panel-title">Estimate Accuracy</div>
        <div className="analytics-grid">
          <div className="analytics-card">
            <div className="analytics-label">Estimate Accuracy</div>
            <div className="analytics-number">{accuracyPercent}%</div>
            <div className="analytics-sublabel">
              {accuracyPercent === '100' ? 'Perfect! 🎯' : 
               parseInt(accuracyPercent) < 100 ? 'You\'re fast ⚡' : 'Take more time ⏱'}
            </div>
          </div>
          <div className="analytics-card">
            <div className="analytics-label">Estimated Avg</div>
            <div className="analytics-number">{fmtMins(avgEstimate)}</div>
          </div>
          <div className="analytics-card">
            <div className="analytics-label">Actual Avg</div>
            <div className="analytics-number">{fmtMins(avgActual)}</div>
          </div>
        </div>

        {overestimated.length > 0 && (
          <div style={{ marginTop: 'var(--space-4)' }}>
            <div style={{ fontSize: 12, color: 'var(--ink-soft)', fontWeight: 600, marginBottom: 'var(--space-2)' }}>
              You usually overestimate:
            </div>
            {overestimated.map((t) => (
              <div key={t.id} className="analytics-task-item">
                <span className="analytics-task-text">{t.text}</span>
                <span className="analytics-task-badge" style={{ color: 'var(--moss)' }}>
                  Est: {fmtMins(t.estimate_mins)} → Actual: {fmtMins(t.actual_mins || 0)}
                </span>
              </div>
            ))}
          </div>
        )}

        {underestimated.length > 0 && (
          <div style={{ marginTop: 'var(--space-3)' }}>
            <div style={{ fontSize: 12, color: 'var(--ink-soft)', fontWeight: 600, marginBottom: 'var(--space-2)' }}>
              You usually underestimate:
            </div>
            {underestimated.map((t) => (
              <div key={t.id} className="analytics-task-item">
                <span className="analytics-task-text">{t.text}</span>
                <span className="analytics-task-badge" style={{ color: 'var(--hazard)' }}>
                  Est: {fmtMins(t.estimate_mins)} → Actual: {fmtMins(t.actual_mins || 0)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Time Distribution */}
      <div className="settings-panel">
        <div className="settings-panel-title">Time Distribution</div>
        <div className="analytics-grid">
          <div className="analytics-card">
            <div className="analytics-label">Planned Tasks</div>
            <div className="analytics-number">{fmtHours(plannedMins)}</div>
            <div className="analytics-sublabel">{plannedTasks.length} tasks</div>
          </div>
          <div className="analytics-card">
            <div className="analytics-label">Came Up</div>
            <div className="analytics-number">{fmtHours(cameUpMins)}</div>
            <div className="analytics-sublabel">{cameUpTasks.length} tasks</div>
          </div>
          <div className="analytics-card">
            <div className="analytics-label">Ratio</div>
            <div className="analytics-number">
              {totalActualMins > 0 ? ((plannedMins / totalActualMins) * 100).toFixed(0) : '0'}%
            </div>
            <div className="analytics-sublabel">planned</div>
          </div>
        </div>
      </div>

      {/* Day of Week Analysis */}
      <div className="settings-panel">
        <div className="settings-panel-title">Weekly Patterns</div>
        {mostProductiveDay ? (
          <div style={{ marginBottom: 'var(--space-4)' }}>
            <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginBottom: 'var(--space-2)' }}>
              Most productive day:
            </div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>
              {dayNames[mostProductiveDay[0]]} ({mostProductiveDay[1].count} tasks, {fmtHours(mostProductiveDay[1].mins)})
            </div>
          </div>
        ) : null}

        <div className="day-activity-grid">
          {dayNames.map((day, idx) => {
            const stats = dayStats[idx];
            const isHighest = mostProductiveDay?.[0] === idx;
            return (
              <div key={idx} className={`day-activity-card ${isHighest ? 'highest' : ''}`}>
                <div className="day-name">{day}</div>
                <div className="day-count">{stats?.count || 0}</div>
                <div className="day-time">{stats ? fmtHours(stats.mins) : '0h'}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Streaks & Consistency */}
      <div className="settings-panel">
        <div className="settings-panel-title">Streaks & Consistency</div>
        <div className="analytics-grid">
          <div className="analytics-card">
            <div className="analytics-label">Current Streak</div>
            <div className="analytics-number">{streak}</div>
            <div className="analytics-sublabel">days with work</div>
          </div>
          <div className="analytics-card">
            <div className="analytics-label">This Week</div>
            <div className="analytics-number">{daysWorkedThisWeek}</div>
            <div className="analytics-sublabel">days worked</div>
          </div>
          <div className="analytics-card">
            <div className="analytics-label">Consistency</div>
            <div className="analytics-number">{((daysWorkedThisWeek / 7) * 100).toFixed(0)}%</div>
            <div className="analytics-sublabel">this week</div>
          </div>
        </div>
      </div>

      {/* Recent Completed Tasks */}
      {currentTasks.length > 0 && (
        <div className="settings-panel">
          <div className="settings-panel-title">Recent Completions</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            {currentTasks.slice(0, 5).map((task) => (
              <div key={task.id} className="analytics-task-row">
                <div className="analytics-task-info">
                  <div className="analytics-task-name">{task.text}</div>
                  <div className="analytics-task-time mono">
                    Est: {fmtMins(task.estimate_mins)} → Actual: {fmtMins(task.actual_mins || 0)}
                  </div>
                </div>
                <div className={`analytics-task-source ${task.source}`}>
                  {task.source === 'planned' ? 'Planned' : 'Came Up'}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

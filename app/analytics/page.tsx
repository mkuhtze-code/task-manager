'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import AppHeader from '@/components/AppHeader';
import GearMenu from '@/components/GearMenu';
import TopSwitcher from '@/components/TopSwitcher';
import { BackIcon } from '@/components/icons';
import { buildClusters, type HistoricalTask } from '@/lib/taskIntelligence';

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

type LearnedPattern = {
  label: string;
  count: number;
  avgMins: number;
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

function buildDailySeries(
  tasks: CompletedTask[],
  start: Date,
  end: Date,
  labelMode: 'weekday' | 'sparse'
): { label: string; mins: number }[] {
  const totalsByDate: Record<string, number> = {};
  tasks.forEach((t) => {
    const key = new Date(t.completed_at).toDateString();
    totalsByDate[key] = (totalsByDate[key] || 0) + (t.actual_mins || 0);
  });

  const days: { label: string; mins: number }[] = [];
  const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const endDay = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  let i = 0;
  while (cursor <= endDay) {
    const key = cursor.toDateString();
    let label = '';
    if (labelMode === 'weekday') {
      label = cursor.toLocaleDateString(undefined, { weekday: 'narrow' });
    } else if (i % 5 === 0) {
      label = String(cursor.getDate());
    }
    days.push({ label, mins: totalsByDate[key] || 0 });
    cursor.setDate(cursor.getDate() + 1);
    i++;
  }
  return days;
}

function DailyBarChart({ series }: { series: { label: string; mins: number }[] }) {
  const max = Math.max(...series.map((d) => d.mins), 1);
  return (
    <div className="daily-chart">
      {series.map((d, i) => (
        <div key={i} className="daily-chart-col">
          <div className="daily-chart-bar-track">
            <div
              className="daily-chart-bar"
              style={{ height: d.mins > 0 ? `${Math.max((d.mins / max) * 100, 6)}%` : '0%' }}
            />
          </div>
          <div className="daily-chart-label">{d.label}</div>
        </div>
      ))}
    </div>
  );
}

function AccuracyGauge({ ratioPercent }: { ratioPercent: number }) {
  const clamped = Math.min(Math.max(ratioPercent, 0), 200);
  const pos = (clamped / 200) * 100;
  let tone: 'under' | 'close' | 'over' = 'close';
  if (ratioPercent < 85) tone = 'under';
  else if (ratioPercent > 115) tone = 'over';

  let message = 'Your estimates are usually spot on.';
  if (tone === 'under') message = `You tend to finish about ${Math.round(100 - ratioPercent)}% faster than planned.`;
  if (tone === 'over') message = `Things tend to take about ${Math.round(ratioPercent - 100)}% longer than planned.`;

  return (
    <div className="accuracy-gauge-wrap">
      <div className="accuracy-gauge-track">
        <div className="accuracy-gauge-mid" />
        <div className={`accuracy-gauge-marker tone-${tone}`} style={{ left: `${pos}%` }} />
      </div>
      <div className="accuracy-gauge-scale-labels">
        <span>Faster</span>
        <span>On estimate</span>
        <span>Slower</span>
      </div>
      <p className="accuracy-gauge-message">{message}</p>
    </div>
  );
}

function confidenceTag(count: number): string {
  if (count >= 5) return 'Well known';
  if (count >= 3) return 'Fairly confident';
  return 'Just noticed';
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

  const now = new Date();
  const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const currentData = analytics[`${timePeriod}Tasks` as keyof AnalyticsData];

  const totalCompleted = currentData.length;
  const totalActualMins = currentData.reduce((sum, t) => sum + (t.actual_mins || 0), 0);
  const totalEstimateMins = currentData.reduce((sum, t) => sum + t.estimate_mins, 0);
  const avgEstimate = totalCompleted > 0 ? totalEstimateMins / totalCompleted : 0;
  const avgActual = totalCompleted > 0 ? totalActualMins / totalCompleted : 0;
  const accuracyRatioPercent = avgEstimate > 0 ? (avgActual / avgEstimate) * 100 : 100;

  const taskDeltas = currentData.map((t) => ({
    ...t,
    ratio: (t.actual_mins || 0) / Math.max(t.estimate_mins, 1),
  }));
  const ranShorter = taskDeltas.filter((t) => t.ratio < 0.8).sort((a, b) => a.ratio - b.ratio).slice(0, 2);
  const ranLonger = taskDeltas.filter((t) => t.ratio > 1.2).sort((a, b) => b.ratio - a.ratio).slice(0, 2);

  // "What Dokkit has learned" now runs on the same fuzzy clustering that
  // powers the capture-time suggestion chip on the home page, instead of
  // its old exact lowercase-text match. This is deliberate: the two should
  // never quietly disagree about what counts as "the same task".
  const historyForClustering: HistoricalTask[] = analytics.allTasks.map((t) => ({
    text: t.text,
    actual_mins: t.actual_mins || 0,
  }));
  const learnedPatterns: LearnedPattern[] = buildClusters(historyForClustering)
    .filter((c) => c.count >= 2)
    .sort((a, b) => b.count - a.count)
    .slice(0, 6)
    .map((c) => ({ label: c.label, count: c.count, avgMins: c.avgMins }));

  const dailySeries =
    timePeriod === 'week'
      ? buildDailySeries(analytics.weekTasks, weekStart, now, 'weekday')
      : timePeriod === 'month'
      ? buildDailySeries(analytics.monthTasks, monthStart, now, 'sparse')
      : null;

  return (
    <div className="app-shell">
      <div className="app-header">
        <div className="app-header-left">
          <button className="back-link" onClick={() => router.push('/')} aria-label="Back"><BackIcon /></button>
          <h1 className="app-title">Patterns</h1>
        </div>
        <div className="app-header-right">
          <TopSwitcher active="patterns" />
          <GearMenu />
        </div>
      </div>

      <p className="settings-help" style={{ marginTop: 'var(--space-4)' }}>
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
          {/* Overview */}
          <div className="settings-panel">
            <div className="settings-panel-title">Time spent</div>
            <div className="hero-stat-row">
              <div className="hero-stat-number mono">{fmtHours(totalActualMins)}</div>
              <div className="hero-stat-sub">
                across {totalCompleted} task{totalCompleted === 1 ? '' : 's'} · ~{fmtMins(avgActual)} each
              </div>
            </div>
            {dailySeries && <DailyBarChart series={dailySeries} />}
          </div>

          {/* Estimate sense */}
          <div className="settings-panel">
            <div className="settings-panel-title">Estimate sense</div>
            <AccuracyGauge ratioPercent={accuracyRatioPercent} />

            {(ranShorter.length > 0 || ranLonger.length > 0) && (
              <div className="notable-tasks-block">
                {ranShorter.map((t) => (
                  <div key={t.id} className="analytics-task-item">
                    <span className="analytics-task-text">{t.text}</span>
                    <span className="analytics-task-badge" style={{ color: 'var(--steel-dark)' }}>
                      {fmtMins(t.estimate_mins)} → {fmtMins(t.actual_mins || 0)}
                    </span>
                  </div>
                ))}
                {ranLonger.map((t) => (
                  <div key={t.id} className="analytics-task-item">
                    <span className="analytics-task-text">{t.text}</span>
                    <span className="analytics-task-badge" style={{ color: 'var(--hazard)' }}>
                      {fmtMins(t.estimate_mins)} → {fmtMins(t.actual_mins || 0)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* What Dokkit has learned */}
          {learnedPatterns.length > 0 && (
            <div className="settings-panel">
              <div className="settings-panel-title">What Dokkit has learned</div>
              <p style={{ color: 'var(--ink-soft)', fontSize: 12, lineHeight: 1.5, margin: '-4px 0 4px' }}>
                Tasks you've typed more than once, and what they've actually taken. This is what feeds the
                estimate suggestion when you add something similar.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                {learnedPatterns.map((p) => (
                  <div key={p.label} className="analytics-task-row">
                    <div className="analytics-task-info">
                      <div className="analytics-task-name">{p.label}</div>
                      <div className="analytics-task-time mono">usually ~{fmtMins(p.avgMins)}</div>
                    </div>
                    <div className="confidence-tag">{confidenceTag(p.count)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

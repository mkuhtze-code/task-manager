'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import AppHeader from '@/components/AppHeader';
import GearMenu from '@/components/GearMenu';
import { BackIcon } from '@/components/icons';
import { buildClusters, type HistoricalTask, type TaskCluster } from '@/lib/taskIntelligence';
import { observePlanning, observeLifecycle } from '@/lib/thinking';
import type { CompletedTaskFacts, PlanningObservation, LifecycleObservation } from '@/lib/thinking/types';

function fmtMins(mins: number): string {
  mins = Math.round(mins);
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function clusterToFacts(c: TaskCluster, history: HistoricalTask[]): CompletedTaskFacts[] {
  const matched = history.filter((h) => {
    const hTokens = h.text.toLowerCase().split(/\s+/);
    const cTokens = Array.from(c.tokens);
    return hTokens.some((t) => cTokens.includes(t));
  });
  if (matched.length === 0) return [];
  return matched.map((h) => ({
    text: h.text,
    status: 'done' as const,
    source: 'planned' as const,
    estimate_mins: h.actual_mins,
    actual_mins: h.actual_mins,
    logged_mins: h.actual_mins,
    created_at: h.created_at || '',
    completed_at: null,
    started_at: null,
    surface_date: null,
    location_text: h.location_text ?? null,
    lat: h.lat ?? null,
    lng: h.lng ?? null,
    job_id: h.job_id ?? null,
    info: null,
    subtaskCount: 0,
    subtaskDoneCount: 0,
    subtaskTotalMins: 0,
  }));
}

type Pattern = {
  text: string;
  detail?: string[];
};

function durationPatterns(clusters: TaskCluster[]): Pattern[] {
  return clusters
    .filter((c) => c.count >= 3 && c.avgMins >= 5)
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)
    .map((c) => ({
      text: `${c.label} usually takes about ${fmtMins(c.avgMins)}.`,
      detail: [
        `${c.count} completed`,
        `most recently ~${fmtMins(c.avgMins)}`,
      ],
    }));
}

function rhythmPatterns(
  planning: PlanningObservation | null,
  lifecycle: LifecycleObservation | null,
  totalTasks: number
): Pattern[] {
  const patterns: Pattern[] = [];
  if (!planning || totalTasks < 5) return patterns;

  if (lifecycle && lifecycle.sameDayRate >= 0.65) {
    patterns.push({
      text: 'Most tasks clear the same day.',
      detail: [`${Math.round(lifecycle.sameDayRate * 100)}% of completed tasks`],
    });
  }

  if (lifecycle && lifecycle.carryoverRate >= 0.35) {
    patterns.push({
      text: 'Some kinds of work regularly carry over.',
      detail: [`${Math.round(lifecycle.carryoverRate * 100)}% of tasks took more than a day`],
    });
  }

  if (planning.estimatedRate > 0.7) {
    patterns.push({
      text: 'You usually set estimates.',
      detail: [`${Math.round(planning.estimatedRate * 100)}% of tasks are estimated`],
    });
  }

  return patterns;
}

function contextPatterns(
  history: HistoricalTask[],
  clusters: TaskCluster[]
): Pattern[] {
  const patterns: Pattern[] = [];

  const withLocation = history.filter((h) => h.location_text);
  const locationRate = history.length > 0 ? withLocation.length / history.length : 0;
  if (locationRate > 0.3 && withLocation.length >= 5) {
    const topLocations = new Map<string, number>();
    for (const h of withLocation) {
      const key = h.location_text!.toLowerCase().trim();
      topLocations.set(key, (topLocations.get(key) || 0) + 1);
    }
    const sorted = Array.from(topLocations.entries()).sort((a, b) => b[1] - a[1]);
    if (sorted.length > 0 && sorted[0][1] >= 3) {
      patterns.push({
        text: 'You tend to work from specific locations.',
        detail: [`${sorted.length} different places remembered`],
      });
    }
  }

  const withJob = history.filter((h) => h.job_id);
  const jobRate = history.length > 0 ? withJob.length / history.length : 0;
  if (jobRate > 0.4 && withJob.length >= 5) {
    patterns.push({
      text: 'You usually attach tasks to jobs.',
      detail: [`${Math.round(jobRate * 100)}% of tasks are linked to a job`],
    });
  }

  return patterns;
}

export default function Patterns() {
  const router = useRouter();
  const [session, setSession] = useState<any>(null);
  const [clusters, setClusters] = useState<TaskCluster[]>([]);
  const [history, setHistory] = useState<HistoricalTask[]>([]);
  const [planning, setPlanning] = useState<PlanningObservation | null>(null);
  const [lifecycle, setLifecycle] = useState<LifecycleObservation | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
  }, []);

  useEffect(() => {
    if (session) loadData();
  }, [session]);

  async function loadData() {
    setLoading(true);
    const userId = session.user.id;

    const { data: allData } = await supabase
      .from('tasks')
      .select('text, actual_mins, location_text, lat, lng, job_id, created_at')
      .eq('user_id', userId)
      .eq('status', 'done')
      .not('actual_mins', 'is', null)
      .order('completed_at', { ascending: false })
      .limit(500);

    const hist: HistoricalTask[] = (allData || []).map((r: any) => ({
      text: r.text,
      actual_mins: r.actual_mins,
      location_text: r.location_text,
      lat: r.lat,
      lng: r.lng,
      job_id: r.job_id,
      created_at: r.created_at,
    }));

    setHistory(hist);
    const c = buildClusters(hist);
    setClusters(c);

    const allFacts: CompletedTaskFacts[] = hist.map((h) => ({
      text: h.text,
      status: 'done' as const,
      source: 'planned' as const,
      estimate_mins: h.actual_mins,
      actual_mins: h.actual_mins,
      logged_mins: h.actual_mins,
      created_at: h.created_at || '',
      completed_at: null,
      started_at: null,
      surface_date: null,
      location_text: h.location_text ?? null,
      lat: h.lat ?? null,
      lng: h.lng ?? null,
      job_id: h.job_id ?? null,
      info: null,
      subtaskCount: 0,
      subtaskDoneCount: 0,
      subtaskTotalMins: 0,
    }));

    if (allFacts.length >= 3) {
      setPlanning(observePlanning(allFacts));
      setLifecycle(observeLifecycle(allFacts));
    }

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

  const dPatterns = durationPatterns(clusters);
  const rPatterns = rhythmPatterns(planning, lifecycle, history.length);
  const cPatterns = contextPatterns(history, clusters);

  const hasAny = dPatterns.length > 0 || rPatterns.length > 0 || cPatterns.length > 0;

  function toggleExpand(idx: number) {
    setExpanded((prev) => ({ ...prev, [idx]: !prev[idx] }));
  }

  return (
    <div className="app-shell">
      <div className="app-header">
        <div className="app-header-left">
          <button className="back-link" onClick={() => router.push('/')} aria-label="Back"><BackIcon /></button>
          <h1 className="app-title">Patterns</h1>
        </div>
        <div className="app-header-right">
          <GearMenu />
        </div>
      </div>

      {loading ? (
        <div className="empty-state">Loading…</div>
      ) : !hasAny ? (
        <div className="patterns-empty">
          <p>Dokkit is getting to know how you work.</p>
          <p>As you use it, things you do regularly will begin to appear here.</p>
        </div>
      ) : (
        <div className="patterns-content">
          {dPatterns.length > 0 && (
            <div className="patterns-section">
              <div className="patterns-section-title">How you work</div>
              {dPatterns.map((p, i) => (
                <div key={i} className="pattern-row">
                  <button className="pattern-text" onClick={() => p.detail && toggleExpand(i)}>
                    {p.text}
                  </button>
                  {p.detail && expanded[i] && (
                    <div className="pattern-detail">
                      {p.detail.map((d, j) => (
                        <span key={j} className="pattern-detail-item">{d}</span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {rPatterns.length > 0 && (
            <div className="patterns-section">
              <div className="patterns-section-title">Your rhythm</div>
              {rPatterns.map((p, i) => {
                const idx = dPatterns.length + i;
                return (
                  <div key={idx} className="pattern-row">
                    <button className="pattern-text" onClick={() => p.detail && toggleExpand(idx)}>
                      {p.text}
                    </button>
                    {p.detail && expanded[idx] && (
                      <div className="pattern-detail">
                        {p.detail.map((d, j) => (
                          <span key={j} className="pattern-detail-item">{d}</span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {cPatterns.length > 0 && (
            <div className="patterns-section">
              <div className="patterns-section-title">What Dokkit has noticed</div>
              {cPatterns.map((p, i) => {
                const idx = dPatterns.length + rPatterns.length + i;
                return (
                  <div key={idx} className="pattern-row">
                    <button className="pattern-text" onClick={() => p.detail && toggleExpand(idx)}>
                      {p.text}
                    </button>
                    {p.detail && expanded[idx] && (
                      <div className="pattern-detail">
                        {p.detail.map((d, j) => (
                          <span key={j} className="pattern-detail-item">{d}</span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

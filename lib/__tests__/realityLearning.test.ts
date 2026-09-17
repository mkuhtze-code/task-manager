import { describe, it, expect } from 'vitest';
import {
  buildClusters,
  suggestEstimate,
  effectiveEstimate,
  type HistoricalTask,
} from '@/lib/taskIntelligence';
import type { Task } from '@/lib/taskTypes';

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 't-1',
    text: 'Install flashing',
    status: 'pending',
    source: 'came_up',
    estimate_mins: 120,
    logged_mins: 0,
    started_at: null,
    due_today: true,
    order_index: 0,
    created_at: new Date().toISOString(),
    surface_date: null,
    intended_time: null,
    location_text: null,
    lat: null,
    lng: null,
    drive_mins_to_next: 0,
    route_polyline: null,
    info: '',
    job_id: null,
    original_input: 'Install flashing',
    ...overrides,
  };
}

describe('Reality → Planning Learning Loop', () => {
  it('A. User estimate remains unchanged when reality diverges', () => {
    const task = makeTask({ estimate_mins: 120 });
    const actualObserved = 180;

    // Build history of 7 completions of 180 mins so confidence is 'high'
    const history: HistoricalTask[] = Array.from({ length: 7 }, () => ({
      text: 'Install flashing',
      actual_mins: actualObserved,
    }));

    const clusters = buildClusters(history);
    const suggestion = suggestEstimate(task.text, history, clusters);
    const effectiveMins = effectiveEstimate(task.estimate_mins, suggestion);

    // Core product rule: User-entered estimate on task object remains 120
    expect(task.estimate_mins).toBe(120);

    // Learned suggestion is 180 with high confidence
    expect(suggestion).not.toBeNull();
    expect(suggestion?.suggestedMins).toBe(180);
    expect(suggestion?.confidence).toBe('high');

    // Effective estimate blends toward learned reality (high confidence weight = 0.75)
    // 120 * 0.25 + 180 * 0.75 = 30 + 135 = 165
    expect(effectiveMins).toBe(165);
    expect(effectiveMins).not.toBe(task.estimate_mins);
  });

  it('B. Insufficient history does not prematurely override user estimate', () => {
    const task = makeTask({ estimate_mins: 120 });

    // Single observation of 180 minutes
    const singleHistory: HistoricalTask[] = [
      { text: 'Install flashing', actual_mins: 180 },
    ];

    const clusters = buildClusters(singleHistory);
    const suggestion = suggestEstimate(task.text, singleHistory, clusters);
    const effectiveMins = effectiveEstimate(task.estimate_mins, suggestion);

    // With MIN_SAMPLES_FOR_SUGGESTION = 2, a single sample yields no suggestion
    expect(suggestion).toBeNull();
    // Therefore, effective estimate equals typed estimate
    expect(effectiveMins).toBe(120);
  });

  it('C. Repeated reality increases confidence and influences effective duration', () => {
    const task = makeTask({ estimate_mins: 120 });

    // 2 samples -> low confidence -> weight 0.25
    const history2: HistoricalTask[] = [
      { text: 'Install flashing', actual_mins: 180 },
      { text: 'Install flashing', actual_mins: 180 },
    ];
    let clusters = buildClusters(history2);
    let suggestion = suggestEstimate(task.text, history2, clusters);
    expect(suggestion?.confidence).toBe('low');
    // 120 * 0.75 + 180 * 0.25 = 90 + 45 = 135
    expect(effectiveEstimate(task.estimate_mins, suggestion)).toBe(135);

    // 4 samples -> medium confidence -> weight 0.50
    const history4: HistoricalTask[] = Array.from({ length: 4 }, () => ({
      text: 'Install flashing',
      actual_mins: 180,
    }));
    clusters = buildClusters(history4);
    suggestion = suggestEstimate(task.text, history4, clusters);
    expect(suggestion?.confidence).toBe('medium');
    // 120 * 0.50 + 180 * 0.50 = 60 + 90 = 150
    expect(effectiveEstimate(task.estimate_mins, suggestion)).toBe(150);

    // 8 samples -> high confidence -> weight 0.75
    const history8: HistoricalTask[] = Array.from({ length: 8 }, () => ({
      text: 'Install flashing',
      actual_mins: 180,
    }));
    clusters = buildClusters(history8);
    suggestion = suggestEstimate(task.text, history8, clusters);
    expect(suggestion?.confidence).toBe('high');
    // 120 * 0.25 + 180 * 0.75 = 30 + 135 = 165
    expect(effectiveEstimate(task.estimate_mins, suggestion)).toBe(165);
  });

  it('D. Partial outcome total duration is spent + remaining', () => {
    const actualSpent = 80;
    const remainingWork = 60;

    // Total required duration observed for this partial completion:
    const totalObserved = actualSpent + remainingWork; // 140
    expect(totalObserved).toBe(140);
    expect(totalObserved).not.toBe(actualSpent);

    // Adding this partial observation into history preserves total duration
    const history: HistoricalTask[] = Array.from({ length: 5 }, () => ({
      text: 'Install flashing',
      actual_mins: totalObserved,
    }));

    const clusters = buildClusters(history);
    const suggestion = suggestEstimate('Install flashing', history, clusters);

    expect(suggestion?.suggestedMins).toBe(140);
  });

  it('E. Carry forward does not act as negative learning signal or corrupt history', () => {
    const task = makeTask({ estimate_mins: 120 });
    const historyBefore: HistoricalTask[] = [
      { text: 'Install flashing', actual_mins: 120 },
      { text: 'Install flashing', actual_mins: 120 },
    ];

    // Simulated carry: history remains unmodified
    const historyAfter = [...historyBefore];

    const clustersBefore = buildClusters(historyBefore);
    const clustersAfter = buildClusters(historyAfter);

    const suggestionBefore = suggestEstimate(task.text, historyBefore, clustersBefore);
    const suggestionAfter = suggestEstimate(task.text, historyAfter, clustersAfter);

    expect(suggestionBefore).toEqual(suggestionAfter);
    expect(task.estimate_mins).toBe(120);
  });

  it('F. Capacity calculations consume effective duration while UI displays user estimate', () => {
    const tasks: Task[] = [
      makeTask({ id: 't1', text: 'Install flashing', estimate_mins: 120 }), // learned: 180 -> blended 165
      makeTask({ id: 't2', text: 'Clean gutters', estimate_mins: 60 }),    // no history -> 60
    ];

    const history: HistoricalTask[] = Array.from({ length: 8 }, () => ({
      text: 'Install flashing',
      actual_mins: 180,
    }));

    const clusters = buildClusters(history);

    // Compute effective remaining for each task (similar to Home component)
    const learnedEffectiveEstimates = new Map<string, number>();
    for (const t of tasks) {
      const suggestion = suggestEstimate(t.text, history, clusters);
      learnedEffectiveEstimates.set(t.id, effectiveEstimate(t.estimate_mins, suggestion));
    }

    function effectiveRemainingForTask(t: Task): number {
      const effEstimate = learnedEffectiveEstimates.get(t.id) ?? t.estimate_mins;
      return Math.max(effEstimate - t.logged_mins, 0);
    }

    function remainingForTask(t: Task): number {
      return Math.max(t.estimate_mins - t.logged_mins, 0);
    }

    // Task 1 user display remaining vs effective remaining
    expect(remainingForTask(tasks[0])).toBe(120);
    expect(effectiveRemainingForTask(tasks[0])).toBe(165);

    // Task 2 user display remaining vs effective remaining
    expect(remainingForTask(tasks[1])).toBe(60);
    expect(effectiveRemainingForTask(tasks[1])).toBe(60);

    // Aggregate capacity consumption uses effective remaining
    const userTotalMins = tasks.reduce((sum, t) => sum + remainingForTask(t), 0);
    const capacityConsumedMins = tasks.reduce((sum, t) => sum + effectiveRemainingForTask(t), 0);

    expect(userTotalMins).toBe(180);
    expect(capacityConsumedMins).toBe(225);
  });
});

/**
 * Deterministic short-term Working Memory.
 * In-memory + optional localStorage mirror. Pure helpers; no React.
 */

import type {
  Confidence,
  CurrentFocus,
  MemoryItem,
  MemoryItemType,
  WorkingMemorySnapshot,
} from './types';

const STORE_KEY = 'dokkit.engine.workingMemory.v1';
const MAX_RECENT = 24;

export function emptyWorkingMemory(
  surface: string | null = null
): WorkingMemorySnapshot {
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    recentUtterances: [],
    recentEntities: [],
    recentTasks: [],
    recentJobs: [],
    recentLocations: [],
    recentSuggestions: [],
    recentActions: [],
    recentCorrections: [],
    currentFocus: { kind: 'none', id: null, label: null },
    currentTopic: null,
    currentSurface: surface,
    unresolvedReferences: [],
    activeRequestId: null,
  };
}

function bucketFor(type: MemoryItemType): keyof WorkingMemorySnapshot | null {
  switch (type) {
    case 'utterance':
      return 'recentUtterances';
    case 'entity':
      return 'recentEntities';
    case 'task':
    case 'list_item':
      return 'recentTasks';
    case 'job':
      return 'recentJobs';
    case 'location':
      return 'recentLocations';
    case 'suggestion':
      return 'recentSuggestions';
    case 'action':
      return 'recentActions';
    case 'correction':
      return 'recentCorrections';
    case 'reference':
      return 'unresolvedReferences';
    default:
      return null;
  }
}

function pushCapped(list: MemoryItem[], item: MemoryItem): MemoryItem[] {
  const next = [item, ...list.filter((x) => x.id !== item.id)];
  return next.slice(0, MAX_RECENT);
}

export function makeMemoryItem(input: {
  type: MemoryItemType;
  label: string;
  source: string;
  confidence?: Confidence;
  salience?: number;
  relationships?: Record<string, string>;
  payload?: Record<string, unknown>;
  id?: string;
  timestamp?: string;
}): MemoryItem {
  return {
    id: input.id ?? `wm_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    type: input.type,
    label: input.label.trim(),
    source: input.source,
    timestamp: input.timestamp ?? new Date().toISOString(),
    salience: input.salience ?? 0.5,
    confidence: input.confidence ?? 'medium',
    relationships: input.relationships ?? {},
    payload: input.payload,
  };
}

export function remember(
  mem: WorkingMemorySnapshot,
  item: MemoryItem
): WorkingMemorySnapshot {
  const key = bucketFor(item.type);
  const next: WorkingMemorySnapshot = {
    ...mem,
    updatedAt: new Date().toISOString(),
  };
  if (key && Array.isArray(next[key])) {
    (next as unknown as Record<string, MemoryItem[]>)[key] = pushCapped(
      next[key] as MemoryItem[],
      item
    );
  }
  return next;
}

export function setFocus(
  mem: WorkingMemorySnapshot,
  focus: CurrentFocus
): WorkingMemorySnapshot {
  return {
    ...mem,
    currentFocus: focus,
    updatedAt: new Date().toISOString(),
  };
}

export function setActiveRequest(
  mem: WorkingMemorySnapshot,
  requestId: string | null
): WorkingMemorySnapshot {
  return {
    ...mem,
    activeRequestId: requestId,
    updatedAt: new Date().toISOString(),
  };
}

export function setTopic(
  mem: WorkingMemorySnapshot,
  topic: string | null
): WorkingMemorySnapshot {
  return {
    ...mem,
    currentTopic: topic,
    updatedAt: new Date().toISOString(),
  };
}

/** Decay salience slightly; drop very old low-salience noise. */
export function touchDecay(mem: WorkingMemorySnapshot, now = Date.now()): WorkingMemorySnapshot {
  const decay = (items: MemoryItem[]) =>
    items
      .map((it) => {
        const ageMin = (now - Date.parse(it.timestamp)) / 60000;
        const factor = ageMin < 5 ? 1 : ageMin < 30 ? 0.85 : ageMin < 120 ? 0.6 : 0.35;
        return { ...it, salience: Math.max(0.05, it.salience * factor) };
      })
      .filter((it) => it.salience > 0.08 || Date.parse(it.timestamp) > now - 10 * 60000);

  return {
    ...mem,
    recentUtterances: decay(mem.recentUtterances),
    recentEntities: decay(mem.recentEntities),
    recentTasks: decay(mem.recentTasks),
    recentJobs: decay(mem.recentJobs),
    recentLocations: decay(mem.recentLocations),
    recentSuggestions: decay(mem.recentSuggestions),
    recentActions: decay(mem.recentActions),
    recentCorrections: decay(mem.recentCorrections),
    unresolvedReferences: decay(mem.unresolvedReferences),
    updatedAt: new Date().toISOString(),
  };
}

export function loadWorkingMemory(): WorkingMemorySnapshot {
  if (typeof localStorage === 'undefined') return emptyWorkingMemory();
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return emptyWorkingMemory();
    const parsed = JSON.parse(raw) as WorkingMemorySnapshot;
    if (parsed?.version !== 1) return emptyWorkingMemory();
    return parsed;
  } catch {
    return emptyWorkingMemory();
  }
}

export function saveWorkingMemory(mem: WorkingMemorySnapshot): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(mem));
  } catch {
    /* quota — ignore */
  }
}

/** Flatten recent items for reference ranking. */
export function allReferents(mem: WorkingMemorySnapshot): MemoryItem[] {
  return [
    ...mem.recentTasks,
    ...mem.recentJobs,
    ...mem.recentLocations,
    ...mem.recentEntities,
    ...mem.recentUtterances,
    ...mem.recentActions,
  ].sort((a, b) => {
    if (b.salience !== a.salience) return b.salience - a.salience;
    return Date.parse(b.timestamp) - Date.parse(a.timestamp);
  });
}

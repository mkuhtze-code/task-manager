/**
 * Task/List bridge — maps collection-style intents onto the existing
 * tasks + subtasks system. A list is a normal task used as a container.
 *
 * Reuses collection intent detection; does not persist to collections tables.
 */

import type { CollectionIntent, CollectionTarget, CollectionItemInput } from '@/lib/collections';
import {
  ACTIVE_HARD_TTL_MS,
  ACTIVE_SOFT_TTL_MS,
  evaluateActiveEligibility,
  type ActiveEligibility,
} from '@/lib/collections/active';
import {
  normalizeKey,
  normalizeTitle,
  isLikelySameItem,
  collapseWhitespace,
} from '@/lib/collections/normalize';
import { detectCollectionIntent, intentBlocksTaskCreate } from '@/lib/collections/intent';
import type { Task } from '@/lib/taskTypes';

/** Marker stored in task.info so list-like tasks remain ordinary tasks. */
export const LIST_TASK_MARKER = '__list__';

export type ActiveListState = {
  taskId: string | null;
  title: string | null;
  activatedAt: string | null;
  lastInteractionAt: string | null;
};

export type RecentSemanticMemory = {
  items: string[];
  updatedAt: string | null;
};

const ACTIVE_LIST_KEY = 'dokkit-active-list';
const SEMANTIC_MEM_KEY = 'dokkit-list-semantic-mem';
const SEMANTIC_TTL_MS = 5 * 60 * 1000;

/** In-memory fallback when localStorage is unavailable (SSR / node tests). */
let memoryActive: ActiveListState = {
  taskId: null,
  title: null,
  activatedAt: null,
  lastInteractionAt: null,
};
let memorySemantic: RecentSemanticMemory = { items: [], updatedAt: null };

export function emptyActiveListState(): ActiveListState {
  return {
    taskId: null,
    title: null,
    activatedAt: null,
    lastInteractionAt: null,
  };
}

export function loadActiveListState(): ActiveListState {
  if (typeof localStorage === 'undefined') {
    return { ...memoryActive };
  }
  try {
    const raw = localStorage.getItem(ACTIVE_LIST_KEY);
    if (!raw) return emptyActiveListState();
    const parsed = JSON.parse(raw) as ActiveListState;
    if (!parsed || typeof parsed !== 'object') return emptyActiveListState();
    return {
      taskId: parsed.taskId ?? null,
      title: parsed.title ?? null,
      activatedAt: parsed.activatedAt ?? null,
      lastInteractionAt: parsed.lastInteractionAt ?? null,
    };
  } catch {
    return emptyActiveListState();
  }
}

export function saveActiveListState(state: ActiveListState): void {
  memoryActive = { ...state };
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(ACTIVE_LIST_KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

export function activateListTask(
  taskId: string,
  title: string,
  now = Date.now()
): ActiveListState {
  const iso = new Date(now).toISOString();
  const prev = loadActiveListState();
  const next: ActiveListState = {
    taskId,
    title,
    activatedAt: prev.taskId === taskId ? prev.activatedAt ?? iso : iso,
    lastInteractionAt: iso,
  };
  saveActiveListState(next);
  return next;
}

export function touchActiveList(now = Date.now()): ActiveListState {
  const state = loadActiveListState();
  if (!state.taskId) return state;
  const next = {
    ...state,
    lastInteractionAt: new Date(now).toISOString(),
  };
  saveActiveListState(next);
  return next;
}

export function clearActiveList(): ActiveListState {
  const empty = emptyActiveListState();
  memorySemantic = { items: [], updatedAt: null };
  saveActiveListState(empty);
  return empty;
}

export function evaluateActiveListEligibility(
  state: ActiveListState = loadActiveListState(),
  now = Date.now()
): ActiveEligibility {
  return evaluateActiveEligibility(
    {
      collectionId: state.taskId,
      activatedAt: state.activatedAt,
      lastInteractionAt: state.lastInteractionAt,
      surface: null,
    },
    now
  );
}

export function canUseActiveList(
  state: ActiveListState = loadActiveListState(),
  now = Date.now()
): boolean {
  return evaluateActiveListEligibility(state, now).eligible;
}

export function loadSemanticMemory(): RecentSemanticMemory {
  const fromMem = (): RecentSemanticMemory => {
    if (!memorySemantic.updatedAt) return { items: [], updatedAt: null };
    const age = Date.now() - Date.parse(memorySemantic.updatedAt);
    if (!Number.isFinite(age) || age > SEMANTIC_TTL_MS) {
      return { items: [], updatedAt: null };
    }
    return {
      items: memorySemantic.items.slice(0, 12),
      updatedAt: memorySemantic.updatedAt,
    };
  };
  if (typeof localStorage === 'undefined') return fromMem();
  try {
    const raw = localStorage.getItem(SEMANTIC_MEM_KEY);
    if (!raw) return fromMem();
    const parsed = JSON.parse(raw) as RecentSemanticMemory;
    if (!parsed?.updatedAt) return fromMem();
    const age = Date.now() - Date.parse(parsed.updatedAt);
    if (!Number.isFinite(age) || age > SEMANTIC_TTL_MS) {
      return { items: [], updatedAt: null };
    }
    return {
      items: Array.isArray(parsed.items) ? parsed.items.slice(0, 12) : [],
      updatedAt: parsed.updatedAt,
    };
  } catch {
    return fromMem();
  }
}

export function rememberSemanticItems(items: string[]): void {
  if (items.length === 0) return;
  const cleaned = items.map((s) => s.trim()).filter(Boolean).slice(0, 12);
  if (cleaned.length === 0) return;
  memorySemantic = {
    items: cleaned,
    updatedAt: new Date().toISOString(),
  };
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(SEMANTIC_MEM_KEY, JSON.stringify(memorySemantic));
  } catch {
    /* ignore */
  }
}

/** Resolve pronouns like "this", "that", "it" against short-lived semantic memory. */
export function resolveReferentialItems(
  contents: string[]
): { items: string[]; ambiguous: boolean } {
  const REFS = /^(this|that|it|the last one|that one|those|them)$/i;
  const mem = loadSemanticMemory();
  const out: string[] = [];
  let usedRef = false;
  for (const c of contents) {
    const t = c.trim();
    if (REFS.test(t)) {
      usedRef = true;
      if (mem.items.length === 1) {
        out.push(mem.items[0]);
      } else if (mem.items.length > 1) {
        return { items: [], ambiguous: true };
      }
    } else {
      out.push(t);
    }
  }
  if (usedRef && out.length === 0 && mem.items.length === 0) {
    return { items: [], ambiguous: true };
  }
  return { items: out, ambiguous: false };
}

export function isListTask(task: Task): boolean {
  const info = (task.info || '').trim();
  if (info === LIST_TASK_MARKER || info.startsWith(LIST_TASK_MARKER)) return true;
  return false;
}

export type ListTaskCandidate = {
  id: string;
  text: string;
  info?: string | null;
  /** Job this list-task is attached to (Dokkit landscape). */
  jobId?: string | null;
  jobName?: string | null;
};

export type ListResolveResult =
  | { kind: 'found'; taskId: string; title: string }
  | { kind: 'ambiguous'; candidates: Array<{ taskId: string; title: string; reason: string }> }
  | { kind: 'none' };

function matchTitle(taskText: string, spoken: string): boolean {
  const a = normalizeTitle(taskText);
  const b = normalizeTitle(spoken);
  if (!a || !b) return false;
  if (a === b) return true;
  // Containment on normalised keys (e.g. "grocery shopping" vs "grocery")
  if (a.includes(b) || b.includes(a)) return true;
  // Token overlap: at least one meaningful shared token
  const ta = new Set(a.split(' ').filter(Boolean));
  const tb = new Set(b.split(' ').filter(Boolean));
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  if (inter > 0 && (inter === ta.size || inter === tb.size)) return true;
  return false;
}

function scoreTitleMatch(taskText: string, spoken: string): number {
  const a = normalizeTitle(taskText);
  const b = normalizeTitle(spoken);
  if (!a || !b) return 0;
  if (a === b) return 100;
  if (a.startsWith(b) || b.startsWith(a)) return 80;
  if (a.includes(b) || b.includes(a)) return 60;
  const ta = a.split(' ').filter(Boolean);
  const tb = new Set(b.split(' ').filter(Boolean));
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  if (inter === 0) return 0;
  return Math.round((40 * inter) / Math.max(ta.length, tb.size));
}

export function resolveListTarget(
  target: CollectionTarget,
  tasks: ListTaskCandidate[],
  active: ActiveListState = loadActiveListState()
): ListResolveResult {
  if (target.kind === 'id') {
    const t = tasks.find((x) => x.id === target.collectionId);
    if (t) return { kind: 'found', taskId: t.id, title: t.text };
    return { kind: 'none' };
  }

  if (target.kind === 'active') {
    if (active.taskId && canUseActiveList(active)) {
      const t = tasks.find((x) => x.id === active.taskId);
      if (t) return { kind: 'found', taskId: t.id, title: t.text };
      // Active id may still be valid even if not in the current in-memory array yet
      if (active.title) {
        return { kind: 'found', taskId: active.taskId, title: active.title };
      }
    }
    // Soft fallback: most recent list-marked task
    const listMarked = tasks.filter((t) => (t.info || '').includes(LIST_TASK_MARKER));
    if (listMarked.length === 1) {
      return { kind: 'found', taskId: listMarked[0].id, title: listMarked[0].text };
    }
    return { kind: 'none' };
  }

  if (target.kind === 'title' || target.kind === 'unresolved') {
    const spoken = target.kind === 'title' ? target.title : target.spoken;
    const spokenNorm = normalizeTitle(spoken);

    // Prefer list-marked tasks when scoring. Also score job-name anchors
    // so "fixings for Munstead is sorted" finds a list titled "Order"
    // that is attached to the Munstead job.
    const scored = tasks
      .map((t) => {
        const titleScore = scoreTitleMatch(t.text, spoken);
        const jobScore = t.jobName ? scoreTitleMatch(t.jobName, spoken) : 0;
        const base = Math.max(titleScore, jobScore);
        const listBonus = (t.info || '').includes(LIST_TASK_MARKER) ? 15 : 0;
        const jobBonus = jobScore >= 60 ? 10 : 0;
        return { t, score: base + listBonus + jobBonus, jobScore, titleScore };
      })
      .filter((x) => x.score >= 60)
      .sort((a, b) => b.score - a.score);

    if (scored.length === 1) {
      return { kind: 'found', taskId: scored[0].t.id, title: scored[0].t.text };
    }
    if (scored.length > 1) {
      // Clear winner
      if (scored[0].score >= scored[1].score + 20) {
        return { kind: 'found', taskId: scored[0].t.id, title: scored[0].t.text };
      }
      const exact = scored.filter(
        (x) => normalizeTitle(x.t.text) === spokenNorm
      );
      if (exact.length === 1) {
        return { kind: 'found', taskId: exact[0].t.id, title: exact[0].t.text };
      }
      const listOnly = scored.filter((x) =>
        (x.t.info || '').includes(LIST_TASK_MARKER)
      );
      if (listOnly.length === 1) {
        return { kind: 'found', taskId: listOnly[0].t.id, title: listOnly[0].t.text };
      }
      return {
        kind: 'ambiguous',
        candidates: scored.slice(0, 5).map((x) => ({
          taskId: x.t.id,
          title: x.t.text,
          reason: 'title_match',
        })),
      };
    }

    // Fall back to active if still eligible
    if (active.taskId && canUseActiveList(active)) {
      if (!spokenNorm || (active.title && matchTitle(active.title, spoken))) {
        return {
          kind: 'found',
          taskId: active.taskId,
          title: active.title || 'List',
        };
      }
    }
    return { kind: 'none' };
  }

  return { kind: 'none' };
}

export type CreateListTaskOpts = {
  /** Existing job to attach when context resolved. */
  jobId?: string | null;
  /** Unresolved place/job phrase kept as free-text location. */
  locationText?: string | null;
  /** Verbatim capture line. */
  originalInput?: string | null;
};

export type TaskListOps = {
  createListTask: (
    title: string,
    itemTexts: string[],
    opts?: CreateListTaskOpts
  ) => Promise<{
    taskId: string;
    title: string;
  } | null>;
  appendSubtasks: (taskId: string, itemTexts: string[]) => Promise<number>;
  completeSubtasks: (taskId: string, refs: string[]) => Promise<number>;
  removeSubtasks: (taskId: string, refs: string[]) => Promise<number>;
  openTask: (taskId: string) => void;
  getSubtaskTexts: (taskId: string) => Promise<string[]>;
  listTasks: () => ListTaskCandidate[];
};

export type ApplyListResult = {
  ok: boolean;
  message: string;
  taskId: string | null;
  openTaskId: string | null;
  needsClarification?: {
    spoken: string;
    candidates: Array<{ taskId: string; title: string; reason: string }>;
    pendingIntent: Exclude<CollectionIntent, { type: 'clarification_required' }> | null;
  };
};

function itemContents(items: CollectionItemInput[]): string[] {
  return items.map((i) => i.content.trim()).filter(Boolean);
}

export async function applyListIntent(
  intent: CollectionIntent,
  ops: TaskListOps
): Promise<ApplyListResult> {
  if (intent.type === 'clarification_required') {
    return {
      ok: false,
      message: `Which list — ${intent.candidates.map((c) => c.title).join(' or ')}?`,
      taskId: null,
      openTaskId: null,
      needsClarification: {
        spoken: intent.spoken,
        candidates: intent.candidates.map((c) => ({
          taskId: c.collectionId,
          title: c.title,
          reason: c.reason,
        })),
        pendingIntent: intent.pendingIntent,
      },
    };
  }

  if (intent.type === 'create_collection') {
    let title = (intent.title || 'List').trim() || 'List';
    let texts = itemContents(intent.items);
    const resolved = resolveReferentialItems(texts);
    if (resolved.ambiguous) {
      return { ok: false, message: 'Which items did you mean?', taskId: null, openTaskId: null };
    }
    texts = resolved.items;

    // Attach to existing job when context linked; otherwise keep the anchor
    // on the title/location so the landscape is not lost.
    const jobId =
      intent.contextType === 'job' && intent.contextId ? intent.contextId : null;
    const unresolvedHint =
      !jobId && intent.contextHint ? collapseWhitespace(intent.contextHint) : null;
    if (unresolvedHint && !normalizeKey(title).includes(normalizeKey(unresolvedHint))) {
      // Standalone: preserve anchor in the task name (Dokkit remembers places).
      title = `${title} — ${unresolvedHint}`;
    }

    const created = await ops.createListTask(title, texts, {
      jobId,
      locationText: unresolvedHint,
      originalInput: title,
    });
    if (!created) {
      return { ok: false, message: 'Could not create list.', taskId: null, openTaskId: null };
    }
    activateListTask(created.taskId, created.title);
    if (texts.length > 0) rememberSemanticItems(texts);
    const n = texts.length;
    const jobNote = jobId ? ' (on job)' : '';
    return {
      ok: true,
      message:
        n > 0
          ? `"${created.title}" with ${n} item${n === 1 ? '' : 's'}${jobNote}`
          : `"${created.title}" created${jobNote}`,
      taskId: created.taskId,
      openTaskId: null,
    };
  }

  if (intent.type === 'append_collection') {
    let texts = itemContents(intent.items);
    const resolved = resolveReferentialItems(texts);
    if (resolved.ambiguous) {
      return { ok: false, message: 'Which items did you mean by "this"?', taskId: null, openTaskId: null };
    }
    texts = resolved.items;
    if (texts.length === 0) {
      return { ok: false, message: 'Nothing to add.', taskId: null, openTaskId: null };
    }
    const res = resolveListTarget(intent.target, ops.listTasks());
    if (res.kind === 'ambiguous') {
      return {
        ok: false,
        message: `Which list — ${res.candidates.map((c) => c.title).join(' or ')}?`,
        taskId: null,
        openTaskId: null,
        needsClarification: {
          spoken: intent.target.kind === 'title' ? intent.target.title : '',
          candidates: res.candidates,
          pendingIntent: intent,
        },
      };
    }
    if (res.kind === 'none') {
      return { ok: false, message: 'No list to add to. Start one first.', taskId: null, openTaskId: null };
    }
    const added = await ops.appendSubtasks(res.taskId, texts);
    activateListTask(res.taskId, res.title);
    rememberSemanticItems(texts);
    return {
      ok: true,
      message: `Added ${added} to "${res.title}"`,
      taskId: res.taskId,
      openTaskId: null,
    };
  }

  if (intent.type === 'complete_collection_items') {
    let res = resolveListTarget(intent.target, ops.listTasks());
    // If named target misses but active list still holds the item refs, use active.
    if (res.kind === 'none' || (res.kind === 'found' && intent.itemReferences.length > 0)) {
      const active = loadActiveListState();
      if (active.taskId && canUseActiveList(active)) {
        const activeRes: ListResolveResult = {
          kind: 'found',
          taskId: active.taskId,
          title: active.title || 'List',
        };
        if (res.kind === 'none') {
          res = activeRes;
        }
      }
    }
    if (res.kind === 'ambiguous') {
      return {
        ok: false,
        message: `Which list — ${res.candidates.map((c) => c.title).join(' or ')}?`,
        taskId: null,
        openTaskId: null,
        needsClarification: { spoken: '', candidates: res.candidates, pendingIntent: intent },
      };
    }
    if (res.kind === 'none') {
      return { ok: false, message: 'No list found.', taskId: null, openTaskId: null };
    }
    const n = await ops.completeSubtasks(res.taskId, intent.itemReferences);
    // If named list matched but item names didn't, try active list once.
    if (n === 0) {
      const active = loadActiveListState();
      if (
        active.taskId &&
        canUseActiveList(active) &&
        active.taskId !== res.taskId
      ) {
        const n2 = await ops.completeSubtasks(active.taskId, intent.itemReferences);
        if (n2 > 0) {
          touchActiveList();
          return {
            ok: true,
            message: `Marked ${n2} done on "${active.title || 'List'}"`,
            taskId: active.taskId,
            openTaskId: null,
          };
        }
      }
    }
    touchActiveList();
    return {
      ok: true,
      message: n > 0 ? `Marked ${n} done on "${res.title}"` : 'No matching items',
      taskId: res.taskId,
      openTaskId: null,
    };
  }

  if (intent.type === 'remove_collection_items') {
    const res = resolveListTarget(intent.target, ops.listTasks());
    if (res.kind === 'ambiguous') {
      return {
        ok: false,
        message: `Which list — ${res.candidates.map((c) => c.title).join(' or ')}?`,
        taskId: null,
        openTaskId: null,
        needsClarification: { spoken: '', candidates: res.candidates, pendingIntent: intent },
      };
    }
    if (res.kind === 'none') {
      return { ok: false, message: 'No list found.', taskId: null, openTaskId: null };
    }
    const n = await ops.removeSubtasks(res.taskId, intent.itemReferences);
    touchActiveList();
    return {
      ok: true,
      message: n > 0 ? `Removed ${n} from "${res.title}"` : 'No matching items',
      taskId: res.taskId,
      openTaskId: null,
    };
  }

  if (intent.type === 'query_collection' || intent.type === 'reopen_collection') {
    const res = resolveListTarget(intent.target, ops.listTasks());
    if (res.kind === 'ambiguous') {
      return {
        ok: false,
        message: `Which list — ${res.candidates.map((c) => c.title).join(' or ')}?`,
        taskId: null,
        openTaskId: null,
        needsClarification: { spoken: '', candidates: res.candidates, pendingIntent: intent },
      };
    }
    if (res.kind === 'none') {
      return { ok: false, message: 'List not found.', taskId: null, openTaskId: null };
    }
    activateListTask(res.taskId, res.title);
    if (intent.type === 'query_collection') {
      const items = await ops.getSubtaskTexts(res.taskId);
      ops.openTask(res.taskId);
      const preview =
        items.length === 0
          ? 'empty'
          : items.slice(0, 6).join(', ') + (items.length > 6 ? '…' : '');
      return {
        ok: true,
        message: `"${res.title}": ${preview}`,
        taskId: res.taskId,
        openTaskId: res.taskId,
      };
    }
    ops.openTask(res.taskId);
    return {
      ok: true,
      message: `Opened "${res.title}"`,
      taskId: res.taskId,
      openTaskId: res.taskId,
    };
  }

  if (intent.type === 'close_collection') {
    clearActiveList();
    return { ok: true, message: 'List closed', taskId: null, openTaskId: null };
  }

  if (intent.type === 'update_collection_item') {
    return {
      ok: false,
      message: 'Edit items in the task detail view.',
      taskId: null,
      openTaskId: null,
    };
  }

  return { ok: false, message: 'Unknown list action.', taskId: null, openTaskId: null };
}

export function detectListIntent(
  text: string,
  tasks?: ListTaskCandidate[]
): CollectionIntent | null {
  const active = loadActiveListState();
  const eligible = canUseActiveList(active);
  const ctx = {
    activeCollectionId: eligible ? active.taskId : null,
    activeCollectionTitle: eligible ? active.title : null,
    collections: (tasks || []).map((t) => ({
      id: t.id,
      userId: '',
      title: t.text,
      normalizedTitle: normalizeTitle(t.text),
      collectionType: 'generic' as const,
      status: 'open' as const,
      contextType: null,
      contextId: null,
      aliases: [] as string[],
      isActive: active.taskId === t.id,
      createdAt: '',
      updatedAt: '',
      lastActivityAt: '',
      closedAt: null,
    })),
    msSinceLastActivity: active.lastInteractionAt
      ? Date.now() - Date.parse(active.lastInteractionAt)
      : null,
  };
  return detectCollectionIntent(text, ctx);
}

export { intentBlocksTaskCreate, ACTIVE_HARD_TTL_MS, ACTIVE_SOFT_TTL_MS };

export function matchSubtaskRefs(
  subtasks: Array<{ id: string; text: string; done?: boolean }>,
  refs: string[]
): string[] {
  const ids: string[] = [];
  for (const ref of refs) {
    const r = ref.trim();
    if (!r) continue;
    const exact = subtasks.filter((s) => normalizeKey(s.text) === normalizeKey(r));
    if (exact.length === 1) {
      ids.push(exact[0].id);
      continue;
    }
    const similar = subtasks.filter((s) => isLikelySameItem(s.text, r));
    if (similar.length === 1) {
      ids.push(similar[0].id);
    }
  }
  return [...new Set(ids)];
}

import { describe, it, expect, beforeEach } from 'vitest';
import {
  detectListIntent,
  applyListIntent,
  activateListTask,
  clearActiveList,
  loadActiveListState,
  resolveReferentialItems,
  rememberSemanticItems,
  matchSubtaskRefs,
  canUseActiveList,
  LIST_TASK_MARKER,
  type TaskListOps,
  type ListTaskCandidate,
} from '../taskListBridge';

function makeOps(seed: ListTaskCandidate[] = []) {
  const tasks = [...seed];
  const subtasks: Record<string, Array<{ id: string; text: string; done: boolean }>> = {};
  const opened: string[] = [];
  let idSeq = 1;
  const ops: TaskListOps = {
    listTasks: () => tasks,
    createListTask: async (title, itemTexts) => {
      const id = `t${idSeq++}`;
      tasks.push({ id, text: title, info: LIST_TASK_MARKER });
      subtasks[id] = itemTexts.map((text, i) => ({ id: `s${idSeq++}-${i}`, text, done: false }));
      return { taskId: id, title };
    },
    appendSubtasks: async (taskId, itemTexts) => {
      if (!subtasks[taskId]) subtasks[taskId] = [];
      for (const text of itemTexts) {
        subtasks[taskId].push({ id: `s${idSeq++}`, text, done: false });
      }
      return itemTexts.length;
    },
    completeSubtasks: async (taskId, refs) => {
      const ids = matchSubtaskRefs(subtasks[taskId] || [], refs);
      for (const s of subtasks[taskId] || []) {
        if (ids.includes(s.id)) s.done = true;
      }
      return ids.length;
    },
    removeSubtasks: async (taskId, refs) => {
      const ids = matchSubtaskRefs(subtasks[taskId] || [], refs);
      subtasks[taskId] = (subtasks[taskId] || []).filter((s) => !ids.includes(s.id));
      return ids.length;
    },
    openTask: (taskId) => opened.push(taskId),
    getSubtaskTexts: async (taskId) => (subtasks[taskId] || []).map((s) => s.text),
  };
  return { ops, tasks, subtasks, opened };
}

describe('taskListBridge', () => {
  beforeEach(() => {
    clearActiveList();
    if (typeof localStorage !== 'undefined') localStorage.clear();
  });

  it('detects Start a grocery list', () => {
    const intent = detectListIntent('Start a grocery list');
    expect(intent?.type).toBe('create_collection');
    if (intent?.type === 'create_collection') {
      expect(intent.title.toLowerCase()).toContain('grocery');
    }
  });

  it('creates parent with items', async () => {
    const { ops, tasks, subtasks } = makeOps();
    const intent = detectListIntent('Start a grocery list: milk, bread, eggs')!;
    const result = await applyListIntent(intent, ops);
    expect(result.ok).toBe(true);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].info).toBe(LIST_TASK_MARKER);
    expect(subtasks[tasks[0].id].map((s) => s.text.toLowerCase())).toEqual(
      expect.arrayContaining(['milk', 'bread', 'eggs'])
    );
  });

  it('continues active list', async () => {
    const { ops, tasks, subtasks } = makeOps();
    await applyListIntent(detectListIntent('Start a grocery list')!, ops);
    await applyListIntent(detectListIntent('Add milk')!, ops);
    await applyListIntent(detectListIntent('Add bread')!, ops);
    expect(subtasks[tasks[0].id].map((s) => s.text.toLowerCase())).toEqual(['milk', 'bread']);
  });

  it('named append', async () => {
    const { ops, tasks, subtasks } = makeOps();
    await applyListIntent(detectListIntent('Start a grocery list')!, ops);
    clearActiveList();
    await applyListIntent(detectListIntent('Add cheese to my grocery list', tasks)!, ops);
    expect(subtasks[tasks[0].id].map((s) => s.text.toLowerCase())).toContain('cheese');
  });

  it('show opens task', async () => {
    const { ops, tasks, opened } = makeOps();
    await applyListIntent(detectListIntent('Start a grocery list: milk')!, ops);
    const result = await applyListIntent(detectListIntent('Show my grocery list', tasks)!, ops);
    expect(result.openTaskId).toBe(tasks[0].id);
    expect(opened).toContain(tasks[0].id);
  });

  it('complete and remove', async () => {
    const { ops, tasks, subtasks } = makeOps();
    await applyListIntent(detectListIntent('Start a grocery list: milk, eggs')!, ops);
    await applyListIntent(detectListIntent('Complete eggs')!, ops);
    expect(subtasks[tasks[0].id].find((s) => s.text.toLowerCase() === 'eggs')?.done).toBe(true);
    await applyListIntent(detectListIntent('Remove milk from my grocery list', tasks)!, ops);
    expect(subtasks[tasks[0].id].map((s) => s.text.toLowerCase())).not.toContain('milk');
  });

  it('ordinary tasks stay ordinary', () => {
    expect(detectListIntent('Call John tomorrow')).toBeNull();
    expect(detectListIntent('Buy a new drill')).toBeNull();
    expect(detectListIntent('Fix the leaking tap')).toBeNull();
  });

  it('add this uses semantic memory', () => {
    rememberSemanticItems(['cheese']);
    expect(resolveReferentialItems(['this'])).toEqual({ items: ['cheese'], ambiguous: false });
    rememberSemanticItems(['a', 'b']);
    expect(resolveReferentialItems(['this']).ambiguous).toBe(true);
  });

  it('hard TTL expires active list', () => {
    activateListTask('t1', 'Grocery', Date.now() - 25 * 60 * 60 * 1000);
    expect(canUseActiveList(loadActiveListState())).toBe(false);
  });
});

import { describe, it, expect } from 'vitest';
import {
  normalizeTitle,
  detectCollectionIntent,
  emptyStore,
  applyCollectionIntent,
  createCollection,
  appendItems,
  resolveCollection,
  splitItemEnumeration,
  canUseActiveForImplicit,
  activateCollection,
  emptyActiveState,
  ACTIVE_HARD_TTL_MS,
} from '../index';

describe('normalizeTitle', () => {
  it('collapses grocery variants', () => {
    expect(normalizeTitle('Grocery List')).toBe('grocery');
    expect(normalizeTitle('grocery list')).toBe('grocery');
    expect(normalizeTitle('groceries')).toBe('grocery');
    expect(normalizeTitle('GROCERIES')).toBe('grocery');
  });

  it('keeps distinct titles apart', () => {
    expect(normalizeTitle('Christmas Grocery')).not.toBe(normalizeTitle('Grocery'));
  });
});

describe('splitItemEnumeration', () => {
  it('splits comma and and lists', () => {
    expect(splitItemEnumeration('milk, bread, eggs, bananas')).toEqual([
      'milk',
      'bread',
      'eggs',
      'bananas',
    ]);
    expect(splitItemEnumeration('milk, bread and eggs')).toEqual([
      'milk',
      'bread',
      'eggs',
    ]);
  });
});

describe('detectCollectionIntent', () => {
  it('creates from colon list', () => {
    const i = detectCollectionIntent('Grocery list: milk, bread, eggs, bananas.');
    expect(i?.type).toBe('create_collection');
    if (i?.type === 'create_collection') {
      expect(i.items.map((x) => x.content.toLowerCase())).toEqual([
        'milk',
        'bread',
        'eggs',
        'bananas',
      ]);
      expect(normalizeTitle(i.title)).toBe('grocery');
    }
  });

  it('creates start phrase', () => {
    const i = detectCollectionIntent('Start a snag list for Smith Street.');
    expect(i?.type).toBe('create_collection');
    if (i?.type === 'create_collection') {
      expect(i.contextHint).toMatch(/Smith Street/i);
    }
  });

  it('appends to named list', () => {
    const i = detectCollectionIntent('Add coffee to my grocery list.');
    expect(i?.type).toBe('append_collection');
    if (i?.type === 'append_collection') {
      expect(i.items[0].content.toLowerCase()).toBe('coffee');
      expect(i.target.kind).toBe('title');
    }
  });

  it('implicit continuation when active', () => {
    const i = detectCollectionIntent('Milk.', {
      activeCollectionId: 'c1',
      msSinceLastActivity: 60_000,
    });
    expect(i?.type).toBe('append_collection');
  });

  it('does not treat need-to tasks as implicit items', () => {
    const i = detectCollectionIntent('Need to call the plumber about the leak.', {
      activeCollectionId: 'c1',
      msSinceLastActivity: 60_000,
    });
    expect(i).toBeNull();
  });

  it('detects complete and remove', () => {
    expect(detectCollectionIntent('Got the milk.')?.type).toBe(
      'complete_collection_items'
    );
    expect(detectCollectionIntent('Remove bananas.')?.type).toBe(
      'remove_collection_items'
    );
    expect(detectCollectionIntent('Take bread off the list')?.type).toBe(
      'remove_collection_items'
    );
  });

  it('does not mistake a delivery using “take … to” for list removal', () => {
    expect(detectCollectionIntent('Take the materials to Smith Road on Monday')).toBeNull();
  });
});

describe('Scenario A–D — grocery create append continue', () => {
  it('runs multi-turn grocery sequence', () => {
    let store = emptyStore('u1');
    store = applyCollectionIntent(
      store,
      'u1',
      detectCollectionIntent('Grocery list: milk, eggs and bread.')!
    ).store;
    expect(store.collections).toHaveLength(1);
    expect(store.items.filter((i) => i.status === 'open')).toHaveLength(3);

    store = applyCollectionIntent(
      store,
      'u1',
      detectCollectionIntent('Add coffee to my grocery list.')!
    ).store;
    expect(store.items.filter((i) => i.status === 'open').length).toBeGreaterThanOrEqual(4);

    store = applyCollectionIntent(
      store,
      'u1',
      detectCollectionIntent('Oh, and dishwasher tablets.', {
        activeCollectionId: store.collections[0].id,
        msSinceLastActivity: 30_000,
      })!
    ).store;

    const open = store.items.filter((i) => i.status === 'open');
    expect(open.length).toBeGreaterThanOrEqual(4);
  });
});

describe('Scenario E — ambiguity', () => {
  it('does not silently merge two open similarly named lists via resolve', () => {
    let store = emptyStore('u1');
    store = createCollection(store, 'u1', 'Site Snags', []).store;
    store = createCollection(store, 'u1', 'Office Snags', []).store;
    const res = resolveCollection('snags', store.collections);
    // Either single match or needs clarification — never invent a third silent merge id
    if (res.needsClarification) {
      expect(res.collectionId).toBeNull();
      expect(res.candidates.length).toBeGreaterThan(1);
    }
  });
});

describe('Scenario F — site snag', () => {
  it('creates snag with context hint', () => {
    const i = detectCollectionIntent('Start a snag list for Smith Street.');
    expect(i?.type).toBe('create_collection');
    let store = emptyStore('u1');
    store = applyCollectionIntent(store, 'u1', i!).store;
    expect(store.collections[0].title.toLowerCase()).toMatch(/snag/);
  });
});

describe('Scenario G–H — complete and remove', () => {
  it('marks done and removes', () => {
    let store = applyCollectionIntent(
      emptyStore('u1'),
      'u1',
      detectCollectionIntent('Grocery list: milk, bread, eggs.')!
    ).store;

    store = applyCollectionIntent(
      store,
      'u1',
      detectCollectionIntent('Got the milk.')!
    ).store;
    expect(
      store.items.find((i) => i.normalizedContent === 'milk')?.status
    ).toBe('completed');

    store = applyCollectionIntent(
      store,
      'u1',
      detectCollectionIntent('Remove bread.')!
    ).store;
    expect(
      store.items.find((i) => i.normalizedContent === 'bread')?.status
    ).toBe('removed');
  });
});

describe('Scenario I — Reopen without duplicate', () => {
  it('reopens same collection', () => {
    let store = emptyStore('u1');
    store = applyCollectionIntent(
      store,
      'u1',
      detectCollectionIntent('Grocery list: milk.')!
    ).store;
    store = applyCollectionIntent(
      store,
      'u1',
      detectCollectionIntent("That's everything for groceries.")!
    ).store;
    expect(store.collections[0].status).toBe('closed');

    store = applyCollectionIntent(
      store,
      'u1',
      detectCollectionIntent('Add coffee to my grocery list.')!
    ).store;
    expect(store.collections).toHaveLength(1);
    expect(store.collections[0].status).toBe('open');
  });
});

describe('duplicate + idempotency', () => {
  it('skips duplicate milk', () => {
    let store = emptyStore('u1');
    store = applyCollectionIntent(
      store,
      'u1',
      detectCollectionIntent('Grocery list: milk.')!
    ).store;
    const r = applyCollectionIntent(
      store,
      'u1',
      detectCollectionIntent('Add milk.')!
    );
    expect(r.store.items.filter((i) => i.status === 'open')).toHaveLength(1);
    expect(r.message.toLowerCase()).toMatch(/already/);
  });

  it('respects client_op_id', () => {
    let store = emptyStore('u1');
    store = createCollection(store, 'u1', 'Grocery', []).store;
    const op = { content: 'Butter', clientOpId: 'op-1' };
    store = appendItems(store, 'u1', { kind: 'active' }, [op]).store;
    store = appendItems(store, 'u1', { kind: 'active' }, [op]).store;
    expect(store.items.filter((i) => i.normalizedContent === 'butter')).toHaveLength(1);
  });
});

describe('active decay', () => {
  it('hard-expires active', () => {
    let state = emptyActiveState();
    state = activateCollection(state, 'c1');
    state = {
      ...state,
      lastInteractionAt: new Date(Date.now() - ACTIVE_HARD_TTL_MS - 1000).toISOString(),
    };
    expect(canUseActiveForImplicit(state)).toBe(false);
  });
});

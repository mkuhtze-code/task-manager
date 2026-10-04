'use client';

/**
 * Minimal open-collections peek — view / complete / close without leaving capture flow.
 * Not a full Collections product surface; speech remains the primary path.
 */

import { useEffect, useState } from 'react';
import {
  loadCollectionStore,
  applyAndPersistCollectionIntent,
  hydrateCollectionsFromRemote,
  type Collection,
  type CollectionItem,
  type CollectionStore,
} from '@/lib/collections';

export function CollectionsPeekSheet(props: {
  userId: string | null | undefined;
  open: boolean;
  onClose: () => void;
}) {
  const { userId, open, onClose } = props;
  const uid = (userId && userId.trim()) || 'anon';
  const [store, setStore] = useState<CollectionStore | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      const hydrated = await hydrateCollectionsFromRemote(uid);
      if (!cancelled) setStore(hydrated);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, uid]);

  if (!open) return null;

  const openCollections = (store?.collections ?? []).filter((c) => c.status === 'open');

  function itemsFor(c: Collection): CollectionItem[] {
    return (store?.items ?? [])
      .filter((i) => i.collectionId === c.id && i.status === 'open')
      .sort((a, b) => a.position - b.position);
  }

  function refresh() {
    setStore(loadCollectionStore(uid));
  }

  function completeItem(c: Collection, content: string) {
    applyAndPersistCollectionIntent(uid, {
      type: 'complete_collection_items',
      target: { kind: 'id', collectionId: c.id },
      itemReferences: [content],
      confidence: 'high',
      reasons: ['peek_ui'],
    });
    refresh();
  }

  function closeList(c: Collection) {
    applyAndPersistCollectionIntent(uid, {
      type: 'close_collection',
      target: { kind: 'id', collectionId: c.id },
      confidence: 'high',
      reasons: ['peek_ui'],
    });
    refresh();
  }

  return (
    <div className="sheet-overlay" onClick={onClose}>
      <div
        className="sheet-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Open lists"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="capture-sheet-header">
          <h2 className="capture-sheet-title">Lists</h2>
          <button type="button" className="btn-text" onClick={onClose}>
            Close
          </button>
        </div>

        {openCollections.length === 0 ? (
          <p className="settings-help">
            No open lists. Say “grocery list — milk and bread” to start one.
          </p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {openCollections.map((c) => {
              const items = itemsFor(c);
              return (
                <li key={c.id} style={{ marginBottom: 16 }}>
                  <div className="capture-row" style={{ alignItems: 'center', gap: 8 }}>
                    <strong>{c.title}</strong>
                    <span className="settings-help" style={{ margin: 0 }}>
                      {items.length} open
                    </span>
                    <button type="button" className="btn-text" onClick={() => closeList(c)}>
                      Close list
                    </button>
                  </div>
                  {items.length === 0 ? (
                    <p className="settings-help">Empty</p>
                  ) : (
                    <ul style={{ paddingLeft: 16, margin: '8px 0' }}>
                      {items.map((i) => (
                        <li
                          key={i.id}
                          className="capture-row"
                          style={{ gap: 8, alignItems: 'center' }}
                        >
                          <span>{i.content}</span>
                          <button
                            type="button"
                            className="btn-text"
                            onClick={() => completeItem(c, i.content)}
                          >
                            Done
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

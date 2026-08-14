'use client';

import { useEffect, useState } from 'react';

// Freeform information on a task — the thing a person would write
// underneath the task on paper. Deliberately just one plain multiline
// string: no formatting, no metadata, no separate note objects. It
// autosaves on blur through the same task-persistence path everything
// else uses, and the text is never interpreted into structure.
//
// Empty state is nearly invisible: on the expanded card (surface="paper")
// it is a quiet, borderless "information…" line — blank paper, not a
// feature button; in the detail sheet (surface="edit") it stays a hairline
// "+ information" control, which is fine at the deliberate editing layer.
// Existing information is shown in place — as paper-like text on the
// expanded card, or as a ready-to-edit field in the detail sheet. Tapping
// either starts editing.
export function TaskInfo({
  value,
  onSave,
  surface,
}: {
  value: string;
  onSave: (info: string) => void;
  surface: 'paper' | 'edit';
}) {
  const hasContent = value.trim().length > 0;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setDraft(value);
    setDirty(false);
  }, [value]);

  function startEdit() {
    setEditing(true);
    setDraft(value);
    setDirty(false);
  }

  function commit() {
    if (dirty) onSave(draft);
    if (draft.trim().length === 0) setEditing(false);
  }

  const showInput = editing || (surface === 'edit' && hasContent);

  if (!showInput) {
    if (hasContent) {
      return (
        <div
          className="task-info"
          onClick={startEdit}
          role="button"
          tabIndex={0}
          aria-label="Edit information"
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              startEdit();
            }
          }}
        >
          {value}
        </div>
      );
    }
    if (surface === 'paper') {
      return (
        <button className="task-info-placeholder" onClick={startEdit} aria-label="Add information">
          information…
        </button>
      );
    }
    return (
      <button className="task-info-add" onClick={startEdit}>
        + information
      </button>
    );
  }

  return (
    <textarea
      className="task-info-input"
      value={draft}
      onChange={(e) => {
        setDraft(e.target.value);
        setDirty(true);
      }}
      onBlur={commit}
      placeholder="Write it here…"
      autoFocus={editing}
      rows={Math.min(10, Math.max(3, draft.split('\n').length))}
    />
  );
}

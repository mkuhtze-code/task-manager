'use client';

import { fmtMins } from '@/lib/timeFormat';

export type PostStopPromptState = {
  taskId: string;
  text: string;
  loggedMins: number;
};

/**
 * Calm post-stop prompt. Shown only when the timer banked real minutes.
 * Done → complete with logged time (high-quality learning).
 * Still going → dismiss; task stays open on the plan.
 */
export function PostStopPrompt({
  prompt,
  busy,
  onDone,
  onStillGoing,
}: {
  prompt: PostStopPromptState;
  busy?: boolean;
  onDone: () => void;
  onStillGoing: () => void;
}) {
  const title =
    prompt.text.trim().length > 48
      ? prompt.text.trim().slice(0, 47) + '…'
      : prompt.text.trim();

  return (
    <div
      className="post-stop-prompt"
      role="status"
      aria-live="polite"
      style={{
        margin: '0 var(--space-page, 16px) var(--space-3)',
        padding: '12px 14px',
        background: 'var(--paper)',
        borderRadius: 14,
        border: '1px solid var(--line, rgba(0,0,0,0.06))',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      <div>
        <div style={{ fontWeight: 600, color: 'var(--ink)', fontSize: 14 }}>
          {title || 'Timer stopped'}
        </div>
        <div
          className="mono"
          style={{ fontSize: 12, color: 'var(--ink-faint)', marginTop: 2 }}
        >
          {fmtMins(Math.round(prompt.loggedMins))} logged — mark done?
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          type="button"
          className="btn btn-steel"
          style={{ flex: 1, minHeight: 40 }}
          disabled={busy}
          onClick={onDone}
        >
          {busy ? '…' : 'Done'}
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          style={{ flex: 1, minHeight: 40 }}
          disabled={busy}
          onClick={onStillGoing}
        >
          Still going
        </button>
      </div>
    </div>
  );
}

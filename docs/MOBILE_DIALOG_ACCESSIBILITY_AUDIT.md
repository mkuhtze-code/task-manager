# Mobile Web — Dialog and Focus Interaction Audit

**Status:** Source-level audit and regression coverage; physical-device and screen-reader acceptance remains outstanding.

## Scope

This pass follows the web-first redesign contract. It closes demonstrated keyboard-focus gaps in modal and non-modal overlays without changing product workflows, data models, or the deterministic capture/planning engine.

## Shared modal behavior

The shared `useDialogA11y` hook manages initial focus, Escape dismissal, Tab/Shift+Tab containment for modal sheets, and focus restoration when the dialog is removed. It now uses a state-backed callback ref so its lifecycle attaches when a dialog is conditionally rendered after the owning page has mounted.

Existing hook-backed sheets were checked for both the hook call and a corresponding dialog ref: Capture, Task detail, Reality Check, job create/edit, meeting create, scheduled tasks, nearby places, trip overview, day shape, map, library, accommodation, meeting-export review, collections peek, trip vault, photo lightbox, trip creation, and trip tools.

## Defects addressed

- **Conditionally mounted modal sheets:** ensured the shared hook can attach when a modal appears after the page is already mounted. Regression coverage exercises open → focus containment → close → focus restoration.
- **Meeting export failure:** the failure state previously rendered an interactive overlay as `role="alert"` without modal semantics or the shared focus lifecycle. It now uses `role="alertdialog"`, `aria-modal="true"`, and the shared focus ref. Escape closes the flow through its existing cleanup path.
- **Meeting photo lightbox:** uses shared focus containment/restoration while retaining arrow-key photo navigation and the existing body-scroll lock.
- **Trip creation, trip tools, trip vault, and collections peek:** use the shared focus lifecycle for their modal sheets.
- **Non-modal PillReveal popover:** does not trap focus; Escape now closes it and restores focus to its trigger. A regression test covers that behavior.

## Modal vs non-modal boundaries

- The desktop task-detail pane continues to disable focus trapping; it is not a modal sheet.
- `PillReveal` is a non-modal contextual panel. It must not acquire a modal focus trap.
- The desktop plan popover is also non-modal and remains outside this mobile-web slice.
- Trip tools closes before opening the selected child sheet, so the focus traps are not intentionally nested.
- Meeting export review has its own dialog hook. Missing-media, ready, and failure decision states use the parent flow's focus ref; the transient Generating state remains a status announcement, not an interactive dialog.

## Automated validation

The existing `test:dialog-a11y` suite now covers:
- Tab and Shift+Tab wrapping in a modal.
- Escape dismissal and focus restoration.
- Safe initial focus when no control is designated.
- A dialog that mounts conditionally after its parent.
- Non-modal task-detail behavior.
- Non-modal popover Escape and focus restoration.

The build/CI chain already runs this suite. Both Vercel projects and the CodeRabbit/review checks must pass before merge.

## Remaining acceptance

Source-level fixes do not establish full WCAG 2.2 AA acceptance. Still required on the actual mobile web experience:
- TalkBack/browser screen-reader names, order, and announcement of state transitions.
- Physical touch targets, text scaling/reflow, contrast, keyboard/safe-area overlap, and reduced-motion checks.
- Manual verification that opening and closing each core sheet returns the user to the expected control and preserves prior surface state.
- A complete working-slice run: Today → multi-item capture → edit → job/meeting context → exact return state → controlled save/sync failure → recovery without lost or duplicate items.

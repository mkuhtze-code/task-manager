# Mobile Web Modal and Focus Audit

**Status:** Source-level audit and regression coverage; physical-device and screen-reader acceptance remains outstanding.

## Scope

This pass follows the web-first redesign contract. It closes demonstrated keyboard-focus gaps in existing modal and non-modal overlays without changing product workflows, data models, or the deterministic capture/planning engine.

## Existing shared modal behavior

The shared `useDialogA11y` hook manages initial focus, Escape dismissal, Tab/Shift+Tab containment for modal sheets, and focus restoration when the dialog is removed. It supports conditional overlays that open while the owning page remains mounted. Active modal layers are tracked so only the topmost modal consumes Escape and Tab; closing a child restores focus into the still-open parent. Non-modal desktop task-detail panes are not registered as modal layers.

Regression tests cover focus wrapping, Escape, focus restoration, safe initial focus, conditional open/close, nested-modal keyboard ownership, and non-modal task-detail behavior.

## Modal surfaces covered by this audit

The shared hook is applied to:
- Capture and task detail.
- Reality Check.
- Job create/edit and meeting create.
- Scheduled tasks and nearby places.
- Trip overview, day shape, map, library, accommodation, trip vault, trip tools, trip creation, trip-stop editing, and trip-stop capture.
- Collections peek.
- Meeting export review and its missing-media, generating, ready, and failure phases.
- Meeting photo lightbox.

The trip-stop editor and trip-stop capture now expose explicit dialog semantics and accessible names. The photo lightbox retains its arrow-key photo navigation and body-scroll lock; arrow-key handling is scoped to the focused lightbox instead of a global listener. Meeting export uses a separate focus lifecycle for each interactive phase so focus moves into the current phase; the Generating state remains non-dismissible and exposes its busy/status announcement.

## Non-modal popovers

`PillReveal` is a non-modal disclosure/popover used for Connections, Job files, and Meetings. It has an accessible name and explicit trigger relationship, moves focus into the opened panel, returns focus to its trigger on Escape, and does not trap focus. Escape is handled locally so a popover inside a modal closes first without closing the parent modal. The desktop plan popover is outside this mobile-web slice and must remain non-modal.

## Implementation details

- Conditional overlays in a long-lived page use an explicit enabled lifecycle, so a focus handler is installed only while the corresponding dialog is open.
- Meeting export has independent refs for missing media, generating, ready, and error states; Escape closes or returns to review according to the existing flow and never dismisses the generating phase.
- Closing trip tools precedes opening its selected child sheet, avoiding intentionally nested modal focus traps.
- No data model, persistence, scheduling, capacity, or capture interpretation behavior was changed.

## Automated validation

The established build/CI chain runs `test:dialog-a11y` and `test:pill-reveal-a11y`. The dialog suite covers Tab/Shift+Tab wraparound, Escape, focus restoration, safe initial focus, conditional mounting, nested-modal keyboard ownership, and non-modal task-detail behavior. The popover suite covers its accessible name, trigger relationship, initial focus, Escape focus return, the absence of a modal focus trap, and isolation from an enclosing modal.

Both Vercel projects and review checks must pass before merge.

## Remaining manual acceptance

Source-level fixes do not establish full WCAG 2.2 AA acceptance. Still required on the actual mobile web experience:
- TalkBack/browser screen-reader names, reading order, and announcements of state transitions.
- Physical touch targets, text scaling/reflow, contrast, keyboard/safe-area overlap, and reduced-motion checks.
- Verify that opening and closing each core sheet returns the user to the expected control and preserves the prior surface state.
- Complete the working slice: Today → multi-item capture → edit → job/meeting context → exact return state → controlled save/sync failure → recovery without lost or duplicate items.

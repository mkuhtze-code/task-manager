# Mobile Web Modal and Focus Audit

**Status:** Source-level audit and regression coverage; physical-device and screen-reader acceptance remains outstanding.

## Shared modal behavior

The shared `useDialogA11y` hook uses a callback ref to attach focus management when a dialog enters the DOM, including sheets opened after their owner page has mounted. It manages initial focus, Escape dismissal, Tab/Shift+Tab containment, hidden/disabled/inert control filtering, and focus restoration when a dialog is removed.

Active modal layers are tracked so only the topmost modal consumes Escape and Tab. Closing a child modal restores focus to its opener inside the still-open parent; it must not restore focus behind another active modal. Non-modal desktop task-detail panes are not registered as modal layers and do not trap focus.

## Modal surfaces covered

The shared hook is applied to:
- Capture and task detail.
- Reality Check.
- Job create/edit and meeting create.
- Scheduled tasks and nearby places.
- Trip overview, day shape, map, library, accommodation, trip vault, trip tools, trip creation, trip-stop editing, and trip-stop capture.
- Collections peek.
- Meeting export review and its missing-media, ready, and failure phases.
- Meeting photo lightbox.

Trip-stop editor/capture expose explicit dialog semantics and accessible names. Meeting export's generating phase remains a non-dismissible status announcement, not an interactive modal. The photo lightbox retains body-scroll locking; left/right navigation is handled by the focused lightbox rather than a global key listener.

## Non-modal popovers

`PillReveal` is a non-modal disclosure/popover used for Connections, Job files, and Meetings. It has an accessible name and explicit trigger relationship, moves focus into the opened panel, returns focus to its trigger on Escape, and does not trap focus. Escape is handled locally so a popover inside a modal closes first without closing the parent modal. The desktop plan popover remains outside this mobile-web slice and must remain non-modal.

## Automated regression coverage

The established build/CI chain runs `test:dialog-a11y` and `test:pill-reveal-a11y`. Coverage includes:
- Tab/Shift+Tab wraparound and Escape dismissal;
- focus restoration and safe initial focus;
- conditionally mounted dialogs;
- topmost nested-modal keyboard ownership;
- non-modal task-detail panes not trapping focus;
- popover accessible name, trigger relationship, initial focus, and Escape focus return;
- a popover closing without also closing its enclosing modal.

Date jump/return-to-today and Today capacity derivation are covered by separate working-slice tests. These source tests do not establish visual or physical-device acceptance.

## Remaining manual acceptance

Source-level fixes do not establish full WCAG 2.2 AA acceptance. Still required on the actual mobile web experience:
- TalkBack/browser screen-reader names, reading order, and announcements of state transitions;
- physical touch targets, text scaling/reflow, contrast, keyboard/safe-area overlap, and reduced-motion checks;
- focus return from each modal close path, including cancel, save, backdrop, and failure recovery;
- the full working slice: Today → multi-item capture → edit → job/meeting context → exact return state → controlled save/sync failure → recovery without lost or duplicate items.

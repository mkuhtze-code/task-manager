# Mobile Web Modal and Focus Audit

**Scope:** Source-level audit of modal/dialog semantics and keyboard focus on the responsive web app. This does not substitute for keyboard, screen-reader, zoom/reflow, or physical-device acceptance.

## Findings addressed in merged PR #274

The shared `useDialogA11y` hook previously inspected its ref only when the owning component mounted. For sheets rendered conditionally while their owner remained mounted, the ref was null and the hook never installed Escape handling, focus containment, or focus restoration.

PR #274 changed the hook to use a stable callback ref and re-run focus management when a dialog enters/leaves the DOM. It retains:
- initial focus to an explicitly marked control, or the modal container when none is marked;
- Escape dismissal;
- Tab and Shift+Tab containment for modal dialogs;
- filtering of disabled/hidden/inert/closed-disclosure controls;
- focus restoration when a dialog is removed;
- opt-out of focus trapping for non-modal desktop task-detail panes.

Regression tests cover wraparound, Escape, focus restoration, initial focus, conditionally mounted dialogs, non-modal behavior, and Escape dismissal/focus return for the non-modal `PillReveal` popover.

## Modal surfaces covered in PR #274

The shared hook was applied to previously uncovered modal dialogs:
- Open Lists / Collections peek
- Travel Vault
- Plan a Trip
- Trip Tools
- Meeting export's missing-media and export-ready dialogs
- Meeting photo lightbox

Other core sheets already using the shared hook include capture, task details, Reality Check, meeting/job forms, scheduled tasks, nearby places, day shape, trip overview, map, library, accommodation, and meeting export review.

## Remaining non-modal findings

- `PillReveal` is a non-modal disclosure/popover used for Connections, Job files, and Meetings. It must not trap focus. Its dialog role previously lacked an accessible name, and Escape closed it without returning focus to its trigger. PR #275 addresses the name, trigger relationship, initial focus, and Escape focus return without adding a focus trap.
- `DesktopProductNav` plan popover is desktop navigation and remains outside this mobile-web slice.
- The export-generation overlay uses `role="status"`, not modal semantics; its busy announcement and focus behavior need a separate check.

## Remaining manual acceptance

- Verify on a real mobile browser with keyboard and screen reader: open/close representative modals, navigate controls, confirm focus stays inside modal dialogs and returns to the invoking control, and confirm the virtual keyboard does not obscure the active field.
- Verify reduced-motion, contrast, touch target size, 200% zoom/reflow, and screen-reader names/announcements across the full web experience.
- Confirm non-modal popovers remain keyboard reachable without focus trapping and return focus appropriately when dismissed.
- Full WCAG 2.2 AA acceptance remains outstanding until these checks are completed.

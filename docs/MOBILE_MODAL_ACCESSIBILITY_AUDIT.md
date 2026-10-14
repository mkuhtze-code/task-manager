# Mobile Web Modal and Focus Audit

**Scope:** Source-level audit of modal/dialog semantics and keyboard focus on the responsive web app. This does not substitute for keyboard, screen-reader, zoom/reflow, or physical-device acceptance.

## Findings addressed in this slice

The shared `useDialogA11y` hook previously captured its dialog node once in a mount-only effect. When a component stayed mounted while its dialog rendered conditionally (for example, a sheet opened from a page), the hook ran while the ref was null and never installed focus management. This made it unsafe to apply the shared hook consistently to late-mounted sheets.

The hook now uses a stable callback ref and re-runs focus management when the dialog node enters/leaves the DOM. It retains:
- initial focus to an explicitly marked control, or to the modal container when none is marked;
- Escape dismissal;
- Tab and Shift+Tab containment for modal dialogs;
- filtering of disabled/hidden/inert/closed-disclosure controls;
- focus restoration when a dialog is removed;
- opt-out of focus trapping for non-modal desktop task-detail panes.

Regression tests cover wraparound, Escape, focus restoration, initial focus, conditionally mounted dialogs, and non-modal behavior.

## Modal surfaces covered

The shared hook is now applied to previously uncovered modal dialogs:
- Open Lists / Collections peek
- Travel Vault
- Plan a Trip
- Trip Tools
- Meeting export's missing-media and export-ready dialogs
- Meeting photo lightbox

Other core sheets already using the shared hook include capture, task details, Reality Check, meeting/job forms, scheduled tasks, nearby places, day shape, trip overview, map, library, accommodation, and meeting export review.

## Non-modal and layered overlay behavior

- `PillReveal` remains a non-modal disclosure/popover and does not trap focus. Its panel now has an accessible name; Escape closes it and restores focus to its trigger. Escape is stopped at the focused disclosure so an enclosing modal does not also close.
- The shared dialog hook now tracks active modal layers. Only the topmost modal consumes Escape or constrains Tab/Shift+Tab. Closing a nested modal restores focus into its still-open parent instead of stealing focus behind it.
- The meeting photo lightbox handles left/right navigation only when keyboard events originate inside the focused lightbox, rather than installing a window-wide arrow-key handler that could act behind another overlay.
- `DesktopProductNav` plan popover is desktop navigation and remains outside this mobile-web slice.
- The export-generation overlay uses `role="status"`, not modal semantics; its busy announcement and focus behavior need a separate check.

## Remaining manual acceptance

- Verify on a real mobile browser with keyboard and screen reader: open/close each representative modal, navigate all controls, confirm focus stays inside and returns to the invoking control, and confirm the virtual keyboard does not obscure the active field.
- Verify reduced-motion, contrast, touch target size, 200% zoom/reflow, and screen-reader names/announcements across the full web experience.
- Confirm non-modal popovers remain keyboard reachable without focus trapping and return focus appropriately when dismissed.
- Full WCAG 2.2 AA acceptance remains outstanding until these checks are completed.

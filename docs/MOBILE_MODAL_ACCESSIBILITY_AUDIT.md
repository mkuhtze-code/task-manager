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

## Follow-up interaction fixes

- **Non-modal `PillReveal` popover:** merged PR #276 added an accessible name and trigger relationship, moves focus into the panel, and restores focus to the trigger on Escape without trapping focus. Its behavior has dedicated regression coverage.
- **Meeting export failure:** merged PR #281 changed the interactive failure overlay to a named `alertdialog` with modal semantics and shared focus management.
- **Trip stop editor and Add-a-trip-stop sheet:** merged PR #289 adds explicit dialog semantics and shared focus management, including focus restoration on dismissal.
- **Layered overlays:** this change makes only the topmost modal handle Escape and Tab/Shift+Tab, restores a child modal's focus to its opener inside the still-open parent, and keeps non-modal desktop task detail outside the modal stack.
- **Popover inside a modal:** Escape closes the non-modal `PillReveal` first and stops propagation, so one keypress cannot also dismiss its enclosing modal. It remains non-trapping.
- **Photo lightbox:** left/right navigation is scoped to the focused lightbox rather than a global key listener, so arrow keys do not change photos while focus is elsewhere.
- `DesktopProductNav` plan popover is desktop navigation and remains outside this mobile-web slice.
- **Meeting export generation:** the blocking progress state is a focus-managed `dialog` with `aria-modal="true"` and `aria-busy="true"`; “Generating export…” remains a nested `role="status"` announcement. Escape does not dismiss the in-progress operation. Real screen-reader announcements and focus behavior still need manual acceptance.
- **Meeting export phase transitions:** missing-media, generating, ready, and failure states now each own a distinct focus lifecycle, preventing one modal phase from inheriting another phase's focus-restoration target.

## Remaining manual acceptance

- Verify on a real mobile browser with keyboard and screen reader: open/close representative modals, navigate controls, confirm focus stays inside modal dialogs and returns to the invoking control, and confirm the virtual keyboard does not obscure the active field.
- Verify reduced-motion, contrast, touch target size, 200% zoom/reflow, and screen-reader names/announcements across the full web experience.
- Confirm non-modal popovers remain keyboard reachable without focus trapping and return focus appropriately when dismissed.
- Full WCAG 2.2 AA acceptance remains outstanding until these checks are completed.

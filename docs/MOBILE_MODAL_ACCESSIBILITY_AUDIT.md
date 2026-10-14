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

Regression tests cover wraparound, Escape, focus restoration, initial focus, conditionally mounted dialogs, and non-modal behavior.

## Modal surfaces covered in PR #274

The shared hook was applied to previously uncovered modal dialogs:
- Open Lists / Collections peek
- Travel Vault
- Plan a Trip
- Trip Tools
- Meeting export's missing-media and export-ready dialogs
- Meeting photo lightbox

Other core sheets already using the shared hook include capture, task details, Reality Check, meeting/job forms, scheduled tasks, nearby places, day shape, trip overview, map, library, accommodation, and meeting export review.

## Follow-up defects addressed

- **Non-modal `PillReveal`:** PR #276 added an accessible name and trigger relationship, moved focus into the panel on open, returned focus to the trigger on Escape, and retained natural Tab movement without a focus trap. Regression coverage lives in `components/__tests__/pillRevealA11y.test.tsx`.
- **Trip stop editor:** the editor now uses the shared modal focus lifecycle, has an accessible dialog name, and returns focus when dismissed.
- **Add-a-trip-stop sheet:** the existing sheet now has shared modal focus management and explicit dialog semantics.
- **Meeting export failure:** the failure state is now a named `alertdialog` with `aria-modal="true"` and shared focus management. The existing Close and Try again actions remain unchanged.
- `DesktopProductNav` plan popover is desktop navigation and remains outside this mobile-web slice.
- The export-generation overlay remains a busy `role="status"`, not a dismissible modal; its announcement and focus behavior still need manual acceptance.

## Remaining manual acceptance

- Verify on a real mobile browser with keyboard and screen reader: open/close representative modals, navigate controls, confirm focus stays inside modal dialogs and returns to the invoking control, and confirm the virtual keyboard does not obscure the active field.
- Verify reduced-motion, contrast, touch target size, 200% zoom/reflow, and screen-reader names/announcements across the full web experience.
- Confirm non-modal popovers remain keyboard reachable without focus trapping and return focus appropriately when dismissed.
- Full WCAG 2.2 AA acceptance remains outstanding until these checks are completed.

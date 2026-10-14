# Mobile Web Modal and Focus Audit

**Scope:** Source-level audit of modal/dialog semantics and keyboard focus on the responsive web app. This does not substitute for keyboard, screen-reader, zoom/reflow, or physical-device acceptance.

## Shared modal behavior

The shared `useDialogA11y` hook provides initial focus, Escape dismissal, Tab/Shift+Tab containment for modal sheets, filtering of hidden/disabled/inert controls, and focus restoration when a dialog is removed. A state-backed callback ref ensures it attaches when a sheet opens after its owning page has mounted.

The hook now tracks active modal layers. Only the topmost modal owns document-level Escape and Tab handling. Closing a child modal restores focus to its opener inside the still-open parent; closing a child must not steal focus behind an active modal. Non-modal desktop task-detail panes are not registered as modal layers and do not trap focus.

## Non-modal popovers

`PillReveal` is a non-modal disclosure/popover used for Connections, Job files, and Meetings. It has an accessible name, a programmatic trigger relationship, and initial focus when opened, but no focus trap. Escape is handled on the popover wrapper, closes that popover first, and restores focus to its trigger without also closing an enclosing modal.

## Other modal interaction boundaries

- Meeting export's missing-media, ready, and failure decision states use the shared focus lifecycle and explicit modal semantics.
- The export-generation overlay remains a status announcement, not an interactive dialog.
- Meeting photo left/right navigation is handled by the focused lightbox itself, rather than a global key listener that could react while another overlay owns focus.
- Trip Tools closes before opening its selected child sheet; nested focus traps are not intentionally mounted by that flow.
- The desktop plan popover remains outside this mobile-web slice.

## Automated regression coverage

The dialog accessibility suite covers:
- Tab and Shift+Tab wraparound inside a modal;
- Escape dismissal and focus restoration;
- a modal that is mounted conditionally after its owner;
- safe initial focus when no control is designated;
- non-modal panes not trapping focus;
- only the topmost nested modal consuming keyboard input;
- a non-modal popover closing without also closing its enclosing modal;
- popover Escape dismissal and focus return.

The date-navigation suite separately verifies direct jump to a distant date and return to today. These tests establish source behavior, not visual or device acceptance.

## Remaining manual acceptance

- On a real mobile browser, verify representative modals and popovers with a physical/soft keyboard and a screen reader.
- Confirm the virtual keyboard does not obscure active fields and focus indicators remain visible.
- Verify reduced motion, contrast, touch target size, 200% zoom/reflow, accessible names, and announcements across the full web experience.
- Exercise focus return from every modal close path, including backdrop, cancel, save, and failure recovery.
- Full WCAG 2.2 AA acceptance remains outstanding until manual checks are completed and documented.

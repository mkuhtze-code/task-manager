# Mobile Web — Dialog and Focus Interaction Audit

**Status:** Source-level audit with focused regression coverage; physical-device and screen-reader acceptance remains outstanding.

## Scope

This pass follows the web-first redesign contract. It checks modal semantics and the shared focus lifecycle without changing product workflows, data models, or the deterministic capture/planning engine.

## Findings and fixes in this slice

The shared `useDialogA11y` hook already handles Escape, initial focus, Tab/Shift+Tab containment, and focus restoration. Its lifecycle previously only attached once when the component mounted. That was insufficient for a dialog element rendered conditionally by a long-lived parent: the hook mounted while the ref was empty and never attached when the dialog later appeared.

The hook now accepts an `enabled` option. The lifecycle is activated only after the conditional dialog is rendered and is cleaned up when it closes. Regression coverage verifies opening after the parent has mounted, focus containment while open, and focus restoration on close.

The option is applied to these modal surfaces:
- `CollectionsPeekSheet` — modal list peek.
- `MeetingPhotoCarousel` — photo lightbox, retaining left/right photo navigation while delegating Escape and focus containment/restoration to the shared hook.
- `MeetingExport` — Missing media, Export ready, and Export failed decision dialogs. The failed state now uses `alertdialog` semantics and all three states have focus management. The transient Generating state remains a status announcement rather than an interactive modal.
- `app/travel/page.tsx` — Plan a trip dialog.
- `app/travel/[tripId]/page.tsx` — Trip tools dialog.
- `TravelVaultSheet` — Trip vault dialog.

Existing hook-backed modal sheets were checked for a hook call and a corresponding dialog ref: Capture, Task detail, Reality Check, job create/edit, meeting create, scheduled tasks, nearby places, trip overview, day shape, map, library, accommodation, and meeting-export review.

## Modal vs non-modal boundaries

- The desktop task-detail pane continues to disable focus trapping; it is not a modal sheet.
- `PillReveal` and the desktop plan popover are non-modal contextual panels. They must not acquire a modal focus trap. Their keyboard dismissal and return-focus behavior remain a separate popover-specific check.
- The trip tools modal closes before opening its selected child sheet, so the focus traps are not intentionally nested.
- The photo lightbox uses the shared focus lifecycle while retaining its existing body-scroll lock and arrow-key photo navigation.
- Meeting export review remains managed by its own dialog hook. The parent flow hook is enabled only for the other interactive decision/error dialogs, not while the review dialog is active.

## Validation

- Added regression coverage for a dialog that is absent on initial parent mount, then opens, traps focus, and restores focus when closed.
- Existing dialog tests continue to cover Tab and Shift+Tab wraparound, Escape, focus restoration, safe initial focus, and non-modal task-detail behavior.
- Both Vercel projects and the CI check must pass before merge.

## Remaining acceptance

Source-level fixes do not establish full WCAG 2.2 AA acceptance. Still required on the actual mobile web experience:
- TalkBack/browser screen-reader names, order, and announcement of state transitions.
- Physical touch target, text scaling/reflow, contrast, keyboard/safe-area overlap, and reduced-motion checks.
- Manual verification that opening/closing each core sheet returns the user to the expected control and preserves the prior surface state.
- A complete core working-slice run: Today → multi-item capture → edit → job/meeting context → exact return state → controlled save/sync failure → recovery without lost or duplicate items.

# Mobile modal accessibility follow-up

**Status:** Source-level interaction fix; device and screen-reader acceptance remains outstanding.  
**Scope:** Existing web-app overlays only. No new product capability or visual language.

## Findings

The shared `useDialogA11y` hook now supports an `enabled` lifecycle for dialogs that are rendered conditionally inside a component that remains mounted. Before this change, an effect that ran while the dialog ref was empty could never attach focus handling when the dialog opened later.

The following existing modal surfaces now use the shared focus-management contract:

- Open collections peek
- Meeting photo lightbox
- Trip vault
- Plan-a-trip sheet
- Trip stop editor
- Add-a-trip-stop sheet
- Trip tools sheet
- Meeting export missing-media, generating, ready, and error states

The meeting photo lightbox retains its left/right arrow navigation and body-scroll lock. Escape handling and focus containment/restoration are provided by the shared hook. The meeting export flow gives each modal phase its own lifecycle so focus is re-established when the overlay changes from one phase to another.

## Shared contract

- Focus moves into an open modal without automatically selecting an input when the user has not designated one.
- Tab and Shift+Tab remain within modal controls.
- Escape invokes the dialog's existing close/cancel behavior; generation-in-progress remains non-dismissible.
- Focus returns to the opener when the modal closes.
- Non-modal desktop task details continue to opt out of focus trapping.
- Hidden and disabled controls, inert regions, and controls inside closed disclosures are excluded from the focus sequence.
- Condition-driven dialogs can activate and deactivate focus management as their open state changes.

## Regression coverage

The shared hook tests cover focus wraparound, Escape, restoration to the opener, safe initial focus when no control is designated, non-modal behavior, and a dialog that opens after its parent component has already mounted. The test is included in the repository CI/build chain.

## Remaining acceptance

This is not a claim of full WCAG 2.2 AA compliance. Still required on the actual mobile web app:

- Test TalkBack and at least one desktop screen reader across the key capture/edit/navigation journeys.
- Verify that every dialog has a useful accessible name and that its first announcement gives context.
- Check focus visibility, text scaling, zoom/reflow, touch-target sizes, contrast, reduced motion, and virtual-keyboard overlap.
- Confirm the visual stacking and close behavior of nested or sequential sheets.
- Run the full mobile working-slice acceptance against the production web experience after the changes deploy.

Do not port these changes into native Android until the web interaction contract is accepted.

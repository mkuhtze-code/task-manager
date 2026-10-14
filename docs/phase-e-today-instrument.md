# Phase E — Today as primary instrument

## Intent and scope

Today opens as an instrument for the day, not a stack of status modules. The visual order is surface identity, capacity/load, then the ordered TaskCard list. This phase is presentation-only: it does not alter capacity calculations, task ordering, task mutations, capture semantics, Reality Check outcomes, navigation, entitlements, or non-Today surfaces.

## Default-chrome audit

The classifications below describe the default Today face on mobile and desktop. “Tertiary/disclosure” means the existing entry point remains available, but should not compete visually with capacity or the task list.

| Block above / around the task list | Mobile | Desktop | Decision |
|---|---|---|---|
| Today identity / date | Primary | Primary | Keep visible and quiet; preserves surface orientation |
| Capacity total and segmented track | Primary | Primary | Main numeric/visual instrument; stronger total and track, reduced container chrome |
| Capacity legend (planned / fixed / travel / free) | Secondary | Secondary | Retain as compact legend; track remains the visual anchor |
| Long day interpretation / narrative sentence | Secondary | Secondary | Keep but reduce size/contrast so it does not compete with the instrument |
| Glance metrics and next commitment | Secondary | Secondary | Keep context available in a compact, unboxed row rather than a competing card stack |
| Travel regime / meeting presence | Secondary | Secondary | Existing concise context only; no new status block added |
| First-session / day-order hints | Secondary or conditional | Secondary or conditional | Retain existing gating/copy logic; avoid elevating hints above capacity |
| Example-task banner | Secondary / conditional | Secondary / conditional | Remains only when starter tasks exist; clear action retained |
| Setup line | Secondary / conditional | Secondary / conditional | Existing dismissal and setup logic retained |
| Pending Reality Check invite | Secondary / conditional | Secondary / conditional | Existing optional review/dismiss actions retained; no nagging added |
| Map and route controls | Tertiary/disclosure | Tertiary/disclosure | Keep behind existing controls/sheet; not part of default visual hierarchy |
| Scheduled sheet | Tertiary/disclosure | Tertiary/disclosure | Existing entry point and sheet retained |
| Capture sheet / Dock it affordance | Tertiary entry point | Tertiary entry point | Preserve existing capture access; no competing new CTA |
| Reality Check sheet | Tertiary/disclosure | Tertiary/disclosure | Existing entry point and outcomes unchanged |
| Task detail sheet / desktop detail pane | Secondary on open | Secondary on open | Existing interaction remains; task list is the default body |
| Primary navigation | Primary navigation (unchanged) | Primary navigation (unchanged) | No item or ordering changes |

## Implementation decisions

- Reuse the existing capacity UI and existing calculations. No new capacity math or model fields.
- Capacity total receives a stronger typographic signal and the track remains visible, while the enclosing panel loses some decorative border/shadow weight.
- Glance items are less card-like, more compact, and visually subordinate to capacity.
- Narrative and legend typography are restrained, preserving useful context without making a paragraph the hero.
- Mobile header padding and instrument spacing are tightened to bring ordered work into view sooner.
- Reduced-motion preference explicitly disables the capacity-segment width transition.
- No controls, modules, or data were deleted. Existing sheets and navigation entry points remain.

## Verification

Automated verification must run on the Phase E pull request before merge. Manual acceptance still requires:
- Mobile Today with several tasks and one active task; verify Start/Stop/Complete/expand/drag.
- Desktop split view; verify the task list remains primary and detail stays secondary.
- Empty day and starter-task state.
- Light and dark themes, with readable contrast.
- Reality Check entry and outcomes unchanged.
- `prefers-reduced-motion` enabled and disabled.

This repository edit does not claim device-level visual verification; record any remaining wayfinding-only polish separately rather than expanding Phase E scope.

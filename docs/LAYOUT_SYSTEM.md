# Dokkit Layout System

Status: active implementation contract

## Purpose
Dokkit's core surfaces should feel like one calm, expert system rather than four separately designed products.

Canonical reference: **Travel Trip Detail**.

The rule is simple: **converge structure first, abstract second, clean CSS third.**

## Surface hierarchy

Every primary surface follows this order where applicable:
1. Header — back when nested, title, one overflow/tools control.
2. Optional compact context strip or navigator.
3. One quiet status line, or no status line.
4. Primary work object/list.
5. One primary create/add action.
6. Secondary tools behind the owning surface's tools/overflow entry.

The existing four-surface SurfaceNav remains the top-level navigation paradigm. This pass does not replace it.

## Capture
Capture is progressive disclosure.
- Essential input appears first.
- Advanced fields appear only after More options.
- Do not turn capture into a wall of equal-weight pills.
- Existing engine/capture behavior must remain unchanged.

## Sheets
- One title.
- One close control.
- Focused content.
- Primary action at the bottom.
- Advanced options below the essential path.

## Visual language
Prefer existing Dokkit primitives: paper/ink surfaces, hairline dividers, whitespace, restrained type scale, existing CSS variables, btn-steel for primary actions, and existing sheet primitives.

Avoid rainbow/status badge grids, dense first-paint chip grids, competing header pills, equal-weight toolbar controls, and hype copy.

## Capability rule
Do not remove capabilities. Relocate secondary capabilities into clear tools sheets or contextual controls while preserving behavior and ownership.

Existing features should remain reachable within two taps from their owning surface.

## Accessibility
- Every tools/overflow trigger has a useful aria-label.
- Tools and capture sheets use dialog semantics.
- Primary actions are keyboard/focus reachable.
- Existing tab semantics and surface navigation remain intact.

## Desktop
Desktop may widen the same hierarchy. It must not introduce a second header language or a row of equal-weight pills just because there is more horizontal space.

## Non-goals
This layout pass does not change data models, engine authority, capacity or fit logic, speech interpretation, capture mutation semantics, AI architecture, native Android shell, marketing/branding, or top-level surface navigation.

## Acceptance criteria
- No primary screen has more than one prominent primary create/add button.
- No primary screen header shows Stay / Library / Vault / Map / Sort as equal pills.
- Status is at most one quiet line, or absent.
- Advanced capture fields appear only after More options.
- Empty states have exactly one primary CTA.
- Secondary tools are discoverable through a clear Tools/overflow entry.
- Existing capabilities remain reachable within two taps.
- Mobile is the source of truth; desktop widens without inventing a second hierarchy.
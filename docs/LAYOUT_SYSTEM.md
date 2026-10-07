# Dokkit Layout System

Status: active implementation contract

## Purpose
Dokkit's core surfaces should feel like one calm, expert system rather than four separately designed products.

The information architecture authority is **WHOLE_DAY_MODEL.md**: Dokkit is one system for a person's time, viewed through four projections — Today, Jobs, Meetings, and Travel.

Canonical visual reference: **Travel Trip Detail**.

The governing rule is: **converge the underlying model first, converge interaction grammar second, abstract only where the patterns genuinely converge, then clean CSS.**

## Surface hierarchy

Every primary surface follows this order where applicable:
1. Header — back when nested, title, one overflow/tools control.
2. Optional compact context strip or navigator.
3. One quiet status line, or no status line.
4. Primary work object/list.
5. One primary create/add action.
6. Secondary tools behind the owning surface's tools/overflow entry.

The existing four-surface SurfaceNav remains the top-level navigation paradigm. It represents four lenses into one system, not four independent products.

## Whole-day model

Today, Jobs, Meetings, and Travel are projections of the same temporal reality:
- Today — the whole day and what fits.
- Jobs — work over time.
- Meetings — people/conversations in time.
- Travel — movement through time and place.

Cross-surface navigation should preserve object identity and context.

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

Cohesion comes from shared grammar, not identical surface styling.

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
This layout/system pass does not change data models, engine authority, capacity or fit logic, speech interpretation, capture mutation semantics, AI architecture, native Android shell, marketing/branding, or top-level surface navigation.

## Acceptance criteria
- A user can understand the four surfaces as four views of the same day/time.
- The same underlying object retains identity across surfaces.
- Cross-surface navigation feels like following context, not switching applications.
- Temporal state vocabulary is consistent.
- Header, primary action, Tools, object, and depth grammar are consistent.
- Today integrates the other three projections.
- Jobs, Meetings, and Travel visibly relate their objects back to time.
- No capability is removed merely for visual consistency.
- No primary screen has more than one prominent primary create/add button.
- Status is at most one quiet line, or absent.
- Advanced capture fields appear only after More options.
- Empty states have exactly one primary CTA.
- Secondary tools are discoverable through a clear Tools/overflow entry.
- Mobile is the source of truth; desktop widens without inventing a second hierarchy.
- A realistic multi-surface day can be followed end-to-end without mental reconstruction.

## Design engineering contract

Dokkit's visible design is governed by five rules:

1. **The object is the primitive.** A task, job, meeting, or trip should feel like the same kind of thing even when its content emphasis differs.
2. **Quiet surface, strong object.** Space and hierarchy carry more weight than borders, badges, gradients, or decorative panels.
3. **The lens changes emphasis, not physics.** Today prioritizes time/fit; Jobs durable work identity; Meetings people/conversation; Travel place/movement. Geometry, type rhythm, interaction feedback, and disclosure remain shared.
4. **Intelligence appears as reduced effort.** Do not expose implementation theatre or turn useful inference into warnings, dashboards, or AI-labelled UI unless the user actually needs an explanation.
5. **Controls earn their space.** Primary actions remain obvious; secondary actions are progressively disclosed; routine state changes should be quiet and reversible.

### Signature interaction qualities

- The user should know where they are, what matters, and what happens next without reading the interface closely.
- Objects should preserve identity when followed across Today, Jobs, Meetings, and Travel.
- Time should feel spatially meaningful: now, next, later, carried, and complete should have presence without becoming a badge grid.
- Mobile and desktop are the same instrument at different scales, not separate designs.
- If a visual element does not establish hierarchy, communicate state, support action, preserve context, or create calm, remove it.

This contract supersedes incremental surface-specific styling when the two conflict.

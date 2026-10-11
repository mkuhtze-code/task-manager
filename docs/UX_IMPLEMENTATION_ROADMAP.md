# Dokkit — UI/UX Implementation Roadmap

Status: active implementation tracker  
Source of truth: World-Class UI & UX Design Report (12 October 2026)

## Milestone UX-1 — Grammar foundation

### This pass
- [x] Add semantic aliases for shared surfaces, ink, hairline, accent, danger, focus, offline tint, and elevation.
- [x] Add shared fast/navigation motion tokens.
- [x] Respect `prefers-reduced-motion` globally.
- [x] Standardize visible focus treatment across interactive controls.
- [x] Keep the change additive; do not alter capture authorization, engine behavior, data models, or navigation.
- [ ] Audit and converge header / Tools / primary-action hierarchy across Today, Jobs, Meetings, and Travel.
- [ ] Audit capture progressive disclosure and one-primary-CTA compliance.
- [ ] Verify keyboard and screen-reader semantics on shared sheets.

### Acceptance gates
- Existing behavior and capabilities remain intact.
- No new top-level navigation destinations.
- Focus remains visible; reduced-motion preference is honored.
- Touch target remediation is applied to specific controls after component audit, not through a blanket global size override.
- Build and relevant UI tests pass before merge.

## Milestone UX-2 — Today Excellence

### This pass
- [x] Replace terse score-like mobile fit labels (`Fits`, `Over`, `Off`) with plain-language states.
- [x] Keep capacity numbers grounded in existing Today calculations; no new or inferred capacity math.
- [x] Describe overload as work needing reshaping, with the amount of time beyond today's available window.
- [x] Keep the existing time-left, planned-work, and free-capacity figures visible.
- [x] Add quiet presentation rules; preserve the existing mobile layout and action ownership.
- [ ] Verify Today on small Android screens, desktop, and dark mode.
- [ ] Confirm the mobile readout remains understandable with color disabled and screen reader enabled.
- [ ] Review Now / Next / Later order and capacity integration with calendar and travel commitments before further changes.

## Milestone UX-3 — Capture and speech proposal states

### This pass
- [x] Make speech proposal tone understandable through words, not color alone.
- [x] Label proposals as suggestions and clarification states as needing the user's input.
- [x] Label safe no-op interpretations as taking no action; retain the full editable capture line.
- [x] Keep speech interpretation as presentation only; Dock remains the explicit commit action.
- [x] Keep collection mutations on their dedicated, existing path.
- [ ] Verify capture at narrow Android widths, dark mode, keyboard navigation, and screen readers.
- [ ] Confirm the proposal label never implies that a task/list mutation has already happened.
- [ ] Audit mic recording/transcribing/error states and unsupported-native capture fallback.

## Milestone UX-4 — Stable cross-lens identity and shared detail grammar

### This pass
- [x] Reuse the existing shared ContextLine primitive in both mobile and desktop task details.
- [x] Show job and location as contextual identity in the same order as Today task rows.
- [x] Keep job context navigable to its existing job route; keep location descriptive rather than inventing a destination.
- [x] Preserve task IDs, save paths, object ownership, and existing detail actions.
- [x] Audit Meetings detail: already uses shared ContextLine for time, linked job, and location; preserve that domain-specific ordering.
- [x] Audit Travel detail: stop editor already exposes stop name, location, and optional job link, but its header does not clearly anchor the stop to its trip/day.
- [x] Add a compact trip → day → stop identity line to Travel stop detail using the shared ContextLine primitive.
- [x] Pass the existing trip name and day context into the stop detail sheet without changing stop IDs, persistence, or navigation.
- [ ] Verify task job links, narrow screens, and desktop pane interaction; check Travel breadcrumb at narrow Android widths.

## Sequencing
1. UX-1: grammar lock and shared foundations.
2. UX-2: Today hierarchy, capacity status, and Reality Check entry points.
3. UX-3: Capture and speech proposal states.
4. UX-4: stable cross-lens identity and shared detail grammar.
5. UX-5: offline completeness and Android Today parity.
6. UX-6: motion, accessibility, and desktop widening.

## Guardrails
- The four lenses remain Today, Jobs, Meetings, and Travel.
- Dokkit is a calm instrument for deciding what fits, not a productivity scoreboard or chatbot.
- Preserve the existing paper/ink visual identity and primary action conventions.
- Capability may be relocated but never silently removed.
- UI must not bypass confirm-before-act or promote shadow semantic output into authority.

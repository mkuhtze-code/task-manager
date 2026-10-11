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

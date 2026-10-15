# Experience replacement frame — implementation slice

**Status:** Implemented on branch `reconstruction/experience-replacement-frame`; awaiting PR validation and review.
**Scope:** Responsive mobile web at `/app`. No domain engine, schema, persistence, entitlement, route target, or data-fetching changes.

## Why this is a replacement slice

The prior object passes established consistent object semantics, but left the familiar page composition in place. This slice changes the mobile navigation and lens frame itself:

- One persistent navigation spine is owned by `AppChrome`, not separately rendered by each page.
- Today, Jobs, Meetings, and Travel retain their existing route identities and entitlement gates.
- The primary add action is supplied by the currently mounted lens through the existing primary-action registry: capture on Today, create job on Jobs, record meeting on Meetings, and plan trip on Travel.
- The global Today instrument is shown only on Today. Jobs, Meetings, and Travel lead with their own workspace identity rather than repeating Today capacity above unrelated content.
- Redundant “back to Today” controls are removed from lens overview headers; the four-lens navigation is now the stable wayfinding mechanism.
- Mobile lens headings use a shared editorial hierarchy: large lens identity, one compact status/context line, and subdued secondary controls.
- The bottom navigation respects device safe areas, maintains 44px-class touch targets, has a clear selected state, and honours reduced-motion preferences.

## Preservation boundary

The existing `SurfaceNav` component still owns the same four routes and plan gating; only its presentation and ownership changed. Existing page-specific create actions are registered through `lib/captureOpen.ts`'s primary-action registry. The existing create sheets and capture sheet remain authoritative.

No changes are made to deterministic interpretation, task-fit/capacity calculations, Reality Check learning, meeting or trip semantics, Supabase records, permissions, entitlements, or business rules.

## Acceptance status

- Source-level regression assertions are added to `test:canonical-object-visual`.
- Production and Capacitor-test Vercel builds must pass before merge.
- Browser/device visual comparison, small-screen overflow, dark mode, text scaling, keyboard overlap, touch behavior, and assistive-technology review remain outstanding. Green CI is not visual acceptance.
- Native Android and desktop redesign remain deferred until the mobile-web experience is accepted.

## Next scope

After this frame is validated, the next implementation should replace the lens workspaces themselves as a coherent working slice—starting with Today’s day instrument and task flow, then reusing the same workspace grammar in Jobs, Meetings, and Travel. Avoid returning to isolated typography-only passes.


## Follow-on workspace reconstruction — 2026-10

The next slice moves beyond a shared frame and recomposes the three remaining mobile workspaces around their actual purpose:

- **Jobs — durable work context:** mobile job rows expose canonical job identity/state/glance/evidence landmarks. A distinct workspace lead explains that tasks, places, conversations and evidence remain attached as work spans days. The next task is presented as the next piece of work, not generic card metadata.
- **Meetings — conversation and consequence:** the workspace lead describes the relationship between what was said, decisions and unresolved actions, with the existing open-loop count. Existing live/upcoming/past sectioning and meeting actions are preserved.
- **Travel — movement and time:** the workspace lead explains how trips affect when work can happen, with the existing active/upcoming trip count. Existing trip grouping, dates, stops and actions are preserved.
- **Shared hierarchy, different rhythm:** all three use the same quiet editorial language and measure treatment, while section headers and object rows keep their domain-specific structure. Featured meetings/trips are reduced to a compact lead-in rather than a heavy card.
- **Small-screen fit:** the workspace lead reflows to a single column at narrow widths; long job names, client/location metadata and next-task text can wrap.

These are mobile web composition changes. They do not alter filters, sort order, trip/meeting/job models, data access, routes, entitlement checks, or creation flows. The canonical object landmarks are now used by the mobile Jobs list as well as the previously instrumented desktop job object.

The added source-level regression test verifies the workspace-specific structure and its CSS ownership. As before, actual phone visual acceptance (including dark mode, text scaling, keyboard overlap, reduced motion and assistive technology) remains a separate required step; passing a build does not establish visual acceptance.

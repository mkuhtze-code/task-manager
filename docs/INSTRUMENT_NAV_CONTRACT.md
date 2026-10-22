# Instrument Navigation Contract (N0–N1)

Status: N0 inventory + N1 primitives and first migrations. This is a staged contract, not a claim that every legacy route has already migrated.

## Four navigation kinds

| Kind | Surfaces | Leave control | Dock |
|---|---|---|---|
| **Root lens** | /, /jobs, /meetings, /travel | Switch via SystemDock (replace destination; do not build a peer stack) | Visible |
| **Peer push** | /jobs/[jobId], /meetings/[meetingId], /travel/[tripId], nested peers | **Up** labelled with parent lens name | Visible |
| **Utility** | Settings/preferences, account, billing, calendar connection and similar hubs | Hub exit **Done** or **Close**; utility section → hub **Up: Settings** (or hub title) | Prefer hidden or dimmed; never a second IA |
| **Transient** | Capture, Find place, vault, depth/detail sheets, confirmations | **Dismiss** via X + scrim and Escape where the host supports it; restore focus to invoker | Underlay remains as before |

## Normative label and behavior rules

- Do not use generic **Back** / **‹ Back** as the primary leave control on migrated peer or utility pages.
- Peer **Up** is explicit hierarchy, not browser history: parent name only (e.g. **Jobs**, **Meetings**, **Travel**) and a leading chevron is optional.
- Utility hub exit is **Done** or **Close**. A utility subsection returns with **Up: Settings** (or its actual hub title).
- Transient dismiss controls have aria-label="Close" or aria-label="Dismiss"; scrim and Escape behavior must remain owned by the existing sheet/dialog implementation. Restore focus to the invoker when the host supports it.
- Use explicit parent href values. Use router.back() / history.back() only where the pushed stack is known safe.
- Root lens order and entitlement handling are invariants: Today → Jobs → Meetings → Travel; preserve Pro redirects and billing destinations.
- Shared GearMenu remains owned by shared chrome. Do not add per-page duplicate gear menus. Trip deletion remains a domain action, not a trip-navigation link.

## Motion

- Use --ins-motion-fast, --ins-motion-standard, and --ins-motion-ease for Instrument chrome.
- prefers-reduced-motion: reduce disables transformative movement; current tokens resolve durations to zero. New nav primitives must not introduce horizontal transitions.
- Root dock changes may use a short opacity-only cross-fade in a later phase. N1 does not restyle the dock.
- Peer horizontal transition is deferred until scroll restoration and route transitions can be validated.
- Sheets retain existing rise/scrim behavior. N1 unifies the dismiss primitive only; no sheet behavior is replaced.

## Route inventory (main)

Routes below are grouped by navigation class; dynamic segments are route patterns. This inventory includes public/auth routes and admin routes so migration cannot accidentally change signed-out or privileged flows.

| Route pattern | Class | Current contract / N1 disposition |
|---|---|---|
| / | Root lens + auth landing | Today root; auth/signed-out behavior unchanged |
| /jobs | Root lens | SystemDock root; Pro behavior unchanged |
| /meetings | Root lens | SystemDock root; Pro behavior unchanged |
| /travel | Root lens | SystemDock root; Pro behavior unchanged |
| /jobs/[jobId] | Peer push | **Migrated:** explicit Up → /jobs, label **Jobs** |
| /meetings/[meetingId] | Peer push | **Migrated in N2:** Up → Meetings → /meetings; dock retained |
| /travel/[tripId] | Peer push | **Migrated in N2:** Up → Travel → /travel; R4.2 content and delete placement retained |
| /preferences | Utility hub (GearMenu destination) | **Migrated:** Done → /; settings behavior unchanged |
| /account | Utility hub | **Migrated in N2:** Done → / in signed-in and signed-out render branches |
| /account/billing | Utility / plan flow | Deferred; preserve ?feature= redirects |
| /account/change-password | Utility section | **Migrated in N2:** Up: Account → /account in both render branches |
| /analytics | Utility hub | **Migrated in N2:** Done → / in both render branches |
| /feedback | Utility flow | Deferred |
| /contact | Public support | Public route; unchanged |
| /welcome | Auth/onboarding | Auth flow; unchanged |
| /reset-password | Auth recovery | Signed-out-safe; unchanged |
| /admin | Privileged utility hub | Admin-gated; deferred |
| /admin/[section] | Privileged utility section | Parent should be Admin; deferred |
| /admin/activity | Privileged utility section | Parent Admin; deferred |
| /admin/admin-access | Privileged utility section | Parent Admin; deferred |
| /admin/alerts | Privileged utility section | Parent Admin; deferred |
| /admin/announcements | Privileged utility section | Parent Admin; deferred |
| /admin/audit-log | Privileged utility section | Parent Admin; deferred |
| /admin/database | Privileged utility section | Parent Admin; deferred |
| /admin/errors | Privileged utility section | Parent Admin; deferred |
| /admin/feature-flags | Privileged utility section | Parent Admin; deferred |
| /admin/feedback | Privileged utility section | Parent Admin; deferred |
| /admin/infrastructure | Privileged utility section | Parent Admin; deferred |
| /admin/integrations | Privileged utility section | Parent Admin; deferred |
| /admin/jobs | Privileged utility section | Parent Admin; deferred |
| /admin/meetings | Privileged utility section | Parent Admin; deferred |
| /admin/notifications | Privileged utility section | Parent Admin; deferred |
| /admin/oauth | Privileged utility section | Parent Admin; deferred |
| /admin/patterns | Privileged utility section | Parent Admin; deferred |
| /admin/revenue | Privileged utility section | Parent Admin; deferred |
| /admin/sessions | Privileged utility section | Parent Admin; deferred |
| /admin/stripe | Privileged utility section | Parent Admin; deferred |
| /admin/subscriptions | Privileged utility section | Parent Admin; deferred |
| /admin/support | Privileged utility section | Parent Admin; deferred |
| /admin/system-settings | Privileged utility section | Parent Admin; deferred |
| /admin/thinking | Privileged utility section | Parent Admin; deferred |
| /admin/today | Privileged utility section | Parent Admin; deferred |
| /admin/travel | Privileged utility section | Parent Admin; deferred |
| /admin/trials | Privileged utility section | Parent Admin; deferred |
| /admin/usage | Privileged utility section | Parent Admin; deferred |
| /admin/users | Privileged utility section | Parent Admin; deferred |

**Route count:** 46 route patterns in the tree at inventory time (including dynamic admin and auth/public routes); patterns are not a count of runtime URLs.

## Sheet and panel inventory

Inventory is based on named app components and the instrument shell references visible on main. This is a routing-contract inventory, not a behavioral rewrite.

| Surface / component | Kind | N1 treatment |
|---|---|---|
| CaptureSheet / capture composer | Transient | Existing open/close contract retained; standardize in later sheet pass |
| TaskDetailSheet | Transient depth | Deferred; retain existing dismissal/focus behavior |
| DepthSheet | Transient depth | Existing backdrop dismissal retained; adopt SheetDismiss incrementally |
| JobEditSheet | Transient edit | Deferred |
| FindPlaceSheet | Transient travel tool | Deferred to N4 |
| TravelToolsStrip tool panels | Transient travel tools | Individual tool migration deferred to N4 |
| AccommodationSheet | Transient travel tool | Deferred to N4 |
| TravelVaultSheet | Transient travel tool | Deferred to N4 |
| DaySheet | Transient day detail | Deferred to N4 |
| LibrarySheet | Transient library | Deferred to N4 |
| NearbySheet | Transient place results | Deferred to N4 |
| Meeting capture / observation draft | Transient capture | Existing draft cancel/save semantics retained |
| GearMenu dropdown panel | Utility entry panel | Shared owner is GearMenu; no per-page duplicate introduced |
| ProPlanGate / MeetingsPlanGate | Entitlement gate | Not navigation chrome; redirect behavior unchanged |
| Confirmation dialogs and delete confirms | Transient confirmation | Existing mutation and confirmation semantics retained |

## Source-pattern inventory and anti-patterns

N0–N2 inventory combines the route tree (46 route patterns as recorded in N0), focused source inspection of the migrated pages, and GitHub code-search queries against main before the N2 patch. GitHub search counts are indexed result counts, not raw occurrence totals; indexing can lag merged commits and common words match prose as well as controls.

### Search snapshot before N2 migrations

| Search pattern | Indexed results | Interpretation |
|---|---:|---|
| `router.back` | 0 | No indexed matches; explicit href remains the default |
| `history.back` | 0 | No indexed matches |
| `BackIcon` | 7 | Shared header, Analytics, Meeting, Job, Travel, icon source and Android icon source |
| `back-link` | 7 | Shared header, Analytics, Job, Travel and CSS selectors |
| `aria-label Back` | 47 | Noisy: generic primary controls and unrelated UI controls |
| `UpLink` / `UtilityDone` | 0 | Search index had not yet reflected the merged N1 implementation |

### Confirmed primary leave-control findings and disposition

| Location | Finding before N2 | Disposition |
|---|---|---|
| `app/jobs/[jobId]/page.tsx` | Icon-only “Back to jobs” | **Fixed in N1:** Up → Jobs → `/jobs` |
| `app/preferences/page.tsx` | Generic Back in utility header; one render branch remained after N1 | **Fixed:** Done → `/` in both render branches |
| `app/meetings/[meetingId]/page.tsx` | Generic Back in loading, error and populated detail headers | **Fixed in N2:** Up → Meetings → `/meetings` in all three branches |
| `app/travel/[tripId]/page.tsx` | “Back to travel” icon button | **Fixed in N2:** Up → Travel → `/travel`; trip content, day strip, tools and domain delete controls unchanged |
| `app/account/page.tsx` | Generic Back via AppHeader | **Fixed in N2:** Done → `/` in both render branches |
| `app/account/change-password/page.tsx` | Generic Back via AppHeader | **Fixed in N2:** Up: Account → `/account` in both render branches |
| `app/analytics/page.tsx` | Icon-only Back / “Back to Today” | **Fixed in N2:** Done → `/` in both render branches |
| `components/AppHeader.tsx` | Legacy generic Back fallback | **Retained intentionally** for un-migrated callers; N2 adds explicit `upHref` + `upLabel` support |

### Residual generic Back audit after N2

The migrated day-to-day peer and utility surfaces above no longer use generic Back as their primary leave control. Remaining known legacy callers of AppHeader's generic fallback are:

- `app/account/billing/page.tsx`: Back to Account. Deferred because billing query/return semantics (including `?feature=` redirects) require a separate safe review.
- `app/contact/page.tsx`: Back to `/`. Public support route; not part of the core utility migration.
- `components/AppHeader.tsx`: generic fallback remains for callers not yet migrated.
- Admin and lower-traffic utility routes remain a later inventory/migration pass; do not bulk-rewrite them in N2.

The indexed pre-N2 source queries returned zero `router.back` / `history.back` matches. The Travel navigation previously used explicit `router.push('/travel')`; it is now an explicit `UpLink` href. No browser-history back was introduced.

**Counts:** 6 core primary-leave patterns identified in the N0–N1 inventory; all 6 now use their intended navigation language (Jobs, Preferences, Meetings, Travel, Account, Analytics). N2 also migrates Change Password → Account and closes the remaining Preferences render-branch gap. Three known legacy generic-fallback locations remain (Billing, Contact, shared AppHeader fallback); Admin/lower-traffic utilities are deferred. These are inspected findings, not a claim that every literal “Back” in the repository is navigation chrome.

GearMenu ownership and SystemDock remain unchanged. Root order remains Today → Jobs → Meetings → Travel; Pro redirects and billing destination semantics remain untouched. Trip deletion remains a domain control, separate from the Travel Up link.
## Primitive API

- UpLink({ href, label }): explicit parent route; visible parent name; accessible name equals parent name.
- UtilityDone({ href = '/', label = 'Done' }): explicit utility completion destination; default is lens-safe Today root.
- SheetDismiss({ onDismiss, label = 'Dismiss' }): button-only wrapper for sheet headers; use **Close** or **Dismiss** as accessible name. Existing scrim, Escape, and focus restoration remain the sheet owner's responsibility.

CSS lives in app/instrument-nav.css and uses --ins-* tokens. It is loaded from the root layout. No dock visual, engine, entitlement, or mutation behavior changes in this phase.

## N3+ backlog

1. Audit Admin hub/section routes and lower-traffic utility surfaces without bulk-changing shared headers.
2. Review Billing leave semantics and preserve all `?feature=` redirect/return behavior before replacing its legacy Back control.
3. Decide whether Contact should use UtilityDone or retain its public-route Back-to-home treatment.
4. Adopt SheetDismiss consistently across Capture, DepthSheet, Find place, Travel tools, vault, and confirmation surfaces; verify Escape and invoker focus restoration.
5. Consider utility dock dimming and root-switch opacity-only transition only after dedicated design review; N2 does not restyle SystemDock.
6. Browser/device QA: focus order, screen-reader labels, scrim dismissal, Escape, scroll restoration, signed-out routes, and 320–390px widths.

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
| /meetings/[meetingId] | Peer push | Deferred to N2; legacy header retained |
| /travel/[tripId] | Peer push | Deferred to N2; trip-delete placement unchanged |
| /preferences | Utility hub (GearMenu destination) | **Migrated:** Done → /; settings behavior unchanged |
| /account | Utility hub | Deferred |
| /account/billing | Utility / plan flow | Deferred; preserve ?feature= redirects |
| /account/change-password | Utility section | Deferred; intended Up → Account |
| /analytics | Utility hub | Deferred |
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

N0 inventoried all 46 app page route patterns and reviewed the shared shell/header, GearMenu, AppChrome, SystemDock/SurfaceNav, peer detail headers, Preferences, and named sheet/panel components. GitHub code-search queries against main returned the following indexed matches. These are search-result counts, not raw occurrence counts: code search can return one file for multiple matches and common words such as “Back” include prose and non-navigation controls.

| Search pattern | Indexed results | Interpretation |
|---|---:|---|
| router.back | 0 | No indexed result returned; use explicit href by default |
| history.back | 0 | No indexed result returned; use explicit href by default |
| literal Back | 100 returned (query limit reached) | Very noisy: docs, comments, onboarding and UI text; inspect navigation-specific hits rather than treating this as a primary-control count |
| ‹ | 0 | No indexed result returned |
| leading back links / back-link | 8 | Includes JSX controls plus CSS selectors; relevant route controls are itemized below |
| BackIcon | 7 | Icon definition, shared AppHeader, Analytics, Meeting detail, Job detail, Travel detail, and Android icon source |
| back-link | 8 | Shared header, Analytics, Job detail, Travel detail, plus matching style rules |
| aria-label Back | 48 | Noisy query: includes generic icon controls, “Back to Today”, and non-navigation copy; inspect file context before classifying |

### Confirmed primary leave-control findings

| Location | Finding | Disposition |
|---|---|---|
| app/jobs/[jobId]/page.tsx | Icon-only parent link labelled “Back to jobs” | **Fixed:** visible UpLink label **Jobs**, explicit /jobs |
| app/preferences/page.tsx | Preferences used shared AppHeader generic “Back” icon to / | **Fixed:** utility **Done** → / |
| app/meetings/[meetingId]/page.tsx | Parent route link /meetings still exposes generic “Back” accessible label | Deferred to N2: Up → /meetings |
| app/travel/[tripId]/page.tsx | Explicit parent navigation to /travel is still labelled generic “Back to travel” | Deferred to N2: Up → /travel |
| app/analytics/page.tsx | Utility-like Analytics surface uses icon-only “Back” to / | Deferred to N2 utility audit |
| app/account/page.tsx + components/AppHeader.tsx | Account uses shared AppHeader with backHref="/" and generic “Back” | Deferred to N2 utility audit |
| components/AppHeader.tsx | Generic icon-only aria-label="Back" fallback remains for legacy callers | Retained only to avoid a broad navigation-tree rewrite in N1; migrate callers by class |

GearMenu is implemented in components/GearMenu.tsx and is available through shared chrome/header ownership. N1 does not add any page-level gear menu or change its destinations. SystemDock continues delegating to SurfaceNav, preserving Today → Jobs → Meetings → Travel and existing Pro-to-billing behavior.

**Counts for this phase:** 6 route/header primary-leave patterns explicitly identified in app JSX/shared chrome; 2 fixed in N1 (Jobs and Preferences); 4 deferred (Meeting, Travel, Analytics, Account). The source search found 0 indexed router.back/history.back matches. This is the recorded N0 code/search inventory. The N2 gate should repeat these queries against the checked-out source and inspect any newly indexed matches before expanding migrations.

## Primitive API

- UpLink({ href, label }): explicit parent route; visible parent name; accessible name equals parent name.
- UtilityDone({ href = '/', label = 'Done' }): explicit utility completion destination; default is lens-safe Today root.
- SheetDismiss({ onDismiss, label = 'Dismiss' }): button-only wrapper for sheet headers; use **Close** or **Dismiss** as accessible name. Existing scrim, Escape, and focus restoration remain the sheet owner's responsibility.

CSS lives in app/instrument-nav.css and uses --ins-* tokens. It is loaded from the root layout. No dock visual, engine, entitlement, or mutation behavior changes in this phase.

## N2+ backlog

1. Complete checked-out-repository grep for router.back(), history.back(), generic Back, ‹, and icon-only leading links; record exact counts and owner paths.
2. Migrate meeting detail Up → /meetings and trip detail Up → /travel, preserving existing selected-day/filter return state.
3. Audit Account, Billing, Change Password, Analytics, Feedback, and Admin hub/section navigation.
4. Adopt SheetDismiss consistently across Capture, DepthSheet, Find place, Travel tools, vault, and confirmation surfaces; verify Escape and invoker focus restoration.
5. Decide dock dimming on utilities and add opacity-only root switching only after visual QA; preserve root order and Pro redirects.
6. Browser/device QA: focus order, screen reader labels, scrim dismissal, Escape, scroll restoration, signed-out routes, and 320–390px widths.

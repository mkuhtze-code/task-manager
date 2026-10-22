# Instrument Navigation Contract (N0–N1)

Status: N0 inventory + N1 primitives + N2 peer/core utility migrations + N3 remaining utility/admin chrome. This is a staged contract; the N4 transient-sheet backlog remains open.

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
| /account/billing | Utility / plan flow | **Migrated in N3:** Up: Account → `/account`; `?feature=` display and Pro redirect/checkout behavior unchanged |
| /account/change-password | Utility section | **Migrated in N2:** Up: Account → /account in both render branches |
| /analytics | Utility hub | **Migrated in N2:** Done → / in both render branches |
| /feedback | Legacy utility path | Redirects to `/contact`; redirect unchanged |
| /contact | App support utility | **Migrated in N3:** Done → `/`; shared app chrome remains; public marketing site is separate and unchanged |
| /welcome | Auth/onboarding | Auth flow; unchanged |
| /reset-password | Auth recovery | Signed-out-safe; unchanged |
| /admin | Privileged utility hub | Admin-gated; existing **Open app** → `/` exit retained; no generic Back to replace |
| /admin/[section] | Privileged utility section | **Migrated in N3:** shared AdminLayout Up → Admin → `/admin`; admin gate unchanged |
| /admin/activity | Privileged utility section | **Migrated in N3:** shared AdminLayout Up → Admin → `/admin`; admin gate unchanged |
| /admin/admin-access | Privileged utility section | **Migrated in N3:** shared AdminLayout Up → Admin → `/admin`; admin gate unchanged |
| /admin/alerts | Privileged utility section | **Migrated in N3:** shared AdminLayout Up → Admin → `/admin`; admin gate unchanged |
| /admin/announcements | Privileged utility section | **Migrated in N3:** shared AdminLayout Up → Admin → `/admin`; admin gate unchanged |
| /admin/audit-log | Privileged utility section | **Migrated in N3:** shared AdminLayout Up → Admin → `/admin`; admin gate unchanged |
| /admin/database | Privileged utility section | **Migrated in N3:** shared AdminLayout Up → Admin → `/admin`; admin gate unchanged |
| /admin/errors | Privileged utility section | **Migrated in N3:** shared AdminLayout Up → Admin → `/admin`; admin gate unchanged |
| /admin/feature-flags | Privileged utility section | **Migrated in N3:** shared AdminLayout Up → Admin → `/admin`; admin gate unchanged |
| /admin/feedback | Privileged utility section | **Migrated in N3:** shared AdminLayout Up → Admin → `/admin`; admin gate unchanged |
| /admin/infrastructure | Privileged utility section | **Migrated in N3:** shared AdminLayout Up → Admin → `/admin`; admin gate unchanged |
| /admin/integrations | Privileged utility section | **Migrated in N3:** shared AdminLayout Up → Admin → `/admin`; admin gate unchanged |
| /admin/jobs | Privileged utility section | **Migrated in N3:** shared AdminLayout Up → Admin → `/admin`; admin gate unchanged |
| /admin/meetings | Privileged utility section | **Migrated in N3:** shared AdminLayout Up → Admin → `/admin`; admin gate unchanged |
| /admin/notifications | Privileged utility section | **Migrated in N3:** shared AdminLayout Up → Admin → `/admin`; admin gate unchanged |
| /admin/oauth | Privileged utility section | **Migrated in N3:** shared AdminLayout Up → Admin → `/admin`; admin gate unchanged |
| /admin/patterns | Privileged utility section | **Migrated in N3:** shared AdminLayout Up → Admin → `/admin`; admin gate unchanged |
| /admin/revenue | Privileged utility section | **Migrated in N3:** shared AdminLayout Up → Admin → `/admin`; admin gate unchanged |
| /admin/sessions | Privileged utility section | **Migrated in N3:** shared AdminLayout Up → Admin → `/admin`; admin gate unchanged |
| /admin/stripe | Privileged utility section | **Migrated in N3:** shared AdminLayout Up → Admin → `/admin`; admin gate unchanged |
| /admin/subscriptions | Privileged utility section | **Migrated in N3:** shared AdminLayout Up → Admin → `/admin`; admin gate unchanged |
| /admin/support | Privileged utility section | **Migrated in N3:** shared AdminLayout Up → Admin → `/admin`; admin gate unchanged |
| /admin/system-settings | Privileged utility section | **Migrated in N3:** shared AdminLayout Up → Admin → `/admin`; admin gate unchanged |
| /admin/thinking | Privileged utility section | **Migrated in N3:** shared AdminLayout Up → Admin → `/admin`; admin gate unchanged |
| /admin/today | Privileged utility section | **Migrated in N3:** shared AdminLayout Up → Admin → `/admin`; admin gate unchanged |
| /admin/travel | Privileged utility section | **Migrated in N3:** shared AdminLayout Up → Admin → `/admin`; admin gate unchanged |
| /admin/trials | Privileged utility section | **Migrated in N3:** shared AdminLayout Up → Admin → `/admin`; admin gate unchanged |
| /admin/usage | Privileged utility section | **Migrated in N3:** shared AdminLayout Up → Admin → `/admin`; admin gate unchanged |
| /admin/users | Privileged utility section | **Migrated in N3:** shared AdminLayout Up → Admin → `/admin`; admin gate unchanged |

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

- `components/AppHeader.tsx`: generic fallback remains for legacy callers outside this phase; migrated Billing and Contact no longer use it.
- `/admin` itself has no generic Back control; its existing `Open app → /` exit remains the hub policy.
- Remaining fallback call sites outside the N3 scope require a future route-specific review.

The indexed pre-N2 source queries returned zero `router.back` / `history.back` matches. The Travel navigation previously used explicit `router.push('/travel')`; it is now an explicit `UpLink` href. No browser-history back was introduced.

**Counts through N3:** core peer/utility exits now use their contract labels; Billing and Contact have migrated, and Admin sections share one layout-level Up control. The shared AppHeader fallback remains for unmigrated callers outside this scope. These are inspected primary-control findings, not a claim that every literal “Back” in the repository is navigation chrome.

GearMenu ownership and SystemDock remain unchanged. Root order remains Today → Jobs → Meetings → Travel; Pro redirects and billing destination semantics remain untouched. Trip deletion remains a domain control, separate from the Travel Up link.
## Primitive API

- UpLink({ href, label }): explicit parent route; visible parent name; accessible name equals parent name.
- UtilityDone({ href = '/', label = 'Done' }): explicit utility completion destination; default is lens-safe Today root.
- SheetDismiss({ onDismiss, label = 'Dismiss' }): button-only wrapper for sheet headers; use **Close** or **Dismiss** as accessible name. Existing scrim, Escape, and focus restoration remain the sheet owner's responsibility.

CSS lives in app/instrument-nav.css and uses --ins-* tokens. It is loaded from the root layout. No dock visual, engine, entitlement, or mutation behavior changes in this phase.

## N3 completion

| Route / surface | Leave control | Destination | Status / invariant |
|---|---|---|---|
| `/account/billing` | **Up: Account** | `/account` | Shared AppHeader props only; `?feature=` reading/highlighting, Stripe checkout/portal logic, and Pro redirects unchanged |
| `/contact` (app support chrome) | **Done** | `/` | AppHeader utility exit; public marketing site untouched |
| `/feedback` | Redirect | `/contact` | Legacy redirect unchanged |
| `/admin` | **Open app** | `/` | Existing admin hub exit retained; no generic Back was present |
| `/admin/*` sections | **Up: Admin** | `/admin` | One shared AdminLayout control; existing admin session/authorization gate unchanged |

Admin strategy: `app/admin/layout.tsx` renders `UpLink` only when `pathname !== '/admin'`. This covers the section routes in the inventory without per-page edits. The signed-out/loading/unauthorized AdminGate branch is unchanged. The Admin overview has no generic Back control; its explicit Open app link remains the existing exit policy.

N3 source guards cover Billing's parent link and `?feature=` handling, shared Admin section Up/hub exit/auth gate, and Contact Done plus the Feedback redirect. CI is the acceptance gate; source inspection alone does not establish test/build success.

## N4+ backlog

1. Adopt `SheetDismiss` consistently across Capture, DepthSheet, Find place, Travel tools, vault, and confirmation surfaces; verify Escape and invoker focus restoration.
2. Consider utility dock dimming and root-switch opacity-only transition only after dedicated design review; no SystemDock visual changes in N3.
3. Browser/device QA: focus order, screen-reader labels, scrim dismissal, Escape, scroll restoration, signed-out routes, and 320–390px widths.

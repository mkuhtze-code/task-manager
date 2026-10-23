# Instrument Navigation Contract (N0–N6)

Status: **N0–N6 complete** — inventory, navigation primitives, peer/core utilities, remaining utility/admin chrome, transient dismiss consistency, Instrument-native dock ownership, and local return-state hardening. The navigation program is complete; remaining device QA is verification, not a planned navigation phase.

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
- N5 root dock uses an Instrument-native active indicator and opacity-only icon emphasis (bounded by `--ins-motion-standard`); it does not animate page position. `prefers-reduced-motion` disables transitions.
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
| /account/billing | Utility / plan flow | **Migrated in N3:** Up: Account → `/account`; `?feature=` and Pro redirect/checkout behavior preserved |
| /account/change-password | Utility section | **Migrated in N2:** Up: Account → /account in both render branches |
| /analytics | Utility hub | **Migrated in N2:** Done → / in both render branches |
| /feedback | Legacy utility path | Redirects to `/contact`; redirect unchanged |
| /contact | App support utility | **Migrated in N3:** Done → `/`; public marketing site remains separate and unchanged |
| /welcome | Auth/onboarding | Auth flow; unchanged |
| /reset-password | Auth recovery | Signed-out-safe; unchanged |
| /admin | Privileged utility hub | Existing **Open app** → `/` exit retained; no generic Back was present |
| /admin/[section] | Privileged utility section | **Migrated in N3:** shared AdminLayout Up → Admin → `/admin`; gate unchanged |
| /admin/activity | Privileged utility section | **Migrated in N3:** shared AdminLayout Up → Admin → `/admin`; gate unchanged |
| /admin/admin-access | Privileged utility section | **Migrated in N3:** shared AdminLayout Up → Admin → `/admin`; gate unchanged |
| /admin/alerts | Privileged utility section | **Migrated in N3:** shared AdminLayout Up → Admin → `/admin`; gate unchanged |
| /admin/announcements | Privileged utility section | **Migrated in N3:** shared AdminLayout Up → Admin → `/admin`; gate unchanged |
| /admin/audit-log | Privileged utility section | **Migrated in N3:** shared AdminLayout Up → Admin → `/admin`; gate unchanged |
| /admin/database | Privileged utility section | **Migrated in N3:** shared AdminLayout Up → Admin → `/admin`; gate unchanged |
| /admin/errors | Privileged utility section | **Migrated in N3:** shared AdminLayout Up → Admin → `/admin`; gate unchanged |
| /admin/feature-flags | Privileged utility section | **Migrated in N3:** shared AdminLayout Up → Admin → `/admin`; gate unchanged |
| /admin/feedback | Privileged utility section | **Migrated in N3:** shared AdminLayout Up → Admin → `/admin`; gate unchanged |
| /admin/infrastructure | Privileged utility section | **Migrated in N3:** shared AdminLayout Up → Admin → `/admin`; gate unchanged |
| /admin/integrations | Privileged utility section | **Migrated in N3:** shared AdminLayout Up → Admin → `/admin`; gate unchanged |
| /admin/jobs | Privileged utility section | **Migrated in N3:** shared AdminLayout Up → Admin → `/admin`; gate unchanged |
| /admin/meetings | Privileged utility section | **Migrated in N3:** shared AdminLayout Up → Admin → `/admin`; gate unchanged |
| /admin/notifications | Privileged utility section | **Migrated in N3:** shared AdminLayout Up → Admin → `/admin`; gate unchanged |
| /admin/oauth | Privileged utility section | **Migrated in N3:** shared AdminLayout Up → Admin → `/admin`; gate unchanged |
| /admin/patterns | Privileged utility section | **Migrated in N3:** shared AdminLayout Up → Admin → `/admin`; gate unchanged |
| /admin/revenue | Privileged utility section | **Migrated in N3:** shared AdminLayout Up → Admin → `/admin`; gate unchanged |
| /admin/sessions | Privileged utility section | **Migrated in N3:** shared AdminLayout Up → Admin → `/admin`; gate unchanged |
| /admin/stripe | Privileged utility section | **Migrated in N3:** shared AdminLayout Up → Admin → `/admin`; gate unchanged |
| /admin/subscriptions | Privileged utility section | **Migrated in N3:** shared AdminLayout Up → Admin → `/admin`; gate unchanged |
| /admin/support | Privileged utility section | **Migrated in N3:** shared AdminLayout Up → Admin → `/admin`; gate unchanged |
| /admin/system-settings | Privileged utility section | **Migrated in N3:** shared AdminLayout Up → Admin → `/admin`; gate unchanged |
| /admin/thinking | Privileged utility section | **Migrated in N3:** shared AdminLayout Up → Admin → `/admin`; gate unchanged |
| /admin/today | Privileged utility section | **Migrated in N3:** shared AdminLayout Up → Admin → `/admin`; gate unchanged |
| /admin/travel | Privileged utility section | **Migrated in N3:** shared AdminLayout Up → Admin → `/admin`; gate unchanged |
| /admin/trials | Privileged utility section | **Migrated in N3:** shared AdminLayout Up → Admin → `/admin`; gate unchanged |
| /admin/usage | Privileged utility section | **Migrated in N3:** shared AdminLayout Up → Admin → `/admin`; gate unchanged |
| /admin/users | Privileged utility section | **Migrated in N3:** shared AdminLayout Up → Admin → `/admin`; gate unchanged |

**Route count:** 46 route patterns in the tree at inventory time (including dynamic admin and auth/public routes); patterns are not a count of runtime URLs.

## Sheet and panel inventory

Inventory is based on named app components and the instrument shell references visible on main. This is a routing-contract inventory, not a behavioral rewrite.

| Surface / component | Kind | N4 disposition |
|---|---|---|
| CaptureSheet / capture composer | Transient | **Migrated in N4:** SheetDismiss label Close; existing `useDialogA11y`, scrim and capture callbacks retained |
| TaskDetailSheet | Transient depth | **Migrated in N4:** outer sheet header uses SheetDismiss label Close; nested sub-form close remains local |
| DepthSheet | Transient depth | **Migrated in N4:** SheetDismiss label Close; existing backdrop and `useDialogA11y` retained |
| JobEditSheet | Transient edit | **Migrated in N4:** JobSheets edit header uses SheetDismiss; commit-before-close behavior preserved |
| FindPlaceSheet | Transient travel tool | **Migrated in N4:** SheetDismiss label Close; existing backdrop/Escape owner retained |
| TravelToolsStrip tool panels | Transient travel tools | Primary sheet headers migrated where the component exposes them; see rows below |
| AccommodationSheet | Transient travel tool | **Migrated in N4:** SheetDismiss label Close |
| TravelVaultSheet | Transient travel tool | **Migrated in N4:** SheetDismiss label Close |
| DaySheet | Transient day detail | **Migrated in N4:** SheetDismiss label Close |
| LibrarySheet | Transient library | **Migrated in N4:** outer sheet exit uses SheetDismiss; inner Close controls intentionally switch internal Library modes |
| NearbySheet | Transient place results | **Migrated in N4:** SheetDismiss label Close |
| Meeting capture / observation draft | Transient capture | Custom close remains: separate meeting-capture form with existing draft/save semantics; already labelled Close |
| GearMenu dropdown panel | Utility entry panel | Shared owner is GearMenu; not a modal sheet; unchanged |
| ProPlanGate / MeetingsPlanGate | Entitlement gate | Not navigation chrome; redirect behavior unchanged |
| Confirmation dialogs and delete confirms | Transient confirmation | Custom controls retained where they express confirm/cancel choices; no misleading Back label found in this scoped pass |

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

### Residual generic Back audit after N4

The migrated day-to-day peer and utility surfaces above no longer use generic Back as their primary leave control. Remaining known legacy callers of AppHeader's generic fallback are:

- `components/AppHeader.tsx`: generic fallback remains for legacy callers outside the migrated N2/N3 routes.
- N4 leaves internal Library mode controls and domain-specific close/save actions intact; they are not route-level Back controls.
- The inventory is scoped to the named major sheet hosts; this is not a claim that every modal-like surface in the repository has been migrated.

The indexed pre-N2 source queries returned zero `router.back` / `history.back` matches. The Travel navigation previously used explicit `router.push('/travel')`; it is now an explicit `UpLink` href. No browser-history back was introduced.

**Counts through N4:** N2 peer/core utilities and N3 Billing, Contact, and Admin chrome are migrated on the shipping branch. N4 standardizes major sheet header dismiss controls while retaining host-owned dialog behavior. These are scoped source findings, not a claim that every literal “Back” in the repository is navigation chrome.

GearMenu remains owned by shared chrome and stays out of the dock. SystemDock owns the dock presentation; SurfaceNav retains root destinations, entitlement checks, visit tracking, and contextual Add behavior. Root order remains Today → Jobs → Meetings → Travel; Pro redirects and billing destination semantics remain untouched. Trip deletion remains a domain control, separate from the Travel Up link.
## Primitive API

- UpLink({ href, label }): explicit parent route; visible parent name; accessible name equals parent name.
- UtilityDone({ href = '/', label = 'Done' }): explicit utility completion destination; default is lens-safe Today root.
- SheetDismiss({ onDismiss, label = 'Dismiss' }): button-only wrapper for sheet headers; use **Close** or **Dismiss** as accessible name. Existing scrim, Escape, and focus restoration remain the sheet owner's responsibility.

Navigation primitives live in app/instrument-nav.css; SystemDock presentation lives in app/instrument-system-dock.css. Both are loaded from the root layout. Dock changes are presentation-only; route, entitlement, visit-tracking, and domain mutation behavior remain owned by existing code.

## N4 completion

N4 applies `SheetDismiss` to Capture, DepthSheet, TaskDetailSheet's outer header, Find place, Travel Vault, Accommodation/Stay, Library's outer sheet, Nearby, DaySheet, and the New/Edit Job sheet headers. The component's accessible name is **Close**.

The shared dismiss primitive only invokes the existing host callback. Each sheet continues to own `useDialogA11y`, Escape topmost arbitration, scrim handling, focus return, and any local state transitions. No capture-engine, travel math, offline queue, save, or mutation semantics were changed. Job edit's existing commit-before-close callback is preserved. Library's nested Close controls remain custom because they return from an internal mode to the Library list rather than dismissing the host sheet.

## N5 completion

SystemDock owns the mobile root dock markup and presentation in `components/instrument/SystemDock.tsx` and `app/instrument-system-dock.css`. SurfaceNav supplies the shared four-destination configuration, routing/entitlement controller, quiet visit tracking, and contextual Add behavior; its legacy dock markup remains for peer-page compatibility but is hidden inside the mobile workspace so the shell dock is the only visible dock. The dock order and hrefs remain Today (`/`) → Jobs (`/jobs`) → Meetings (`/meetings`) → Travel (`/travel`). The contextual primary remains outside the four-tab tablist, and GearMenu remains outside the dock.

The active lens uses `aria-current="page"` / `aria-selected`, stronger ink, and a small steel top indicator. Inactive icons are quietly dimmed; lens-change motion is opacity-only and uses `--ins-motion-standard`. No page translation, route-transition library, router history navigation, clearance token, or desktop sidebar IA was changed. Utility pages retain the existing default dock visibility policy; N5 introduces no hide/dim policy.

Automated source guards cover the four routes/order, active lens semantics, SurfaceNav Pro→billing feature mapping, visit tracking, contextual Add separation, Instrument token styling, safe-area padding, minimum 44px hit targets, reduced-motion behavior, and unchanged dock-clearance ownership. Device QA remains a manual checklist: 390px viewport, safe-area insets, dark mode, focus-visible contrast, no duplicate dock on peer detail, and Android browser/device rendering.

## N6 completion — return-state hardening

Overview return state uses sessionStorage only, keyed by lens and authenticated user:
- Jobs: `dokkit.surface-return.{userId}.jobs.v1` stores filter, search, selected date, and overview scrollY.
- Meetings: `dokkit.surface-return.{userId}.meetings.v1` stores filter, search, selected date, and overview scrollY.
- Travel overview: `dokkit.surface-return.{userId}.travel.v1` stores filter, search, selected date, and overview scrollY.
- Trip detail: `dokkit.surface-return.{userId}.travel-trip.{tripId}.v1` stores the selected day id. A saved day is restored only if it still belongs to the loaded trip; stale ids fall back to the existing initial-day policy. The existing offline trip snapshot remains authoritative for offline data and is not rewritten by this UI-state layer.

The shared helper API in `lib/nav/returnState.ts` provides `serializeLensState`, `deserializeLensState`, `saveLensState`, `loadLensState`, and `clearLensState`. Writes are best-effort and local to the current browser session. The overview hook restores state only when the page is ready and restores scroll on the next animation frame. Mutations may invalidate the saved view; refreshed data takes precedence.

Cross-lens history is intentionally not implemented. UpLink continues to target explicit parent hrefs, so a job opened from Today returns to the Jobs root rather than creating a cross-lens stack. Auth and utility flows do not preserve a hidden return stack. No server-side or Supabase UI state was added.

## Remaining verification (not a new phase)

- Continue a full modal inventory for custom dialogs and confirmation surfaces; retain custom controls when they represent explicit save/cancel choices or local mode navigation.
- Browser/device QA: focus order, screen-reader labels, scrim dismissal, Escape arbitration, scroll restoration, and 320–390px widths.

**Navigation program status: N0–N6 complete. Stop after N6 unless a concrete regression is found.**

# Dokkit Android

Native Android client for Dokkit (Kotlin + Jetpack Compose), sharing the
existing Supabase backend and account/data model with the web app. Not a
WebView, wrapper, or PWA — a real native client that feels native while
keeping Dokkit's design voice.

## How this relates to the web app

The web app (Next.js + Supabase) is the production/reference product and
must not be changed by Android work. The Android app is a separate,
self-contained project under `android/` that talks to the **same Supabase
project, same tables, same RLS policies**. Structural groundwork is done so
features can be lifted into Gradle modules later without rework.

| Thing | Where it lives (web) | Android equivalent |
| --- | --- | --- |
| Design tokens | `app/globals.css` (`:root`, `[data-theme="dark"]`) | `core/theme/Color.kt`, `Dimens.kt`, `Type.kt`, `Theme.kt` |
| Icons | `components/icons.tsx` | `core/icon/DokkitIcon.kt` |
| Schema | `supabase/schema.sql` | `domain/model/DokkitModels.kt` |
| Pure logic | `lib/timeFormat.ts` etc. | `util/TimeFormat.kt` (ported + tested) |
| Supabase client | `lib/supabaseClient.ts` | `data/remote/SupabaseFactory.kt` |

## Architecture

Single-activity Compose app, explicit manual dependency graph (no DI
framework yet):

```
com.dokkit.app/
├── DokkitApp.kt / MainActivity.kt / DokkitRoot.kt   entry + theme + nav gate
├── core/
│   ├── theme/            Dokkit tokens: colors, dims, type, Material3 bridge
│   └── icon/             DokkitIcons + DokkitIcon composable
├── navigation/           Today → Jobs → Travel shell
├── data/
│   ├── config/           DokkitConfig (from BuildConfig)
│   ├── remote/           SupabaseFactory (auth + postgrest plugins)
│   └── auth/             AuthRepository (single auth source of truth)
├── domain/
│   ├── model/            Task, Subtask, Meeting, TimeLog, UserSettings, Trip, …
│   └── repository/       TodayRepository, TravelRepository boundaries
├── ui/                   screens (today / jobs / travel / auth)
└── util/                 ported pure logic (TimeFormat)
```

The Material 3 library is used as the underlying component system only;
all real theming is driven by Dokkit tokens via `DokkitTheme`.

## Opening the project

1. Open `android/` (the directory containing `settings.gradle.kts`) in
   Android Studio as the project root.
2. Let Gradle sync. The project is self-contained — the web app is not
   involved in the build at all.

Requires Android Studio (with the Android SDK). The version catalog
(`gradle/libs.versions.toml`) pins AGP 8.13.0, Kotlin 2.2, Gradle 8.14.3,
and a current stable Compose BOM.

## Configuring local secrets

Copy the Supabase **public** credentials from the web app's `.env.local`
into `android/local.properties` (gitignored — never committed):

```properties
sdk.dir=/path/to/your/android-sdk
dokkit.supabase.url=https://YOURPROJECT.supabase.co
dokkit.supabase.anonKey=YOUR_ANON_KEY
dokkit.googleMapsApiKey=
```

`local.properties` is consumed at build time and the values are baked into
`BuildConfig` for `data/config/DokkitConfig.kt`.

Only public keys ever live here — this is the exact parity the browser has
with the anon key. **Never** put any of these in the Android project or
repo:
- `SUPABASE_SERVICE_ROLE_KEY`
- `GOOGLE_MAPS_API_KEY` (server-side Google Maps key)
- `VAPID_PRIVATE_KEY`
- `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`
- `CRON_CHECK_SECRET`

Anything the app needs that requires those secrets goes through the web
app's existing authenticated API routes (`/api/travel/*`, `/api/today/*`),
which already verify the caller's Bearer token and rate-limit server-side.

Without values set, the app still builds and runs; the Supabase client is
just unconfigured until real credentials are added.

## What is implemented (this stage: foundation)

- Buildable Android project (Kotlin, Compose, version catalog, self-contained)
- Dokkit design system: full light/dark token pair, spacing/radius/type
  scale, mono, System/Light/Dark theme. Dark mode follows the web
  philosophy — accents stay saturated, washes/text-variants change, and
  text over `paperRaised` always uses the contrasting ink (the web's
  white-on-white bug is structurally impossible here).
- Icon foundation: `DokkitIcons` vectors + `DokkitIcon` composable for the
  icons the product actually uses (check, play/stop, fit/warn, back, plus,
  close, trash, bed, chevron, map pin, refresh, compass, lock, gear,
  today/jobs/travel nav marks).
- Navigation shell: restrained native bottom bar, **Today → Jobs →
  Travel**, with Jobs a deliberate placeholder. Feature screens are plain
  empty shells awaiting their stages.
- Data foundation: `DokkitConfig`, `SupabaseFactory` (auth + postgrest),
  `AuthRepository` + `AuthViewModel` state model (session stream → signed
  in/out), and all domain models + repository boundaries.
- Unit tests: `TimeFormatTest` (ports lib/timeFormat.ts behaviour) and
  `ModelMappingTest` (snake_case → camelCase wire mapping).

## What is intentionally deferred

- Full Today UI and its ported sort/route logic (`taskSort`, `todayRoute`,
  `taskIntelligence` ports with behaviour-pinned tests)
- Jobs feature (entirely — not designed yet)
- Travel UI and its logic ports (`travelSort`, calculate-day, nearby)
- Full auth *experience* (the alphabetical email/password/magic-link/Google
  screens) — only the layer/state model exists
- Push notifications / FCM (needs the web app's `check-task-timers` cron
  to gain an FCM branch and possibly a small additive schema table)
- Local cache (Room) — data access is staged behind repository interfaces
- Native maps (the Maps SDK key slot is reserved; geocoding/routing stays
  server-side for now)
- Signing / release pipeline

## Building & testing

```bash
cd android
./gradlew :app:assembleDebug   # compile
./gradlew :app:testDebugUnitTest  # unit tests
```
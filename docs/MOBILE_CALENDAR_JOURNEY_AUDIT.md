# Mobile web calendar journey — source audit and recovery

## Status

The existing Microsoft Calendar integration is now exposed in Preferences for accounts with the calendar entitlement. The source-level path is complete through connect, calendar selection, immediate sync, Today capacity input, disconnect, and manual sync retry.

**Live OAuth acceptance is still required.** CI can verify the route/build contract but cannot prove that the production Microsoft app registration accepts the production callback URL or that a real user's calendar grants the expected scopes.

## Confirmed gaps before this change

- The Preferences calendar panel was hidden by `CALENDAR_CONNECT_ENABLED = false`.
- OAuth callback seeded the calendar list but did not fetch events. The user-facing message promised commitments within minutes, while the configured background sync cadence is every four hours.
- Changing a calendar's selected state persisted the preference but did not trigger an immediate sync. Re-selecting a calendar could leave its events cancelled until the next background run.
- The sync throttle could suppress an explicit first/selection sync if a connection had synced recently.
- Calendar-list loading failures were silent, and disconnect UI reported success even if the disconnect request failed.
- There was no direct user action to retry a failed sync.

## Changes in this slice

- Added a tested sync-throttle policy with an explicit force option for user-initiated syncs.
- OAuth callback now attempts an immediate forced event sync after calendar discovery. A sync failure keeps the connection and returns a distinct status message; the background job can retry.
- Calendar selection saves first, then attempts an immediate forced sync. If syncing fails, the selected state remains visible and the UI reports the failure rather than pretending the sync succeeded.
- Added a user-authenticated, entitlement-gated, rate-limited sync-now endpoint. It lists connections only for the authenticated user, retries each Microsoft connection, and updates per-connection sync status.
- Added a Retry calendar sync action for failed syncs.
- Calendar list and disconnect failures now produce explicit feedback.
- Enabled the existing Preferences panel for eligible accounts and show a plan link for accounts without calendar entitlement.
- The Today capacity integration and read-only permission scope remain unchanged. OAuth tokens are not returned by the calendar APIs.

## Security and data boundaries

- User-triggered sync requires authentication, the calendar entitlement, and rate limiting.
- Calendar connections used by the retry endpoint are queried by `user_id`; the selection path looks up the connection with both connection ID and user ID.
- Sync errors stored in the database are bounded to the first line and 300 characters. API responses use user-safe summaries.
- The feature remains read-only against Microsoft Calendar; Dokkit does not create or edit provider events.

## Validation

- Unit tests cover first sync, the five-minute background throttle, expiry of the throttle, forced sync, and malformed timestamps.
- The production environment has the required Microsoft OAuth and cron variable names configured. Values were not inspected.
- Preview deployments do not have the Microsoft/cron environment variables, so OAuth cannot be fully tested on the preview project.
- After deployment, complete a real-account acceptance check in production: connect Microsoft, confirm selected calendars appear, confirm today's events affect Today capacity immediately, deselect/reselect a calendar, force Retry after a controlled sync error if available, then disconnect and confirm external commitments no longer count.

## Remaining limitation

A source audit cannot verify the Microsoft Entra app registration's redirect URI or the actual granted permissions. Do not mark the live calendar journey fully accepted until the production OAuth round trip and first sync have been observed with a test account.

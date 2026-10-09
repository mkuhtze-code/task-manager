# Run Phase K from the browser (no local setup)

This workflow lets a repository maintainer run the Phase K live Supabase test from GitHub Actions. It does not require a local checkout or terminal.

## 1. Prepare two dedicated test accounts

In the Supabase Dashboard for the Dokkit project:

1. Open **Authentication → Users**.
2. Create two dedicated test users with email/password credentials (for example, separate test addresses you control). Do not use a personal or customer account.
3. Sign in to the Dokkit app once as each test user so each has a `public.user_settings` row.
4. Keep the email addresses and passwords for the next step.

The test temporarily changes two engine-context fields on test user A's `user_settings` row and restores their original values in a `finally` block. It does not create or edit tasks in the production task table. Use test accounts only.

## 2. Add six repository Actions secrets

In GitHub, open **Settings → Secrets and variables → Actions → New repository secret** for this repository. Add these exact names, one at a time:

| Secret name | Value |
| --- | --- |
| `PHASE_K_SUPABASE_URL` | Project URL from Supabase → Project Settings → API |
| `PHASE_K_SUPABASE_ANON_KEY` | The project's publishable/anon key from Supabase → Project Settings → API Keys |
| `PHASE_K_USER_A_EMAIL` | Email for test user A |
| `PHASE_K_USER_A_PASSWORD` | Password for test user A |
| `PHASE_K_USER_B_EMAIL` | Email for test user B |
| `PHASE_K_USER_B_PASSWORD` | Password for test user B |

Use the publishable/anon key only. **Never add the service-role key.** Do not paste any passwords or keys into issues, pull requests, chat, or workflow files. GitHub Actions secrets are supplied to the test as environment variables and are not printed by this workflow.

## 3. Run the test

After this workflow is merged to `main`:

1. Open the repository's **Actions** tab.
2. Select **Phase K Live Supabase Context Test**.
3. Click **Run workflow**, leave the branch as `main`, and click the green **Run workflow** button.
4. Open the new run and wait for the job to finish.

A green run means the test passed against the configured Supabase project's real authenticated Data API, including account-isolation checks and follow-up resolution. A red run means the logs should be reviewed; share the failure text, but never share secret values.

## Safety and limitations

- This workflow is manual-only; it does not run on every push or pull request.
- It has read-only repository permissions and does not use a service-role key.
- The test restores test user A's original engine context. If restoration fails, it reports a critical failure.
- The test checks context persistence and account isolation; it does not prove every live task-creation path or speech-recognition accuracy.

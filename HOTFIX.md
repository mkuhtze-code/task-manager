# React #310 hotfix

`useDesktopWorkspaceKeys` must run on every render, before any `if (!session)` / onboarding early return.

Replace `app/page.tsx` with the fixed file from the chat artifact `page-fixed-hooks.tsx`.

Do not leave the hook call after those early returns.

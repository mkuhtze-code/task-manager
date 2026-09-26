[asset-inventory.md](https://github.com/user-attachments/files/32687566/asset-inventory.md)

# Asset inventory

| Asset | Type | Owner | Notes |
|-------|------|-------|-------|
| github.com/mkuhtze-code/task-manager | Code | Operator | Main app |
| github.com/mkuhtze-code/dokkit-site | Code | Operator | Marketing |
| dokkit.space | Domain / site | Operator | Public marketing |
| dokkit.space/app (or app host) | Application | Operator | Next.js on Vercel |
| Supabase project | Database + Auth + Storage | Operator | Primary data plane |
| Vercel project(s) | Hosting | Operator | App + site |
| Stripe account | Payments | Operator | USD $6/mo Dokkit plan |
| Firebase (if enabled) | Push | Operator | Notifications |
| Microsoft Entra app | OAuth | Operator | Calendar |
| Google Cloud OAuth / Maps | OAuth / APIs | Operator | Sign-in, Places |
| support@dokkit.space | Support mailbox | Operator | Privacy + billing support |
| Admin UI `/admin` | Application | Operator | Business / Users / Production |

## Data classes

| Class | Examples | Sensitivity |
|-------|----------|-------------|
| Account | email, auth ids, tier | Medium |
| User content | tasks, jobs, meetings, travel | High |
| Media | photos, PDFs in Storage | High |
| Billing linkage | stripe customer/sub ids, status | Medium |
| Calendar tokens | OAuth refresh tokens | High |
| Ops logs | error_logs (sanitized) | Low–Medium |

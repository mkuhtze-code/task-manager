// Central Admin navigation definition. One source of truth for:
//  * the persistent sidebar groups/items
//  * the not-yet-implemented fallback page (app/admin/[section])
//
// `implemented` means a real page exists. Everything else routes to a
// clearly-labelled "Not yet implemented" state so navigation never
// dead-ends while the shell stays ready for future pages.

export type AdminNavItem = {
  slug: string;
  title: string;
  href: string;
  implemented: boolean;
  description: string;
};

export type AdminNavGroup = {
  group: string;
  items: AdminNavItem[];
};

export const ADMIN_NAV: AdminNavGroup[] = [
  {
    group: 'Command',
    items: [
      { slug: 'overview', title: 'Overview', href: '/admin', implemented: true, description: 'Command centre for the whole system.' },
      { slug: 'activity', title: 'Activity', href: '/admin/activity', implemented: true, description: 'A chronological system activity stream across Dokkit.' },
      { slug: 'alerts', title: 'Alerts', href: '/admin/alerts', implemented: true, description: 'System attention signals (counts and status only).' },
    ],
  },
  {
    group: 'Accounts',
    items: [
      { slug: 'users', title: 'Users', href: '/admin/users', implemented: true, description: 'User accounts, tiers and account status controls.' },
      { slug: 'sessions', title: 'Sessions', href: '/admin/sessions', implemented: true, description: 'Session policy — live device lists withheld for privacy.' },
      { slug: 'support', title: 'Support', href: '/admin/support', implemented: true, description: 'Support queue via Feedback counts.' },
    ],
  },
  {
    group: 'Product',
    items: [
      { slug: 'usage', title: 'Usage', href: '/admin/usage', implemented: true, description: 'Cross-product usage aggregates.' },
      { slug: 'today', title: 'Today', href: '/admin/today', implemented: true, description: 'Today surface activity counts.' },
      { slug: 'jobs', title: 'Jobs', href: '/admin/jobs', implemented: true, description: 'Jobs surface metrics (no names or clients).' },
      { slug: 'meetings', title: 'Meetings', href: '/admin/meetings', implemented: true, description: 'Meetings and evidence counts only.' },
      { slug: 'travel', title: 'Travel', href: '/admin/travel', implemented: true, description: 'Trip and activity counts only.' },
      { slug: 'thinking', title: 'Thinking', href: '/admin/thinking', implemented: true, description: 'Estimate accuracy aggregates.' },
      { slug: 'patterns', title: 'Patterns', href: '/admin/patterns', implemented: true, description: 'System-level pattern evidence only.' },
    ],
  },
  {
    group: 'System',
    items: [
      { slug: 'errors', title: 'Errors', href: '/admin/errors', implemented: true, description: 'Server and client error log.' },
      { slug: 'database', title: 'Database', href: '/admin/database', implemented: true, description: 'Database reachability — no table browser.' },
      { slug: 'integrations', title: 'Integrations', href: '/admin/integrations', implemented: true, description: 'External integration status (no emails or tokens).' },
      { slug: 'notifications', title: 'Notifications', href: '/admin/notifications', implemented: true, description: 'Push configuration and subscription counts.' },
      { slug: 'infrastructure', title: 'Infrastructure', href: '/admin/infrastructure', implemented: true, description: 'Platform status signals.' },
    ],
  },
  {
    group: 'Business',
    items: [
      { slug: 'stripe', title: 'Stripe', href: '/admin/stripe', implemented: true, description: 'Stripe connection status.' },
      { slug: 'subscriptions', title: 'Subscriptions', href: '/admin/subscriptions', implemented: true, description: 'Subscription lifecycle (not wired).' },
      { slug: 'trials', title: 'Trials', href: '/admin/trials', implemented: true, description: 'Trial tracking (not wired).' },
      { slug: 'revenue', title: 'Revenue', href: '/admin/revenue', implemented: true, description: 'Revenue reporting (not wired).' },
    ],
  },
  {
    group: 'Communication',
    items: [
      { slug: 'feedback', title: 'Feedback', href: '/admin/feedback', implemented: true, description: 'User feedback inbox and threads.' },
      { slug: 'support', title: 'Support', href: '/admin/support', implemented: true, description: 'Support queue via Feedback.' },
      { slug: 'announcements', title: 'Announcements', href: '/admin/announcements', implemented: true, description: 'In-app announcements (not available).' },
    ],
  },
  {
    group: 'Security',
    items: [
      {
        slug: 'admin-access',
        title: 'Admin Access',
        href: '/admin/admin-access',
        implemented: true,
        description: 'Who holds administrator membership (read-only; grant/revoke via SQL).',
      },
      {
        slug: 'audit-log',
        title: 'Audit Log',
        href: '/admin/audit-log',
        implemented: true,
        description: 'Administrative action audit trail — who did what, when.',
      },
      { slug: 'oauth', title: 'OAuth', href: '/admin/oauth', implemented: true, description: 'OAuth policy — tokens never displayed.' },
    ],
  },
  {
    group: 'Configuration',
    items: [
      { slug: 'feature-flags', title: 'Feature Flags', href: '/admin/feature-flags', implemented: true, description: 'Feature flags (no store yet).' },
      { slug: 'system-settings', title: 'System Settings', href: '/admin/system-settings', implemented: true, description: 'Global settings policy — secrets stay in env.' },
    ],
  },
];

export function findAdminSection(slug: string): { group: string; item: AdminNavItem } | null {
  for (const group of ADMIN_NAV) {
    const item = group.items.find((i) => i.slug === slug);
    if (item) return { group: group.group, item };
  }
  return null;
}

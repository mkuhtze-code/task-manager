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
      { slug: 'activity', title: 'Activity', href: '/admin/activity', implemented: false, description: 'A chronological system activity stream across Dokkit.' },
      { slug: 'alerts', title: 'Alerts', href: '/admin/alerts', implemented: false, description: 'System alerts, thresholds and notification rules.' },
    ],
  },
  {
    group: 'Accounts',
    items: [
      { slug: 'users', title: 'Users', href: '/admin/users', implemented: true, description: 'User accounts, tiers and account status controls.' },
      { slug: 'sessions', title: 'Sessions', href: '/admin/sessions', implemented: false, description: 'Active sessions and sign-in activity.' },
      { slug: 'support', title: 'Support', href: '/admin/support', implemented: false, description: 'Support queue and conversation handling.' },
    ],
  },
  {
    group: 'Product',
    items: [
      { slug: 'usage', title: 'Usage', href: '/admin/usage', implemented: false, description: 'Cross-product usage analytics.' },
      { slug: 'today', title: 'Today', href: '/admin/today', implemented: false, description: 'Today surface activity and completion metrics.' },
      { slug: 'jobs', title: 'Jobs', href: '/admin/jobs', implemented: false, description: 'Jobs surface metrics.' },
      { slug: 'meetings', title: 'Meetings', href: '/admin/meetings', implemented: false, description: 'Meetings, observations, decisions and actions.' },
      { slug: 'travel', title: 'Travel', href: '/admin/travel', implemented: false, description: 'Trips, activities and accommodation usage.' },
      { slug: 'thinking', title: 'Thinking', href: '/admin/thinking', implemented: false, description: 'Thinking-engine estimation evidence.' },
      { slug: 'patterns', title: 'Patterns', href: '/admin/patterns', implemented: false, description: 'Learned task patterns and estimate calibration.' },
    ],
  },
  {
    group: 'System',
    items: [
      { slug: 'errors', title: 'Errors', href: '/admin/errors', implemented: true, description: 'Server and client error log.' },
      { slug: 'database', title: 'Database', href: '/admin/database', implemented: false, description: 'Schema, sizes and database health.' },
      { slug: 'integrations', title: 'Integrations', href: '/admin/integrations', implemented: false, description: 'External integrations (calendar, provider status).' },
      { slug: 'notifications', title: 'Notifications', href: '/admin/notifications', implemented: false, description: 'Push notification delivery.' },
      { slug: 'infrastructure', title: 'Infrastructure', href: '/admin/infrastructure', implemented: false, description: 'Deployment platform and infrastructure status.' },
    ],
  },
  {
    group: 'Business',
    items: [
      { slug: 'stripe', title: 'Stripe', href: '/admin/stripe', implemented: false, description: 'Stripe connection and payment metrics.' },
      { slug: 'subscriptions', title: 'Subscriptions', href: '/admin/subscriptions', implemented: false, description: 'Subscription management and lifecycle.' },
      { slug: 'trials', title: 'Trials', href: '/admin/trials', implemented: false, description: 'Trial tracking and conversions.' },
      { slug: 'revenue', title: 'Revenue', href: '/admin/revenue', implemented: false, description: 'Revenue reporting.' },
    ],
  },
  {
    group: 'Communication',
    items: [
      { slug: 'feedback', title: 'Feedback', href: '/admin/feedback', implemented: true, description: 'User feedback inbox and threads.' },
      { slug: 'support', title: 'Support', href: '/admin/support', implemented: false, description: 'Support queue and escalation.' },
      { slug: 'announcements', title: 'Announcements', href: '/admin/announcements', implemented: false, description: 'User-facing announcements.' },
    ],
  },
  {
    group: 'Security',
    items: [
      { slug: 'admin-access', title: 'Admin Access', href: '/admin/admin-access', implemented: false, description: 'Administrator membership management.' },
      { slug: 'audit-log', title: 'Audit Log', href: '/admin/audit-log', implemented: false, description: 'Administrative action audit trail.' },
      { slug: 'oauth', title: 'OAuth', href: '/admin/oauth', implemented: false, description: 'OAuth applications and grants.' },
    ],
  },
  {
    group: 'Configuration',
    items: [
      { slug: 'feature-flags', title: 'Feature Flags', href: '/admin/feature-flags', implemented: false, description: 'Feature flag management.' },
      { slug: 'system-settings', title: 'System Settings', href: '/admin/system-settings', implemented: false, description: 'Global system configuration.' },
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
// Admin navigation — three pillars for a production SaaS console.
// Business is primary. Users and Production are operational depth.
// `implemented` means a real page exists (never dead-end navigation).

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
    group: 'Business',
    items: [
      {
        slug: 'overview',
        title: 'Overview',
        href: '/admin',
        implemented: true,
        description: 'Business command centre — revenue posture, subscribers, attention.',
      },
      {
        slug: 'revenue',
        title: 'Revenue',
        href: '/admin/revenue',
        implemented: true,
        description: 'Subscription revenue signals from Dokkit billing records and Stripe.',
      },
      {
        slug: 'subscriptions',
        title: 'Subscriptions',
        href: '/admin/subscriptions',
        implemented: true,
        description: 'Live subscription status counts (no card data).',
      },
      {
        slug: 'stripe',
        title: 'Stripe',
        href: '/admin/stripe',
        implemented: true,
        description: 'Payment infrastructure status and configuration posture.',
      },
      {
        slug: 'trials',
        title: 'Trials',
        href: '/admin/trials',
        implemented: true,
        description: 'Trialing subscriptions and conversion posture.',
      },
    ],
  },
  {
    group: 'Users',
    items: [
      {
        slug: 'users',
        title: 'Accounts',
        href: '/admin/users',
        implemented: true,
        description: 'User accounts, tiers, and account status controls.',
      },
      {
        slug: 'activity',
        title: 'Activity',
        href: '/admin/activity',
        implemented: true,
        description: 'Chronological system activity stream.',
      },
      {
        slug: 'feedback',
        title: 'Feedback',
        href: '/admin/feedback',
        implemented: true,
        description: 'User feedback inbox and threads.',
      },
      {
        slug: 'support',
        title: 'Support',
        href: '/admin/support',
        implemented: true,
        description: 'Support queue via Feedback.',
      },
      {
        slug: 'sessions',
        title: 'Sessions',
        href: '/admin/sessions',
        implemented: true,
        description: 'Session policy — live device lists withheld for privacy.',
      },
      {
        slug: 'admin-access',
        title: 'Admin access',
        href: '/admin/admin-access',
        implemented: true,
        description: 'Who holds administrator membership.',
      },
      {
        slug: 'audit-log',
        title: 'Audit log',
        href: '/admin/audit-log',
        implemented: true,
        description: 'Administrative action audit trail.',
      },
    ],
  },
  {
    group: 'Production',
    items: [
      {
        slug: 'alerts',
        title: 'Alerts',
        href: '/admin/alerts',
        implemented: true,
        description: 'System attention signals.',
      },
      {
        slug: 'errors',
        title: 'Errors',
        href: '/admin/errors',
        implemented: true,
        description: 'Error log and unresolved issues.',
      },
      {
        slug: 'usage',
        title: 'Usage',
        href: '/admin/usage',
        implemented: true,
        description: 'Cross-product usage aggregates.',
      },
      {
        slug: 'today',
        title: 'Today',
        href: '/admin/today',
        implemented: true,
        description: 'Today surface activity counts.',
      },
      {
        slug: 'jobs',
        title: 'Jobs',
        href: '/admin/jobs',
        implemented: true,
        description: 'Jobs surface metrics (no names or clients).',
      },
      {
        slug: 'meetings',
        title: 'Meetings',
        href: '/admin/meetings',
        implemented: true,
        description: 'Meetings counts only.',
      },
      {
        slug: 'travel',
        title: 'Travel',
        href: '/admin/travel',
        implemented: true,
        description: 'Trip counts only.',
      },
      {
        slug: 'thinking',
        title: 'Thinking',
        href: '/admin/thinking',
        implemented: true,
        description: 'Estimate accuracy aggregates.',
      },
      {
        slug: 'patterns',
        title: 'Patterns',
        href: '/admin/patterns',
        implemented: true,
        description: 'Pattern-related aggregates.',
      },
      {
        slug: 'infrastructure',
        title: 'Infrastructure',
        href: '/admin/infrastructure',
        implemented: true,
        description: 'Deployment and dependency posture.',
      },
      {
        slug: 'database',
        title: 'Database',
        href: '/admin/database',
        implemented: true,
        description: 'Database connectivity posture.',
      },
      {
        slug: 'integrations',
        title: 'Integrations',
        href: '/admin/integrations',
        implemented: true,
        description: 'External integration status.',
      },
      {
        slug: 'oauth',
        title: 'OAuth',
        href: '/admin/oauth',
        implemented: true,
        description: 'OAuth policy — tokens never displayed.',
      },
      {
        slug: 'notifications',
        title: 'Notifications',
        href: '/admin/notifications',
        implemented: true,
        description: 'Push / FCM posture.',
      },
      {
        slug: 'feature-flags',
        title: 'Feature flags',
        href: '/admin/feature-flags',
        implemented: true,
        description: 'Feature flag policy.',
      },
      {
        slug: 'system-settings',
        title: 'System settings',
        href: '/admin/system-settings',
        implemented: true,
        description: 'Global settings policy — secrets stay in env.',
      },
      {
        slug: 'announcements',
        title: 'Announcements',
        href: '/admin/announcements',
        implemented: true,
        description: 'In-app announcements posture.',
      },
    ],
  },
];

export function findAdminSection(
  slug: string
): { group: string; item: AdminNavItem } | null {
  for (const group of ADMIN_NAV) {
    const item = group.items.find((i) => i.slug === slug);
    if (item) return { group: group.group, item };
  }
  return null;
}

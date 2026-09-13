// Shared types for the Admin Overview payload. These are plain data
// shapes — safe to import from both the server-side Admin API route and
// the client components that render the dashboard. All sensitive data
// flows from the server through the Admin API boundary; the client never
// queries user tables directly for overview data.

export type SystemState = 'operational' | 'warning' | 'error' | 'not_configured' | 'not_monitored';
export type Severity = 'critical' | 'warning' | 'info';
export type DeltaDirection = 'up' | 'down' | 'flat';

// A single headline number. A delta is only present when the current
// database can actually compute a comparable previous period — trends
// are never manufactured.
export type OverviewMetric = {
  key: string;
  label: string;
  value: number | null;
  display: string;
  href?: string;
  state?: 'normal' | 'attention' | 'critical';
  note?: string;
  deltaLabel?: string;
  deltaDirection?: DeltaDirection;
  deltaGoodWhen?: 'up' | 'down';
};

export type ChartSeries = { date: string; value: number };

export type AttentionItem = {
  severity: Severity;
  title: string;
  detail: string;
  href: string;
};

export type ActivityEvent = {
  id: string;
  type:
    | 'account'
    | 'account_status'
    | 'feedback'
    | 'feedback_reply'
    | 'error'
    | 'task_created'
    | 'task_completed'
    | 'job_created'
    | 'meeting_created'
    | 'trip_created';
  title: string;
  detail?: string;
  timestamp: string;
  href?: string;
};

export type FeedbackOverviewItem = {
  id: string;
  label: string;
  message: string;
  pageContext: string | null;
  numberOfReplies: number;
  createdAt: string;
};

export type InfrastructureItem = {
  key: string;
  label: string;
  state: SystemState;
  detail: string;
  href?: string;
};

export type ProductAreaSummary = {
  key: 'today' | 'jobs' | 'meetings' | 'travel' | 'thinking' | 'patterns';
  name: string;
  href: string;
  headline: string;
  headlineLabel: string;
  metrics: OverviewMetric[];
  note?: string;
};

export type OverviewPayload = {
  generatedAt: string;
  overall: 'operational' | 'attention' | 'critical';
  overallLabel: string;
  overallDetail: string;

  topMetrics: OverviewMetric[];

  signups: { series: ChartSeries[]; seriesLabel: string };
  errorsByDay: { series: ChartSeries[]; seriesLabel: string };

  accounts: {
    total: number;
    active: number;
    terminated: number;
    notOnboarded: number;
    byTier: { trusted_tester: number; free: number; premium: number };
    newUsers7d: number;
    newUsersPrev7d: number;
    newUsers30d: number;
    activeUsers7d: number;
    recent: { id: string; email: string | null; createdAt: string }[];
    recentChanges: { id: string; email: string | null; status: string; updatedAt: string }[];
  };

  productAreas: ProductAreaSummary[];
  surfaces: { today: number; jobs: number; travel: number };

  system: { components: InfrastructureItem[] };
  attention: AttentionItem[];
  activity: ActivityEvent[];
  feedback: {
    total: number;
    open: number;
    replied: number;
    recent: FeedbackOverviewItem[];
  };
  business: {
    stripe: { state: SystemState; detail: string; href: string };
    planned: string[];
  };
  infrastructure: InfrastructureItem[];
  limitations: string[];
};
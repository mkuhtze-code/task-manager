export type CalendarProvider = 'microsoft' | 'google';

export type ExternalCommitmentStatus = 'confirmed' | 'tentative' | 'cancelled';

export interface ExternalCalendarEvent {
  id: string;
  provider: CalendarProvider;
  providerAccountId: string;
  calendarId: string | null;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  location: string | null;
  description: string | null;
  status: ExternalCommitmentStatus;
  sourceUrl: string | null;
  lastModified: string | null;
}

export interface ExternalCalendar {
  id: string;
  connectionId: string;
  userId: string;
  provider: CalendarProvider;
  providerCalendarId: string;
  name: string;
  isDefault: boolean;
  selected: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ExternalConnection {
  id: string;
  userId: string;
  provider: CalendarProvider;
  providerAccountId: string;
  connectedEmail: string | null;
  accessToken: string | null;
  refreshToken: string | null;
  expiresAt: string | null;
  scopes: string | null;
  lastSyncAt: string | null;
  syncStatus: 'ok' | 'error';
  syncError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SyncWindow {
  startUtc: string;
  endUtc: string;
}

export interface SyncResult {
  connectionId: string;
  eventsUpserted: number;
  eventsCancelled: number;
  fetchedAt: string;
}

export interface CommitmentInterval {
  start: Date;
  end: Date;
}
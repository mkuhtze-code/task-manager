// Pure ownership guard for calendar selection. Every route that reads or
// writes external_calendars enforces connection ownership via these helpers
// on top of the store's user-scoped queries, so one user can never read or
// alter another user's calendar selections.
export function ownsExternalCalendar(
  row: { user_id: string },
  userId: string
): boolean {
  return row.user_id === userId;
}

export function assertOwnsExternalCalendar(
  row: { user_id: string },
  userId: string
): void {
  if (!ownsExternalCalendar(row, userId)) {
    throw new Error('Calendar does not belong to this account');
  }
}
export function toSessionDto(row) {
  if (row === null) return null;

  return {
    sessionId: row.session_id,
    status: row.status,
    lastIssuedNumber: row.last_issued_number,
    openedAt: new Date(row.opened_at).toISOString(),
    stoppedAt: row.stopped_at === null ? null : new Date(row.stopped_at).toISOString(),
    closedAt: row.closed_at === null ? null : new Date(row.closed_at).toISOString(),
  };
}

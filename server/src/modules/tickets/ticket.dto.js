const iso = (value) => (value === null ? null : new Date(value).toISOString());

// Ticket DTO of contract v1.0: exactly eight fields. issued_by_user_id and request_id stay internal.
export function toTicketDto(row) {
  return {
    ticketId: row.ticket_id,
    sessionId: row.session_id,
    patientId: row.patient_id,
    number: row.number,
    status: row.status,
    lastCalledAt: iso(row.last_called_at),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

// TicketView of contract v1.0: { ticket, waitingAhead }. waitingAhead is null unless WAITING.
export function toTicketView(row) {
  return {
    ticket: toTicketDto(row),
    waitingAhead: row.status === 'WAITING' ? row.waiting_ahead : null,
  };
}

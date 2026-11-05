const validNumber = (value) => Number.isSafeInteger(value) && value > 0;

export function toPublicBoardDto(row) {
  if (!row || !Array.isArray(row.waiting_numbers) || !row.waiting_numbers.every(validNumber)) {
    throw new TypeError('Invalid public board snapshot.');
  }
  const current = row.current_ticket;
  if (current !== null && (!current || !validNumber(current.number)
      || !['CALLED', 'REGISTERING'].includes(current.status))) {
    throw new TypeError('Invalid current public ticket.');
  }
  // Explicit allowlist at both levels; never spread a Ticket/PatientProfile DTO.
  return {
    currentTicket: current === null ? null : { number: current.number, status: current.status },
    waitingNumbers: [...row.waiting_numbers],
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

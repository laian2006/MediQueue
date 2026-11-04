export class TicketError extends Error {
  constructor(statusCode, code, message, details) {
    super(message);
    this.name = 'TicketError';
    this.statusCode = statusCode;
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

export class QueueError extends Error {
  constructor(statusCode, code, message, details) {
    super(message);

    this.name = 'QueueError';
    this.statusCode = statusCode;
    this.code = code;

    if (details !== undefined) {
      this.details = details;
    }
  }
}
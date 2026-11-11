export class QueueError extends Error {
  constructor(statusCode, code, message) {
    super(message);
    this.name = 'QueueError';
    this.statusCode = statusCode;
    this.code = code;
  }
}
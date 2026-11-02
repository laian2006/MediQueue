export class SessionError extends Error {
  constructor(statusCode, code, message) {
    super(message);
    this.name = 'SessionError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

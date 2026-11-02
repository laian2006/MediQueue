export class PatientError extends Error {
  constructor(statusCode, code, message) {
    super(message);
    this.name = 'PatientError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

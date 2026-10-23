/**
 * Application-specific error class that carries an HTTP status code and an
 * operational flag so the error middleware can distinguish expected client
 * errors (404, 422) from unexpected server faults (500).
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;

  constructor(message: string, statusCode: number, isOperational = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;

    // Maintain a correct prototype chain so `instanceof` checks work after TS compilation.
    Object.setPrototypeOf(this, new.target.prototype);
    Error.captureStackTrace(this, this.constructor);
  }
}

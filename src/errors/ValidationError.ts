/**
 * Domain-specific error for request-boundary validation failures.
 *
 * Routes throw this when incoming data violates the endpoint's input contract
 * (e.g. a missing or malformed email on `POST /signup`). Handlers catch it and
 * translate it into a 400 response — it represents a client error, never a
 * server fault, so it must NOT reach the app-level `onError` handler (which
 * captures to Sentry and returns 500).
 */
export class ValidationError extends Error {
  readonly field: string | undefined;

  constructor(message: string, field?: string) {
    super(message);
    this.name = "ValidationError";
    this.field = field;
  }
}

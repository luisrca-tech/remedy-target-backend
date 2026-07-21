/**
 * Renders an error with its cause chain.
 *
 * Database drivers routinely wrap the useful message — the query builder
 * reports "Failed query: insert into ..." and hangs the actual reason
 * ("column X does not exist") off `cause`. Printing only the top-level message
 * throws away the one line that explains the failure.
 */
export function describeError(err: unknown): string {
  if (!(err instanceof Error)) {
    return String(err);
  }

  const parts = [err.message];
  let cause: unknown = err.cause;
  while (cause instanceof Error) {
    parts.push(`caused by: ${cause.message}`);
    cause = cause.cause;
  }
  return parts.join("\n  ");
}

/**
 * Reads a JSON response as the shape the endpoint documents. Callers name the
 * type, so a test fails to compile when a response shape drifts.
 */
export async function jsonBody<T>(res: Response): Promise<T> {
  return (await res.json()) as T;
}

export type ErrorBody = {
  error: string;
  field?: string;
};

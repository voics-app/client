/** The one-line text shown for a failed command (offline, an API error message, or a generic fallback). */
import { ApiError } from '../infrastructure/http/httpClient';

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.status === 0 ? 'You appear to be offline.' : error.message;
  return error instanceof Error ? error.message : 'Something went wrong.';
}

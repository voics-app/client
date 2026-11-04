import { describe, expect, it } from 'vitest';
import { errorMessage } from '../../src/application/errorMessage';
import { ApiError } from '../../src/infrastructure/http/httpClient';

describe('errorMessage', () => {
  it('says offline for a status 0 API error', () => {
    expect(errorMessage(new ApiError(0, 0, 'fetch failed'))).toBe('You appear to be offline.');
  });

  it('uses the API error message', () => {
    expect(errorMessage(new ApiError(400, 50035, 'Invalid form body'))).toBe('Invalid form body');
  });

  it('falls back to the Error message and then a generic text', () => {
    expect(errorMessage(new Error('boom'))).toBe('boom');
    expect(errorMessage('x')).toBe('Something went wrong.');
  });
});

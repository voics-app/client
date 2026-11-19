import { describe, expect, it } from 'vitest';
import { shouldRegisterProtocol } from '../../../src/main/protocolRegistration';

describe('protocol registration', () => {
  it('registers packaged builds regardless of the development override', () => {
    expect(shouldRegisterProtocol(true, undefined)).toBe(true);
    expect(shouldRegisterProtocol(true, '0')).toBe(true);
  });

  it('leaves the installed association alone in development unless explicitly enabled', () => {
    expect(shouldRegisterProtocol(false, undefined)).toBe(false);
    expect(shouldRegisterProtocol(false, '0')).toBe(false);
    expect(shouldRegisterProtocol(false, '1')).toBe(true);
  });
});

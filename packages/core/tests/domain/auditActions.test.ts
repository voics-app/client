import { describe, expect, it } from 'vitest';
import { AUDIT_ACTIONS } from '../../src/domain/auditActions';

// Every code the api writes (crates/domain/src/audit.rs); a missing one reads "performed action 26".
const API_CODES = [1, 10, 11, 12, 13, 14, 15, 20, 21, 22, 23, 24, 25, 26, 27, 28, 30, 31, 32, 40, 42, 50, 51, 52, 60, 61, 62, 110, 111, 112];

describe('AUDIT_ACTIONS', () => {
  it('has wording for every action the api records', () => {
    expect(API_CODES.filter((code) => !AUDIT_ACTIONS[code])).toEqual([]);
  });
});

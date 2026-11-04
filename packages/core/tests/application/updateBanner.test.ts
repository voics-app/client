import { describe, expect, it } from 'vitest';
import { bannerFor } from '../../src/application/stores/updateStore';

describe('update banner model', () => {
  it('maps statuses', () => {
    expect(bannerFor({ state: 'idle' }, null)).toBeNull();
    expect(bannerFor({ state: 'not-available' }, null)).toBeNull();
    expect(bannerFor({ state: 'available', version: '2' }, null)).toEqual({ kind: 'available', version: '2' });
    expect(bannerFor({ state: 'downloading', percent: 5 }, null)).toEqual({ kind: 'downloading', percent: 5 });
    expect(bannerFor({ state: 'downloaded', version: '2', notes: 'n' }, null)).toEqual({ kind: 'ready', version: '2', notes: 'n' });
  });
  it('stays dismissed for that version only', () => {
    expect(bannerFor({ state: 'downloaded', version: '2' }, '2')).toBeNull();
    expect(bannerFor({ state: 'downloaded', version: '3' }, '2')).not.toBeNull();
  });
});

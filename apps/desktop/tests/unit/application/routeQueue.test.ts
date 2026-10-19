import { describe, expect, it } from 'vitest';
import { RouteQueue } from '../../../src/renderer/application/routeQueue';

describe('RouteQueue', () => {
  it('applies immediately when ready', () => {
    const applied: string[] = [];
    const q = new RouteQueue(() => true, (r) => applied.push(r));
    q.push('/invite/abc');
    expect(applied).toEqual(['/invite/abc']);
  });

  it('holds the latest route until ready, once', () => {
    let ready = false;
    const applied: string[] = [];
    const q = new RouteQueue(() => ready, (r) => applied.push(r));
    q.push('/invite/one');
    q.push('/invite/two');
    q.flush();
    expect(applied).toEqual([]);
    ready = true;
    q.flush();
    q.flush();
    expect(applied).toEqual(['/invite/two']);
  });
});

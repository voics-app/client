import { describe, expect, it } from 'vitest';
import type { Poll } from '../../src/contracts/rest';
import { mergePoll, pollEventResults } from '../../src/domain/poll';
import { canForward } from '../../src/domain/forward';

const poll = (version: string, voteVersion?: string, me?: boolean): Poll => ({
  question: { text: 'Where?' }, answers: [{ answer_id: 1, poll_media: { text: 'Here' } }, { answer_id: 2, poll_media: { text: 'There' } }],
  expiry: '2027-01-01T00:00:00Z', layout_type: 1, allow_multiselect: false,
  results: { version, vote_version: voteVersion, is_finalized: false, answer_counts: [{ id: 1, count: Number(version), me_voted: me }, { id: 2, count: 0, me_voted: me === undefined ? undefined : !me }] },
});

describe('poll snapshot reconciliation', () => {
  it('keeps the newer counts and viewer revision independently across out-of-order events', () => {
    const current = poll('12', '3', true);
    const publicEvent = poll('13');
    const merged = mergePoll(current, publicEvent);
    expect(merged.results?.version).toBe('13');
    expect(merged.results?.answer_counts[0]).toMatchObject({ count: 13, me_voted: true });
    const delayedViewer = poll('11', '4', false);
    const final = mergePoll(merged, delayedViewer);
    expect(final.results?.version).toBe('13');
    expect(final.results?.vote_version).toBe('4');
    expect(final.results?.answer_counts[0]).toMatchObject({ count: 13, me_voted: false });
  });
  it('uses the actor selection only for our own event', () => {
    const results = poll('3').results!;
    expect(pollEventResults(results, false, '2', [2])).toEqual(results);
    expect(pollEventResults(results, true, '2', [2]).answer_counts.map((c) => c.me_voted)).toEqual([false, true]);
  });
});

it('does not forward polls', () => { expect(canForward({ type: 0, poll: poll('0') }, 'standard')).toBe(false); });

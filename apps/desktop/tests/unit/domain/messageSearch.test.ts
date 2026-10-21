import { describe, expect, it } from 'vitest';
import type { Message } from '@shared/contracts/rest';
import {
  applySuggestion,
  dateBounds,
  highlightTerms,
  matchesLocal,
  parseQuery,
  splitHighlight,
  suggest,
  toSearchParams,
  withoutFilter,
  type SuggestionContext,
} from '@renderer/domain/messageSearch';
import { compareSnowflakes, snowflakeFromTimestamp } from '@renderer/domain/snowflake';

const ctx: SuggestionContext = {
  users: [
    { id: '10', name: 'alice' },
    { id: '11', name: 'Bob Builder' },
  ],
  channels: [
    { id: '20', name: 'general' },
    { id: '21', name: 'random' },
  ],
  now: new Date(2026, 9, 21),
};

describe('parseQuery', () => {
  it('separates filters from free text and keeps quoted values together', () => {
    const q = parseQuery('deploy from:alice has:image "exact phrase" in:general from:"Bob Builder"');
    expect(q.text).toBe('deploy "exact phrase"');
    expect(q.filters.map((f) => `${f.key}=${f.value}`)).toEqual(['from=alice', 'has=image', 'in=general', 'from=Bob Builder']);
  });

  it('treats unknown keys and empty values as text', () => {
    expect(parseQuery('foo:bar has: ratio 3:4').text).toBe('foo:bar has: ratio 3:4');
  });

  it('removes one filter by its raw token', () => {
    const q = parseQuery('hello from:alice has:link');
    expect(withoutFilter('hello from:alice has:link', q.filters[0]!)).toBe('hello has:link');
  });
});

describe('suggest', () => {
  it('offers the operators for an empty box and a typed prefix', () => {
    expect(suggest('', ctx).map((s) => s.label)).toContain('pinned:');
    expect(suggest('fr', ctx).map((s) => s.label)).toEqual(['from:']);
    expect(suggest('deploy ', ctx)).toEqual([]);
  });

  it('completes values from the server context', () => {
    expect(suggest('has:i', ctx).map((s) => s.label)).toEqual(['has:image']);
    expect(suggest('from:bo', ctx).map((s) => s.insert)).toEqual(['from:"Bob Builder" ']);
    expect(suggest('in:rand', ctx).map((s) => s.label)).toEqual(['in:#random']);
    expect(suggest('pinned:', ctx).map((s) => s.label)).toEqual(['pinned:true', 'pinned:false']);
    expect(suggest('before:', ctx)[0]?.label).toBe('before:2026-10-21');
  });

  it('replaces only the token under the caret', () => {
    const [pick] = suggest('hello from:al', ctx);
    expect(applySuggestion('hello from:al', pick!)).toBe('hello from:alice ');
    expect(applySuggestion('', suggest('', ctx)[0]!)).toBe('from:');
  });
});

describe('toSearchParams', () => {
  it('resolves names to ids and builds the parameters', () => {
    const { params, problems } = toSearchParams(
      parseQuery('deploy from:alice mentions:"bob builder" has:image has:link in:#random pinned:true'),
      ctx,
      { sort_by: 'timestamp', sort_order: 'desc', offset: 25, limit: 25 },
    );
    expect(problems).toEqual([]);
    expect(params).toMatchObject({
      content: 'deploy',
      author_id: ['10'],
      mentions: ['11'],
      has: ['image', 'link'],
      channel_id: ['21'],
      pinned: true,
      offset: 25,
    });
  });

  it('reports unknown names and malformed values instead of searching', () => {
    const { problems } = toSearchParams(parseQuery('from:ghost in:nowhere has:gif pinned:maybe before:yesterday'), ctx);
    expect(problems).toEqual([
      'No member named "ghost"',
      'No channel named "nowhere"',
      'has: expects link, embed, file, image, video, sound',
      'pinned: expects true or false',
      'before: expects a date like 2026-10-31',
    ]);
  });

  it('turns dates into exclusive snowflake bounds', () => {
    const day = new Date(2026, 9, 21).getTime();
    const during = dateBounds('during', '2026-10-21')!;
    expect(compareSnowflakes(during.min!, snowflakeFromTimestamp(day))).toBeLessThan(0);
    expect(during.max).toBe(snowflakeFromTimestamp(day + 86_400_000));
    expect(dateBounds('before', '2026-10-21')).toEqual({ max: snowflakeFromTimestamp(day) });
    expect(compareSnowflakes(dateBounds('after', '2026-10-21')!.min!, snowflakeFromTimestamp(day + 86_400_000))).toBeLessThan(0);
    expect(dateBounds('before', 'nope')).toBeNull();
    const both = toSearchParams(parseQuery('after:2026-10-01 before:2026-10-31'), ctx).params;
    expect(both.min_id).toBeDefined();
    expect(both.max_id).toBeDefined();
  });
});

describe('highlighting', () => {
  it('splits content around the matched words, ignoring case and exclusions', () => {
    expect(highlightTerms('"deploy" -failed or build')).toEqual(['deploy', 'build']);
    expect(splitHighlight('The Deploy and a deploy.', ['deploy'])).toEqual([
      { text: 'The ', hit: false },
      { text: 'Deploy', hit: true },
      { text: ' and a ', hit: false },
      { text: 'deploy', hit: true },
      { text: '.', hit: false },
    ]);
    expect(splitHighlight('a.b', ['.'])).toEqual([
      { text: 'a', hit: false },
      { text: '.', hit: true },
      { text: 'b', hit: false },
    ]);
    expect(splitHighlight('plain', [])).toEqual([{ text: 'plain', hit: false }]);
  });
});

function message(over: Partial<Message> & { content: string }): Message {
  return {
    id: 'local-1',
    channel_id: 'c',
    author: { id: '10', username: 'alice', global_name: null, avatar: null },
    timestamp: new Date(2026, 9, 21, 12).toISOString(),
    edited_timestamp: null,
    mention_everyone: false,
    mentions: [],
    mention_roles: [],
    attachments: [],
    embeds: [],
    pinned: false,
    type: 0,
    ...over,
  };
}

describe('matchesLocal', () => {
  it('matches words, exclusions and the author for private chats', () => {
    const m = message({ content: 'Deploy finished https://x.test' });
    expect(matchesLocal(m, { content: 'deploy finished' })).toBe(true);
    expect(matchesLocal(m, { content: 'deploy -finished' })).toBe(false);
    expect(matchesLocal(m, { content: 'missing' })).toBe(false);
    expect(matchesLocal(m, { author_id: ['11'] })).toBe(false);
    expect(matchesLocal(m, { has: ['link'] })).toBe(true);
    expect(matchesLocal(m, { has: ['image'] })).toBe(false);
  });

  it('applies mentions, attachments, pins and date bounds', () => {
    const m = message({
      content: 'look',
      mentions: [{ id: '11', username: 'bob', global_name: null, avatar: null }],
      attachments: [{ id: '1', filename: 'a.png', size: 1, url: 'u', proxy_url: 'u', content_type: 'image/png' }],
      pinned: true,
    });
    expect(matchesLocal(m, { mentions: ['11'], has: ['image', 'file'], pinned: true })).toBe(true);
    expect(matchesLocal(m, { pinned: false })).toBe(false);
    const { min, max } = dateBounds('during', '2026-10-21')!;
    expect(matchesLocal(m, { min_id: min, max_id: max })).toBe(true);
    expect(matchesLocal(m, { max_id: dateBounds('before', '2026-10-21')!.max })).toBe(false);
  });
});

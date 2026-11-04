import { describe, expect, it } from 'vitest';
import { formatTimestamp, relativeTickMs, relativeTime, timestampTooltip } from '@discordy/core/domain/timestamp';
import { hostOf, isTrustedLink } from '@renderer/domain/linkTrust';
import { parseHighlightHtml } from '@discordy/core/domain/highlightHtml';
import { searchShortcodes } from '@discordy/core/domain/emojiShortcodes';
import { acceptFiles, charsRemaining, formatCountdown, shouldPasteAsFile, showCounter, slowmodeRemaining } from '@discordy/core/domain/composerLimits';

const UNIX = 1700000000; // 2023-11-14T22:13:20Z
const UTC = 'UTC';

describe('formatTimestamp', () => {
  it('renders every absolute style in the given zone', () => {
    expect(formatTimestamp(UNIX, 't', 0, 'en-US', UTC)).toBe('10:13 PM');
    expect(formatTimestamp(UNIX, 'T', 0, 'en-US', UTC)).toBe('10:13:20 PM');
    expect(formatTimestamp(UNIX, 'd', 0, 'en-US', UTC)).toBe('11/14/2023');
    expect(formatTimestamp(UNIX, 'D', 0, 'en-US', UTC)).toBe('November 14, 2023');
    expect(formatTimestamp(UNIX, 'f', 0, 'en-US', UTC)).toContain('November 14, 2023');
    expect(formatTimestamp(UNIX, 'f', 0, 'en-US', UTC)).toContain('10:13 PM');
    expect(formatTimestamp(UNIX, 'F', 0, 'en-US', UTC)).toContain('Tuesday');
  });

  it('uses the zone offset (local time)', () => {
    expect(formatTimestamp(UNIX, 't', 0, 'en-US', 'Asia/Tokyo')).toBe('7:13 AM');
  });

  it('renders relative times in both directions', () => {
    const now = UNIX * 1000;
    expect(relativeTime(UNIX + 3 * 3600, now, 'en')).toBe('in 3 hours');
    expect(relativeTime(UNIX - 120, now, 'en')).toBe('2 minutes ago');
    expect(relativeTime(UNIX, now, 'en')).toBe('now');
    expect(formatTimestamp(UNIX - 86400 * 2, 'R', now, 'en')).toBe('2 days ago');
  });

  it('survives out-of-range values', () => {
    expect(formatTimestamp(9e15, 'f')).toBe('Invalid date');
    expect(timestampTooltip(Number.NaN)).toBe('Invalid date');
  });

  it('includes the zone in the tooltip', () => {
    expect(timestampTooltip(UNIX, 'en-US', UTC)).toContain('UTC');
  });

  it('ticks faster the closer a relative time is', () => {
    expect(relativeTickMs(UNIX + 10, UNIX * 1000)).toBe(1000);
    expect(relativeTickMs(UNIX + 600, UNIX * 1000)).toBe(30_000);
    expect(relativeTickMs(UNIX + 36000, UNIX * 1000)).toBe(60_000);
  });
});

describe('link trust', () => {
  it('extracts hosts only for http(s)', () => {
    expect(hostOf('https://Example.com./x')).toBe('example.com');
    expect(hostOf('javascript:alert(1)')).toBeNull();
    expect(hostOf('not a url')).toBeNull();
  });

  it('trusts built-in hosts and their subdomains', () => {
    expect(isTrustedLink('https://discordy.voics.nl/x')).toBe(true);
    expect(isTrustedLink('https://api.voics.nl')).toBe(true);
  });

  it('does not trust look-alike hosts', () => {
    expect(isTrustedLink('https://voics.nl.evil.com')).toBe(false);
    expect(isTrustedLink('https://evilvoics.nl')).toBe(false);
    expect(isTrustedLink('https://voics.nl@evil.com')).toBe(false);
  });

  it('honours user trusted domains', () => {
    expect(isTrustedLink('https://github.com/a', ['github.com'])).toBe(true);
    expect(isTrustedLink('https://example.com', ['github.com'])).toBe(false);
  });
});

describe('parseHighlightHtml', () => {
  it('builds nested nodes and decodes entities', () => {
    expect(parseHighlightHtml('<span class="hljs-keyword">const</span> a = <span class="hljs-string">&quot;&lt;b&gt;&quot;</span> &amp;&amp; 1')).toEqual([
      { className: 'hljs-keyword', children: ['const'] },
      ' a = ',
      { className: 'hljs-string', children: ['"<b>"'] },
      ' && 1',
    ]);
  });

  it('treats unexpected markup as text, never as elements', () => {
    const nodes = parseHighlightHtml('<img src=x onerror=alert(1)>');
    expect(JSON.stringify(nodes)).not.toContain('className');
  });

  it('tolerates unbalanced spans', () => {
    expect(() => parseHighlightHtml('</span></span><span class="a">x')).not.toThrow();
  });
});

describe('searchShortcodes', () => {
  it('finds ra -> rage/rainbow/rabbit first by prefix', () => {
    const names = searchShortcodes('ra').map((m) => m.name);
    expect(names.slice(0, 6)).toEqual(expect.arrayContaining(['rage', 'rainbow', 'rabbit']));
  });

  it('returns nothing for an empty or unknown query', () => {
    expect(searchShortcodes('')).toEqual([]);
    expect(searchShortcodes('zzzzzz')).toEqual([]);
  });

  it('respects the limit', () => {
    expect(searchShortcodes('a', 3)).toHaveLength(3);
  });
});

describe('composer limits', () => {
  it('counts characters remaining by code point and trims', () => {
    expect(charsRemaining('  hi  ')).toBe(1998);
    expect(charsRemaining('😀😀')).toBe(1998);
    expect(charsRemaining('x'.repeat(2005))).toBe(-5);
  });

  it('shows the counter only near the limit', () => {
    expect(showCounter(1000)).toBe(false);
    expect(showCounter(200)).toBe(true);
    expect(showCounter(-1)).toBe(true);
  });

  it('computes slowmode remaining', () => {
    expect(slowmodeRemaining(0, 1000, 5000)).toBe(0);
    expect(slowmodeRemaining(10, undefined, 5000)).toBe(0);
    expect(slowmodeRemaining(10, 1000, 4500)).toBe(7);
    expect(slowmodeRemaining(10, 1000, 20000)).toBe(0);
  });

  it('formats countdowns', () => {
    expect(formatCountdown(7)).toBe('7s');
    expect(formatCountdown(75)).toBe('1m 15s');
    expect(formatCountdown(3700)).toBe('1h 1m');
  });

  it('limits file count and size', () => {
    const f = (size: number) => new File([new Uint8Array(size)], 'a.bin');
    const ok = acceptFiles([], [f(10), f(20)], 100, false);
    expect(ok.accepted).toHaveLength(2);
    expect(ok.problems).toEqual([]);

    const big = acceptFiles([], [f(10), f(500)], 100, false);
    expect(big.accepted).toHaveLength(1);
    expect(big.problems).toHaveLength(1);

    const empty = acceptFiles([], [f(0)], 100, false);
    expect(empty.accepted).toHaveLength(0);
    expect(acceptFiles([], [f(0)], 100, true).accepted).toHaveLength(1);

    const many = acceptFiles(Array.from({ length: 9 }, () => f(1)), [f(1), f(1)], 100, false);
    expect(many.accepted).toHaveLength(1);
    expect(many.problems[0]).toContain('at most 10');
  });

  it('turns over-long pastes into files', () => {
    expect(shouldPasteAsFile('x'.repeat(2000))).toBe(false);
    expect(shouldPasteAsFile('x'.repeat(2001))).toBe(true);
  });
});

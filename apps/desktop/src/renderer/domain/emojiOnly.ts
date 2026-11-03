/** A message is shown in jumbo size when it holds only emoji (unicode or custom), at most this many. */
export const MAX_JUMBO_EMOJI = 27;

const CUSTOM_AT_START = /^<a?:\w+:\d+>/;
const UNICODE_EMOJI = /^(?:\p{Extended_Pictographic}|\p{Regional_Indicator}{2}|[0-9#*]️?⃣)/u;

const segmenter = typeof Intl !== 'undefined' && 'Segmenter' in Intl ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null;

function firstGrapheme(text: string): string {
  if (segmenter) {
    for (const s of segmenter.segment(text)) return s.segment;
  }
  return Array.from(text)[0] ?? '';
}

/** True when `source` is 1..27 emoji separated only by whitespace. */
export function isEmojiOnly(source: string): boolean {
  let rest = source.trim();
  let count = 0;
  while (rest) {
    const custom = CUSTOM_AT_START.exec(rest);
    let used: number;
    if (custom) {
      used = custom[0].length;
    } else {
      const g = firstGrapheme(rest);
      if (!UNICODE_EMOJI.test(g)) return false;
      used = g.length;
    }
    count += 1;
    if (count > MAX_JUMBO_EMOJI) return false;
    rest = rest.slice(used).trimStart();
  }
  return count > 0;
}

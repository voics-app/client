/** Presentation rules for server discovery (api#74). */

const CATEGORY_LABELS: Record<string, string> = {
  gaming: 'Gaming',
  music: 'Music',
  entertainment: 'Entertainment',
  science_tech: 'Science & Tech',
  education: 'Education',
  art_creative: 'Art & Creative',
  community: 'Community',
  other: 'Other',
};

/** A readable label for a category slug; unknown slugs are title-cased so new server categories still render. */
export function categoryLabel(slug: string): string {
  const known = CATEGORY_LABELS[slug];
  if (known) return known;
  return slug
    .split('_')
    .filter(Boolean)
    .map((w) => w[0]!.toUpperCase() + w.slice(1))
    .join(' ');
}

const BLOCKER_MESSAGES: Record<string, string> = {
  DESCRIPTION_REQUIRED: 'Add a server description of at least 10 characters in Overview.',
  MEMBER_COUNT_TOO_LOW: 'The server needs more members before it can be listed.',
  GUILD_TOO_NEW: 'The server is too new to be listed. Try again later.',
  NSFW_NOT_ALLOWED: 'Servers with age-restricted channels cannot be listed.',
};

export function blockerMessage(code: string): string {
  return BLOCKER_MESSAGES[code] ?? 'This server does not meet the listing requirements.';
}

/** Splits a comma/space separated tag field into at most `max` normalised tags. */
export function parseTags(input: string, max = 5): string[] {
  const seen = new Set<string>();
  for (const raw of input.split(/[\s,]+/)) {
    const tag = raw.trim().toLowerCase().replace(/^#/, '');
    if (tag) seen.add(tag);
  }
  return [...seen].slice(0, max);
}

/** "1,234 members" / "1 member". */
export function memberCountLabel(count: number): string {
  return `${count.toLocaleString('en-US')} ${count === 1 ? 'member' : 'members'}`;
}

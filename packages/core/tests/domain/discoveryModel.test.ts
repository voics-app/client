import { describe, expect, it } from 'vitest';
import { blockerMessage, categoryLabel, memberCountLabel, parseTags } from '../../src/domain/discoveryModel';

describe('discoveryModel', () => {
  it('labels known and unknown categories', () => {
    expect(categoryLabel('science_tech')).toBe('Science & Tech');
    expect(categoryLabel('board_games')).toBe('Board Games');
  });

  it('explains blockers with a fallback', () => {
    expect(blockerMessage('NSFW_NOT_ALLOWED')).toMatch(/age-restricted/);
    expect(blockerMessage('SOMETHING_NEW')).toMatch(/requirements/);
  });

  it('parses tags: lowercases, strips #, dedupes and caps', () => {
    expect(parseTags('#Rust, rust  open-source')).toEqual(['rust', 'open-source']);
    expect(parseTags('a1 b2 c3 d4 e5 f6')).toHaveLength(5);
    expect(parseTags('  ,  ')).toEqual([]);
  });

  it('pluralises member counts', () => {
    expect(memberCountLabel(1)).toBe('1 member');
    expect(memberCountLabel(1234)).toBe('1,234 members');
  });
});

import { describe, expect, it } from 'vitest';
import { EMOJI_CATEGORIES, applySkinTone, reactionSummary, supportsSkinTone, usableEmojiGroups } from '@discordy/core/domain/emojiModel';
import { idsOf } from '@discordy/core/domain/menuModel';
import { buildMessageMenu, buildReactionMenu } from '@discordy/core/domain/messageMenuModel';

describe('skin tones', () => {
  it('inserts the modifier after the base character and drops the variation selector', () => {
    expect(applySkinTone('👍', '\u{1F3FD}')).toBe('👍\u{1F3FD}');
    expect(applySkinTone('✌️', '\u{1F3FB}')).toBe('✌\u{1F3FB}');
  });
  it('leaves the default tone and tone-less emoji alone', () => {
    expect(applySkinTone('👍', '')).toBe('👍');
    expect(applySkinTone('😀', '\u{1F3FD}')).toBe('😀');
    expect(supportsSkinTone('😀')).toBe(false);
  });
  it('has categories with unique ids', () => {
    const ids = EMOJI_CATEGORIES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('usableEmojiGroups', () => {
  const guilds = [
    { id: 'a', name: 'Alpha', emojis: [{ id: '1', name: 'wave' }, { id: '2', name: 'hidden', available: false }] },
    { id: 'b', name: 'Beta', emojis: [{ id: '3', name: 'wavy', animated: true }] },
  ];
  it('puts the current server first and includes other servers when permitted', () => {
    const groups = usableEmojiGroups(guilds, 'b', true);
    expect(groups.map((g) => g.guildId)).toEqual(['b', 'a']);
    expect(groups[1]!.emoji.map((e) => e.name)).toEqual(['wave']);
  });
  it('drops other servers without USE_EXTERNAL_EMOJIS', () => {
    expect(usableEmojiGroups(guilds, 'a', false).map((g) => g.guildId)).toEqual(['a']);
  });
  it('filters by search text', () => {
    expect(usableEmojiGroups(guilds, 'a', true, 'wav').flatMap((g) => g.emoji.map((e) => e.name))).toEqual(['wave', 'wavy']);
  });
});

describe('reactionSummary', () => {
  it('names a few users and counts the rest', () => {
    expect(reactionSummary(['Ann'], 1, '👍')).toBe('Ann reacted with 👍');
    expect(reactionSummary(['Ann', 'Bob'], 2, '👍')).toBe('Ann and Bob reacted with 👍');
    expect(reactionSummary(['Ann', 'Bob', 'Cy', 'Di'], 9, ':x:')).toBe('Ann, Bob, Cy and 6 others reacted with :x:');
  });
  it('falls back before names load', () => {
    expect(reactionSummary([], 3, '👍')).toBe('Reacted with 👍');
  });
});

describe('reaction menu', () => {
  it('offers moderation only with MANAGE_MESSAGES', () => {
    expect(idsOf(buildReactionMenu({ canReact: true, mine: false, canManageMessages: false }))).toEqual(['whoReacted', 'toggle']);
    expect(idsOf(buildReactionMenu({ canReact: true, mine: true, canManageMessages: true }))).toEqual(['whoReacted', 'toggle', 'removeEmoji', 'removeAll']);
    expect(idsOf(buildReactionMenu({ canReact: false, mine: false, canManageMessages: false }))).toEqual(['whoReacted']);
  });
});

describe('message menu placeholders', () => {
  const base = { isMine: false, standard: true, canReact: true, canManageMessages: false, canCreateThread: false, forwardSupported: false, canSpeak: false, hasText: true, pinned: false, selection: '', canAddEmoji: false, quick: [] };
  it('offers attachment editing only for author-owned standard attachments', () => {
    const edit = { ...base, isMine: true, hasEditableAttachments: true };
    expect(idsOf(buildMessageMenu(edit, { kind: 'message' }))).toContain('editAttachments');
    for (const disabled of [{ isMine: false }, { standard: false }, { hasEditableAttachments: false }]) {
      expect(idsOf(buildMessageMenu({ ...edit, ...disabled }, { kind: 'message' }))).not.toContain('editAttachments');
    }
  });
  it('shows a disabled Forward until its backend lands', () => {
    const model = buildMessageMenu(base, { kind: 'message' });
    const items = model.filter((m) => m.kind === 'item');
    expect(items.find((m) => m.id === 'forwardSoon')?.disabled).toBe(true);
  });
  it('offers Report Message on other people\'s messages in every delivery mode', () => {
    for (const standard of [true, false]) {
      const report = buildMessageMenu({ ...base, standard }, { kind: 'message' }).find((m) => m.kind === 'item' && m.id === 'report');
      expect(report).toMatchObject({ label: 'Report Message', danger: true });
      expect(report).not.toHaveProperty('disabled');
    }
  });
  it('does not offer Report on own messages', () => {
    expect(idsOf(buildMessageMenu({ ...base, isMine: true }, { kind: 'message' }))).not.toContain('report');
  });
});

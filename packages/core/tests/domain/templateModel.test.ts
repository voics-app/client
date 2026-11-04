import { describe, expect, it } from 'vitest';
import { TEST_BRAND } from '../support/brandFixture';
import type { GuildTemplate, TemplateChannel } from '../../src/contracts/rest';
import { isBuiltinTemplate, parseTemplateCode, previewTemplate, templateShareLink, templateSummary, usageLabel } from '../../src/domain/templateModel';

const channel = (id: number, type: number, name: string, parent: number | null, position = 0): TemplateChannel => ({
  id,
  type,
  name,
  position,
  topic: null,
  nsfw: false,
  parent_id: parent,
  permission_overwrites: [],
});

const template: GuildTemplate = {
  code: 'abc123',
  name: 'T',
  description: null,
  usage_count: 1,
  creator_id: null,
  creator: null,
  created_at: '2026-11-04T00:00:00.000Z',
  updated_at: '2026-11-04T00:00:00.000Z',
  source_guild_id: null,
  is_dirty: false,
  serialized_source_guild: {
    name: 'S',
    description: null,
    afk_channel_id: null,
    system_channel_id: null,
    roles: [
      { id: 0, name: '@everyone', permissions: '0', color: 0, hoist: false, mentionable: false },
      { id: 1, name: 'Moderator', permissions: '0', color: 0, hoist: true, mentionable: false },
    ],
    channels: [
      channel(1, 4, 'Voice', null, 1),
      channel(2, 4, 'Text', null, 0),
      channel(3, 0, 'general', 2, 0),
      channel(4, 2, 'Lounge', 1, 0),
      channel(5, 0, 'rules', 2, 1),
      channel(6, 0, 'loose', null, 0),
    ],
  },
};

describe('parseTemplateCode', () => {
  it('accepts codes, web links and deep links', () => {
    expect(parseTemplateCode('hTKzmak12345')).toBe('hTKzmak12345');
    expect(parseTemplateCode(' https://example.test/template/hTKzmak12345 ')).toBe('hTKzmak12345');
    expect(parseTemplateCode('app://template/hTKzmak12345/')).toBe('hTKzmak12345');
    expect(parseTemplateCode('builtin-study-group')).toBe('builtin-study-group');
    expect(parseTemplateCode('https://example.test/template/abc?x=1')).toBe('abc');
  });

  it('rejects text that is not a code', () => {
    expect(parseTemplateCode('')).toBeNull();
    expect(parseTemplateCode('a')).toBeNull();
    expect(parseTemplateCode('not a code')).toBeNull();
  });
});

describe('template links', () => {
  it('shares through the brand scheme', () => {
    expect(templateShareLink('abc')).toBe(`${TEST_BRAND.protocolScheme}://template/abc`);
    expect(parseTemplateCode(templateShareLink('abc-12'))).toBe('abc-12');
  });

  it('knows built-ins', () => {
    expect(isBuiltinTemplate('builtin-gaming')).toBe(true);
    expect(isBuiltinTemplate('gaming')).toBe(false);
  });
});

describe('previewTemplate', () => {
  it('groups channels under categories in position order and drops @everyone', () => {
    const preview = previewTemplate(template);
    expect(preview.roles).toEqual(['Moderator']);
    expect(preview.channelCount).toBe(4);
    expect(preview.groups.map((g) => g.category)).toEqual([null, 'Text', 'Voice']);
    expect(preview.groups[1]!.channels.map((c) => c.name)).toEqual(['general', 'rules']);
    expect(preview.groups[2]!.channels.map((c) => c.name)).toEqual(['Lounge']);
  });

  it('summarises counts with plurals', () => {
    expect(templateSummary(template)).toBe('4 channels, 1 role');
    expect(usageLabel(1)).toBe('Used 1 time');
    expect(usageLabel(0)).toBe('Used 0 times');
  });
});

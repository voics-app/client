import { ChannelType, type Channel, type PermissionOverwrite } from '@discordy/core/contracts/rest';
import { auditLine } from '../../src/serverSettings/AuditScreen';
import { channelPatch, draftOfChannel, overwriteChanges } from '../../src/serverSettings/channelEditModel';
import { emojiNameFor, emojiUpload, MAX_EMOJI_BYTES } from '../../src/serverSettings/emojiModel';

const text = { id: 'c1', type: ChannelType.GUILD_TEXT, guild_id: 'g1', name: 'general', topic: 'hello', rate_limit_per_user: 5, nsfw: false } as Channel;
const voice = { id: 'v1', type: ChannelType.GUILD_VOICE, guild_id: 'g1', name: 'lobby', user_limit: 4, bitrate: 64000 } as Channel;

describe('emojiNameFor and emojiUpload', () => {
  it('derives an emoji name from a file name like desktop', () => {
    expect(emojiNameFor('party parrot!.gif')).toBe('party_parrot_');
    expect(emojiNameFor('x'.repeat(50) + '.png')).toHaveLength(32);
  });

  it('builds the upload, or says why not', () => {
    expect(emojiUpload({ base64: 'AAAA', mimeType: 'image/png', fileName: 'cat.png' })).toEqual({ name: 'cat', uri: 'data:image/png;base64,AAAA' });
    expect(emojiUpload({ base64: 'AAAA' })).toMatchObject({ name: 'emoji' });
    expect(emojiUpload({})).toEqual({ error: 'Could not read the image.' });
    expect(emojiUpload({ base64: 'A'.repeat(Math.ceil((MAX_EMOJI_BYTES * 4) / 3) + 8) })).toEqual({ error: 'Emoji images must be 256 KB or smaller.' });
  });
});

describe('channelPatch', () => {
  it('is null while nothing changed', () => {
    expect(channelPatch(text, draftOfChannel(text))).toBeNull();
  });

  it('sends topic, slowmode and age restriction for a text channel', () => {
    expect(channelPatch(text, { ...draftOfChannel(text), topic: 'new topic', slowmode: 30, nsfw: true })).toEqual({ name: 'general', nsfw: true, topic: 'new topic', rate_limit_per_user: 30 });
  });

  it('clears an emptied topic with null and cleans the name', () => {
    expect(channelPatch(text, { ...draftOfChannel(text), name: 'Main Chat', topic: '' })).toMatchObject({ name: 'main-chat', topic: null });
  });

  it('sends the voice limits, bounded, for a voice channel and no topic or slowmode', () => {
    expect(channelPatch(voice, { ...draftOfChannel(voice), userLimit: 500, bitrateKbps: 1 })).toEqual({ name: 'lobby', nsfw: false, user_limit: 99, bitrate: 8000 });
  });

  it('refuses an empty name', () => {
    expect(channelPatch(text, { ...draftOfChannel(text), name: '  ' })).toBeNull();
  });
});

describe('overwriteChanges', () => {
  const a: PermissionOverwrite = { id: 'a', type: 0, allow: '1', deny: '0' };
  const b: PermissionOverwrite = { id: 'b', type: 1, allow: '0', deny: '2' };

  it('puts new and changed overwrites and removes dropped ones', () => {
    expect(overwriteChanges([a, b], [{ ...a, allow: '3' }, { id: 'c', type: 0, allow: '0', deny: '0' }])).toEqual({ put: [{ ...a, allow: '3' }, { id: 'c', type: 0, allow: '0', deny: '0' }], remove: ['b'] });
  });

  it('does nothing for an unchanged list', () => {
    expect(overwriteChanges([a, b], [a, b])).toEqual({ put: [], remove: [] });
  });
});

describe('auditLine', () => {
  const entry = (action_type: number) => ({ id: '1', target_id: null, user_id: 'u', action_type });

  it('words an entry like desktop, with a fallback for unknown actions and users', () => {
    expect(auditLine(entry(22), { id: 'u', username: 'pat', global_name: 'Pat' } as never)).toBe('Pat banned a member');
    expect(auditLine(entry(999), undefined)).toBe('Unknown performed action 999');
  });
});

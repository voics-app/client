import { describe, expect, it } from 'vitest';
import { Permission } from '../../src/contracts/permissions';
import type { Channel, Webhook } from '../../src/contracts/rest';
import { webhookChannels, webhookNameError, webhookPatch } from '../../src/domain/integrations';

describe('webhook metadata and channel selection', () => {
  const original: Webhook = { id: '4', type: 1, channel_id: '3', name: 'Reminders', avatar: 'hash', application_id: null };
  it('sends only edited fields and distinguishes unchanged images from removal', () => {
    expect(webhookPatch(original, { name: 'Renamed', channelId: '3' })).toEqual({ name: 'Renamed' });
    expect(webhookPatch(original, { name: 'Reminders', channelId: '3', avatar: null })).toEqual({ avatar: null });
    expect(webhookPatch(original, { name: 'Reminders', channelId: '5', avatar: 'data:image/png;base64,test' })).toEqual({ channel_id: '5', avatar: 'data:image/png;base64,test' });
  });
  it('validates trimmed Unicode scalar length consistently with the API', () => {
    expect(webhookNameError(' ')).toBeTruthy();
    expect(webhookNameError('🎵'.repeat(80))).toBeNull();
    expect(webhookNameError('🎵'.repeat(81))).toBeTruthy();
  });
  it('offers only visible eligible channels where the caller can manage webhooks', () => {
    const bits = Permission.VIEW_CHANNEL | Permission.MANAGE_WEBHOOKS;
    const channels = [
      { id: '3', guild_id: '1', type: 0 }, { id: '4', guild_id: '1', type: 4 },
      { id: '5', guild_id: '2', type: 0 },
      { id: '6', guild_id: '1', type: 0, permission_overwrites: [{ id: '1', type: 0, allow: '0', deny: String(Permission.MANAGE_WEBHOOKS) }] },
      { id: '7', guild_id: '1', type: 0, permission_overwrites: [{ id: '1', type: 0, allow: '0', deny: String(Permission.VIEW_CHANNEL) }] },
    ] as Channel[];
    expect(webhookChannels(channels, { guildId: '1', ownerId: '2', userId: '8', memberRoleIds: [], roles: [{ id: '1', permissions: String(bits) }] }).map((c) => c.id)).toEqual(['3']);
  });
});

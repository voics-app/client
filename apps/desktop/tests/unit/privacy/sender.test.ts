import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@renderer/infrastructure/http/httpClient';
import { GatewayOp } from '@discordy/core/contracts/gateway';
import type { Channel, Message } from '@discordy/core/contracts/rest';
import { LocalHistory } from '@renderer/application/privacy/localHistory';
import { MessageSender } from '@renderer/application/privacy/messageSender';
import { PrivateMessaging } from '@renderer/application/privacy/privateMessaging';
import { usePrivacyStore } from '@discordy/core/application/stores/privacyStore';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { useMessageStore } from '@discordy/core/application/stores/messageStore';
import { useSessionStore } from '@renderer/application/stores/sessionStore';
import { FakeGateway, FakePeerConnection, SELF, asApi, bobUser, dm, fakeApi, fakeCrypto, resetStores, selfUser } from './fakes';

const serverMessage = (over: Partial<Message> = {}): Message => ({
  id: '8001',
  channel_id: '500',
  author: selfUser,
  content: 'hi',
  timestamp: '2026-10-17T10:00:00.000Z',
  edited_timestamp: null,
  mention_everyone: false,
  mentions: [],
  mention_roles: [],
  attachments: [],
  embeds: [],
  pinned: false,
  type: 0,
  ...over,
});

function setup(channel: Channel = dm('standard')) {
  resetStores(channel);
  const api = fakeApi({});
  const ephemeral = { send: vi.fn(async (_c: Channel, i: { content: string }) => serverMessage({ id: 'e1', content: i.content })) };
  const p2p = { send: vi.fn(async (_c: Channel, i: { content: string }) => serverMessage({ id: 'p1', content: i.content })) };
  const gateway = new FakeGateway();
  const { crypto, records } = fakeCrypto(gateway);
  const sender = new MessageSender({ api: asApi(api), ephemeral, p2p, history: new LocalHistory(() => crypto), now: () => 1_800_000_000_000 });
  return { sender, api, ephemeral, p2p, crypto, records };
}

describe('MessageSender routing', () => {
  beforeEach(() => resetStores());

  it('sends standard messages optimistically and reconciles by nonce', async () => {
    const { sender, api } = setup();
    api.sendMessage.mockImplementation(async (_c: string, body: { nonce: string; content: string }) =>
      serverMessage({ content: body.content, nonce: body.nonce }),
    );
    await sender.send(dm('standard'), { content: 'hi', replyTo: '7000' });
    const body = api.sendMessage.mock.calls[0]![1] as { nonce: string; message_reference?: { message_id: string } };
    expect(body.message_reference?.message_id).toBe('7000');
    const timeline = useMessageStore.getState().timelines['500']!;
    expect(timeline.ids).toEqual(['8001']);
    expect(timeline.byId['8001']?.localState).toBeUndefined();
  });

  it('sends @silent as SUPPRESS_NOTIFICATIONS and a ping-off reply as replied_user false', async () => {
    const { sender, api } = setup();
    api.sendMessage.mockImplementation(async (_c: string, body: { nonce: string; content: string }) => serverMessage({ content: body.content, nonce: body.nonce }));
    await sender.send(dm('standard'), { content: 'psst', silent: true, replyTo: '7000', pingReplied: false });
    const body = api.sendMessage.mock.calls[0]![1] as { flags?: number; allowed_mentions?: { replied_user?: boolean } };
    expect(body.flags).toBe(4096);
    expect(body.allowed_mentions).toEqual({ replied_user: false });
  });

  it('omits flags and allowed_mentions for a plain pinging reply', async () => {
    const { sender, api } = setup();
    api.sendMessage.mockImplementation(async (_c: string, body: { nonce: string; content: string }) => serverMessage({ content: body.content, nonce: body.nonce }));
    await sender.send(dm('standard'), { content: 'hi', replyTo: '7000', pingReplied: true });
    const body = api.sendMessage.mock.calls[0]![1] as Record<string, unknown>;
    expect(body).not.toHaveProperty('flags');
    expect(body).not.toHaveProperty('allowed_mentions');
  });

  it('marks a failed standard send as failed', async () => {
    const { sender, api } = setup();
    api.sendMessage.mockRejectedValue(new Error('boom'));
    await expect(sender.send(dm('standard'), { content: 'hi' })).rejects.toThrow('boom');
    const timeline = useMessageStore.getState().timelines['500']!;
    expect(Object.values(timeline.byId)[0]?.localState).toBe('failed');
  });

  it('routes ephemeral and p2p channels to their services without touching REST', async () => {
    const eph = setup(dm('ephemeral'));
    await eph.sender.send(dm('ephemeral'), { content: 'secret' });
    expect(eph.ephemeral.send).toHaveBeenCalledOnce();
    expect(eph.api.sendMessage).not.toHaveBeenCalled();

    const peer = setup(dm('p2p'));
    await peer.sender.send(dm('p2p'), { content: 'direct' });
    expect(peer.p2p.send).toHaveBeenCalledOnce();
    expect(peer.api.sendMessage).not.toHaveBeenCalled();
  });

  it('on a 409 delivery-mode conflict re-resolves the channel and retries privately', async () => {
    const { sender, api, ephemeral } = setup();
    api.sendMessage.mockRejectedValue(new ApiError(409, 50160, 'Channel uses ephemeral delivery'));
    api.channel.mockResolvedValue(dm('ephemeral'));
    await sender.send(dm('standard'), { content: 'secret' });
    expect(ephemeral.send).toHaveBeenCalledOnce();
    expect(useGuildStore.getState().channels['500']?.delivery_mode).toBe('ephemeral');
    expect(useMessageStore.getState().timelines['500']?.ids ?? []).toEqual([]);
  });

  it('hands attachments to the private services, never uploading them in the clear', async () => {
    const { sender, api, ephemeral, p2p } = setup(dm('ephemeral'));
    const file = new File(['x'], 'a.txt');
    await sender.send(dm('ephemeral'), { content: '', files: [file] });
    await sender.send(dm('p2p'), { content: '', files: [file] });
    expect(ephemeral.send).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ files: [file] }));
    expect(p2p.send).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ files: [file] }));
    expect(api.createAttachmentSlots).not.toHaveBeenCalled();
  });

  it('refuses edit and delete in private chats', async () => {
    const { sender, api } = setup(dm('p2p'));
    await expect(sender.edit(dm('p2p'), '1', 'x')).rejects.toMatchObject({ reason: 'unsupported' });
    await expect(sender.remove(dm('ephemeral'), '1')).rejects.toMatchObject({ reason: 'unsupported' });
    expect(api.editMessage).not.toHaveBeenCalled();
  });
});

describe('MessageSender mode switches', () => {
  it('validates before calling the server: p2p is never allowed in guild channels', async () => {
    const guildChannel: Channel = { id: '600', type: 0, guild_id: '700', delivery_mode: 'standard' };
    const { sender, api } = setup(guildChannel);
    await expect(sender.setChannelMode(guildChannel, 'p2p')).rejects.toMatchObject({ reason: 'invalid_mode' });
    expect(api.updateChannel).not.toHaveBeenCalled();
  });

  it('sets a per-chat DM override, records it locally and adopts the server-resolved mode', async () => {
    const { sender, api } = setup(dm('standard'));
    api.channel.mockResolvedValue(dm('p2p'));
    const mode = await sender.setChannelMode(dm('standard'), 'p2p');
    expect(api.setChannelDeliveryOverride).toHaveBeenCalledWith('500', 'p2p');
    expect(mode).toBe('p2p');
    expect(useSessionStore.getState().settings.delivery_overrides?.['500']).toBe('p2p');
  });

  it('rejects p2p in a group DM above the limit', async () => {
    const big: Channel = { ...dm('standard'), type: 3, recipients: Array.from({ length: 11 }, (_, i) => ({ ...bobUser, id: `${100 + i}` })) };
    const { sender } = setup(big);
    await expect(sender.setChannelMode(big, 'p2p')).rejects.toMatchObject({ reason: 'invalid_mode' });
  });

  it('updates the account default mode', async () => {
    const { sender, api } = setup();
    api.updateSettings.mockResolvedValue({ default_delivery_mode: 'ephemeral' });
    await sender.setDefaultMode('ephemeral');
    expect(useSessionStore.getState().settings.default_delivery_mode).toBe('ephemeral');
  });

  it('turns on end-to-end encryption for every call', async () => {
    const { sender, api } = setup();
    api.updateSettings.mockResolvedValue({ default_delivery_mode: 'standard', e2ee_calls_default: true });
    await sender.setE2eeCallsDefault(true);
    expect(api.updateSettings).toHaveBeenCalledWith({ e2ee_calls_default: true });
    expect(useSessionStore.getState().settings.e2ee_calls_default).toBe(true);
  });
});

describe('MessageSender history', () => {
  it('merges local private history for ephemeral channels without calling the server', async () => {
    const { sender, api, records } = setup(dm('ephemeral'));
    records.set('500/1', { channelId: '500', messageId: '1', sortKey: 1, json: JSON.stringify(serverMessage({ id: '1', content: 'old secret' })) });
    await sender.loadHistory(dm('ephemeral'));
    expect(api.messages).not.toHaveBeenCalled();
    expect(useMessageStore.getState().timelines['500']?.byId['1']?.content).toBe('old secret');
  });

  it('merges server and local history for standard channels', async () => {
    const { sender, api, records } = setup(dm('standard'));
    api.messages.mockResolvedValue([serverMessage({ id: '2', content: 'from server' })]);
    records.set('500/1', { channelId: '500', messageId: '1', sortKey: 1, json: JSON.stringify(serverMessage({ id: '1', content: 'from before' })) });
    await sender.loadHistory(dm('standard'));
    expect(useMessageStore.getState().timelines['500']?.ids).toEqual(['1', '2']);
  });
});

describe('PrivateMessaging facade', () => {
  function facade(crypto?: ReturnType<typeof fakeCrypto>['crypto']) {
    resetStores(dm('ephemeral'));
    const gateway = new FakeGateway();
    const api = fakeApi({ '2': [{ device_id: '20', identity_key_b64: 'key-bob' }] });
    const pm = new PrivateMessaging({
      gateway,
      api: asApi(api),
      crypto,
      getSelf: () => SELF,
      createPeerConnection: () => new FakePeerConnection(),
      fetchBytes: async () => new Uint8Array(0),
      cdnUrl: () => "https://cdn.test",
    });
    return { pm, gateway, api };
  }

  it('routes op 20 and 22 frames and ignores others', async () => {
    const { crypto } = fakeCrypto();
    const { pm, gateway } = facade(crypto);
    pm.handleGatewayOp(20, {
      channel_id: '500',
      message_id: '1',
      sender_device_id: '20',
      recipients: [{ user_id: '1', device_id: '10', ciphertext_b64: 'w' }],
      mls_epoch: 1,
      content_type: 'welcome',
    });
    pm.handleGatewayOp(11, null);
    await vi.waitFor(() => expect(gateway.ofOp(GatewayOp.E2EE_ACK)).toHaveLength(1));
    expect(crypto.joinFromWelcome).toHaveBeenCalled();
  });

  it('applies CHANNEL_DELIVERY_MODE_UPDATE to the channel', () => {
    const { pm } = facade();
    pm.handleDispatch('CHANNEL_DELIVERY_MODE_UPDATE', { channel_id: '500', delivery_mode: 'p2p' });
    expect(useGuildStore.getState().channels['500']?.delivery_mode).toBe('p2p');
  });

  it('shows a relay rejection on the channel instead of staying silent', () => {
    const { pm } = facade();
    pm.handleDispatch('E2EE_ENVELOPE_REJECTED', { channel_id: '500', message_id: '9', reason: 'recipient_not_allowed' });
    expect(usePrivacyStore.getState().groups['500']).toMatchObject({ state: 'error', detail: expect.stringContaining('recipient_not_allowed') });
  });

  it('without a crypto module, ephemeral sends fail and nothing is relayed', async () => {
    const { pm, gateway } = facade(undefined);
    await expect(pm.sender.send(dm('ephemeral'), { content: 'secret' })).rejects.toMatchObject({ reason: 'encryption_unavailable' });
    expect(gateway.sent).toHaveLength(0);
  });
});

import { badgeOf, environmentOf, foregroundPresentation, permissionPlan, pushTargetOf, registrationOf, statusLabel } from '../../../src/notifications/push/pushModel';

describe('pushTargetOf', () => {
  it('routes scheduled event payloads only with both identifiers', () => {
    expect(pushTargetOf({ type: 'scheduled_event', guild_id: '1', event_id: '9', channel_id: '10' })).toEqual({ kind: 'scheduled_event', guildId: '1', eventId: '9' });
    expect(pushTargetOf({ type: 'scheduled_event', guild_id: '1', channel_id: '10' })).toBeNull();
  });
  it('reads the chat and message the notifier put in the payload', () => {
    expect(pushTargetOf({ channel_id: '10', guild_id: '1', message_id: '100' })).toEqual({ guildId: '1', channelId: '10', messageId: '100' });
  });

  it('treats a direct message (no guild) and a missing message id as null', () => {
    expect(pushTargetOf({ channel_id: '10' })).toEqual({ guildId: null, channelId: '10', messageId: null });
  });

  it.each([undefined, null, 'text', 5, {}, { channel_id: '' }, { channel_id: 7 }])('names no chat for %p', (data) => expect(pushTargetOf(data)).toBeNull());
});

describe('foregroundPresentation', () => {
  const data = { channel_id: '10' };

  it('shows a scheduled-event push whether the gateway is connected or not', () => {
    const event = { type: 'scheduled_event', dedupe_key: '1:9:10:0:2' };
    expect(foregroundPresentation({ gateway: 'ready', viewing: null, data: event })).toBe('show');
    expect(foregroundPresentation({ gateway: 'closed', viewing: null, data: event })).toBe('show');
  });

  it('leaves the banner to the app while the gateway is live', () => {
    expect(foregroundPresentation({ gateway: 'ready', viewing: null, data })).toBe('suppress');
  });

  it('shows the system banner when the gateway is not live, so the message is not lost', () => {
    for (const gateway of ['idle', 'connecting', 'reconnecting', 'closed'] as const) expect(foregroundPresentation({ gateway, viewing: null, data })).toBe('show');
  });

  it('never shows a push for the chat on screen', () => {
    expect(foregroundPresentation({ gateway: 'closed', viewing: '10', data })).toBe('suppress');
    expect(foregroundPresentation({ gateway: 'closed', viewing: '11', data })).toBe('show');
  });
});

describe('permissionPlan', () => {
  it('registers when allowed and never asks again after a refusal', () => {
    expect(permissionPlan({ permission: 'granted', offered: false, inChat: false })).toBe('register');
    expect(permissionPlan({ permission: 'denied', offered: true, inChat: true })).toBe('blocked');
  });

  it('offers the prompt once, and only inside a chat', () => {
    expect(permissionPlan({ permission: 'undetermined', offered: false, inChat: false })).toBe('wait');
    expect(permissionPlan({ permission: 'undetermined', offered: false, inChat: true })).toBe('offer');
    expect(permissionPlan({ permission: 'undetermined', offered: true, inChat: true })).toBe('wait');
  });
});

describe('small rules', () => {
  it('builds the registration body of an iPhone', () => {
    expect(registrationOf('ab12', 'sandbox', false, true)).toEqual({ platform: 'apns', token: 'ab12', environment: 'sandbox', previews: false, only_mentions: true });
  });

  it('builds the registration body of an Android phone: the FCM token, always production', () => {
    expect(registrationOf('fcm-token', 'sandbox', true, false, 'fcm')).toEqual({ platform: 'fcm', token: 'fcm-token', environment: 'production', previews: true, only_mentions: false });
  });

  it('names the phone settings app in the denied label', () => {
    expect(statusLabel('denied', 'Android Settings')).toBe('Off in Android Settings');
  });

  it('keeps the badge a non-negative whole number', () => {
    expect([badgeOf(3), badgeOf(0), badgeOf(-2), badgeOf(2.9)]).toEqual([3, 0, 0, 2]);
  });

  it('defaults to production unless the build says sandbox', () => {
    expect([environmentOf('sandbox'), environmentOf('production'), environmentOf(undefined), environmentOf(3)]).toEqual(['sandbox', 'production', 'production', 'production']);
  });

  it('describes every state on the settings page', () => {
    expect((['granted', 'denied', 'undetermined', 'unavailable'] as const).map((status) => statusLabel(status))).toEqual(['On', 'Off in iOS Settings', 'Not turned on yet', 'Not available in Expo Go']);
  });
});

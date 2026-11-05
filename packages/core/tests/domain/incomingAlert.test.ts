import { describe, expect, it } from 'vitest';
import { alertBody, incomingAlert, type IncomingAlertInput } from '@discordy/core/domain/incomingAlert';
import { emptySettings } from '@discordy/core/domain/notificationSettings';
import { MessageFlag } from '@discordy/core/contracts/rest';

const base = (over: Partial<IncomingAlertInput> = {}, message: Partial<IncomingAlertInput['message']> = {}): IncomingAlertInput => ({
  message: { channel_id: 'c1', guild_id: 'g1', author: { id: 'u2' }, mentions: [], mention_everyone: false, ...message },
  meId: 'u1',
  channel: { parent_id: null },
  settings: undefined,
  guildDefaultNotifications: 0,
  myRoleIds: [],
  onlyMentionsPref: false,
  viewingChannel: false,
  doNotDisturb: false,
  now: 1000,
  ...over,
});

describe('incomingAlert', () => {
  it('alerts for a message elsewhere at the default level', () => {
    expect(incomingAlert(base())).toBe(true);
  });

  it('never alerts for your own or silent messages', () => {
    expect(incomingAlert(base({}, { author: { id: 'u1' } }))).toBe(false);
    expect(incomingAlert(base({}, { flags: MessageFlag.SUPPRESS_NOTIFICATIONS }))).toBe(false);
  });

  it('stays quiet in the channel being viewed and in Do Not Disturb', () => {
    expect(incomingAlert(base({ viewingChannel: true }))).toBe(false);
    expect(incomingAlert(base({ doNotDisturb: true }))).toBe(false);
  });

  it('follows only-mentions from the server default, the settings and the device preference', () => {
    expect(incomingAlert(base({ guildDefaultNotifications: 1 }))).toBe(false);
    expect(incomingAlert(base({ onlyMentionsPref: true }))).toBe(false);
    expect(incomingAlert(base({ onlyMentionsPref: true }, { mentions: [{ id: 'u1' }] }))).toBe(true);
    expect(incomingAlert(base({ settings: { ...emptySettings('g1'), message_notifications: 2 } }, { mentions: [{ id: 'u1' }] }))).toBe(false);
  });

  it('is silenced by a muted server or category', () => {
    expect(incomingAlert(base({ settings: { ...emptySettings('g1'), muted: true } }))).toBe(false);
    const overrides = { ...emptySettings('g1'), channel_overrides: [{ channel_id: 'cat', muted: true, mute_config: null, message_notifications: null }] };
    expect(incomingAlert(base({ settings: overrides, channel: { parent_id: 'cat' } }))).toBe(false);
  });

  it('respects suppressed @everyone', () => {
    const ping = { mention_everyone: true };
    expect(incomingAlert(base({ onlyMentionsPref: true }, ping))).toBe(true);
    expect(incomingAlert(base({ onlyMentionsPref: true, settings: { ...emptySettings('g1'), suppress_everyone: true } }, ping))).toBe(false);
  });
});

describe('alertBody', () => {
  it('strips markdown, truncates and names attachments', () => {
    expect(alertBody({ content: '**hi** there' })).toBe('hi there');
    expect(alertBody({ content: 'x'.repeat(300) }, 10)).toHaveLength(10);
    expect(alertBody({ content: '' })).toBe('Sent an attachment');
  });

  it('hides private text', () => {
    expect(alertBody({ content: 'secret', deliveryMode: 'ephemeral' })).toBe('Sent a private message');
  });
});

import { describe, expect, it } from 'vitest';
import {
  effectiveDeliveryMode,
  stricterMode,
  validateModeForChannel,
  validateModeForDevice,
  availableModes,
} from '../../src/domain/deliveryMode';

describe('validateModeForDevice', () => {
  it('never blocks standard mode', () => {
    expect(validateModeForDevice('standard', false)).toBeNull();
  });

  it('blocks encrypted modes on a device that is not registered', () => {
    expect(validateModeForDevice('ephemeral', false)).toMatch(/Settings > Devices/);
    expect(validateModeForDevice('p2p', false)).toMatch(/Settings > Devices/);
  });

  it('allows encrypted modes once the device is registered', () => {
    expect(validateModeForDevice('ephemeral', true)).toBeNull();
    expect(validateModeForDevice('p2p', true)).toBeNull();
  });
});

describe('stricterMode', () => {
  it('orders standard < ephemeral < p2p', () => {
    expect(stricterMode('standard', 'ephemeral')).toBe('ephemeral');
    expect(stricterMode('p2p', 'ephemeral')).toBe('p2p');
    expect(stricterMode('standard', 'standard')).toBe('standard');
  });
});

describe('effectiveDeliveryMode (P11)', () => {
  it('uses the channel mode for guild channels, ignoring account defaults', () => {
    expect(
      effectiveDeliveryMode({
        guildId: 'g',
        channelMode: 'ephemeral',
        participants: [{ override: null, accountDefault: 'p2p' }],
      }),
    ).toBe('ephemeral');
  });

  it('takes the strictest participant setting in DMs', () => {
    expect(
      effectiveDeliveryMode({
        guildId: null,
        channelMode: 'standard',
        participants: [
          { override: null, accountDefault: 'standard' },
          { override: 'ephemeral', accountDefault: 'standard' },
        ],
      }),
    ).toBe('ephemeral');
  });

  it('per-chat override beats the account default', () => {
    expect(
      effectiveDeliveryMode({
        guildId: null,
        channelMode: 'standard',
        participants: [
          { override: 'standard', accountDefault: 'p2p' },
          { override: null, accountDefault: 'standard' },
        ],
      }),
    ).toBe('standard');
  });

  it('falls back from p2p to ephemeral for group DMs over 10 members', () => {
    const participants = Array.from({ length: 11 }, () => ({ override: null, accountDefault: 'p2p' as const }));
    expect(effectiveDeliveryMode({ guildId: null, channelMode: 'standard', participants })).toBe('ephemeral');
  });
});

describe('validateModeForChannel', () => {
  it('rejects p2p in guild channels', () => {
    expect(validateModeForChannel('p2p', { isGuild: true, memberCount: 3 })).toMatch(/guild/i);
  });

  it('rejects ephemeral in guild channels over 100 members', () => {
    expect(validateModeForChannel('ephemeral', { isGuild: true, memberCount: 101 })).toMatch(/100/);
    expect(validateModeForChannel('ephemeral', { isGuild: true, memberCount: 100 })).toBeNull();
  });

  it('rejects p2p for group DMs over 10 members', () => {
    expect(validateModeForChannel('p2p', { isGuild: false, memberCount: 11 })).toMatch(/10/);
  });

  it('lists only the allowed modes', () => {
    expect(availableModes({ isGuild: true, memberCount: 500 })).toEqual(['standard']);
    expect(availableModes({ isGuild: false, memberCount: 2 })).toEqual(['standard', 'ephemeral', 'p2p']);
  });
});

import { describe, expect, it } from 'vitest';
import { groupMessages } from '@renderer/domain/messageGrouping';
import { playbackPosition } from '@renderer/domain/watchTogether';
import { SCREEN_PRESETS, presetConstraints } from '@renderer/domain/screenPresets';
import { extractDtlsFingerprint, fingerprintSigningPayload } from '@renderer/domain/p2pIdentity';
import { isUnread } from '@renderer/domain/unread';
import { reconnectDelay } from '@renderer/domain/backoff';

describe('groupMessages', () => {
  it('groups consecutive messages by the same author within 7 minutes', () => {
    const t = Date.UTC(2026, 9, 16, 10, 0);
    const groups = groupMessages([
      { id: '1', authorId: 'a', timestamp: t },
      { id: '2', authorId: 'a', timestamp: t + 60_000 },
      { id: '3', authorId: 'b', timestamp: t + 120_000 },
      { id: '4', authorId: 'b', timestamp: t + 120_000 + 8 * 60_000 },
    ]);
    expect(groups.map((g) => g.startsGroup)).toEqual([true, false, true, true]);
  });

  it('marks day boundaries', () => {
    const groups = groupMessages([
      { id: '1', authorId: 'a', timestamp: new Date(2026, 9, 16, 23, 59).getTime() },
      { id: '2', authorId: 'a', timestamp: new Date(2026, 9, 17, 0, 1).getTime() },
    ]);
    expect(groups[1]!.startsDay).toBe(true);
    expect(groups[1]!.startsGroup).toBe(true);
  });
});

describe('playbackPosition', () => {
  it('advances while playing using the server clock offset', () => {
    const pos = playbackPosition(
      { action: 'play', position_ms: 10_000, at_server_ms: 1_000 },
      { localNowMs: 5_000, serverOffsetMs: -1_000 },
    );
    expect(pos).toBe(13_000);
  });

  it('stays put while paused', () => {
    expect(
      playbackPosition({ action: 'pause', position_ms: 10_000, at_server_ms: 0 }, { localNowMs: 99_999, serverOffsetMs: 0 }),
    ).toBe(10_000);
  });
});

describe('screen presets', () => {
  it('defines 720p30, 1080p60, 1440p60 and Source', () => {
    expect(SCREEN_PRESETS.map((p) => p.id)).toEqual(['720p30', '1080p60', '1440p60', 'source']);
  });

  it('maps a preset to capture constraints', () => {
    expect(presetConstraints('1080p60')).toEqual({ width: 1920, height: 1080, frameRate: 60, maxBitrateKbps: 6000 });
    expect(presetConstraints('source').width).toBeUndefined();
  });
});

describe('p2p identity', () => {
  it('extracts the DTLS fingerprint from SDP', () => {
    expect(extractDtlsFingerprint('v=0\r\na=fingerprint:sha-256 AB:CD\r\n')).toBe('sha-256 AB:CD');
    expect(extractDtlsFingerprint('v=0\r\n')).toBeNull();
  });

  it('binds the fingerprint to channel and both devices', () => {
    expect(
      fingerprintSigningPayload({ channelId: 'c', fromDeviceId: 'd1', toDeviceId: 'd2', fingerprint: 'sha-256 AB' }),
    ).toBe('discordy-p2p-v1|c|d1|d2|sha-256 AB');
  });
});

describe('isUnread', () => {
  it('is unread when the last message is newer than the read marker', () => {
    expect(isUnread('20', '10')).toBe(true);
    expect(isUnread('10', '10')).toBe(false);
    expect(isUnread(null, null)).toBe(false);
    expect(isUnread('5', null)).toBe(true);
  });
});

describe('reconnectDelay', () => {
  it('grows exponentially, caps, and adds bounded jitter', () => {
    expect(reconnectDelay(0, () => 0)).toBe(1000);
    expect(reconnectDelay(3, () => 0)).toBe(8000);
    expect(reconnectDelay(20, () => 0)).toBe(30_000);
    expect(reconnectDelay(0, () => 1)).toBe(1250);
  });
});

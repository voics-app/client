import { describe, expect, it } from 'vitest';
import { iceServersFromTurn, refreshDelayMs } from '@renderer/domain/turn';

const turn = {
  urls: ['turn:turn.example.com:3478?transport=udp', 'turn:turn.example.com:3478?transport=tcp', 'turns:turn.example.com:5349'],
  username: '1800003600:42',
  credential: 'secret',
  ttl: 3600,
};

describe('iceServersFromTurn', () => {
  it('returns no servers without credentials', () => {
    expect(iceServersFromTurn(null)).toEqual([]);
    expect(iceServersFromTurn(undefined)).toEqual([]);
  });

  it('adds a deduplicated STUN entry per TURN host, then the credentialed TURN entry', () => {
    expect(iceServersFromTurn(turn)).toEqual([
      { urls: ['stun:turn.example.com:3478', 'stun:turn.example.com:5349'] },
      { urls: turn.urls, username: turn.username, credential: turn.credential },
    ]);
  });

  it('defaults the STUN port to 3478 and handles bracketed IPv6 hosts', () => {
    const servers = iceServersFromTurn({ ...turn, urls: ['turn:host.test', 'turn:[::1]:3478'] });
    expect(servers[0]).toEqual({ urls: ['stun:host.test:3478', 'stun:[::1]:3478'] });
  });

  it('skips malformed urls without throwing', () => {
    const servers = iceServersFromTurn({ ...turn, urls: ['nonsense', 'turn:ok.test:3478'] });
    expect(servers[0]).toEqual({ urls: ['stun:ok.test:3478'] });
  });
});

describe('refreshDelayMs', () => {
  it('refreshes at 80% of the ttl, at least 30 seconds out', () => {
    expect(refreshDelayMs(3600)).toBe(2_880_000);
    expect(refreshDelayMs(10)).toBe(30_000);
  });
});

import { peerStatusLine } from '../../src/privacy/peerStatusModel';

describe('peerStatusLine', () => {
  it('says nothing for a standard chat and for a healthy ephemeral group', () => {
    expect(peerStatusLine({ mode: 'standard' })).toBeNull();
    expect(peerStatusLine({ mode: 'ephemeral', group: { state: 'ready' } })).toBeNull();
    expect(peerStatusLine({ mode: 'ephemeral' })).toBeNull();
  });

  it('blocks ephemeral sending loudly when the group could not be established', () => {
    expect(peerStatusLine({ mode: 'ephemeral', group: { state: 'error', detail: 'no devices' } })).toEqual({
      tone: 'danger',
      text: 'Encryption unavailable: no devices. Messages are never sent unencrypted in this mode.',
    });
    expect(peerStatusLine({ mode: 'ephemeral', group: { state: 'error' } })?.text).toContain('sending is blocked');
  });

  it('shows progress while the group or the direct link is being set up', () => {
    expect(peerStatusLine({ mode: 'ephemeral', group: { state: 'establishing' } })).toMatchObject({ tone: 'info', busy: true });
    expect(peerStatusLine({ mode: 'p2p', p2p: { state: 'connecting', verified: false } })).toMatchObject({ tone: 'info', busy: true });
  });

  it('tells what a peer-to-peer chat does before the first message', () => {
    expect(peerStatusLine({ mode: 'p2p' })?.text).toBe('Peer-to-peer: a direct link opens when you send. The peer must be online.');
  });

  it('offers the safety number on an open link and says whether the identity was verified', () => {
    expect(peerStatusLine({ mode: 'p2p', p2p: { state: 'open', verified: true } })).toEqual({ tone: 'ok', text: 'Direct link open, identity verified', safetyNumber: true });
    expect(peerStatusLine({ mode: 'p2p', p2p: { state: 'open', verified: false } })?.text).toBe('Direct link open');
  });

  it('warns for an offline peer and a failed connection, and stops on an unverified identity', () => {
    expect(peerStatusLine({ mode: 'p2p', p2p: { state: 'peer_offline', verified: false } })).toMatchObject({ tone: 'warn' });
    expect(peerStatusLine({ mode: 'p2p', p2p: { state: 'failed', verified: false, detail: 'ICE failed.' } })?.text).toBe('Direct connection failed. ICE failed.');
    expect(peerStatusLine({ mode: 'p2p', p2p: { state: 'unverified', verified: false, detail: 'Fingerprint mismatch.' } })).toEqual({
      tone: 'danger',
      text: 'Peer identity could not be verified. Sending is blocked. Fingerprint mismatch.',
    });
  });
});

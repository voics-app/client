import { describe, expect, it } from 'vitest';
import { parseLocalOffer, synthesizeRemoteAnswer } from '@renderer/domain/sdp';

const OFFER = [
  'v=0',
  'o=- 4611731400430051336 2 IN IP4 127.0.0.1',
  's=-',
  't=0 0',
  'a=group:BUNDLE 0 1',
  'a=extmap-allow-mixed',
  'a=msid-semantic: WMS stream',
  'm=audio 9 UDP/TLS/RTP/SAVPF 111 63',
  'c=IN IP4 0.0.0.0',
  'a=rtcp:9 IN IP4 0.0.0.0',
  'a=ice-ufrag:LoCa',
  'a=ice-pwd:localpasswordlocalpassword',
  'a=ice-options:trickle',
  'a=fingerprint:sha-256 AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99',
  'a=setup:actpass',
  'a=mid:0',
  'a=extmap:1 urn:ietf:params:rtp-hdrext:ssrc-audio-level',
  'a=sendrecv',
  'a=rtcp-mux',
  'a=rtpmap:111 opus/48000/2',
  'a=fmtp:111 minptime=10;useinbandfec=1',
  'm=video 9 UDP/TLS/RTP/SAVPF 98 99',
  'c=IN IP4 0.0.0.0',
  'a=mid:1',
  'a=sendrecv',
  'a=rtpmap:98 VP9/90000',
  'a=rtpmap:99 rtx/90000',
  'a=fmtp:99 apt=98',
  '',
].join('\r\n');

describe('parseLocalOffer', () => {
  it('extracts ICE credentials, fingerprint and payload types', () => {
    const parsed = parseLocalOffer(OFFER);
    expect(parsed.iceUfrag).toBe('LoCa');
    expect(parsed.icePwd).toBe('localpasswordlocalpassword');
    expect(parsed.fingerprint).toMatch(/^sha-256 AA:BB/);
    expect(parsed.audio).toEqual({ mid: '0', payloadType: 111, codec: 'opus', ssrc: null });
    expect(parsed.video).toEqual({ mid: '1', payloadType: 98, rtxPayloadType: 99, codec: 'VP9', ssrc: null, rtxSsrc: null });
    expect(parsed.audioLevelExtId).toBe(1);
  });

  it('reads the SSRCs the browser chose, with the RTX partner from the FID group', () => {
    const withSsrcs = OFFER.replace('a=mid:0', 'a=mid:0\r\na=ssrc:1111 cname:x').replace(
      'a=mid:1',
      'a=mid:1\r\na=ssrc-group:FID 2222 3333\r\na=ssrc:2222 cname:x\r\na=ssrc:3333 cname:x',
    );
    const parsed = parseLocalOffer(withSsrcs);
    expect(parsed.audio.ssrc).toBe(1111);
    expect(parsed.video).toMatchObject({ ssrc: 2222, rtxSsrc: 3333 });
  });
});

describe('synthesizeRemoteAnswer', () => {
  const answer = synthesizeRemoteAnswer(parseLocalOffer(OFFER), {
    ice_ufrag: 'SrvU',
    ice_pwd: 'serverpasswordserverpassword',
    fingerprint: 'sha-256 11:22:33',
    candidates: [{ ip: '203.0.113.7', port: 50000, protocol: 'udp' }],
    audio_codec: 'opus',
    video_codec: 'VP9',
    e2ee: null,
  });

  it('is a valid SDP answer with BUNDLE and ice-lite', () => {
    expect(answer.startsWith('v=0\r\n')).toBe(true);
    expect(answer).toContain('a=group:BUNDLE 0 1');
    expect(answer).toContain('a=ice-lite');
    expect(answer.endsWith('\r\n')).toBe(true);
  });

  it('carries the server credentials and fingerprint in every section', () => {
    expect(answer.match(/a=ice-ufrag:SrvU/g)).toHaveLength(2);
    expect(answer.match(/a=fingerprint:sha-256 11:22:33/g)).toHaveLength(2);
    expect(answer).toContain('a=setup:passive');
  });

  it('emits host candidates from the payload', () => {
    expect(answer).toContain('a=candidate:1 1 udp 2130706431 203.0.113.7 50000 typ host');
    expect(answer).toContain('a=end-of-candidates');
  });

  it('mirrors the offer payload types and directions', () => {
    expect(answer).toContain('m=audio 50000 UDP/TLS/RTP/SAVPF 111');
    expect(answer).toContain('a=rtpmap:111 opus/48000/2');
    expect(answer).toContain('a=fmtp:111 minptime=10;useinbandfec=1;usedtx=1');
    expect(answer).toContain('m=video 50000 UDP/TLS/RTP/SAVPF 98 99');
    expect(answer).toContain('a=fmtp:99 apt=98');
    expect(answer).toContain('a=rtcp-fb:98 nack pli');
    expect(answer).toContain('a=extmap:1 urn:ietf:params:rtp-hdrext:ssrc-audio-level');
    expect(answer.match(/a=sendrecv/g)).toHaveLength(2);
  });

  it('omits the video section when the offer has none', () => {
    const audioOnly = OFFER.split('m=video')[0]!.replace('a=group:BUNDLE 0 1', 'a=group:BUNDLE 0');
    const result = synthesizeRemoteAnswer(parseLocalOffer(audioOnly), {
      ice_ufrag: 'u',
      ice_pwd: 'p',
      fingerprint: 'sha-256 00',
      candidates: [{ ip: '198.51.100.1', port: 50000, protocol: 'udp' }],
      audio_codec: 'opus',
      video_codec: 'VP9',
      e2ee: null,
    });
    expect(result).not.toContain('m=video');
    expect(result).toContain('a=group:BUNDLE 0\r\n');
  });
});

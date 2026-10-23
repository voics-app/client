/**
 * SDP handling for the voice protocol (P8). The voice server never sends SDP;
 * it sends a ~1 KB SESSION_DESCRIPTION. We parse what we need from our local
 * offer (to build SELECT_PROTOCOL) and synthesize the remote answer locally.
 */
import type { SessionDescription } from '@shared/contracts/voice';

export interface AudioSection {
  mid: string;
  payloadType: number;
  codec: 'opus';
  /** SSRC the browser chose for our audio; the voice node must expect this one. */
  ssrc: number | null;
}

export interface VideoSection {
  mid: string;
  payloadType: number;
  rtxPayloadType: number | null;
  codec: string;
  ssrc: number | null;
  rtxSsrc: number | null;
}

/*
 * Uplink bandwidth estimation (client#158). Our own uplink is negotiated WITHOUT transport-wide-cc (no
 * extension, no rtcp-fb): measured against the voice node, Chromium's send-side estimator never applies the
 * node's TWCC reports and decays to its floor (~60 kbps: 320x180 video at 7 fps), whereas without TWCC the
 * sender keeps its start bitrate and sends 1280x720. The estimator then relies on receiver reports (loss) and
 * REMB. Downlink sections keep TWCC.
 */

/**
 * Chromium only honours these on the codec of the remote description: the sender estimate starts at 1.5 Mbps
 * instead of 300 kbps, so 720p30 is sent from the first second and up to 4.5 Mbps (1080p30) is allowed.
 */
export const VIDEO_BWE_FMTP = `x-google-start-bitrate=${1500};x-google-min-bitrate=${600};x-google-max-bitrate=${4500}`;

export interface ParsedOffer {
  iceUfrag: string;
  icePwd: string;
  fingerprint: string;
  audio: AudioSection;
  video: VideoSection | null;
  /** The screen share transceiver: the second video section, sent as its own stream. */
  screen: { mid: string; ssrc: number | null; rtxSsrc: number | null } | null;
  audioLevelExtId: number | null;
  /** extmap URIs per mid, used to echo supported header extensions. */
  extmaps: Record<string, { id: number; uri: string }[]>;
}

interface RawSection {
  kind: string;
  lines: string[];
}

const SUPPORTED_EXTENSIONS = new Set([
  'urn:ietf:params:rtp-hdrext:ssrc-audio-level',
  'urn:ietf:params:rtp-hdrext:sdes:mid',
  'http://www.webrtc.org/experiments/rtp-hdrext/abs-send-time',
  'http://www.ietf.org/id/draft-holmer-rmcat-transport-wide-cc-extensions-01',
  'urn:3gpp:video-orientation',
]);

function splitSections(sdp: string): { session: string[]; media: RawSection[] } {
  const lines = sdp.split(/\r?\n/).filter((l) => l.length > 0);
  const session: string[] = [];
  const media: RawSection[] = [];
  for (const line of lines) {
    if (line.startsWith('m=')) media.push({ kind: line.slice(2).split(' ')[0] ?? '', lines: [line] });
    else if (media.length > 0) media[media.length - 1]!.lines.push(line);
    else session.push(line);
  }
  return { session, media };
}

function attr(lines: readonly string[], name: string): string | null {
  const prefix = `a=${name}:`;
  const line = lines.find((l) => l.startsWith(prefix));
  return line ? line.slice(prefix.length).trim() : null;
}

/** The primary SSRC of a section and, when present, its RTX partner from `a=ssrc-group:FID`. */
function ssrcsOf(lines: readonly string[]): { ssrc: number | null; rtxSsrc: number | null } {
  const fid = attr(lines, 'ssrc-group')?.split(' ');
  if (fid && fid[0] === 'FID' && fid.length >= 3) return { ssrc: Number(fid[1]), rtxSsrc: Number(fid[2]) };
  const first = lines.find((l) => l.startsWith('a=ssrc:'));
  return { ssrc: first ? Number(first.slice('a=ssrc:'.length).split(' ')[0]) : null, rtxSsrc: null };
}

function rtpmaps(lines: readonly string[]): { pt: number; codec: string }[] {
  return lines
    .filter((l) => l.startsWith('a=rtpmap:'))
    .map((l) => {
      const [pt, rest] = l.slice('a=rtpmap:'.length).split(' ');
      return { pt: Number(pt), codec: (rest ?? '').split('/')[0] ?? '' };
    });
}

function extmapsOf(lines: readonly string[]): { id: number; uri: string }[] {
  return lines
    .filter((l) => l.startsWith('a=extmap:'))
    .map((l) => {
      const [idPart, uri] = l.slice('a=extmap:'.length).split(' ');
      return { id: Number((idPart ?? '').split('/')[0]), uri: uri ?? '' };
    });
}

export function parseLocalOffer(sdp: string, preferredVideoCodec = 'VP9'): ParsedOffer {
  const { session, media } = splitSections(sdp);
  const audioRaw = media.find((m) => m.kind === 'audio');
  if (!audioRaw) throw new Error('offer has no audio section');
  const [videoRaw, screenRaw] = media.filter((m) => m.kind === 'video');
  const pick = (name: string) => attr(audioRaw.lines, name) ?? attr(session, name);

  const iceUfrag = pick('ice-ufrag');
  const icePwd = pick('ice-pwd');
  const fingerprint = pick('fingerprint');
  if (!iceUfrag || !icePwd || !fingerprint) throw new Error('offer is missing ICE credentials or fingerprint');

  const opus = rtpmaps(audioRaw.lines).find((r) => r.codec.toLowerCase() === 'opus');
  if (!opus) throw new Error('offer does not support opus');

  const extmaps: ParsedOffer['extmaps'] = {};
  for (const section of media) {
    const mid = attr(section.lines, 'mid');
    if (mid !== null) extmaps[mid] = extmapsOf(section.lines);
  }
  const audioMid = attr(audioRaw.lines, 'mid') ?? '0';
  const audioLevel = (extmaps[audioMid] ?? []).find((e) => e.uri.endsWith('ssrc-audio-level'));

  return {
    iceUfrag,
    icePwd,
    fingerprint,
    audio: { mid: audioMid, payloadType: opus.pt, codec: 'opus', ssrc: ssrcsOf(audioRaw.lines).ssrc },
    video: videoRaw ? parseVideo(videoRaw.lines, preferredVideoCodec) : null,
    screen: screenRaw ? { mid: attr(screenRaw.lines, 'mid') ?? '2', ...ssrcsOf(screenRaw.lines) } : null,
    audioLevelExtId: audioLevel?.id ?? null,
    extmaps,
  };
}

function parseVideo(lines: readonly string[], preferred: string): VideoSection | null {
  const maps = rtpmaps(lines);
  const chosen =
    maps.find((m) => m.codec.toUpperCase() === preferred.toUpperCase()) ??
    maps.find((m) => ['VP9', 'AV1', 'H264', 'VP8'].includes(m.codec.toUpperCase()));
  if (!chosen) return null;
  const rtx = lines
    .filter((l) => l.startsWith('a=fmtp:'))
    .map((l) => l.slice('a=fmtp:'.length).split(' '))
    .find(([, params]) => params === `apt=${chosen.pt}`);
  return {
    mid: attr(lines, 'mid') ?? '1',
    payloadType: chosen.pt,
    rtxPayloadType: rtx ? Number(rtx[0]) : null,
    codec: chosen.codec.toUpperCase(),
    ...ssrcsOf(lines),
  };
}

const CLOCK = { opus: 'opus/48000/2', video: 90000 };

export function synthesizeRemoteAnswer(offer: ParsedOffer, remote: SessionDescription): string {
  const port = remote.candidates[0]?.port ?? 9;
  const mids = [offer.audio.mid, ...(offer.video ? [offer.video.mid] : [])];
  const lines: string[] = [
    'v=0',
    `o=- ${Date.now()} 2 IN IP4 127.0.0.1`,
    's=-',
    't=0 0',
    `a=group:BUNDLE ${mids.join(' ')}`,
    'a=ice-lite',
    'a=msid-semantic: WMS *',
  ];

  const transport = (mid: string): string[] => [
    `c=IN IP4 ${remote.candidates[0]?.ip ?? '0.0.0.0'}`,
    `a=rtcp:${port} IN IP4 ${remote.candidates[0]?.ip ?? '0.0.0.0'}`,
    `a=ice-ufrag:${remote.ice_ufrag}`,
    `a=ice-pwd:${remote.ice_pwd}`,
    `a=fingerprint:${remote.fingerprint}`,
    'a=setup:passive',
    `a=mid:${mid}`,
    ...(offer.extmaps[mid] ?? [])
      .filter((e) => SUPPORTED_EXTENSIONS.has(e.uri) && !e.uri.includes('transport-wide-cc'))
      .map((e) => `a=extmap:${e.id} ${e.uri}`),
    'a=sendrecv',
    'a=rtcp-mux',
  ];
  const candidates = [
    ...remote.candidates.map(
      (c, i) => `a=candidate:${i + 1} 1 ${c.protocol} 2130706431 ${c.ip} ${c.port} typ host`,
    ),
    'a=end-of-candidates',
  ];

  const audioPt = offer.audio.payloadType;
  lines.push(
    `m=audio ${port} UDP/TLS/RTP/SAVPF ${audioPt}`,
    ...transport(offer.audio.mid),
    `a=rtpmap:${audioPt} ${CLOCK.opus}`,
    `a=fmtp:${audioPt} minptime=10;useinbandfec=1;usedtx=1`,
    ...candidates,
  );

  if (offer.video) {
    const { payloadType: vpt, rtxPayloadType: rtx, codec, mid } = offer.video;
    lines.push(
      `m=video ${port} UDP/TLS/RTP/SAVPF ${vpt}${rtx !== null ? ` ${rtx}` : ''}`,
      ...transport(mid),
      `a=rtpmap:${vpt} ${codec}/${CLOCK.video}`,
      `a=fmtp:${vpt} ${VIDEO_BWE_FMTP}`,
      `a=rtcp-fb:${vpt} goog-remb`,
      `a=rtcp-fb:${vpt} ccm fir`,
      `a=rtcp-fb:${vpt} nack`,
      `a=rtcp-fb:${vpt} nack pli`,
      ...(rtx !== null ? [`a=rtpmap:${rtx} rtx/${CLOCK.video}`, `a=fmtp:${rtx} apt=${vpt}`] : []),
      ...candidates,
    );
  }

  return `${lines.join('\r\n')}\r\n`;
}

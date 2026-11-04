/**
 * Renegotiation support for the P8 minimal-payload SDP flow. The base answer
 * (domain/sdp.ts) covers the first audio and video sections. Each additional
 * remote source (another user's mic, camera or screen) or local screen sender
 * becomes one more m-section appended to the synthesized answer, with its ssrc
 * declared so Chromium raises `track` for it.
 */
import type { SessionDescription } from '@discordy/core/contracts/voice';
import { VIDEO_BWE_FMTP } from '@discordy/core/domain/sdp';

export type SourceKind = 'audio' | 'camera' | 'screen';

export interface RemoteSource {
  userId: string;
  source: SourceKind;
  ssrc: number;
  rtxSsrc: number;
  active: boolean;
}

export type SectionPlan =
  | { mid: string; role: 'remote'; source: RemoteSource }
  | { mid: string; role: 'local-screen' };

interface OfferSection {
  kind: 'audio' | 'video';
  mid: string;
  lines: string[];
}

export function offerSections(sdp: string): OfferSection[] {
  const sections: OfferSection[] = [];
  for (const line of sdp.split(/\r?\n/)) {
    if (line.startsWith('m=')) sections.push({ kind: line.startsWith('m=audio') ? 'audio' : 'video', mid: '', lines: [line] });
    else if (line && sections.length > 0) {
      const section = sections[sections.length - 1]!;
      section.lines.push(line);
      if (line.startsWith('a=mid:')) section.mid = line.slice(6).trim();
    }
  }
  return sections;
}

function codecPayload(lines: readonly string[], name: string): { pt: number; rtx: number | null } | null {
  const maps = lines
    .filter((l) => l.startsWith('a=rtpmap:'))
    .map((l) => {
      const [pt, rest] = l.slice(9).split(' ');
      return { pt: Number(pt), codec: (rest ?? '').split('/')[0] ?? '' };
    });
  const chosen = maps.find((m) => m.codec.toUpperCase() === name.toUpperCase());
  if (!chosen) return null;
  const rtxLine = lines
    .filter((l) => l.startsWith('a=fmtp:'))
    .map((l) => l.slice(7).split(' '))
    .find(([, params]) => params === `apt=${chosen.pt}`);
  return { pt: chosen.pt, rtx: rtxLine ? Number(rtxLine[0]) : null };
}

const SUPPORTED_EXTENSIONS = [
  'urn:ietf:params:rtp-hdrext:ssrc-audio-level',
  'urn:ietf:params:rtp-hdrext:sdes:mid',
  'http://www.webrtc.org/experiments/rtp-hdrext/abs-send-time',
  'http://www.ietf.org/id/draft-holmer-rmcat-transport-wide-cc-extensions-01',
];

function sectionAnswer(
  offer: OfferSection,
  remote: SessionDescription,
  direction: 'sendonly' | 'recvonly' | 'inactive',
  source: RemoteSource | null,
): string[] | null {
  const codecName = offer.kind === 'audio' ? 'opus' : remote.video_codec;
  const payload = codecPayload(offer.lines, codecName);
  if (!payload) return null;
  const ip = remote.candidates[0]?.ip ?? '0.0.0.0';
  const port = remote.candidates[0]?.port ?? 9;
  const pts = `${payload.pt}${payload.rtx !== null && offer.kind === 'video' ? ` ${payload.rtx}` : ''}`;
  // The client's own uplink runs without transport-wide-cc, see the uplink note in domain/sdp.
  const uplink = direction === 'recvonly';
  const extmaps = offer.lines
    .filter((l) => l.startsWith('a=extmap:'))
    .map((l) => l.slice(9).split(' '))
    .filter(([, uri]) => SUPPORTED_EXTENSIONS.includes(uri ?? '') && !(uplink && uri?.includes('transport-wide-cc')))
    .map(([id, uri]) => `a=extmap:${id} ${uri}`);
  const out = [
    `m=${offer.kind} ${port} UDP/TLS/RTP/SAVPF ${pts}`,
    `c=IN IP4 ${ip}`,
    `a=rtcp:${port} IN IP4 ${ip}`,
    `a=ice-ufrag:${remote.ice_ufrag}`,
    `a=ice-pwd:${remote.ice_pwd}`,
    `a=fingerprint:${remote.fingerprint}`,
    'a=setup:passive',
    `a=mid:${offer.mid}`,
    ...extmaps,
    `a=${direction}`,
    'a=rtcp-mux',
  ];
  if (offer.kind === 'audio') {
    out.push(`a=rtpmap:${payload.pt} opus/48000/2`, `a=fmtp:${payload.pt} minptime=10;useinbandfec=1;usedtx=1`, ...(uplink ? [] : [`a=rtcp-fb:${payload.pt} transport-cc`]));
  } else {
    out.push(
      `a=rtpmap:${payload.pt} ${remote.video_codec.toUpperCase()}/90000`,
      `a=fmtp:${payload.pt} ${VIDEO_BWE_FMTP}`,
      `a=rtcp-fb:${payload.pt} goog-remb`,
      ...(uplink ? [] : [`a=rtcp-fb:${payload.pt} transport-cc`]),
      `a=rtcp-fb:${payload.pt} ccm fir`,
      `a=rtcp-fb:${payload.pt} nack`,
      `a=rtcp-fb:${payload.pt} nack pli`,
    );
    if (payload.rtx !== null) out.push(`a=rtpmap:${payload.rtx} rtx/90000`, `a=fmtp:${payload.rtx} apt=${payload.pt}`);
  }
  if (source && direction === 'sendonly') {
    const stream = `${source.userId}:${source.source}`;
    const track = `${source.source}-${source.ssrc}`;
    out.push(`a=msid:${stream} ${track}`);
    // Primary SSRC first: Chromium takes the first a=ssrc of a section as the media stream, so
    // listing RTX first made the receiver treat retransmissions as the video and decode nothing.
    const rtx = offer.kind === 'video' && source.rtxSsrc > 0;
    if (rtx) out.push(`a=ssrc-group:FID ${source.ssrc} ${source.rtxSsrc}`);
    out.push(`a=ssrc:${source.ssrc} cname:${source.userId}`, `a=ssrc:${source.ssrc} msid:${stream} ${track}`);
    if (rtx) out.push(`a=ssrc:${source.rtxSsrc} cname:${source.userId}`, `a=ssrc:${source.rtxSsrc} msid:${stream} ${track}`);
  }
  for (const [i, c] of remote.candidates.entries()) out.push(`a=candidate:${i + 1} 1 ${c.protocol} 2130706431 ${c.ip} ${c.port} typ host`);
  out.push('a=end-of-candidates');
  return out;
}

/**
 * Extends a base answer (which already answers the first audio/video sections)
 * with one section per additional offer section described in `plans`.
 * Offer sections that have no plan are answered `inactive`.
 */
export function extendAnswer(baseAnswer: string, offerSdp: string, remote: SessionDescription, plans: readonly SectionPlan[]): string {
  const baseMids = new Set(
    baseAnswer
      .split(/\r?\n/)
      .filter((l) => l.startsWith('a=mid:'))
      .map((l) => l.slice(6).trim()),
  );
  const extras = offerSections(offerSdp).filter((s) => !baseMids.has(s.mid));
  if (extras.length === 0) return baseAnswer;

  const sections: string[][] = [];
  for (const offer of extras) {
    const plan = plans.find((p) => p.mid === offer.mid);
    let direction: 'sendonly' | 'recvonly' | 'inactive' = 'inactive';
    let source: RemoteSource | null = null;
    if (plan?.role === 'local-screen') direction = 'recvonly';
    if (plan?.role === 'remote' && plan.source.active) {
      direction = 'sendonly';
      source = plan.source;
    }
    const lines = sectionAnswer(offer, remote, direction, source);
    if (lines) sections.push(lines);
  }
  const mids = extras.map((s) => s.mid);
  const base = baseAnswer.replace(/\r?\n$/, '').replace(/^a=group:BUNDLE (.*)$/m, (_m, existing: string) => `a=group:BUNDLE ${existing} ${mids.join(' ')}`);
  return `${[base, ...sections.map((s) => s.join('\r\n'))].join('\r\n')}\r\n`;
}

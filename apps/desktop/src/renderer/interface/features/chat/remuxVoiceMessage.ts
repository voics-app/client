/** Read final Matroska DiscardPadding without scanning through encoded packet bytes. */
function finalWebmPadding(bytes: Uint8Array): number {
  let padding = 0;
  let padded = false;
  const read = (at: number, id: boolean): { value: number; length: number; unknown: boolean } => {
    const first = bytes[at];
    if (first === undefined || first === 0) throw new Error('Invalid WebM element.');
    let mask = 0x80;
    let length = 1;
    while (!(first & mask)) { mask >>= 1; length++; }
    if (length > (id ? 4 : 8) || at + length > bytes.length) throw new Error('Invalid WebM element length.');
    let value = BigInt(id ? first : first & (mask - 1));
    for (let i = 1; i < length; i++) value = (value << 8n) | BigInt(bytes[at + i]!);
    const unknown = !id && value === (1n << BigInt(length * 7)) - 1n;
    if (!unknown && value > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('WebM element too large.');
    return { value: Number(value), length, unknown };
  };
  const walk = (start: number, end: number, scope: 'root' | 'segment' | 'cluster' | 'group'): number => {
    let pos = start;
    let sawBlock = false;
    while (pos < end) {
      const elementStart = pos;
      const tag = read(pos, true); pos += tag.length;
      if (scope === 'cluster' && tag.value === 0x1f43b675) return elementStart;
      const size = read(pos, false); pos += size.length;
      const childEnd = size.unknown ? end : pos + size.value;
      if (childEnd > end) throw new Error('Truncated WebM element.');
      if (size.unknown && tag.value !== 0x18538067 && tag.value !== 0x1f43b675) throw new Error('Unexpected unknown WebM size.');
      if (tag.value === 0x18538067) pos = walk(pos, childEnd, 'segment');
      else if (tag.value === 0x1f43b675) pos = walk(pos, childEnd, 'cluster');
      else if (scope === 'cluster' && tag.value === 0xa0) pos = walk(pos, childEnd, 'group');
      else {
        if ((scope === 'cluster' && tag.value === 0xa3) || (scope === 'group' && tag.value === 0xa1)) {
          if (padded) throw new Error('Padding before the final WebM block is unsupported.');
          sawBlock = true;
        }
        if (scope === 'group' && tag.value === 0x75a2) {
          if (!sawBlock || size.value < 1 || size.value > 8 || padding) throw new Error('Invalid WebM discard padding.');
          let value = 0n;
          for (let i = pos; i < childEnd; i++) value = (value << 8n) | BigInt(bytes[i]!);
          if (bytes[pos]! & 0x80) value -= 1n << BigInt(size.value * 8);
          if (value < 0n || value > 120_000_000n) throw new Error('Unsupported WebM discard padding.');
          padding = Number(value) / 1e9;
          padded = padding > 0;
        }
        pos = childEnd;
      }
      if (pos < elementStart || pos > end) throw new Error('Invalid WebM nesting.');
    }
    return pos;
  };
  walk(0, bytes.length, 'root');
  return padding;
}

/** RFC 6716 packet TOC gives the duration when the WebM final packet omits it. */
function opusPacketDuration(data: Uint8Array): number {
  if (!data.length) throw new Error('Empty Opus packet.');
  const toc = data[0]!;
  const config = toc >> 3;
  const milliseconds = config < 12 ? [10, 20, 40, 60][config % 4]!
    : config < 16 ? [10, 20][config % 2]! : [2.5, 5, 10, 20][config % 4]!;
  const code = toc & 3;
  const frames = code === 0 ? 1 : code === 3 ? (data[1] ?? 0) & 0x3f : 2;
  const duration = frames * milliseconds / 1000;
  if (!frames || duration > 0.12) throw new Error('Invalid Opus packet duration.');
  return duration;
}

/** Remux Chromium's Opus packets into Ogg without decoding or re-encoding them. */
export async function remuxVoiceMessage(inputBlob: Blob): Promise<Blob> {
  if (inputBlob.size > 25 * 1024 * 1024) throw new Error('Voice recording is too large.');
  const padding = finalWebmPadding(new Uint8Array(await inputBlob.arrayBuffer()));
  const { BlobSource, BufferTarget, EncodedAudioPacketSource, EncodedPacketSink, Input, Output, OggOutputFormat, WEBM } = await import('mediabunny');
  const input = new Input({ formats: [WEBM], source: new BlobSource(inputBlob) });
  try {
    const audio = await input.getPrimaryAudioTrack();
    if (!audio || await audio.getCodec() !== 'opus') throw new Error('Recording does not contain Opus audio.');
    const decoderConfig = await audio.getDecoderConfig();
    if (!decoderConfig?.description) throw new Error('Recording has no Opus configuration.');
    const description = decoderConfig.description;
    const header = ArrayBuffer.isView(description)
      ? new Uint8Array(description.buffer, description.byteOffset, description.byteLength)
      : new Uint8Array(description);
    if (header.length < 19 || String.fromCharCode(...header.subarray(0, 8)) !== 'OpusHead') throw new Error('Invalid Opus header.');
    const preSkip = header[10]! | (header[11]! << 8);
    const target = new BufferTarget();
    const output = new Output({ format: new OggOutputFormat(), target });
    const source = new EncodedAudioPacketSource('opus');
    output.addAudioTrack(source);
    await output.start();
    let first = true;
    let offset = 0;
    let pending: Awaited<ReturnType<InstanceType<typeof EncodedPacketSink>['getFirstPacket']>> = null;
    for await (const packet of new EncodedPacketSink(audio).packets()) {
      if (first && !pending) {
        // WebM packet times are quantized to milliseconds; preserve the
        // sample-accurate OpusHead pre-skip when writing the Ogg granule.
        offset = -preSkip / 48_000 - packet.timestamp;
        if (Math.abs(offset) > 0.1) throw new Error('Unexpected Opus recording timestamps.');
      }
      if (pending) {
        await source.add(pending, first ? { decoderConfig } : undefined);
        first = false;
      }
      pending = packet.clone({ timestamp: packet.timestamp + offset });
    }
    if (!pending) throw new Error('The recording has no audio packets.');
    const finalDuration = opusPacketDuration(pending.data);
    if (finalDuration <= padding) throw new Error('Invalid final Opus packet duration.');
    await source.add(pending.clone({ duration: finalDuration - padding }), first ? { decoderConfig } : undefined);
    await output.finalize();
    if (!target.buffer) throw new Error('The recording could not be converted to Ogg/Opus.');
    return new Blob([target.buffer], { type: 'audio/ogg' });
  } finally { input.dispose(); }
}

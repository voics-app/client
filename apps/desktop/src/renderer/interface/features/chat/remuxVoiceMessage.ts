/** Remux Chromium's Opus packets into Ogg without decoding or re-encoding them. */
export async function remuxVoiceMessage(inputBlob: Blob): Promise<Blob> {
  const { BlobSource, BufferTarget, EncodedAudioPacketSource, EncodedPacketSink, Input, Output, OggOutputFormat, WEBM } = await import('mediabunny');
  const input = new Input({ formats: [WEBM], source: new BlobSource(inputBlob) });
  try {
    const audio = await input.getPrimaryAudioTrack();
    if (!audio || await audio.getCodec() !== 'opus') throw new Error('Recording does not contain Opus audio.');
    const decoderConfig = await audio.getDecoderConfig();
    if (!decoderConfig) throw new Error('Recording has no Opus configuration.');
    const target = new BufferTarget();
    const output = new Output({ format: new OggOutputFormat(), target });
    const source = new EncodedAudioPacketSource('opus');
    output.addAudioTrack(source);
    await output.start();
    let first = true;
    for await (const packet of new EncodedPacketSink(audio).packets()) {
      await source.add(packet, first ? { decoderConfig } : undefined);
      first = false;
    }
    if (first) throw new Error('The recording has no audio packets.');
    await output.finalize();
    if (!target.buffer) throw new Error('The recording could not be converted to Ogg/Opus.');
    return new Blob([target.buffer], { type: 'audio/ogg' });
  } finally { input.dispose(); }
}

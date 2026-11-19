/** Remux Chromium's Opus packets into Ogg without decoding or re-encoding them. */
export async function remuxVoiceMessage(inputBlob: Blob): Promise<Blob> {
  const { BlobSource, BufferTarget, Conversion, Input, Output, OggOutputFormat, WEBM } = await import('mediabunny');
  const input = new Input({ formats: [WEBM], source: new BlobSource(inputBlob) });
  try {
    const audio = await input.getPrimaryAudioTrack();
    if (!audio || await audio.getCodec() !== 'opus') throw new Error('Recording does not contain Opus audio.');
    const target = new BufferTarget();
    const output = new Output({ format: new OggOutputFormat(), target });
    const conversion = await Conversion.init({ input, output, video: { discard: true }, audio: { codec: 'opus' } });
    if (!conversion.isValid || conversion.discardedTracks.length) throw new Error('The recording could not be converted to Ogg/Opus.');
    await conversion.execute();
    if (!target.buffer) throw new Error('The recording could not be converted to Ogg/Opus.');
    return new Blob([target.buffer], { type: 'audio/ogg' });
  } finally { input.dispose(); }
}

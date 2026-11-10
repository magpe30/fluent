import { MAX_RECORDING_SECONDS, SAMPLE_RATE } from "./contracts";

export async function prepareRecording(blob: Blob): Promise<Blob> {
  const decoder = new AudioContext();
  try {
    const decoded = await decoder.decodeAudioData(await blob.arrayBuffer());
    if (!decoded.length || decoded.duration > MAX_RECORDING_SECONDS + .5) throw new Error("Use a recording of up to two minutes.");
    const samples = Math.min(Math.ceil(decoded.duration * SAMPLE_RATE), MAX_RECORDING_SECONDS * SAMPLE_RATE);
    const renderer = new OfflineAudioContext(1, samples, SAMPLE_RATE);
    const source = renderer.createBufferSource();
    source.buffer = decoded;
    source.connect(renderer.destination);
    source.start();
    const rendered = await renderer.startRendering();
    const data = rendered.getChannelData(0);
    const wav = new ArrayBuffer(44 + data.length * 2);
    const view = new DataView(wav);
    const text = (offset: number, value: string) => { for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i)); };
    text(0, "RIFF"); view.setUint32(4, wav.byteLength - 8, true); text(8, "WAVE"); text(12, "fmt ");
    view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
    view.setUint32(24, SAMPLE_RATE, true); view.setUint32(28, SAMPLE_RATE * 2, true);
    view.setUint16(32, 2, true); view.setUint16(34, 16, true); text(36, "data"); view.setUint32(40, data.length * 2, true);
    for (let i = 0; i < data.length; i++) {
      const value = Math.max(-1, Math.min(1, data[i]));
      view.setInt16(44 + i * 2, value * (value < 0 ? 32768 : 32767), true);
    }
    return new Blob([wav], { type: "audio/wav" });
  } finally { await decoder.close(); }
}

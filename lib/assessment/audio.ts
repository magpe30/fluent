import { MAX_WAV_BYTES, SAMPLE_RATE } from "./contracts.ts";

// The browser sends a canonical mono PCM WAV, avoiding native media decoding
// in Next.js and keeping the assessment worker independent of browser codecs.
export function readWav(bytes: Uint8Array) {
  if (bytes.byteLength < 44 || bytes.byteLength > MAX_WAV_BYTES) throw new Error("Invalid recording size.");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (offset: number) => String.fromCharCode(...bytes.slice(offset, offset + 4));
  const size = view.getUint32(40, true);
  if (tag(0) !== "RIFF" || tag(8) !== "WAVE" || tag(12) !== "fmt " || tag(36) !== "data" ||
      view.getUint32(4, true) !== bytes.length - 8 || view.getUint32(16, true) !== 16 ||
      view.getUint16(20, true) !== 1 || view.getUint16(22, true) !== 1 ||
      view.getUint32(24, true) !== SAMPLE_RATE || view.getUint32(28, true) !== SAMPLE_RATE * 2 ||
      view.getUint16(32, true) !== 2 || view.getUint16(34, true) !== 16 ||
      size !== bytes.length - 44 || size % 2 !== 0 || !size) throw new Error("Invalid audio format.");
  const samples = new Int16Array(size / 2);
  let energy = 0;
  for (let i = 0; i < samples.length; i++) {
    samples[i] = view.getInt16(44 + i * 2, true);
    energy += (samples[i] / 32768) ** 2;
  }
  return { samples, duration: samples.length / SAMPLE_RATE, rms: Math.sqrt(energy / samples.length) };
}

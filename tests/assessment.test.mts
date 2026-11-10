import { test } from "node:test";
import assert from "node:assert/strict";
import { readWav } from "../lib/assessment/audio.ts";
import { evidenceFor, validateFeedback } from "../lib/assessment/validate-feedback.ts";
import { MAX_WAV_BYTES, type TranscriptSegment } from "../lib/assessment/contracts.ts";

const transcript: TranscriptSegment[] = [{ id: 0, text: "I enjoy spending time outside because it helps me relax.", start: 0, end: 6, confidence: .98,
  words: "I enjoy spending time outside because it helps me relax".split(" ").map((text, index) => ({ text, start: index * .5, end: index * .5 + .4, confidence: .97 })),
}];
const feedback = () => ({ status: "ready", strength: { title: "A clear reason", explanation: "You explain why you enjoy the activity.", evidence: { quote: "because it helps me relax", segmentId: 0 } }, suggestions: [], exercise: "Describe another activity and explain why you enjoy it." });

test("feedback uses original words and their playback timestamps", () => {
  const evidence = evidenceFor({ quote: "i enjoy spending time", segmentId: 0 }, transcript);
  assert.equal(evidence.quote, "I enjoy spending time");
  assert.equal(evidence.start, 0); assert.equal(evidence.end, 1.9);
  assert.equal(validateFeedback(feedback(), transcript, 6).status, "ready");
});
test("invented, non-contiguous, and wrong-segment evidence is rejected", () => {
  for (const evidence of [{ quote: "I love the outdoors", segmentId: 0 }, { quote: "I enjoy outside", segmentId: 0 }, { quote: "I enjoy", segmentId: 2 }]) {
    assert.throws(() => evidenceFor(evidence, transcript));
  }
});
test("uncertain words and missing confidence cannot support feedback", () => {
  const uncertain = structuredClone(transcript);
  uncertain[0].words[1].confidence = .2;
  assert.throws(() => evidenceFor({ quote: "I enjoy", segmentId: 0 }, uncertain));
  for (const confidence of [.3, NaN]) {
    uncertain[0].confidence = confidence;
    assert.throws(() => evidenceFor({ quote: "time outside", segmentId: 0 }, uncertain));
  }
});
test("suggestions retain correction/style labels and are limited to two", () => {
  const suggestion = { category: "word_usage", kind: "style", evidence: { quote: "spending time outside", segmentId: 0 }, replacement: "being outdoors", explanation: "An optional shorter alternative." };
  const valid = validateFeedback({ ...feedback(), suggestions: [suggestion] }, transcript, 6);
  assert.equal(valid.suggestions[0].kind, "style");
  assert.throws(() => validateFeedback({ ...feedback(), suggestions: [suggestion, suggestion, suggestion] }, transcript, 6));
  assert.throws(() => validateFeedback({ ...feedback(), suggestions: [{ ...suggestion, category: "pronunciation" }] }, transcript, 6));
});
test("insufficient speech never produces fabricated praise or corrections", () => {
  const result = validateFeedback({ status: "insufficient_evidence", strength: "invented" }, [], 2);
  assert.equal(result.strength, null); assert.deepEqual(result.suggestions, []); assert.equal(result.exercise, null);
});
function silence() {
  const wav = Buffer.alloc(44 + 16000 * 2);
  wav.write("RIFF"); wav.writeUInt32LE(wav.length - 8, 4); wav.write("WAVEfmt ", 8);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(16000, 24); wav.writeUInt32LE(32000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
  wav.write("data", 36); wav.writeUInt32LE(wav.length - 44, 40);
  return wav;
}
test("WAV parser measures silence and rejects invalid or oversized audio", () => {
  const valid = readWav(silence()); assert.equal(valid.duration, 1); assert.equal(valid.rms, 0);
  const stereo = silence(); stereo.writeUInt16LE(2, 22);
  assert.throws(() => readWav(stereo));
  const wrongRate = silence(); wrongRate.writeUInt32LE(48000, 24);
  assert.throws(() => readWav(wrongRate));
  assert.throws(() => readWav(silence().subarray(0, 200)));
  assert.throws(() => readWav(Buffer.alloc(MAX_WAV_BYTES + 1)));
});

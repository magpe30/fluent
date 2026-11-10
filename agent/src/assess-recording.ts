import { inference, initializeLogger, llm, stt } from "@livekit/agents";
import { AudioFrame, dispose } from "@livekit/rtc-node";
import { setTimeout as delay } from "node:timers/promises";
import { readWav } from "../../lib/assessment/audio.ts";
import { insufficientAssessment, SAMPLE_RATE, MAX_WAV_BYTES, type TranscriptSegment } from "../../lib/assessment/contracts.ts";
import { validateFeedback } from "../../lib/assessment/validate-feedback.ts";
import { ASSESSMENT_PROMPT } from "./assessment-prompt.ts";

// This short-lived worker receives audio over stdin and returns JSON over stdout.
// No room, recording, transcript log, temporary file, or database row is created.
initializeLogger({ pretty: false, level: "silent" });
let stage = "transcription_failed";
const deadline = setTimeout(() => { process.stdout.write(JSON.stringify({ error: "timeout" })); process.exit(1); }, 210_000);

async function assess() {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of process.stdin) {
    size += chunk.length;
    if (size > MAX_WAV_BYTES * 1.4 + 30_000) throw new Error("Input too large");
    chunks.push(chunk);
  }
  const input = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  const audio = readWav(Buffer.from(input.audio, "base64"));
  if (audio.duration < 5 || audio.rms < .0003) return insufficientAssessment([], audio.duration);

  const transcriber = new inference.STT({
    model: "deepgram/nova-3", language: "en", sampleRate: SAMPLE_RATE,
    modelOptions: { punctuate: true, filler_words: true, smart_format: false, interim_results: false },
  });
  let transcriptionFailed = false;
  transcriber.on("error", () => { transcriptionFailed = true; });
  const speech = transcriber.stream({ connOptions: { maxRetry: 0, timeoutMs: 15_000, retryIntervalMs: 1000 } });
  const transcript: TranscriptSegment[] = [];
  try {
    // Inference STT is a live stream, not a batch-upload API. Pacing prevents
    // finalization from overtaking transcription and silently losing the tail.
    for (let offset = 0; offset < audio.samples.length; offset += 1600) {
      const data = audio.samples.slice(offset, offset + 1600);
      speech.pushFrame(new AudioFrame(data, SAMPLE_RATE, 1, data.length));
      await delay(data.length / SAMPLE_RATE * 1000);
    }
    speech.pushFrame(new AudioFrame(new Int16Array(SAMPLE_RATE), SAMPLE_RATE, 1, SAMPLE_RATE));
    await delay(1000);
    speech.flush();
    speech.endInput();
    for await (const event of speech) {
      if (event.type !== stt.SpeechEventType.FINAL_TRANSCRIPT) continue;
      const segment = event.alternatives?.[0];
      if (!segment?.text.trim()) continue;
      const clamp = (time: number) => Math.max(0, Math.min(audio.duration, Number.isFinite(time) ? time : 0));
      transcript.push({
        id: transcript.length, text: segment.text.trim(), start: clamp(segment.startTime), end: clamp(segment.endTime),
        confidence: segment.confidence,
        words: (segment.words || []).map((word) => ({ text: word.text, start: clamp(word.startTime ?? segment.startTime), end: clamp(word.endTime ?? segment.endTime), confidence: word.confidence ?? segment.confidence })),
      });
    }
    if (transcriptionFailed) throw new Error("Transcription failed");
  } finally { speech.close(); await transcriber.close(); }
  const reliableWords = transcript.filter((segment) => segment.confidence >= .65).reduce((sum, segment) => sum + segment.text.split(/\s+/).length, 0);
  if (reliableWords < 12) return insufficientAssessment(transcript, audio.duration);

  stage = "coaching_failed";
  const model = new inference.LLM({
    model: process.env.ASSESSMENT_LLM_MODEL || "google/gemma-4-31b-it",
    modelOptions: { temperature: .2, max_tokens: 2500, response_format: { type: "json_object" } },
  });
  model.on("error", () => {});
  try {
    const chatCtx = new llm.ChatContext();
    chatCtx.addMessage({ role: "system", content: ASSESSMENT_PROMPT });
    chatCtx.addMessage({ role: "user", content: JSON.stringify({ topic: input.prompt, transcript }) });
    for (let attempt = 0; attempt < 2; attempt++) {
      const completion = model.chat({ chatCtx, connOptions: { maxRetry: 0, timeoutMs: 25_000, retryIntervalMs: 1000 } });
      let content = "";
      try {
        for await (const chunk of completion) {
          content += chunk.delta?.content || "";
          if (content.length > 16_000) throw new Error("Feedback too large");
        }
      } finally { completion.close(); }
      try { return validateFeedback(JSON.parse(content), transcript, audio.duration); }
      catch {
        if (attempt === 1) throw new Error("Invalid feedback evidence or structure");
        chatCtx.addMessage({ role: "user", content: "Return valid JSON using the required schema. Every quote must be an exact contiguous excerpt from one reliable segment. Use the original numeric segmentId. Keep suggestions to at most two and respect all character limits." });
      }
    }
    throw new Error("No feedback generated");
  } finally { await model.aclose(); }
}

try {
  const result = await assess();
  process.stdout.write(JSON.stringify({ result }));
} catch {
  process.stdout.write(JSON.stringify({ error: stage }));
  process.exitCode = 1;
} finally {
  clearTimeout(deadline);
  await dispose();
}

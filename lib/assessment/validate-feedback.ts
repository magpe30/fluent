import { FEEDBACK_VERSION, insufficientAssessment, type Assessment, type Evidence, type Suggestion, type TranscriptSegment } from "./contracts.ts";

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid feedback structure.");
  return value as Record<string, unknown>;
}
function text(value: unknown, limit: number) {
  if (typeof value !== "string" || !value.trim() || value.length > limit) throw new Error("Invalid feedback text.");
  return value.trim();
}
function tokens(value: string) {
  return [...value.matchAll(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu)];
}
const normalized = (value: string) => value.toLowerCase().replaceAll("’", "'");

export function evidenceFor(value: unknown, transcript: TranscriptSegment[]): Evidence {
  const candidate = object(value);
  const quote = text(candidate.quote, 400);
  const segment = transcript.find((item) => item.id === candidate.segmentId);
  if (!segment || !Number.isFinite(segment.confidence) || segment.confidence < .65) throw new Error("Unreliable feedback evidence.");
  const haystack = tokens(segment.text);
  const needle = tokens(quote);
  if (!needle.length) throw new Error("Empty evidence.");
  const index = haystack.findIndex((_, start) => needle.every((word, offset) => normalized(haystack[start + offset]?.[0] || "") === normalized(word[0])));
  if (index < 0) throw new Error("Feedback quote is absent from the transcript.");
  // Return the actual transcript text, rather than a model-created quotation.
  const first = haystack[index], last = haystack[index + needle.length - 1];
  const original = segment.text.slice(first.index, last.index! + last[0].length);
  const words = segment.words;
  const wordIndex = words.findIndex((_, start) => needle.every((word, offset) => normalized(tokens(words[start + offset]?.text || "")[0]?.[0] || "") === normalized(word[0])));
  const matched = wordIndex >= 0 ? words.slice(wordIndex, wordIndex + needle.length) : [];
  if (matched.some((word) => !Number.isFinite(word.confidence) || word.confidence < .55)) throw new Error("Quote contains uncertain words.");
  return { quote: original, segmentId: segment.id, start: matched[0]?.start ?? segment.start, end: matched.at(-1)?.end ?? segment.end };
}

export function validateFeedback(value: unknown, transcript: TranscriptSegment[], duration: number): Assessment {
  const raw = object(value);
  if (raw.status === "insufficient_evidence") return insufficientAssessment(transcript, duration);
  if (raw.status !== "ready" || !Array.isArray(raw.suggestions) || raw.suggestions.length > 2) throw new Error("Invalid feedback result.");
  const strength = object(raw.strength);
  const suggestions: Suggestion[] = raw.suggestions.map((item) => {
    const suggestion = object(item);
    if (suggestion.category !== "sentence_structure" && suggestion.category !== "word_usage") throw new Error("Unsupported feedback category.");
    if (suggestion.kind !== "correction" && suggestion.kind !== "style") throw new Error("Unsupported suggestion type.");
    return {
      category: suggestion.category, kind: suggestion.kind,
      evidence: evidenceFor(suggestion.evidence, transcript),
      replacement: text(suggestion.replacement, 400), explanation: text(suggestion.explanation, 500),
    };
  });
  return {
    status: "ready", message: "Language feedback from your recording.", transcript,
    strength: { title: text(strength.title, 100), explanation: text(strength.explanation, 500), evidence: evidenceFor(strength.evidence, transcript) },
    suggestions, exercise: text(raw.exercise, 500), duration, version: FEEDBACK_VERSION,
  };
}

export const MAX_RECORDING_SECONDS = 120;
export const SAMPLE_RATE = 16_000;
export const MAX_WAV_BYTES = 44 + MAX_RECORDING_SECONDS * SAMPLE_RATE * 2;
export const FEEDBACK_VERSION = "language-v1";

export type TranscriptWord = { text: string; start: number; end: number; confidence: number };
export type TranscriptSegment = {
  id: number; text: string; start: number; end: number; confidence: number; words: TranscriptWord[];
};
export type Evidence = { quote: string; segmentId: number; start: number; end: number };
export type Strength = { title: string; explanation: string; evidence: Evidence };
export type Suggestion = {
  category: "sentence_structure" | "word_usage";
  kind: "correction" | "style";
  replacement: string;
  explanation: string;
  evidence: Evidence;
};
export type Assessment = {
  status: "ready" | "insufficient_evidence";
  message: string;
  transcript: TranscriptSegment[];
  strength: Strength | null;
  suggestions: Suggestion[];
  exercise: string | null;
  duration: number;
  version: string;
};

export function insufficientAssessment(transcript: TranscriptSegment[], duration: number): Assessment {
  return {
    status: "insufficient_evidence", message: "We need a little more clear speech to give useful language feedback. Try 20–60 seconds on one idea.",
    transcript, strength: null, suggestions: [], exercise: null, duration, version: FEEDBACK_VERSION,
  };
}

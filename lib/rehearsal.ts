// Bounds cover a full conversation plus a focused retry, while keeping model input finite.
export const MAX_MEETING_TURNS = 600;
export const MAX_MEETING_TURN_CHARS = 16_000;
export const MAX_MEETING_TRANSCRIPT_CHARS = 80_000;
export const MAX_MEETING_REQUEST_BYTES = 400_000;
export const MEETING_PROMPT = "Your team wants to launch on Friday. You think another week would produce a better result. Explain your concern and propose a solution.";
export const OPENING_QUESTION = "We’re aiming to launch on Friday. What’s your concern about the timeline?";
export type MeetingTurn = { speaker: "You" | "Fluent"; text: string };
export type MeetingFeedback = {
  status: "ready" | "insufficient_evidence";
  strength: { title: string; quote: string; explanation: string } | null;
  suggestions: { category: "sentence_structure" | "word_usage"; kind: "correction" | "style"; quote: string; replacement: string; explanation: string }[];
  exercise: string;
  comparison: { before: string; after: string; observation: string } | null;
};
export type MeetingRequest = { prompt?: string; turns: MeetingTurn[]; first?: MeetingTurn[] };
const object = (v: unknown): Record<string, unknown> => {
  if (!v || typeof v !== "object" || Array.isArray(v)) throw Error("Invalid feedback");
  return v as Record<string, unknown>;
};
const text = (v: unknown, max = 500) => {
  if (typeof v !== "string" || !v.trim() || v.length > max) throw Error("Invalid text");
  return v.trim();
};
export function parseMeetingRequest(value: unknown): MeetingRequest {
  const raw = object(value);
  let totalCharacters = 0;
  function turns(value: unknown): MeetingTurn[] {
    if (!Array.isArray(value) || value.length > MAX_MEETING_TURNS) throw Error("Invalid transcript");
    return value.map(item => {
      const turn = object(item);
      if (turn.speaker !== "You" && turn.speaker !== "Fluent") throw Error("Invalid speaker");
      const content = text(turn.text, MAX_MEETING_TURN_CHARS);
      totalCharacters += content.length;
      if (totalCharacters > MAX_MEETING_TRANSCRIPT_CHARS) throw Error("Transcript is too long");
      return { speaker: turn.speaker, text: content };
    });
  }
  return { prompt: raw.prompt === undefined ? MEETING_PROMPT : text(raw.prompt, 4000), turns: turns(raw.turns), ...(raw.first ? { first: turns(raw.first) } : {}) };
}
export const insufficientMeeting = (): MeetingFeedback => ({ status: "insufficient_evidence", strength: null, suggestions: [], exercise: "Try answering the opening question again. Give your main point and one detail to help your partner understand.", comparison: null });

// Quotes must come from the learner, never from the colleague or the model.
export function meetingQuote(value: unknown, turns: MeetingTurn[]) {
  const quote = text(value, 400);
  const words = (s: string) => [...s.matchAll(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu)];
  const normalize = (s: string) => s.toLowerCase().replaceAll("’", "'");
  const wanted = words(quote);
  if (!wanted.length) throw Error("Empty quote");
  for (const turn of turns.filter(t => t.speaker === "You")) {
    const source = words(turn.text);
    const at = source.findIndex((_, i) => wanted.every((w, j) => normalize(w[0]) === normalize(source[i + j]?.[0] || "")));
    if (at >= 0) return turn.text.slice(source[at].index, source[at + wanted.length - 1].index! + source[at + wanted.length - 1][0].length);
  }
  throw Error("Quote is not in the learner’s transcript");
}
export function validateMeetingFeedback(value: unknown, request: MeetingRequest): MeetingFeedback {
  const raw = object(value);
  if (raw.status === "insufficient_evidence") return insufficientMeeting();
  if (raw.status !== "ready" || !Array.isArray(raw.suggestions) || raw.suggestions.length > 2) throw Error("Invalid feedback");
  const strength = object(raw.strength);
  const suggestions = raw.suggestions.map(item => {
    const s = object(item);
    if (s.category !== "sentence_structure" && s.category !== "word_usage") throw Error("Invalid category");
    if (s.kind !== "correction" && s.kind !== "style") throw Error("Invalid suggestion");
    return { category: s.category, kind: s.kind, quote: meetingQuote(s.quote, request.turns), replacement: text(s.replacement, 400), explanation: text(s.explanation) } as MeetingFeedback["suggestions"][number];
  });
  let comparison: MeetingFeedback["comparison"] = null;
  if (raw.comparison && request.first) {
    const c = object(raw.comparison);
    comparison = { before: meetingQuote(c.before, request.first), after: meetingQuote(c.after, request.turns), observation: text(c.observation) };
  }
  return { status: "ready", strength: { title: text(strength.title, 100), quote: meetingQuote(strength.quote, request.turns), explanation: text(strength.explanation) }, suggestions, exercise: text(raw.exercise), comparison };
}

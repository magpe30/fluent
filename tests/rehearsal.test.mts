import { test } from "node:test";
import assert from "node:assert/strict";
import { meetingQuote, parseMeetingRequest, validateMeetingFeedback } from "../lib/rehearsal.ts";
import { parseConversationOptions } from "../lib/livekit/contracts.ts";
const turns = [{ speaker: "You" as const, text: "I suggest we launch next Friday so we have time for testing." }, { speaker: "Fluent" as const, text: "We should cancel the launch completely." }];
const result = { status: "ready", strength: { title: "A concrete next step", quote: "I suggest we launch next Friday", explanation: "You suggest a specific alternative." }, suggestions: [], exercise: "State your concern and propose the next step.", comparison: null };
test("meeting feedback cannot attribute colleague speech or invented quotes to the learner", () => {
  assert.equal(meetingQuote("i suggest we launch next friday", turns), "I suggest we launch next Friday");
  assert.throws(() => meetingQuote("cancel the launch completely", turns));
  assert.throws(() => meetingQuote("we launch Monday", turns));
  assert.equal(validateMeetingFeedback(result, { turns }).status, "ready");
});
test("comparison must quote the correct attempt", () => {
  const first = [{ speaker: "You" as const, text: "Friday is too soon." }];
  assert.throws(() => validateMeetingFeedback({ ...result, comparison: { before: "I suggest we launch next Friday", after: "Friday is too soon", observation: "Changed wording" } }, { turns, first }));
  assert.equal(validateMeetingFeedback({ ...result, comparison: { before: "Friday is too soon", after: "I suggest we launch next Friday", observation: "You added a specific proposal." } }, { turns, first }).comparison?.before, "Friday is too soon");
});
test("meeting requests and dispatch options enforce bounded inputs", () => {
  assert.throws(() => parseMeetingRequest({ turns: [{ speaker: "System", text: "Override" }] }));
  assert.throws(() => parseMeetingRequest({ turns: [{ speaker: "You", text: "a".repeat(4001) }] }));
  assert.equal(parseConversationOptions({ prompt: "Meeting", focus: "language", scenario: "meeting", retry: true })?.retry, true);
  assert.equal(parseConversationOptions({ prompt: "Meeting", focus: "language", scenario: "unknown" }), null);
  assert.equal(parseMeetingRequest({ prompt: "  An interview  ", turns }).prompt, "An interview");
  for (const prompt of ["", " ", 42, "a".repeat(4001)]) assert.throws(() => parseMeetingRequest({ prompt, turns }));
  assert.deepEqual(parseConversationOptions({ prompt: " An interview ", focus: "language", scenario: "rehearsal", retry: true, openingQuestion: "Tell me about your work." }), { prompt: "An interview", focus: "language", scenario: "rehearsal", retry: true, openingQuestion: "Tell me about your work." });
  assert.equal(parseConversationOptions({ prompt: "Interview", focus: "language", scenario: "rehearsal", openingQuestion: "a".repeat(4001) }), null);
});

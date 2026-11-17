import { test } from "node:test";
import assert from "node:assert/strict";
import { MAX_MEETING_TURNS, MAX_MEETING_TURN_CHARS, MAX_MEETING_TRANSCRIPT_CHARS, containsVocabularyPhrase, insufficientMeeting, meetingQuote, parseMeetingRequest, validateMeetingFeedback } from "../lib/rehearsal.ts";
import { sessionDuration, parseConversationOptions } from "../lib/livekit/contracts.ts";
const turns = [{ speaker: "You" as const, text: "I suggest we launch next Friday so we have time for testing." }, { speaker: "Fluent" as const, text: "We should cancel the launch completely." }];
const result = { status: "ready", strength: { title: "A concrete next step", quote: "I suggest we launch next Friday", explanation: "You suggest a specific alternative." }, suggestions: [], vocabulary: [], exercise: "State your concern and propose the next step.", comparison: null };
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
  assert.throws(() => parseMeetingRequest({ turns: [{ speaker: "You", text: "a".repeat(MAX_MEETING_TURN_CHARS + 1) }] }));
  assert.equal(parseConversationOptions({ prompt: "Meeting", focus: "language", scenario: "meeting", retry: true })?.retry, true);
  assert.equal(parseConversationOptions({ prompt: "Meeting", focus: "language", scenario: "unknown" }), null);
  assert.equal(parseMeetingRequest({ prompt: "  An interview  ", turns }).prompt, "An interview");
  for (const prompt of ["", " ", 42, "a".repeat(4001)]) assert.throws(() => parseMeetingRequest({ prompt, turns }));
  assert.deepEqual(parseConversationOptions({ prompt: " An interview ", focus: "language", scenario: "rehearsal", retry: true, openingQuestion: "Tell me about your work." }), { prompt: "An interview", focus: "language", scenario: "rehearsal", retry: true, openingQuestion: "Tell me about your work." });
  assert.equal(parseConversationOptions({ prompt: "Interview", focus: "language", scenario: "rehearsal", openingQuestion: "a".repeat(4001) }), null);
});

test("full conversations last fifteen minutes while focused retries stay short", () => {
  assert.equal(sessionDuration({ scenario: "rehearsal", retry: false }), 900);
  assert.equal(sessionDuration({}), 900);
  assert.equal(sessionDuration({ scenario: "rehearsal", retry: true }), 45);
  assert.equal(sessionDuration({ retry: true }), 900);
});

test("feedback accepts a long conversation and still rejects excessive aggregate input", () => {
  const transcript = Array.from({ length: 180 }, (_, index) => ({ speaker: index % 2 ? "You" : "Fluent", text: "We talked about cooking, work, and the places we would like to visit." }));
  assert.equal(parseMeetingRequest({ turns: transcript }).turns.length, 180);
  assert.throws(() => parseMeetingRequest({ turns: Array.from({ length: MAX_MEETING_TURNS + 1 }, () => transcript[0]) }));
  const longTurns = Array.from({ length: MAX_MEETING_TRANSCRIPT_CHARS / 1000 }, () => ({ speaker: "You", text: "a".repeat(1000) }));
  assert.equal(parseMeetingRequest({ turns: longTurns }).turns.length, longTurns.length);
  assert.throws(() => parseMeetingRequest({ turns: longTurns, first: [{ speaker: "You", text: "one more" }] }));
});

const vocabulary = { phrase: "push back", quote: "I suggest we launch next Friday", meaning: "Move a planned time to later.", example: "Could we push back the launch to next Friday?", practice: "Suggest changing a deadline and explain why." };
test("vocabulary is anchored to learner words and examples actually use the expression", () => {
  const feedback = validateMeetingFeedback({ ...result, vocabulary: [vocabulary] }, { turns });
  assert.deepEqual(feedback.vocabulary, [vocabulary]);
  for (const quote of ["cancel the launch completely", "I forgot how to say postpone", "Friday is too soon"]) {
    assert.throws(() => validateMeetingFeedback({ ...result, vocabulary: [{ ...vocabulary, quote }] }, { turns, first: [{ speaker: "You", text: "Friday is too soon" }] }));
  }
  assert.throws(() => validateMeetingFeedback({ ...result, vocabulary: [{ ...vocabulary, example: "We could move the launch." }] }, { turns }));
  assert.equal(containsVocabularyPhrase("I actually agree.", "act"), false);
  assert.equal(containsVocabularyPhrase("Let’s MAKE SURE it works.", "make sure"), true);
  assert.equal(containsVocabularyPhrase("We should push it back.", "push back"), false);
  assert.equal(containsVocabularyPhrase("That’s a good idea.", "that's"), true);
});
test("vocabulary rejects duplicates, missing fields and excessive output", () => {
  for (const items of [undefined, null, {}, [vocabulary, { ...vocabulary, phrase: " PUSH BACK! " }], Array(4).fill(vocabulary)]) {
    assert.throws(() => validateMeetingFeedback({ ...result, vocabulary: items }, { turns }));
  }
  for (const [field, limit] of [["phrase", 80], ["meaning", 240], ["example", 400], ["practice", 240]]) {
    for (const value of ["", " ", null, "a".repeat(limit + 1)]) {
      assert.throws(() => validateMeetingFeedback({ ...result, vocabulary: [{ ...vocabulary, [field]: value }] }, { turns }));
    }
  }
  assert.deepEqual(validateMeetingFeedback(result, { turns }).vocabulary, []);
  assert.deepEqual(validateMeetingFeedback({ status: "insufficient_evidence", vocabulary: [vocabulary] }, { turns: [] }).vocabulary, []);
  assert.deepEqual(insufficientMeeting().vocabulary, []);
});
test("everyday vocabulary is grounded without claiming a word-search error", () => {
  const everyday = [{ speaker: "You", text: "After all those meetings I just wanted to rest and not think about work." }];
  const response = { ...result, strength: { title: "A clear feeling", quote: "I just wanted to rest", explanation: "You explained what you needed after your day." }, vocabulary: [{ phrase: "switch off", quote: "rest and not think about work", meaning: "Relax and stop thinking about work or worries.", example: "I like to switch off after a busy day.", practice: "Say what helps you relax after work." }] };
  assert.equal(validateMeetingFeedback(response, { turns: everyday }).vocabulary[0].phrase, "switch off");
});

import { after, test } from "node:test";
import assert from "node:assert/strict";
import { inference, initializeLogger, llm, voice } from "@livekit/agents";
import { dispose } from "@livekit/rtc-node";
import { startSessionLifetime } from "../src/session-lifetime.ts";
import { CONVERSATION_TURN_HANDLING, conversationPolicy } from "../src/conversation-policy.ts";

initializeLogger({ pretty: false, level: "silent" });
after(async () => { await dispose(); });

// Exercise the installed SDK's learned pause behavior using our production profile.
// This is not an acoustic test: recognition and end-of-turn predictions need speech testing.
test("the patient profile learns a within-turn pause and stays within its ceiling", () => {
  const timing = new voice.DynamicEndpointing(CONVERSATION_TURN_HANDLING.endpointing);
  const initial = timing.minDelay;
  timing.onStartOfSpeech(1000);
  timing.onEndOfSpeech(2000);
  timing.onStartOfSpeech(4500);
  timing.onEndOfSpeech(5000);
  assert.ok(timing.minDelay > initial, "A 2.5-second thinking pause should increase the learned delay");
  timing.onStartOfSpeech(20_000);
  timing.onEndOfSpeech(21_000);
  assert.ok(timing.minDelay <= CONVERSATION_TURN_HANDLING.endpointing.maxDelay);
});

const live = process.env.LIVEKIT_CONVERSATION_SMOKE === "1";
const policy = conversationPolicy({ prompt: "I want to chat about cooking and my day.", focus: "language", scenario: "rehearsal" });
type Turn = { role: "user" | "assistant"; content: string };
async function reply(history: Turn[], instructions = policy.instructions) {
  const model = new inference.LLM({
    model: process.env.LLM_MODEL || "google/gemma-4-31b-it",
    modelOptions: { temperature: .2, max_tokens: 250 },
  });
  model.on("error", () => {});
  const chatCtx = new llm.ChatContext();
  chatCtx.addMessage({ role: "system", content: instructions });
  history.forEach(turn => chatCtx.addMessage(turn));
  const stream = model.chat({ chatCtx, connOptions: { maxRetry: 0, timeoutMs: 25_000, retryIntervalMs: 1000 } });
  let text = "";
  try {
    for await (const chunk of stream) text += chunk.delta?.content || "";
    assert.ok(text.trim(), "Alex must produce a response");
    assert.ok(text.trim().split(/\s+/).length <= 90, `Keep spoken replies brief: ${text}`);
    assert.ok((text.match(/\?/g) || []).length <= 1, `Ask at most one question: ${text}`);
    console.log(`Alex: ${text.trim()}`);
    return text;
  } finally { stream.close(); await model.aclose(); }
}
const options = { skip: !live, timeout: 35_000 };

test("Alex continues after several answers and follows a new topic", options, async () => {
  const text = await reply([
    { role: "assistant", content: "What did you cook today?" },
    { role: "user", content: "I made pasta with tomatoes." },
    { role: "assistant", content: "Tomato pasta is a comforting choice. Did you add anything else?" },
    { role: "user", content: "Just basil and garlic. I was tired after work." },
    { role: "assistant", content: "That keeps it simple when you are tired. Was it a busy day?" },
    { role: "user", content: "Yes, lots of meetings. But I would rather talk about my new puppy." },
  ]);
  assert.match(text, /puppy|dog|pet|breed|name/i);
  assert.doesNotMatch(text, /finish (?:the |your )?(?:session|rehearsal|practice)|last question|wrap up|say goodbye/i);
});

test("Alex offers a word when the learner explicitly asks", options, async () => {
  const text = await reply([{ role: "user", content: "What is the expression for delaying something until later? I keep moving a task to another day. I can't remember the English words." }]);
  assert.match(text, /put(?:ting)? (?:it |something |a task )?off|postpon|procrastinat/i);
});

test("Alex responds to meaning without unsolicited grammar correction", options, async () => {
  const text = await reply([{ role: "user", content: "Yesterday I go to a cooking class. We made bread and it was really fun." }]);
  assert.match(text, /bread|bak|cook|class|fun|recipe|dough/i);
  assert.doesNotMatch(text, /you should say|you meant to say|past tense|gramma|incorrect|mistake|correction/i);
});

test("an explicit request for thinking time does not trigger another question", options, async () => {
  const text = await reply([
    { role: "assistant", content: "What did you enjoy about the cooking class?" },
    { role: "user", content: "Give me a moment please. I'm still thinking. Please don't suggest words yet." },
  ]);
  assert.doesNotMatch(text, /\?|maybe you|perhaps you|you could say|do you mean/i);
  assert.ok(text.trim().split(/\s+/).length <= 25);
});

test("Alex clarifies a missing word without enough context instead of inventing it", options, async () => {
  const text = await reply([{ role: "user", content: "I'm looking for an English word for a thing, but I haven't told you what the thing is yet. Can you help?" }]);
  assert.match(text, /\?/);
  assert.match(text, /describe|what|tell me|used for|look like/i);
  assert.doesNotMatch(text, /the word is|you mean|you're thinking of/i);
});

test("Alex respects an explicit goodbye without asking another question", options, async () => {
  const text = await reply([{ role: "user", content: "That's all for today. I want to finish now. Goodbye!" }]);
  assert.doesNotMatch(text, /\?|before you go|one more|microphone.*off|saved|ended (?:the|your) (?:call|session)/i);
});

test("the existing focused retry still reuses its opening question", options, async () => {
  const question = "What did you enjoy about the cooking class?";
  const retry = conversationPolicy({ prompt: "A cooking class", focus: "language", scenario: "rehearsal", retry: true, openingQuestion: question });
  const text = await reply([{ role: "user", content: "I'm ready to begin." }], `${retry.instructions}\n${retry.openingInstructions}`);
  assert.equal(text.trim(), question);
});

test("session expiry signals feedback at fifteen minutes and independently closes after grace", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let notices = 0, closed = 0;
  startSessionLifetime(900, () => { notices++; return new Promise(() => {}); }, () => { closed++; });
  t.mock.timers.tick(899_000);
  await Promise.resolve();
  assert.equal(notices, 0);
  assert.equal(closed, 0);
  t.mock.timers.tick(1000);
  await Promise.resolve();
  assert.equal(notices, 1);
  assert.equal(closed, 0);
  t.mock.timers.tick(10_000);
  assert.equal(closed, 1);
});

test("leaving a session cancels both its limit and pending cleanup", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let notices = 0, closed = 0;
  const cancel = startSessionLifetime(900, async () => { notices++; }, () => { closed++; });
  cancel();
  t.mock.timers.tick(920_000);
  await Promise.resolve();
  assert.equal(notices, 0);
  const cancelGrace = startSessionLifetime(45, async () => { notices++; }, () => { closed++; });
  t.mock.timers.tick(45_000);
  await Promise.resolve();
  cancelGrace();
  t.mock.timers.tick(10_000);
  assert.equal(notices, 1);
  assert.equal(closed, 0);
});

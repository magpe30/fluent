# Alex: conversation behavior and thinking time

Alex supports ongoing conversation with patient turn-taking and sessions of up
to 15 minutes. The existing visual design and feedback flow remain in place.

## Conversation policy

`agent/src/conversation-policy.ts` owns the instructions and opening behavior.
`agent/src/main.ts` applies them to the live AgentSession. Both the homepage and
legacy studio use the same policy.

- Everyday topics stay everyday conversations; explicit rehearsal requests set
  a role. Alex follows topic changes and draws on the current conversation.
- Replies are brief, with at most one question. Alex contributes reactions and
  observations rather than only asking questions.
- The old “one follow-up, then finish” instruction is removed. Only an explicit
  goodbye or the app's lifecycle should bring a normal conversation to a close.
- Pauses are not mistakes. Explicit requests for thinking time receive a brief
  acknowledgement without suggestions or another question.
- Word help is offered when requested. Ambiguous meanings need clarification.
  Grammar corrections are not volunteered during an ordinary conversation.
- The current single-answer retry remains a focused exercise and repeats the
  supplied opening question. It does not start a new open conversation.

These are model instructions, not deterministic guarantees. Model behavior needs
live evaluation, especially when transcripts are incomplete or inaccurate.

## Turn-taking profile

The profile is typed against the installed LiveKit Node SDK. Time values here
are milliseconds, unlike the seconds used in some Python examples.

| Setting | Value | Purpose |
| --- | --- | --- |
| Turn detector | Existing LiveKit Inference detector | Detect when a thought is finished |
| Endpointing | Dynamic; 1,200–6,000 ms | Learn from pauses within a bounded range |
| Interruptions | Adaptive, enabled | Let the learner resume or interrupt |
| Interruption duration | 400 ms | Speech-duration setting for interruption handling |
| Minimum interruption words | 0 | Avoid imposing a multiword requirement |
| False-interruption recovery | Resume after 2,500 ms | Recover when no user transcript follows an interruption |
| Preemptive generation | Disabled | Generate after the turn is confirmed |

This favors thinking time over the fastest possible reply. It does not guarantee
six seconds for every pause: recognition, the turn detector, interruption
classification, and provider latency all affect the result. The SDK may fall back
to simpler interruption detection if adaptive detection is unavailable.

Reference: [LiveKit turn-taking tuning](https://docs.livekit.io/agents/logic/turns/tuning/).

## Checks

```sh
npm run typecheck
npm run test:assessment
npm run test:conversation
```

The local conversation test exercises the installed SDK's pause adaptation using
our production timing profile. It does not simulate acoustic recognition.

With LiveKit credentials restored to `fluent/.env`, run the model behavior checks:

```sh
LIVEKIT_CONVERSATION_SMOKE=1 npm run test:conversation
```

These checks make small LiveKit Inference requests using synthetic dialogue,
covering continuation after several answers, topic changes, requested vocabulary
help, no unsolicited grammar corrections, thinking time, ambiguous meanings,
explicit goodbyes and the existing retry opening. No microphone or running agent
is required for these text checks. They print only synthetic model replies.

For real speech, run the frontend and agent, then try:

1. Give several answers and change the topic; Alex should follow rather than
   announce the rehearsal is over after two answers.
2. Pause mid-thought for one second, then two to three seconds, and continue.
   Note early replies and delays after a genuinely finished thought.
3. Say “Give me a moment,” then continue. Alex should not fill the gap with ideas.
4. Ask for “the expression for delaying a task”; expect brief help, not a lesson.
5. Resume speaking during Alex's reply; verify that Alex yields and hears the
   continuation. Check that a short acknowledgement does not always cut Alex off.

The live smoke checks and real-microphone calibration have not been run in this
workspace because LiveKit credentials are currently unavailable.

## Session lifecycle

Full conversations use the shared 15-minute limit. Focused retries remain 45
seconds. The frontend offers an early finish action and a last-minute reminder.
The agent starts its clock when the learner joins, signals the limit over a
reliable data message, then independently shuts down after a 10-second grace
period. Pending timers are cancelled on shutdown; setup has a separate deadline.
Offline tests use a simulated clock to exercise expiry and cancellation.

Finishing a rehearsal mutes capture and allows seven seconds for the patient turn
detector to finalize the transcript before disconnecting. Feedback accepts up to
600 turns, 16,000 characters per turn, and 80,000 characters combined across both
attempts, with a 400,000-byte request limit. These bounds cover longer sessions
while keeping input finite; exceeding a bound returns an error.

Alex has a small animated face labelled as an AI conversation partner. In live
sessions, mouth movement follows the agent audio's energy; it is not phoneme
lip-sync. The scripted demo uses a decorative speaking loop. Reduced motion
removes facial animation.

## Next implementation steps

Multilingual recognition and cross-session storage remain upcoming changes.
Vocabulary feedback now offers up to three expressions based on learner quotes,
with meanings, example sentences and optional self-guided practice prompts.
Validation rejects unsupported quotes, duplicate expressions, and examples that
do not contain the proposed phrase. Meanings and usefulness still need real
learner evaluation; structural checks cannot establish semantic accuracy.
STT is still configured for English, so do not yet
rely on recognizing words spoken in another language.

# Fluent

A speaking studio built with Next.js, TypeScript, and a LiveKit voice agent.

## UI components

Shared action buttons live in `components/ui/button.tsx`, with semantic tokens in
`app/design-tokens.css`. See the [design system guide](docs/design-system.md) for
variants, customization props, accessibility behavior, and styling ownership.

## Conversation rehearsal

The homepage is one complete practice flow for adults using English at work: describe a situation, review the setup, explicitly start a conversation with Alex, reflect on sentence structure and word choice, then retry the opening answer. The scenario can be a meeting, interview, client discussion, or another professional conversation. The previous three-mode studio remains at `/studio` for development and regression checks.

- The persistent WebGL cloud responds to microphone and agent audio. GSAP moves it between the meeting and reflection layouts. Reduced motion disables continuous movement, and controls/captions remain HTML.
- **Try the demo** is a clearly labeled scripted text preview. It requests no microphone, makes no AI calls, and includes illustrative feedback and a comparison.
- **Prepare conversation** opens a separate setup screen without requesting microphone access or contacting the AI. Users can review and edit their scenario. **Start conversation** first acquires microphone permission, then joins LiveKit using the existing credentials and local agent. Previously allowed browsers may not prompt again. Denying permission never dispatches an agent; leaving during a pending prompt stops any microphone subsequently granted.
- Alex now follows the learner’s topic in an ongoing conversation, with short responses, optional follow-up questions and word help when asked. Explicit roleplay requests still set the appropriate role. Turn-taking uses a patient, adaptive pause profile. See [conversation behavior and testing](docs/conversation-behavior.md). Full conversations last up to 15 minutes, with an early finish action, a last-minute reminder, and coordinated browser/agent cleanup. The focused retry remains 45 seconds and reuses the first opening question when available.
- Larger system serif headings and quotations are paired with readable sans-serif controls. Supporting text is at least 14px; decorative microcopy has been removed. The dark background, cloud and loading transition remain.
- Live transcripts feed `/api/rehearsal/feedback` directly. There is no second audio transcription pass. The model receives colleague lines as context, but evidence validation only accepts learner quotes. Comparisons validate the before and after quotes against their respective attempts. Unsupported comparisons are omitted; there are no confidence or pronunciation scores.
- The learner's microphone is recorded locally for full-answer playback. The colleague's audio is not included in that recording. Transcript text is processed through LiveKit Inference for coaching; Fluent writes no recordings or transcripts to disk or a database. Leaving the page or starting again clears the takes.
- On request failure, the transcript and local playback remain available for another feedback attempt. A missing/short transcript produces an insufficient-evidence result.
- Live endpoints remain restricted to same-origin localhost development. The scripted demo works in a production build. Public live use still needs authentication, shared usage limits, and deployed agents/workers.

Run `npm run dev` and `npm run agent:dev` in separate terminals. Restart the agent if an older process is running without file watching.

The default integration suite covers scenario editing, explicit start, denied and delayed microphone permissions, the demo, mobile layout, reduced motion, connection errors, request validation, and the previous studio. Optional real-service checks use LiveKit credits:

```sh
MEETING_SMOKE=1 npm run test:integration -- --grep 'live meeting feedback'
REHEARSAL_SMOKE_WAV=/absolute/path/to/synthetic-meeting.wav npm run test:integration -- --grep 'live rehearsal captures'
```

The latter needs a registered agent and a synthetic WAV that mentions the payment flow. It verifies actual voice transport, transcription, feedback, local playback, and microphone release. Feedback accuracy for real learners still needs review with varied speech and an English teacher.

## Run locally

```sh
npm install
npm run dev
```

Open http://localhost:3001. Run `npm run build` for the production build and `npm run typecheck` for both app and agent TypeScript validation.

## Live conversations

Use Node.js 24 or later and install the [LiveKit CLI](https://docs.livekit.io/reference/developer-tools/livekit-cli/).
Add `LIVEKIT_URL` (the `wss://` project URL), `LIVEKIT_API_KEY`, and `LIVEKIT_API_SECRET` to the root `.env`. See `.env.example`; never expose the secret through a `NEXT_PUBLIC_` variable. `.env` files are ignored by Git.

```sh
npm install
npm install --prefix agent
npm run agent:dev
```

Keep the agent running, and run `npm run dev` in another terminal. Choose **Have a conversation**, select a topic and focus, and press **Start conversation**. Allow microphone access; use **Enable sound** if the browser blocks playback.

The agent runs on your computer and registers as `fluent-coach` in your development Cloud project. The CLI uses the default (`production`) dispatch target to match the app's tokens; this does not deploy code to Cloud. Do not run another worker with the same name and deployment unless you want jobs distributed across them.

The default pipeline uses LiveKit Inference with AssemblyAI STT, Gemma LLM, Fish Audio TTS, and LiveKit turn detection. No separate provider keys are needed, but your Cloud project must have available Inference credits. Optional model and voice overrides are listed in `.env.example`.

- `/api/livekit/token` issues five-minute, microphone-only join tokens, creates unique participant and room identities, and dispatches the named agent with the selected topic/focus.
- The dev command binds to loopback. The token endpoint permits same-origin localhost development requests only, limits request size, validates input, and applies a process-local connection-attempt limit. It deliberately returns **403 in production** until real authentication and shared rate limits are implemented. Restart any previously running dev server to pick up the loopback binding.
- The browser handles agent audio, text-stream transcripts, mute/unmute, reconnecting, playback restrictions, and agent startup errors. Finishing or leaving stops local microphone tracks and disconnects the room.
- Both the agent and browser limit sessions to ten minutes. Token expiry limits new connections; it does not end a connected session.
- Conversation audio is streamed to LiveKit and model providers. Agent session recording is disabled (`record: false`); Fluent does not persist conversation audio or transcripts. Provider processing is still involved. The transcript remains in component memory until leaving/retrying or refreshing.

If the agent does not join, check that `npm run agent:dev` reports registration in the same project as the web app. Model errors may indicate unavailable credits, a disabled model, or an incompatible model/voice override. Restart the app and agent after changing `.env`.

## Checks

With the dev server running and Chrome installed:

```sh
npm run typecheck
npm run test:assessment
npm run build
npm run test:integration
```

The unit checks validate audio boundaries and feedback evidence. Integration checks cover explicit recording submission, feedback and retry, preserved audio after errors, rejected assessment requests, signed token permissions, room isolation, and conversation errors. Normal browser checks mock assessment responses and do not call AI models. The opt-in conversation test uses a simulated microphone, consumes a small amount of LiveKit Inference usage, and requires the local agent:

```sh
LIVEKIT_SMOKE=1 npm run test:integration
```

It verifies agent audio and a transcript, mute/unmute, and microphone release after finishing. Real microphone quality and natural interruptions still need a manual listening test.

## Recorded language feedback

Choose **Speak freely → Start practice**, record up to two minutes, then **Finish recording**. Listen back and choose **Send recording for feedback**. The first version gives one supported strength, up to two sentence-structure or word-usage suggestions, and a focused retry exercise. Corrections and optional style alternatives are labeled separately. Quotes link to moments in your recording, and the transcript is available to check for recognition mistakes. Retrying keeps the first take for comparison; it does not invent an improvement score.

Use Node.js 24+, run `npm install --prefix agent`, and keep the existing three LiveKit variables in `.env`. No extra provider account or API key is needed. The conversation agent does **not** need to be running for recorded feedback.

- The browser converts a submitted recording to mono 16 kHz PCM WAV. `/api/assessment` checks origin, consent, format, size, and a process-local rate/concurrency limit.
- A short-lived Node worker uses Nova-3 transcription and Gemma language feedback through [LiveKit Inference](https://docs.livekit.io/agents/models/inference/), billed to your LiveKit project. `ASSESSMENT_LLM_MODEL` optionally overrides the coaching model. Nova-3 supplies word timestamps and recognition confidence; Fluent uses conservative confidence filters, which are heuristics rather than calibrated accuracy guarantees.
- LiveKit Inference transcription is streaming-only, so saved audio is paced through the stream. Allow roughly the recording duration plus feedback generation time. Requests time out within four minutes; cancelling stops the local worker.
- Audio is sent only after the explicit feedback button. Fluent processes it in memory, creates no room/egress recording, logs no transcript, and writes no audio file or database record. LiveKit and its model providers process the submitted audio and text. Local takes are released when leaving the practice session or refreshing.
- Evidence validation rejects quotes absent from the transcript and uncertain matched words. Short, silent, or insufficiently clear recordings receive an insufficient-evidence response. Recognition and coaching can still make mistakes; replay a quote before accepting a correction.
- This endpoint is local-development-only and returns **403 in production**. Deployment needs authentication, shared limits, and a suitable worker host before this route can be enabled.

This version assesses English wording and sentence structure. Pronunciation, acoustic delivery metrics, and automatic improvement scoring are not implemented. Read mode and the demo still display clearly labeled sample feedback.

To exercise the real assessment endpoint with a synthetic canonical mono 16 kHz PCM WAV (uses Inference credits):

```sh
ASSESSMENT_SMOKE_WAV=/absolute/path/to/synthetic.wav npm run test:integration -- --grep 'live assessment'
```

Set `ASSESSMENT_EXPECTED_TAIL` to a phrase near the end of that fixture to verify transcription completeness.

## Included

- Speak freely, read a passage, or have a live AI conversation.
- Choose language, delivery, or both as a focus.
- Use a suggested prompt or supply your own text.
- Record, pause, resume, and play back audio using browser APIs.
- Explore a demo without granting microphone access.
- Request real language feedback for Speak freely and compare the first and new takes.
- Explore explicitly labeled sample feedback in Read mode and the demo.
- View the conversation transcript after a live session, without presenting it as a voice assessment.
- Responsive layouts, keyboard controls, reduced-motion support, and microphone error states.

Recordings stay in browser memory until explicitly submitted for Speak freely feedback. Leaving the session or refreshing discards local takes. Microphone recording requires localhost or HTTPS and a browser with MediaRecorder support.

## Next integration

Next steps are evaluating feedback quality on varied real speech, adding delivery measurements and Read-mode assessment, then account history and persistence. Postgres and temporary object storage are not implemented yet.

`lib/practice.ts` holds prompt definitions and sample coaching content. `components/use-recorder.ts` owns browser recording. `components/speaking-practice.tsx` manages recorded assessment and retry; `lib/assessment` defines its audio and evidence contracts. `agent/src/assess-recording.ts` runs the short-lived assessment worker. `components/use-conversation.ts` manages LiveKit connections. `components/studio.tsx` coordinates the experience. `agent/src/main.ts` runs the conversation agent separately from Next.js requests.

Use separate session and recording identifiers when adding persistence; browser object URLs are temporary and must not be stored as backend audio references.

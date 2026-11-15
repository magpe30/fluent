import { ServerOptions, cli, defineAgent, inference, voice } from "@livekit/agents";
import { fileURLToPath } from "node:url";
import { AGENT_NAME, SESSION_END_TOPIC, sessionDuration, parseConversationOptions } from "../../lib/livekit/contracts.ts";
import { startSessionLifetime } from "./session-lifetime.ts";
import { CONVERSATION_TURN_HANDLING, conversationPolicy } from "./conversation-policy.ts";

export default defineAgent({
  entry: async (ctx) => {
    const options = parseConversationOptions(JSON.parse(ctx.job.metadata || "null"));
    if (!options) throw new Error("Missing conversation topic or focus.");

    const policy = conversationPolicy(options);
    const session = new voice.AgentSession({
      stt: new inference.STT({ model: process.env.STT_MODEL || "assemblyai/universal-3-6-pro", language: "en" }),
      llm: new inference.LLM({ model: process.env.LLM_MODEL || "google/gemma-4-31b-it" }),
      tts: new inference.TTS({
        model: process.env.TTS_MODEL || "fishaudio/s2.1-pro",
        voice: process.env.TTS_VOICE || "fa4c9eb3dccc4806b382b40d61c6b10a",
      }),
      turnHandling: { ...CONVERSATION_TURN_HANDLING, turnDetection: new inference.TurnDetector() },
    });

    session.on(voice.AgentSessionEventTypes.Error, (event) => {
      if (!event.error.recoverable) {
        void ctx.room.localParticipant?.publishData(new TextEncoder().encode("unavailable"), {
          reliable: true, topic: "fluent.agent.error",
        }).catch(() => {});
      }
    });
    session.on(voice.AgentSessionEventTypes.Close, () => ctx.shutdown("Conversation ended"));
    // Bound setup separately; the conversation clock starts once the learner joins.
    const setupDeadline = setTimeout(() => { void ctx.shutdown("No participant joined"); }, 60_000);
    let cancelLifetime = () => {};
    ctx.addShutdownCallback(async () => { clearTimeout(setupDeadline); cancelLifetime(); await session.close(); });

    await session.start({
      room: ctx.room,
      record: false,
      agent: voice.Agent.create({
        instructions: policy.instructions,
      }),
    });
    await ctx.connect();
    await ctx.waitForParticipant();
    clearTimeout(setupDeadline);
    cancelLifetime = startSessionLifetime(sessionDuration(options), async () => {
      await ctx.room.localParticipant?.publishData(new TextEncoder().encode("time_limit"), {
        reliable: true, topic: SESSION_END_TOPIC,
      });
    }, () => { void ctx.shutdown("Session time limit"); });
    session.generateReply({ instructions: policy.openingInstructions });
  },
});

cli.runApp(new ServerOptions({ agent: fileURLToPath(import.meta.url), agentName: AGENT_NAME }));

import { randomUUID } from "node:crypto";
import { AccessToken, RoomAgentDispatch, RoomConfiguration, TrackSource } from "livekit-server-sdk";
import { AGENT_NAME, parseConversationOptions } from "../../../../lib/livekit/contracts";

export const runtime = "nodejs";

// A local-development gate, not a substitute for production authentication.
const localHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);
let windowStart = 0;
let requests = 0;

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const url = new URL(request.url);
  if (process.env.NODE_ENV === "production" || !localHosts.has(url.hostname)) {
    return json({ error: "Live conversations are currently available in local development only." }, 403);
  }
  if (request.headers.get("origin") !== url.origin) {
    return json({ error: "Start your conversation from Fluent." }, 403);
  }
  if (!request.headers.get("content-type")?.startsWith("application/json")) {
    return json({ error: "Expected a JSON request." }, 415);
  }
  const now = Date.now();
  if (now - windowStart >= 60_000) { windowStart = now; requests = 0; }
  if (++requests > 20) {
    return json({ error: "Too many connection attempts. Wait a minute and try again." }, 429);
  }

  let body: unknown;
  try {
    const reader = request.body?.getReader();
    if (!reader) return json({ error: "Choose a conversation topic and focus." }, 400);
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 24_000) {
        await reader.cancel();
        return json({ error: "Your conversation topic is too long." }, 413);
      }
      chunks.push(value);
    }
    body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return json({ error: "Couldn’t read the conversation request." }, 400);
  }
  const options = parseConversationOptions(body);
  if (!options) return json({ error: "Choose a topic of up to 4,000 characters and a valid focus." }, 400);

  const { LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET } = process.env;
  if (!LIVEKIT_URL || !LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
    return json({ error: "Live conversations aren’t configured yet. Check the server environment." }, 503);
  }
  try {
    const serverUrl = new URL(LIVEKIT_URL);
    if (serverUrl.protocol !== "wss:" || serverUrl.username || serverUrl.password) throw new Error("Invalid URL");
    const roomName = `fluent-${randomUUID()}`;
    const token = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
      identity: `speaker-${randomUUID()}`,
      name: "You",
      ttl: "5m",
    });
    token.addGrant({
      roomJoin: true,
      room: roomName,
      canSubscribe: true,
      canPublish: true,
      canPublishSources: [TrackSource.MICROPHONE],
      canPublishData: false,
      canUpdateOwnMetadata: false,
    });
    token.roomConfig = new RoomConfiguration({
      emptyTimeout: 60,
      departureTimeout: 20,
      maxParticipants: 2,
      agents: [new RoomAgentDispatch({ agentName: AGENT_NAME, metadata: JSON.stringify(options) })],
    });
    return json({ server_url: serverUrl.toString(), participant_token: await token.toJwt(), room_name: roomName });
  } catch {
    return json({ error: "Couldn’t prepare the voice session. Check the LiveKit server configuration." }, 503);
  }
}

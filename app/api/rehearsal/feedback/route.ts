import { MAX_MEETING_REQUEST_BYTES, parseMeetingRequest, type MeetingFeedback } from "../../../../lib/rehearsal";
import { runAssessmentWorker } from "../../../../lib/assessment/worker";

export const runtime = "nodejs";
export const maxDuration = 90;
let running = false, count = 0, windowStart = 0;
const json = (value: unknown, status = 200) => Response.json(value, { status, headers: { "Cache-Control": "no-store" } });
export async function POST(request: Request) {
  const url = new URL(request.url);
  if (process.env.NODE_ENV === "production" || !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || request.headers.get("origin") !== url.origin) return json({ error: "Live rehearsal is currently available in local development only." }, 403);
  if (!request.headers.get("content-type")?.startsWith("application/json")) return json({ error: "Expected a transcript." }, 415);
  if (running) return json({ error: "Another rehearsal is being reviewed. Try again shortly." }, 429);
  if (Date.now() - windowStart > 60_000) { count = 0; windowStart = Date.now(); }
  if (++count > 6) return json({ error: "Please wait a minute before requesting more feedback." }, 429);
  let input;
  try {
    const reader = request.body?.getReader();
    if (!reader) return json({ error: "No transcript received." }, 400);
    const chunks: Uint8Array[] = []; let size = 0;
    while (true) { const { value, done } = await reader.read(); if (done) break; size += value.length; if (size > MAX_MEETING_REQUEST_BYTES) { await reader.cancel(); return json({ error: "The transcript is too long." }, 413); } chunks.push(value); }
    input = parseMeetingRequest(JSON.parse(Buffer.concat(chunks).toString("utf8")));
  } catch { return json({ error: "The transcript couldn’t be read." }, 400); }
  if (!process.env.LIVEKIT_API_KEY || !process.env.LIVEKIT_API_SECRET) return json({ error: "The feedback service isn’t configured yet." }, 503);
  // Recheck after reading the body so simultaneous uploads cannot start two workers.
  if (running) return json({ error: "Another rehearsal is being reviewed. Try again shortly." }, 429);
  running = true;
  try { return json(await runAssessmentWorker<MeetingFeedback>("assess-meeting.ts", input, request.signal)); }
  catch { return json({ error: "We couldn’t prepare reliable feedback. Your transcript and recording are still here; please try again." }, 502); }
  finally { running = false; }
}

import { MAX_WAV_BYTES } from "../../../lib/assessment/contracts";
import { readWav } from "../../../lib/assessment/audio";
import { assessRecording } from "../../../lib/assessment/worker";

export const runtime = "nodejs";
export const maxDuration = 240;
let running = false;
let windowStart = 0, requests = 0;
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(request: Request) {
  const url = new URL(request.url);
  if (process.env.NODE_ENV === "production" || !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || request.headers.get("origin") !== url.origin) {
    return json({ error: "Recording feedback is available from the local Fluent app only." }, 403);
  }
  if (!request.headers.get("content-type")?.startsWith("multipart/form-data")) return json({ error: "Send a recording for feedback." }, 415);
  if (!process.env.LIVEKIT_API_KEY || !process.env.LIVEKIT_API_SECRET) return json({ error: "Feedback isn’t configured yet. Check the LiveKit credentials on the server." }, 503);
  if (running) return json({ error: "Another recording is being analyzed. Please try again shortly." }, 429);
  if (Date.now() - windowStart >= 60_000) { windowStart = Date.now(); requests = 0; }
  if (++requests > 6) return json({ error: "Please wait a minute before requesting more feedback." }, 429);
  running = true;
  try {
    const reader = request.body?.getReader();
    if (!reader) return json({ error: "No recording received." }, 400);
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_WAV_BYTES + 25_000) { await reader.cancel(); return json({ error: "Keep your recording under two minutes." }, 413); }
      chunks.push(value);
    }
    let form: FormData;
    try { form = await new Response(Buffer.concat(chunks), { headers: { "Content-Type": request.headers.get("content-type")! } }).formData(); }
    catch { return json({ error: "This recording request couldn’t be read. Please try again." }, 400); }
    const file = form.get("audio"), prompt = form.get("prompt"), consent = form.get("consent");
    if (!(file instanceof File) || file.type !== "audio/wav" || typeof prompt !== "string" || prompt.length > 4000 || consent !== "true") {
      return json({ error: "Choose a recording and agree to send it for feedback." }, 400);
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    try { readWav(bytes); } catch { return json({ error: "This recording couldn’t be read. Try recording again, for up to two minutes." }, 400); }
    const result = await assessRecording(bytes, prompt, request.signal);
    return json(result);
  } catch (cause) {
    if (request.signal.aborted) return json({ error: "Analysis cancelled." }, 499);
    const reason = cause instanceof Error ? cause.message : "";
    const error = reason === "timeout" ? "Feedback took too long. Your recording is still here; you can try again." :
      reason === "coaching_failed" ? "We couldn’t produce reliable feedback this time. Your recording is still here; please try again." :
      "We couldn’t analyze your recording. Check the connection and LiveKit Inference availability, then try again.";
    return json({ error }, 502);
  } finally { running = false; }
}

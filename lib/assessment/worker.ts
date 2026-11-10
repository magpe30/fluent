import { spawn } from "node:child_process";
import path from "node:path";
import type { Assessment } from "./contracts";

export function assessRecording(audio: Uint8Array, prompt: string, signal: AbortSignal): Promise<Assessment> {
  return runAssessmentWorker<Assessment>("assess-recording.ts", { audio: Buffer.from(audio).toString("base64"), prompt }, signal, 220_000);
}

export function runAssessmentWorker<T>(script: "assess-recording.ts" | "assess-meeting.ts", input: unknown, signal: AbortSignal, timeoutMs = 75_000): Promise<T> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(new Error("cancelled")); return; }
    const child = spawn(process.execPath, [path.join(process.cwd(), "agent/src", script)], {
      cwd: process.cwd(), env: process.env, stdio: ["pipe", "pipe", "pipe"],
    });
    let output = "", settled = false;
    const cleanup = () => { clearTimeout(timeout); signal.removeEventListener("abort", cancel); };
    const fail = (reason: string) => {
      if (settled) return;
      settled = true; cleanup(); child.kill("SIGKILL"); reject(new Error(reason));
    };
    const cancel = () => fail("cancelled");
    const timeout = setTimeout(() => fail("timeout"), timeoutMs);
    signal.addEventListener("abort", cancel, { once: true });
    child.on("error", () => fail("worker_unavailable"));
    child.stdin.on("error", () => fail("worker_unavailable"));
    // SDK diagnostics may contain transcripts. Never forward them to logs or clients.
    child.stderr.resume();
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      output += chunk;
      if (output.length > 250_000) fail("invalid_response");
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true; cleanup();
      try {
        const value = JSON.parse(output);
        if (code !== 0 || !value.result) { reject(new Error(value.error || "worker_unavailable")); return; }
        resolve(value.result as T);
      } catch { reject(new Error("invalid_response")); }
    });
    if (signal.aborted) cancel();
    else child.stdin.end(JSON.stringify(input));
  });
}

import { spawn } from "node:child_process";

// Match token dispatch's default deployment in the fluent-dev Cloud project.
// This runs locally; it does not upload or deploy the agent.
const child = spawn("lk", ["agent", "dev", "--deployment", "production", "src/main.ts"], {
  stdio: "inherit",
  env: process.env,
});
child.on("error", () => {
  console.error("Couldn’t start the LiveKit CLI. Install it, then run npm run agent:dev again.");
  process.exitCode = 1;
});
child.on("exit", (code) => { process.exitCode = code ?? 1; });
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));

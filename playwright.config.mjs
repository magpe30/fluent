import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.spec.mjs",
  workers: 1,
  timeout: 60_000,
  use: {
    baseURL: process.env.TEST_APP_URL || "http://localhost:3001",
    browserName: "chromium",
    channel: "chrome",
    permissions: ["microphone"],
    launchOptions: { args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", ...(process.env.REHEARSAL_SMOKE_WAV ? [`--use-file-for-fake-audio-capture=${process.env.REHEARSAL_SMOKE_WAV}`] : [])] },
    trace: "off",
  },
});

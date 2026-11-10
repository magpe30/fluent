import { test, expect } from "@playwright/test";
import { TokenVerifier } from "livekit-server-sdk";

test("tokens restrict participants to a unique room and microphone", async ({ request, baseURL }) => {
  process.loadEnvFile(".env");
  const mint = async () => {
    const response = await request.post("/api/livekit/token", {
      headers: { origin: baseURL }, data: { prompt: "Tell me about a favorite place.", focus: "language" },
    });
    expect(response.status()).toBe(200);
    expect(response.headers()["cache-control"]).toBe("no-store");
    const body = await response.json();
    const claims = await new TokenVerifier(process.env.LIVEKIT_API_KEY, process.env.LIVEKIT_API_SECRET).verify(body.participant_token);
    expect(claims.video.roomJoin).toBe(true);
    expect(claims.video.room).toBe(body.room_name);
    expect(claims.video.canPublishSources).toEqual(["microphone"]);
    expect(claims.video.canPublishData).toBe(false);
    expect(claims.video.canUpdateOwnMetadata).toBe(false);
    expect(claims.exp - claims.nbf).toBeLessThanOrEqual(300);
    expect(claims.roomConfig.agents[0].agentName).toBe("fluent-coach");
    expect(JSON.parse(claims.roomConfig.agents[0].metadata).focus).toBe("language");
    return claims;
  };
  const first = await mint();
  const second = await mint();
  expect(first.video.room).not.toBe(second.video.room);
  expect(first.sub).not.toBe(second.sub);
});

test("token endpoint rejects foreign origins and invalid input", async ({ request, baseURL }) => {
  const foreign = await request.post("/api/livekit/token", { headers: { origin: "https://example.com" }, data: { prompt: "Hello", focus: "both" } });
  expect(foreign.status()).toBe(403);
  const noOrigin = await request.post("/api/livekit/token", { data: { prompt: "Hello", focus: "both" } });
  expect(noOrigin.status()).toBe(403);
  for (const body of [{ prompt: "", focus: "both" }, { prompt: "Hello", focus: "invalid" }, { prompt: "a".repeat(4001), focus: "both" }]) {
    const response = await request.post("/api/livekit/token", { headers: { origin: baseURL }, data: body });
    expect(response.status()).toBe(400);
  }
  const oversized = await request.post("/api/livekit/token", { headers: { origin: baseURL }, data: { prompt: "a".repeat(25_000), focus: "both" } });
  expect(oversized.status()).toBe(413);
});

test("conversation errors are recoverable and do not display sample assessment", async ({ page }) => {
  await page.route("**/api/livekit/token", (route) => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Voice service unavailable for this test." }) }));
  await page.goto("/studio");
  await page.getByRole("button", { name: "Have a conversation", exact: true }).click();
  await expect(page.getByText(/Starting a conversation streams/)).toBeVisible();
  await page.getByRole("button", { name: "Start conversation", exact: true }).click();
  await expect(page.locator(".conversation-content [role=alert]")).toContainText("Voice service unavailable");
  await expect(page.getByRole("button", { name: "Try another conversation" })).toBeVisible();
  await expect(page.getByText("Sample feedback", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Back to setup" }).click();
  await expect(page.getByRole("button", { name: "Start conversation", exact: true })).toBeVisible();
});

test("live agent speaks, streams text, and releases the microphone on finish", async ({ page }) => {
  test.skip(process.env.LIVEKIT_SMOKE !== "1", "Opt-in test uses LiveKit Inference credits.");
  await page.addInitScript(() => {
    window.__fluentTestTracks = [];
    const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async (...args) => {
      const stream = await original(...args);
      window.__fluentTestTracks.push(...stream.getTracks());
      return stream;
    };
  });
  await page.goto("/studio");
  await page.getByRole("button", { name: "Have a conversation", exact: true }).click();
  await page.getByRole("button", { name: "Start conversation", exact: true }).click();
  await expect(page.locator(".transcript-line").first()).toBeVisible({ timeout: 45_000 });
  await expect(page.locator(".conversation-content audio")).toHaveCount(1);
  await page.getByRole("button", { name: "Mute", exact: true }).click();
  await expect(page.getByRole("button", { name: "Unmute", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Unmute", exact: true }).click();
  await expect(page.getByRole("button", { name: "Mute", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Finish conversation", exact: true }).click();
  await expect(page.getByText("Session ended · microphone is off")).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__fluentTestTracks.length > 0 && window.__fluentTestTracks.every((track) => track.readyState === "ended"))).toBe(true);
  await expect(page.locator(".conversation-content audio")).toHaveCount(0);
  await expect(page.getByRole("log")).not.toBeEmpty();
});

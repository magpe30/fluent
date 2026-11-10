import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";

const result = {
  status: "ready", message: "Language feedback from your recording.", duration: 8, version: "language-v1",
  transcript: [{ id: 0, text: "I enjoy spending time outside because it helps me relax.", start: 0, end: 7, confidence: .98, words: [] }],
  strength: { title: "You explain your reason", explanation: "You connect the activity to how it helps you.", evidence: { quote: "because it helps me relax", segmentId: 0, start: 3, end: 7 } },
  suggestions: [{ category: "word_usage", kind: "style", evidence: { quote: "spending time outside", segmentId: 0, start: 1, end: 3 }, replacement: "being outdoors", explanation: "An optional shorter alternative with the same meaning." }],
  exercise: "Describe another outdoor activity and explain why you enjoy it.",
};

async function record(page) {
  await expect(page.getByRole("button", { name: "Finish recording", exact: true })).toBeEnabled();
  await page.waitForTimeout(1200);
  await page.getByRole("button", { name: "Finish recording", exact: true }).click();
  await expect(page.getByRole("button", { name: "Send recording for feedback" })).toBeVisible();
}
async function start(page) {
  await page.goto("/studio");
  await page.getByRole("button", { name: "Speak freely", exact: true }).click();
  await page.getByRole("button", { name: "Start practice", exact: true }).click();
}

test("recording requires an explicit send, shows grounded feedback, and supports a retry", async ({ page }) => {
  let uploads = 0;
  await page.addInitScript(() => {
    window.__assessmentTracks = [];
    const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async (...args) => {
      const stream = await original(...args);
      window.__assessmentTracks.push(...stream.getTracks());
      return stream;
    };
  });
  await page.route("**/api/assessment", async route => {
    uploads++;
    expect(route.request().headers()["content-type"]).toContain("multipart/form-data");
    await route.fulfill({ json: result });
  });
  await start(page);
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await expect(page.getByText("Paused · take a breath")).toBeVisible();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await record(page);
  await expect.poll(() => page.evaluate(() => window.__assessmentTracks.length > 0 && window.__assessmentTracks.every(track => track.readyState === "ended"))).toBe(true);
  expect(uploads).toBe(0);
  await expect(page.locator('audio[aria-label="Your recording"]')).toBeVisible();
  await page.getByRole("button", { name: "Send recording for feedback" }).click();
  await expect(page.getByRole("heading", { name: "You explain your reason" })).toBeVisible();
  expect(uploads).toBe(1);
  await expect(page.getByText("Optional style suggestion", { exact: true })).toBeVisible();
  await expect(page.getByText("Sample feedback", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Try this exercise" }).click();
  await expect(page.getByRole("heading", { name: result.exercise })).toBeVisible();
  await record(page);
  await page.getByRole("button", { name: "Send recording for feedback" }).click();
  await expect(page.getByText("COMPARE YOUR TAKES")).toBeVisible();
  await expect(page.locator('audio[aria-label="Your first take"]')).toBeVisible();
  expect(uploads).toBe(2);
  await page.getByRole("button", { name: "Done for now" }).click();
  await expect(page.locator(".speaking-practice")).toHaveCount(0);
});

test("live assessment transcribes a submitted synthetic recording through LiveKit", async ({ request, baseURL }) => {
  test.skip(!process.env.ASSESSMENT_SMOKE_WAV, "Opt-in test uses a synthetic WAV and LiveKit Inference credits.");
  test.setTimeout(240_000);
  const response = await request.post("/api/assessment", {
    headers: { origin: baseURL }, timeout: 230_000,
    multipart: { prompt: "Describe your weekend.", consent: "true", audio: { name: "synthetic.wav", mimeType: "audio/wav", buffer: readFileSync(process.env.ASSESSMENT_SMOKE_WAV) } },
  });
  expect(response.status(), await response.text()).toBe(200);
  const assessment = await response.json();
  expect(assessment.status).toBe("ready");
  expect(assessment.strength.evidence.quote.length).toBeGreaterThan(0);
  expect(assessment.suggestions.length).toBeLessThanOrEqual(2);
  if (process.env.ASSESSMENT_EXPECTED_TAIL) {
    expect(assessment.transcript.map(segment => segment.text).join(" ").toLowerCase()).toContain(process.env.ASSESSMENT_EXPECTED_TAIL.toLowerCase());
  }
});

test("failed analysis keeps the recording available for another attempt", async ({ page }) => {
  await page.route("**/api/assessment", route => route.fulfill({ status: 502, json: { error: "Feedback temporarily unavailable." } }));
  await start(page); await record(page);
  const url = await page.locator('audio[aria-label="Your recording"]').getAttribute("src");
  await page.getByRole("button", { name: "Send recording for feedback" }).click();
  await expect(page.locator('.speaking-practice [role="alert"]')).toContainText("Feedback temporarily unavailable.");
  await expect(page.locator('audio[aria-label="Your recording"]')).toHaveAttribute("src", url);
  await expect(page.getByRole("button", { name: "Send recording for feedback" })).toBeEnabled();
});

test("assessment endpoint rejects foreign origins, missing consent, and malformed audio", async ({ request, baseURL }) => {
  const foreign = await request.post("/api/assessment", { headers: { origin: "https://example.com" }, multipart: { prompt: "Hello" } });
  expect(foreign.status()).toBe(403);
  const unsupported = await request.post("/api/assessment", { headers: { origin: baseURL }, data: {} });
  expect(unsupported.status()).toBe(415);
  for (const consent of ["false", "true"]) {
    const invalid = await request.post("/api/assessment", { headers: { origin: baseURL }, multipart: { prompt: "Describe your weekend.", consent, audio: { name: "practice.wav", mimeType: "audio/wav", buffer: Buffer.from("invalid audio") } } });
    expect(invalid.status()).toBe(400);
  }
});

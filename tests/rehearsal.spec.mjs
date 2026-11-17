import { test, expect } from "@playwright/test";

async function holdMicrophone(page) {
  await page.addInitScript(() => {
    window.__micCalls = 0;
    window.__micTracks = [];
    const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = (...args) => {
      window.__micCalls++;
      return new Promise(resolve => {
        window.__allowMic = async () => {
          const stream = await original(...args);
          window.__micTracks.push(...stream.getTracks());
          resolve(stream);
        };
      });
    };
  });
}

async function checkScrolledHeader(page, screenshotName) {
  const header = page.locator(".rehearsal-header");
  await page.evaluate(() => window.scrollTo(0, 220));
  await expect(header).toHaveAttribute("data-scrolled", "true");
  await expect.poll(() => header.locator("[data-header-backdrop]").evaluate(element => getComputedStyle(element).opacity)).toBe("1");
  const bounds = await header.boundingBox();
  expect(bounds.y).toBe(0);
  expect(bounds.x).toBe(0);
  expect(bounds.width).toBe(await page.evaluate(() => document.documentElement.clientWidth));
  await expect(page.getByRole("button", { name: "Back", exact: true })).toBeInViewport();
  await page.screenshot({ path: test.info().outputPath(screenshotName) });
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(header).not.toHaveAttribute("data-scrolled", "true");
  await expect.poll(() => header.locator("[data-header-backdrop]").evaluate(element => getComputedStyle(element).opacity)).toBe("0");
}

test("custom scenarios remain editable and start only after explicit microphone permission", async ({ page }) => {
  const prompt = "I am interviewing for a design role. Help me explain a project to the hiring manager.";
  let options;
  await holdMicrophone(page);
  await page.route("**/api/livekit/token", route => {
    options = route.request().postDataJSON();
    return route.fulfill({ status: 503, json: { error: "Test connection finished." } });
  });
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Prepare conversation" })).toBeDisabled();
  await page.getByLabel("Describe who you’re speaking with and what you’d like to practice saying.").fill(prompt);
  await page.getByRole("button", { name: "Prepare conversation" }).click();
  await expect(page.locator(".scenario-preview")).toContainText(prompt);
  await expect(page.getByText("Your scene is set · Microphone off")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Meet Alex", exact: true })).toBeVisible();
  await expect(page.getByText("Your AI conversation partner", { exact: true })).toBeVisible();
  await expect(page.locator(".conversation-invitation")).toContainText("15 minutes");
  expect(await page.evaluate(() => window.__micCalls)).toBe(0);
  expect(options).toBeUndefined();
  await page.getByRole("button", { name: "Edit scenario" }).click();
  await expect(page.getByLabel("Describe who you’re speaking with and what you’d like to practice saying.")).toHaveValue(prompt);
  await page.getByRole("button", { name: "Prepare conversation" }).click();
  await expect(page.locator(".rehearsal-content")).toHaveCSS("opacity", "1");
  await page.screenshot({ path: test.info().outputPath("prepare-desktop.png"), fullPage: true });
  await page.getByRole("button", { name: "Start conversation", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__micCalls)).toBe(1);
  await expect(page.locator(".live-meta")).toContainText("00:00 / 15:00");
  await expect(page.getByRole("status").filter({ hasText: "Allow microphone access" })).toBeVisible();
  expect(options).toBeUndefined();
  await page.evaluate(() => window.__allowMic());
  await expect(page.locator(".rehearsal-error[role=alert]")).toContainText("Test connection finished.");
  expect(options).toMatchObject({ prompt, scenario: "rehearsal", focus: "language", retry: false });
  await expect.poll(() => page.evaluate(() => window.__micTracks.every(t => t.readyState === "ended"))).toBe(true);
});

test("leaving while permission is pending releases a late microphone grant without connecting", async ({ page }) => {
  let requests = 0;
  await holdMicrophone(page);
  await page.route("**/api/**", route => { requests++; return route.abort(); });
  await page.goto("/");
  await page.getByRole("button", { name: "Use an example" }).click();
  await page.getByRole("button", { name: "Prepare conversation" }).click();
  await page.getByRole("button", { name: "Start conversation", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__micCalls)).toBe(1);
  await page.getByRole("button", { name: "Leave rehearsal" }).click();
  await page.evaluate(() => window.__allowMic());
  await expect.poll(() => page.evaluate(() => window.__micTracks.length > 0 && window.__micTracks.every(t => t.readyState === "ended"))).toBe(true);
  await expect(page.getByRole("button", { name: "Prepare conversation" })).toBeVisible();
  expect(requests).toBe(0);
});

test("microphone retry respects a blocked permission and recovers after the user allows it", async ({ page }) => {
  let requests = 0;
  await page.route("**/api/**", route => { requests++; return route.fulfill({ status: 503, json: { error: "Connection reached after microphone permission." } }); });
  await page.addInitScript(() => {
    const capture = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    window.__micCalls = 0; window.__micTracks = []; window.__allowCapture = false;
    window.__permission = Object.assign(new EventTarget(), { state: "denied" });
    navigator.permissions.query = async () => window.__permission;
    navigator.mediaDevices.getUserMedia = async (...args) => {
      window.__micCalls++;
      if (!window.__allowCapture) throw new DOMException("Denied", "NotAllowedError");
      const stream = await capture(...args); window.__micTracks.push(...stream.getTracks()); return stream;
    };
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Use an example" }).click();
  await page.getByRole("button", { name: "Prepare conversation" }).click();
  await page.getByRole("button", { name: "Start conversation", exact: true }).click();
  await expect(page.locator(".rehearsal-error[role=alert]")).toContainText("Microphone access is off");
  await expect(page.locator(".microphone-help")).toContainText("permission is blocked");
  await expect(page.locator(".phase-live .planet")).toHaveCount(0);
  await page.getByRole("button", { name: "Try microphone again", exact: true }).click();
  await expect(page.locator(".rehearsal-error")).toContainText("Change the microphone permission");
  expect(await page.evaluate(() => window.__micCalls)).toBe(1);
  await expect(page.locator(".microphone-help")).toContainText("permission is blocked");
  expect(requests).toBe(0);
  await expect(page.locator(".rehearsal-content")).toHaveCSS("opacity", "1");
  await page.getByRole("button", { name: "Try microphone again", exact: true }).scrollIntoViewIfNeeded();
  await expect(page.locator(".rehearsal-live")).toBeVisible();
  await page.locator(".rehearsal-live").screenshot({ path: test.info().outputPath("microphone-blocked.png") });
  await page.evaluate(() => {
    window.__allowCapture = true;
    window.__permission.state = "granted";
    window.__permission.dispatchEvent(new Event("change"));
  });
  await expect(page.locator(".microphone-help")).toContainText("Site permission is allowed");
  expect(requests).toBe(0);
  await page.getByRole("button", { name: "Try microphone again", exact: true }).click();
  await expect(page.locator(".rehearsal-error")).toContainText("Connection reached after microphone permission.");
  expect(requests).toBe(1);
  await expect(page.locator(".microphone-help")).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => window.__micTracks.length > 0 && window.__micTracks.every(t => t.readyState === "ended"))).toBe(true);
});

test("a pending microphone retry keeps help visible and Back releases a late grant", async ({ page }) => {
  let requests = 0;
  await page.route("**/api/**", route => { requests++; return route.abort(); });
  await page.addInitScript(() => {
    const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    window.__micCalls = 0; window.__micTracks = [];
    navigator.permissions.query = async () => { throw new TypeError("Unsupported permission"); };
    navigator.mediaDevices.getUserMedia = (...args) => {
      window.__micCalls++;
      if (window.__micCalls === 1) return Promise.reject(new DOMException("Denied", "NotAllowedError"));
      return new Promise(resolve => {
        window.__allowMic = async () => {
          const stream = await original(...args);
          window.__micTracks.push(...stream.getTracks());
          resolve(stream);
        };
      });
    };
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Use an example" }).click();
  await page.getByRole("button", { name: "Prepare conversation" }).click();
  await page.getByRole("button", { name: "Start conversation", exact: true }).click();
  await page.getByRole("button", { name: "Try microphone again", exact: true }).click();
  await expect(page.getByRole("button", { name: "Checking microphone…" })).toBeDisabled();
  await expect(page.locator(".microphone-help")).toBeVisible();
  await expect(page.locator(".live-meta")).toContainText("Microphone off");
  await expect(page.getByText("YOUR MICROPHONE", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expect(page.getByRole("button", { name: "Start conversation", exact: true })).toBeVisible();
  await page.evaluate(() => window.__allowMic());
  await expect.poll(() => page.evaluate(() => window.__micTracks.length > 0 && window.__micTracks.every(t => t.readyState === "ended"))).toBe(true);
  expect(requests).toBe(0);
});

for (const [name, message] of [["NotFoundError", "No microphone was found"], ["NotReadableError", "may be in use by another app"], ["NotAllowedError", "Microphone access is off"]]) {
  test(`microphone ${name} gives specific guidance without relying on the Permissions API`, async ({ page }) => {
    let requests = 0;
    await page.route("**/api/**", route => { requests++; return route.abort(); });
    await page.addInitScript(errorName => {
      window.__micCalls = 0;
      navigator.permissions.query = async () => { throw new TypeError("Unsupported permission"); };
      navigator.mediaDevices.getUserMedia = async () => { window.__micCalls++; throw new DOMException("Test microphone error", errorName); };
    }, name);
    await page.goto("/");
    await page.getByRole("button", { name: "Use an example" }).click();
    await page.getByRole("button", { name: "Prepare conversation" }).click();
    await page.getByRole("button", { name: "Start conversation", exact: true }).click();
    await expect(page.locator(".rehearsal-error")).toContainText(message);
    if (name === "NotAllowedError") await expect(page.locator(".microphone-help")).toContainText("If no permission prompt appears");
    else await expect(page.locator(".microphone-help")).toHaveCount(0);
    await page.getByRole("button", { name: "Try microphone again", exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.__micCalls)).toBe(2);
    await expect(page.locator(".rehearsal-error")).toContainText(message);
    expect(requests).toBe(0);
  });
}

async function checkVocabulary(page, screenshotName) {
  const section = page.getByRole("region", { name: "Words for next time." });
  await expect(section).toBeVisible();
  await expect(section.getByRole("article")).toHaveCount(2);
  await expect(section.getByRole("heading", { name: "push back", exact: true })).toBeVisible();
  await expect(section).toContainText("I suggest we launch next Friday");
  await expect(section).toContainText("Could we push back the launch to next Friday?");
  const practice = section.locator("details").first();
  await expect(practice).not.toHaveAttribute("open", "");
  await practice.locator("summary").focus();
  await page.keyboard.press("Enter");
  await expect(practice).toHaveAttribute("open", "");
  await expect(practice).toContainText("Suggest moving a deadline");
  await section.screenshot({ path: test.info().outputPath(screenshotName) });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

test("demo completes the meeting, feedback, retry and comparison without microphone or API calls", async ({ page }) => {
  let requests = 0;
  await page.route("**/api/**", route => { requests++; return route.abort(); });
  await page.addInitScript(() => { navigator.mediaDevices.getUserMedia = async () => { throw Error("Demo must not request a microphone"); }; });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Make room for your point" })).toBeVisible();
  await expect(page.locator(".page-loader")).toBeHidden();
  await expect(page.locator(".rehearsal-content")).toHaveCSS("opacity", "1");
  await page.screenshot({ path: test.info().outputPath("brief-desktop.png"), fullPage: true });
  await page.getByRole("button", { name: "Try the demo" }).click();
  await page.getByRole("button", { name: "Start demo", exact: true }).click();
  await expect(page.locator(".live-meta")).toContainText("Microphone off");
  await page.getByRole("button", { name: "See sample feedback" }).click();
  await expect(page.getByText("SAMPLE FEEDBACK · SCRIPTED DEMO")).toBeVisible();
  await expect(page.locator(".phase-feedback .planet")).toHaveCount(0);
  await expect(page.locator(".rehearsal-player")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Back", exact: true })).toBeVisible();
  await expect(page.getByText("Correction", { exact: true })).toBeVisible();
  await expect(page.getByText("Optional phrasing", { exact: true })).toBeVisible();
  await expect(page.locator(".rehearsal-content")).toHaveCSS("opacity", "1");
  await page.screenshot({ path: test.info().outputPath("feedback-desktop.png"), fullPage: true });
  await checkScrolledHeader(page, "header-scrolled-desktop.png");
  await checkVocabulary(page, "vocabulary-desktop.png");
  await page.getByRole("button", { name: "Try that answer again" }).click();
  await expect(page.getByText("YOUR FOCUS", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expect(page.getByText("SAMPLE FEEDBACK · SCRIPTED DEMO")).toBeVisible();
  await page.getByRole("button", { name: "Try that answer again" }).click();
  await page.getByRole("button", { name: "Start second take" }).click();
  await page.getByRole("button", { name: "See sample feedback" }).click();
  await expect(page.getByText("HEAR THE DIFFERENCE", { exact: true })).toBeVisible();
  await expect(page.getByText('You used “agree” directly after “I” in your second answer.')).toBeVisible();
  await expect(page.getByRole("region", { name: "Words for next time." })).toHaveCount(0);
  await page.getByRole("button", { name: "Finish practice" }).click();
  await expect(page.getByRole("heading", { name: "Your next conversation. A little more room." })).toBeVisible();
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expect(page.getByText("HEAR THE DIFFERENCE", { exact: true })).toBeVisible();
  expect(requests).toBe(0);
});

test("mobile and reduced motion preserve the full demo flow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.getByRole("button", { name: "Try the demo" }).waitFor({ state: "visible" });
  await expect(page.locator(".rehearsal")).not.toHaveAttribute("inert");
  await expect(page.locator(".page-loader")).toBeHidden();
  await page.screenshot({ path: test.info().outputPath("brief-mobile.png"), fullPage: true });
  await page.getByRole("button", { name: "Try the demo" }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: test.info().outputPath("prepare-mobile.png"), fullPage: true });
  await page.getByRole("button", { name: "Start demo", exact: true }).click();
  await page.getByRole("button", { name: "See sample feedback" }).click();
  await expect(page.getByText("SAMPLE FEEDBACK · SCRIPTED DEMO")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: test.info().outputPath("feedback-mobile.png"), fullPage: true });
  await checkScrolledHeader(page, "header-scrolled-mobile.png");
  await checkVocabulary(page, "vocabulary-mobile.png");
  await page.getByRole("button", { name: "Try that answer again" }).click();
  await page.getByRole("button", { name: "Start second take" }).click();
  await page.getByRole("button", { name: "See sample feedback" }).click();
  await expect(page.getByText("HEAR THE DIFFERENCE", { exact: true })).toBeVisible();
});

test("failed live connection is recoverable and never shows sample feedback", async ({ page }) => {
  let options;
  await page.route("**/api/livekit/token", route => {
    options = route.request().postDataJSON();
    return route.fulfill({ status: 503, json: { error: "Voice service unavailable for this test." } });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Use an example" }).click();
  await page.getByRole("button", { name: "Prepare conversation" }).click();
  await page.getByRole("button", { name: "Start conversation", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Voice service unavailable" })).toBeVisible();
  expect(options.scenario).toBe("rehearsal");
  await expect(page.getByRole("button", { name: "Reconnect", exact: true })).toBeVisible();
  await expect(page.getByText("SAMPLE FEEDBACK · SCRIPTED DEMO")).toHaveCount(0);
  await page.getByRole("button", { name: "Back to the brief", exact: true }).click();
  await expect(page.getByRole("button", { name: "Prepare conversation" })).toBeVisible();
});

test("feedback endpoint rejects foreign origins and invalid transcripts", async ({ request, baseURL }) => {
  expect((await request.post("/api/rehearsal/feedback", { headers: { origin: "https://example.com" }, data: { turns: [] } })).status()).toBe(403);
  expect((await request.post("/api/rehearsal/feedback", { headers: { origin: baseURL }, data: { turns: [{ speaker: "Unknown", text: "Hello" }] } })).status()).toBe(400);
  expect((await request.post("/api/rehearsal/feedback", { headers: { origin: baseURL }, data: { turns: "a".repeat(400_001) } })).status()).toBe(413);
});

test("live meeting feedback is grounded in the learner and compares two takes", async ({ request, baseURL }) => {
  test.skip(process.env.MEETING_SMOKE !== "1", "Opt-in LiveKit Inference test.");
  test.setTimeout(100_000);
  const prompt = "I am interviewing for a product designer role. I want to explain how I collaborate with engineers.";
  const first = [{ speaker: "Fluent", text: "How do you work with engineers on a new feature?" }, { speaker: "You", text: "I am work closely with engineers. I explain the design and ask them for feedback before we build a new feature." }];
  const turns = [{ speaker: "Fluent", text: "How do you work with engineers on a new feature?" }, { speaker: "You", text: "I work closely with engineers. I explain the design and ask for their feedback before we build a new feature, so we can find problems early." }];
  const response = await request.post("/api/rehearsal/feedback", { headers: { origin: baseURL }, data: { prompt, turns, first }, timeout: 85_000 });
  expect(response.status(), await response.text()).toBe(200);
  const feedback = await response.json();
  expect(feedback.status).toBe("ready");
  expect(turns[1].text.toLowerCase()).toContain(feedback.strength.quote.toLowerCase());
  expect(feedback.suggestions.length).toBeLessThanOrEqual(2);
  expect(Array.isArray(feedback.vocabulary)).toBe(true);
  expect(feedback.vocabulary.length).toBeLessThanOrEqual(3);
  for (const item of feedback.vocabulary) {
    expect(turns[1].text.toLowerCase()).toContain(item.quote.toLowerCase());
    expect(item.example.toLowerCase()).toContain(item.phrase.toLowerCase());
    expect(item.meaning.trim()).not.toBe("");
    expect(item.practice.trim()).not.toBe("");
  }
  expect(feedback.exercise).not.toMatch(/Friday|deadline|launch/i);
  expect(feedback.exercise).not.toMatch(/(?:different|other|three|multiple) (?:professional )?scenarios/i);
});

test("live rehearsal captures a real transcript, releases the mic and produces feedback", async ({ page }) => {
  test.skip(!process.env.REHEARSAL_SMOKE_WAV, "Requires synthetic speech, a registered agent and Inference credits.");
  test.setTimeout(140_000);
  await page.addInitScript(() => {
    window.__meetingTracks = [];
    const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async (...args) => {
      const stream = await original(...args); window.__meetingTracks.push(...stream.getTracks()); return stream;
    };
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Use an example" }).click();
  await page.getByRole("button", { name: "Prepare conversation" }).click();
  await page.getByRole("button", { name: "Start conversation", exact: true }).click();
  await expect(page.locator(".live-history")).toContainText("payment", { timeout: 65_000 });
  await expect(page.locator(".rehearsal-live audio")).toHaveCount(1);
  await page.getByRole("button", { name: "Finish & reflect" }).click();
  await expect(page.getByText("KEEP THIS", { exact: true })).toBeVisible({ timeout: 80_000 });
  await expect(page.locator('audio[aria-label="Replay your answers"]')).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__meetingTracks.length > 0 && window.__meetingTracks.every(t => t.readyState === "ended"))).toBe(true);
  await expect(page.getByText("SAMPLE FEEDBACK · SCRIPTED DEMO")).toHaveCount(0);
  await expect(page.locator(".rehearsal-content")).toHaveCSS("opacity", "1");
  await page.screenshot({ path: test.info().outputPath("live-feedback.png"), fullPage: true });
});

test("live vocabulary supports everyday word searches with learner evidence", async ({ request, baseURL }) => {
  test.skip(process.env.MEETING_SMOKE !== "1", "Requires LiveKit Inference credentials and credits.");
  test.setTimeout(100_000);
  const turns = [
    { speaker: "Fluent", text: "What do you do to relax after a busy day?" },
    { speaker: "You", text: "I go for a walk after work. It helps me stop thinking about all the meetings. I cannot remember a natural expression for relaxing and not thinking about work." },
  ];
  const response = await request.post("/api/rehearsal/feedback", { headers: { origin: baseURL }, data: { prompt: "A friendly chat about my day", turns }, timeout: 85_000 });
  expect(response.status(), await response.text()).toBe(200);
  const feedback = await response.json();
  expect(feedback.status).toBe("ready");
  expect(feedback.vocabulary.length).toBeGreaterThan(0);
  expect(feedback.vocabulary.length).toBeLessThanOrEqual(3);
  for (const item of feedback.vocabulary) {
    expect(turns[1].text.toLowerCase()).toContain(item.quote.toLowerCase());
    expect(item.example.toLowerCase()).toContain(item.phrase.toLowerCase());
  }
  expect(feedback.exercise).not.toMatch(/Friday|deadline|launch/i);
});

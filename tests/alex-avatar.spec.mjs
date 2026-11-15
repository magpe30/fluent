import { test, expect } from "@playwright/test";

test("Alex keeps the illustrated silhouette during glances and respects reduced motion", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Use an example" }).click();
  await page.getByRole("button", { name: "Prepare conversation" }).click();
  const avatar = page.locator(".alex-introduction > [aria-hidden=true]");
  await expect(avatar).toBeVisible();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect.poll(() => avatar.evaluate(node => Number(node.style.getPropertyValue("--look")))).toBe(0);
  const still = await avatar.screenshot({ path: test.info().outputPath("alex-front.png") });
  const bounds = await avatar.boundingBox();
  await page.waitForTimeout(250);
  expect(await avatar.screenshot()).toEqual(still);

  await page.emulateMedia({ reducedMotion: "no-preference" });
  await expect.poll(() => avatar.evaluate(node => Math.abs(Number(node.style.getPropertyValue("--look")))), { timeout: 10000 }).toBeGreaterThan(.8);
  const turned = await avatar.screenshot({ path: test.info().outputPath("alex-turned.png") });
  expect(turned.equals(still)).toBe(false);
  expect(await avatar.boundingBox()).toEqual(bounds);
  // Only in-plane tilts: the illustration must never expose a flat edge.
  expect(await avatar.locator("div").evaluateAll(nodes => nodes.every(node => !getComputedStyle(node).transform.startsWith("matrix3d")))).toBe(true);

  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect.poll(() => avatar.evaluate(node => Number(node.style.getPropertyValue("--look")))).toBe(0);
});

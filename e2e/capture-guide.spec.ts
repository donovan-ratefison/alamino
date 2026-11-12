import { expect, test } from "@playwright/test";
import { CAPTURE_TOUR_STORAGE_KEY } from "../src/lib/onboarding";
import { viewAs } from "./helpers";

test.use({ storageState: { cookies: [], origins: [] }, reducedMotion: "reduce" });

for (const width of [1440, 375]) {
  test(`Add opens its six-step tour from the help button at ${width}px without creating a debt`, async ({ page, request }) => {
    await page.setViewportSize({ width, height: 900 });
    const before = await (await request.get("/api/debts")).json();
    const mutations: string[] = [];
    page.on("request", (r) => { if (!["GET", "HEAD"].includes(r.method()) && r.url().includes("/api/")) mutations.push(r.url()); });
    await page.goto("/add");
    // The clearing house does not add debts: view as a trader.
    await viewAs(page, "rivo");
    const popover = page.locator(".driver-popover");
    // The tour does not start by itself: it would cover the task.
    await expect(page.getByRole("button", { name: "How to add a debt" })).toBeVisible();
    await page.waitForTimeout(1000);
    await expect(popover).toBeHidden();
    await page.getByRole("button", { name: "How to add a debt" }).click();
    await expect(popover).toContainText("Choose your trader");
    await expect(page.getByRole("complementary", { name: "Add a debt guide" })).toHaveCount(0);
    const targets = ["#view-as", '[data-capture-tour="camera"]', '[data-capture-tour="photo"]', "#capture-text", '[data-capture-tour="read"]', '[data-capture-tour="guide"]'];
    for (const [index, selector] of targets.entries()) {
      await expect(page.locator(selector)).toHaveClass(/driver-active-element/);
      await expect(popover).toContainText(`${index + 1} of 6`);
      const bounds = await popover.boundingBox();
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
      expect(bounds!.y).toBeGreaterThanOrEqual(0);
      expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(900);
      if (index === 1) await expect(popover.getByRole("img")).toHaveJSProperty("naturalWidth", 840);
      await popover.getByRole("button", { name: index === 5 ? "Ready to add" : "Next", exact: true }).click();
    }
    await expect(popover).toBeHidden();
    await expect(page.getByRole("textbox", { name: "Sentence", exact: true })).toHaveValue("");
    await expect(page.getByRole("button", { name: "Read the sentence", exact: true })).toBeDisabled();
    expect(await page.evaluate((key) => localStorage.getItem(key), CAPTURE_TOUR_STORAGE_KEY)).toBe("completed");
    expect(await (await request.get("/api/debts")).json()).toEqual(before);
    expect(mutations).toEqual([]);
    await page.reload();
    await expect(page.getByRole("button", { name: "How to add a debt" })).toBeVisible();
    await page.waitForTimeout(1000);
    await expect(popover).toBeHidden();
    if (width < 640) await page.getByRole("button", { name: "Type a sentence", exact: true }).click();
    await page.getByRole("textbox", { name: "Sentence", exact: true }).fill("I owe Hery 50 for rice");
    await page.getByRole("button", { name: "How to add a debt" }).click();
    await expect(popover).toContainText("Choose your trader");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("textbox", { name: "Sentence", exact: true })).toHaveValue("I owe Hery 50 for rice");
    await expect(page.getByRole("button", { name: "How to add a debt" })).toBeFocused();
    expect(mutations).toEqual([]);
  });
}

import { expect, test } from "@playwright/test";
import { ONBOARDING_STORAGE_KEY } from "../src/lib/onboarding";

test.use({ storageState: { cookies: [], origins: [] }, reducedMotion: "reduce" });

test("a first visit explains all five tasks without changing debts or making a payment", async ({ page, request }) => {
  const debtsBefore = await (await request.get("/api/debts")).json();
  const mutations: string[] = [];
  page.on("request", (r) => { if (!["GET", "HEAD"].includes(r.method()) && r.url().includes("/api/")) mutations.push(r.url()); });
  await page.goto("/");
  const popover = page.locator(".driver-popover");
  await expect(popover).toContainText("Welcome to Alamino");
  await expect(popover.getByRole("img")).toHaveJSProperty("naturalWidth", 840);
  await expect(popover).toContainText("1 of 8");
  await popover.getByRole("button", { name: "Show me around", exact: true }).click();

  for (const [index, topic] of ["market", "add", "confirm", "payments", "statement"].entries()) {
    await expect(page.locator(".driver-active-element")).toHaveAttribute("data-tour", topic);
    await expect(popover).toContainText(`${index + 2} of 8`);
    await expect(popover.getByRole("img")).toHaveAttribute("src", `/illustrations/guide-${topic}.webp`);
    await expect(popover.getByRole("img")).toHaveJSProperty("complete", true);
    await expect(popover.getByRole("img")).toHaveJSProperty("naturalWidth", 840);
    await popover.getByRole("button", { name: "Next", exact: true }).click();
  }
  await expect(page.locator(".driver-active-element")).toHaveAttribute("id", "view-as");
  await popover.getByRole("button", { name: "Next", exact: true }).click();
  await expect(popover).toContainText("8 of 8");
  await popover.getByRole("button", { name: "Let’s get started", exact: true }).click();
  await expect(popover).toBeHidden();
  expect(await page.evaluate((key) => localStorage.getItem(key), ONBOARDING_STORAGE_KEY)).toBe("completed");
  expect(await (await request.get("/api/debts")).json()).toEqual(debtsBefore);
  expect(mutations).toEqual([]);
});

test("a skipped tour stays dismissed after reload and can be replayed from Help", async ({ page }) => {
  await page.goto("/");
  const popover = page.locator(".driver-popover");
  await expect(popover).toContainText("Welcome to Alamino");
  await popover.getByRole("button", { name: "Skip tour" }).click();
  expect(await page.evaluate((key) => localStorage.getItem(key), ONBOARDING_STORAGE_KEY)).toBe("dismissed");
  await page.reload();
  await expect(page.getByRole("heading", { name: /Less to pay/ })).toBeVisible();
  // Wait beyond the first-visit delay to ensure a reload does not reopen the tour.
  await page.waitForTimeout(1000);
  await expect(popover).toBeHidden();
  await page.getByRole("button", { name: "Take a guided tour" }).click();
  await expect(popover).toContainText("Welcome to Alamino");
  await page.keyboard.press("Escape");
  await expect(popover).toBeHidden();
  await expect(page.getByRole("button", { name: "Take a guided tour" })).toBeFocused();
});

test("phone visitors get five labelled icons, a local Add tour and replay in More", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto("/");
  const popover = page.locator(".driver-popover");
  await expect(popover).toContainText("Welcome to Alamino");
  await popover.getByRole("button", { name: "Show me around", exact: true }).click();
  for (const topic of ["market", "add", "confirm", "payments", "statement"]) {
    const active = page.locator(".bottom-bar .driver-active-element");
    await expect(active).toHaveAttribute("data-tour", topic);
    const bounds = await popover.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(375);
    expect(bounds!.y).toBeGreaterThanOrEqual(0);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(800);
    await popover.getByRole("button", { name: "Next", exact: true }).click();
  }
  await page.keyboard.press("Escape");
  const nav = page.getByRole("navigation", { name: "Phone", exact: true });
  await expect(nav.getByRole("link")).toHaveCount(5);
  for (const name of ["Market", "Add a debt", "Confirm", "Payments", "Statement"]) {
    const link = nav.getByRole("link", { name: new RegExp(`^${name}`) });
    await expect(link).toBeVisible();
    await expect(link.locator("svg")).toHaveAttribute("aria-hidden", "true");
  }
  await nav.getByRole("link", { name: "Add a debt" }).click();
  await expect(nav.getByRole("link", { name: "Add a debt" })).toHaveAttribute("aria-current", "page");
  await expect(popover).toContainText("Choose your trader");
  await popover.getByRole("button", { name: "Skip tour" }).click();
  await expect(page.getByRole("complementary", { name: "Add a debt guide" })).toHaveCount(0);
  await expect(page.getByText("Photograph your notebook", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole("button", { name: "More", exact: true }).click();
  await page.getByRole("button", { name: "Take a guided tour" }).click();
  await expect(popover).toContainText("Welcome to Alamino");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "More", exact: true })).toBeFocused();
});

import { expect, test, type Page } from "@playwright/test";
import { api, resetDemo, startRound, viewAs } from "./helpers";

test.use({ viewport: { width: 375, height: 800 } });

// For each page: the path, the viewer, and a check that the main content has loaded.
const pages: [string, string, (page: Page) => Promise<void>][] = [
  ["/", "house", (page) => expect(page.getByRole("main").locator("[data-status]").first()).toBeVisible()],
  ["/", "soa", (page) => expect(page.getByRole("heading", { name: "Hello Soa." })).toBeVisible()],
  [
    "/add",
    "soa",
    async (page) => {
      // On a phone the sentence field opens on demand: the camera comes first.
      await expect(page.getByText("Photograph your notebook")).toBeVisible();
      await page.getByRole("button", { name: "Type a sentence" }).click();
      await expect(page.getByRole("textbox")).toBeVisible();
    },
  ],
  ["/confirm", "soa", (page) => expect(page.getByRole("button", { name: /approve/i })).toBeVisible()],
  ["/rounds/latest", "house", (page) => expect(page.getByRole("main")).toContainText("$990")],
  ["/statement", "soa", (page) => expect(page.getByRole("main")).toContainText(/\$170(?!\d)/)],
  ["/finance", "house", (page) => expect(page.getByRole("heading", { level: 1 })).toContainText("AI Finance")],
];

test.describe("Phone width", () => {
  test.beforeEach(async ({ request }) => {
    await resetDemo(request);
    await startRound(request);
    // A new debt that waits for Soa, so /confirm has content when the test views as Soa.
    await api(request, "/api/debts", {
      debtorId: "soa",
      creditorId: "hery",
      amountCents: 2000,
      note: "rice",
      source: "text",
      createdBy: "hery",
    });
  });

  test("no page scrolls sideways at 375 px", async ({ page }) => {
    for (const [path, viewer, loaded] of pages) {
      await page.goto(path);
      await viewAs(page, viewer);
      await loaded(page);
      const fits = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
      expect.soft(fits, `${path} scrolls sideways`).toBe(true);
    }
  });

  test("the market ledger fits at 375 px without its own sideways scroll", async ({ page }) => {
    await page.goto("/");
    const table = page.getByRole("main").locator(".ledger-table");
    await expect(table.locator("[data-status]").first()).toBeVisible();
    expect(await table.evaluate((el) => el.parentElement!.scrollWidth <= el.parentElement!.clientWidth)).toBe(true);
  });

  test("a task page has a one-row header and no footer", async ({ page }) => {
    await page.goto("/add");
    await viewAs(page, "rivo");
    await expect(page.getByText("Photograph your notebook")).toBeVisible();
    const header = await page.locator("header").boundingBox();
    expect(header!.height).toBeLessThanOrEqual(64);
    // The bottom bar is the navigation on a phone: the footer is hidden.
    await expect(page.locator("footer")).toBeHidden();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });

  test("the phone bottom bar gives the clearing house access to AI Finance", async ({ page }) => {
    await page.goto("/");
    const financeLink = page.getByRole("navigation", { name: "Phone", exact: true }).getByRole("link", { name: "AI Finance" });
    await expect(financeLink).toBeVisible();
    await financeLink.click();

    await expect(page).toHaveURL(/\/finance$/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("AI Finance");
  });
});

import { expect, test, type Page } from "@playwright/test";
import { api, resetDemo, startRound } from "./helpers";

test.use({ viewport: { width: 375, height: 800 } });

// For each page: the path and a check that the main content has loaded.
const pages: [string, (page: Page) => Promise<void>][] = [
  ["/", (page) => expect(page.getByRole("gridcell").first()).toBeVisible()],
  [
    "/add",
    async (page) => {
      // On a phone the sentence field opens on demand: the camera comes first.
      await expect(page.getByText("Photograph your notebook")).toBeVisible();
      await page.getByRole("button", { name: "Type a sentence" }).click();
      await expect(page.getByRole("textbox")).toBeVisible();
    },
  ],
  ["/confirm", (page) => expect(page.getByRole("button", { name: /approve/i })).toBeVisible()],
  ["/rounds/latest", (page) => expect(page.getByRole("main")).toContainText("$990")],
  ["/statement", (page) => expect(page.getByRole("main")).toContainText(/\$170(?!\d)/)],
];

test.describe("Phone width", () => {
  test.beforeEach(async ({ request }) => {
    await resetDemo(request);
    await startRound(request);
    // A new debt that waits for Soa, the default trader, so /confirm has content.
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
    for (const [path, loaded] of pages) {
      await page.goto(path);
      await loaded(page);
      const fits = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
      expect.soft(fits, `${path} scrolls sideways`).toBe(true);
    }
  });
});

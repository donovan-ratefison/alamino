import { expect, test } from "@playwright/test";
import { finishRound, resetDemo, viewAs } from "./helpers";

test.describe("Statement", () => {
  test.beforeEach(async ({ request }) => {
    await resetDemo(request);
  });

  test("shows an empty state when no round exists", async ({ page }) => {
    await page.goto("/statement");
    await expect(page.getByRole("main")).toContainText(/no .*round/i);
  });

  test("shows each trader's result after a finished round", async ({ page, request }) => {
    await finishRound(request);
    await page.goto("/statement");
    const main = page.getByRole("main");

    await viewAs(page, "soa");
    await expect(main).toContainText(/pay[^.]*\$170(?!\d)/i);

    await viewAs(page, "hery");
    await expect(main).toContainText(/receive[^.]*\$290(?!\d)/i);

    await viewAs(page, "rivo");
    await expect(main).toContainText(/receive[^.]*\$30(?!\d)/i);
  });
});

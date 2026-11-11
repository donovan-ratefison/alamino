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
    await expect(main.getByRole("heading", { level: 1 })).toHaveText(/pay[^.]*\$170(?!\d)/i);
    const receipt = main.getByRole("region", { name: "Receipt" });
    await expect(receipt).toContainText(/You pay\s*\$170(?!\d)/);
    await expect(receipt).toContainText("Cleared by Alamino");

    await viewAs(page, "hery");
    await expect(main.getByRole("heading", { level: 1 })).toHaveText(/receive[^.]*\$290(?!\d)/i);

    await viewAs(page, "rivo");
    await expect(main.getByRole("heading", { level: 1 })).toHaveText(/receive[^.]*\$30(?!\d)/i);
  });
});

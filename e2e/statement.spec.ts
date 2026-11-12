import { expect, test } from "@playwright/test";
import { finishRound, resetDemo, viewAs } from "./helpers";

test.describe("Statement", () => {
  test.beforeEach(async ({ request }) => {
    await resetDemo(request);
  });

  test("shows an empty state when no round exists", async ({ page }) => {
    await page.goto("/statement");
    await viewAs(page, "soa");
    await expect(page.getByRole("main")).toContainText(/no .*round/i);
  });

  test("the clearing house has no statement", async ({ page, request }) => {
    await finishRound(request);
    await page.goto("/statement");
    await viewAs(page, "house");
    const main = page.getByRole("main");
    await expect(main).toContainText("Statements are personal. Choose a trader in View as.");
    await expect(main.getByRole("link", { name: "Finance page" })).toHaveAttribute("href", "/finance");
    await expect(main.getByRole("region", { name: "Receipt" })).toHaveCount(0);
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
    // The receipt comes before the list of debts.
    const debts = main.getByRole("region", { name: "Your debts" });
    expect((await receipt.boundingBox())!.y).toBeLessThan((await debts.boundingBox())!.y);
    await expect(main.getByRole("link", { name: "View round", exact: true })).toBeVisible();

    await viewAs(page, "hery");
    await expect(main.getByRole("heading", { level: 1 })).toHaveText(/receive[^.]*\$290(?!\d)/i);

    await viewAs(page, "rivo");
    await expect(main.getByRole("heading", { level: 1 })).toHaveText(/receive[^.]*\$30(?!\d)/i);
  });
});

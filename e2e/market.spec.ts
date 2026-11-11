import { expect, test } from "@playwright/test";
import { addNinthDebt, listDebts, resetDemo, viewAs } from "./helpers";

test.describe("Market view", () => {
  test.beforeEach(async ({ request }) => {
    await resetDemo(request);
  });

  test("shows the 8 seed debts, the $940 total and the five traders", async ({ page }) => {
    await page.goto("/");
    const main = page.getByRole("main");
    await expect(main.locator('[data-status="confirmed"]')).toHaveCount(8);
    await expect(main).toContainText("$940");

    const network = page.getByRole("application", { name: /network/i });
    for (const name of ["Hery", "Soa", "Rivo", "Lalao", "Fidy"]) {
      await expect(network.getByText(name, { exact: true })).toBeVisible();
    }
  });

  test("reset demo removes a debt added after the seed", async ({ page, request }) => {
    await addNinthDebt(request);
    await page.goto("/");
    const main = page.getByRole("main");
    const confirmedRows = main.locator('[data-status="confirmed"]');
    await expect(confirmedRows).toHaveCount(9);
    await expect(main).toContainText("$990");

    await page.getByRole("button", { name: /reset/i }).click();

    await expect(confirmedRows).toHaveCount(8);
    await expect(main).toContainText("$940");
    await expect(main).not.toContainText("$990");
    expect(await listDebts(request)).toHaveLength(8);
  });

  test("the ledger filter Mine shows only the debts of the current trader", async ({ page }) => {
    await page.goto("/");
    await viewAs(page, "soa");
    const rows = page.getByRole("main").locator("[data-status]");
    await expect(rows).toHaveCount(8);

    await page.getByRole("button", { name: "Mine", exact: true }).click();

    // Soa is on 4 of the 8 seed debts.
    await expect(rows).toHaveCount(4);
    for (const row of await rows.all()) await expect(row).toContainText("Soa");

    await page.getByRole("button", { name: "All", exact: true }).click();
    await expect(rows).toHaveCount(8);
  });

  test("the demo guide starts, moves to the next step and closes", async ({ page }) => {
    await page.goto("/");
    const guide = page.getByRole("complementary", { name: "Demo guide" });
    await guide.getByRole("button", { name: "Start", exact: true }).click();
    await expect(guide).toContainText("Step 1 of 5");

    await guide.getByRole("button", { name: "Next", exact: true }).click();
    await expect(guide).toContainText("Step 2 of 5");
    await expect(guide.getByRole("link", { name: "Go to step 2" })).toHaveAttribute("href", "/confirm");

    await guide.getByRole("button", { name: "Close", exact: true }).click();
    await expect(guide).toHaveCount(0);
  });
});

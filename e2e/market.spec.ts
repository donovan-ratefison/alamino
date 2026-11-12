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

    // Reset demo lives in the More menu. It reloads the market.
    await page.getByRole("button", { name: "More", exact: true }).click();
    await page.getByRole("button", { name: "Reset demo", exact: true }).click();

    await expect(confirmedRows).toHaveCount(8);
    await expect(main).toContainText("$940");
    await expect(main).not.toContainText("$990");
    expect(await listDebts(request)).toHaveLength(8);
  });

  test("the clearing house sees the whole market and runs clearing", async ({ page }) => {
    await page.goto("/");
    const main = page.getByRole("main");
    await expect(page.getByLabel(/view as/i)).toHaveValue("house");
    await expect(page.getByRole("heading", { name: "Settle up with the whole market." })).toBeVisible();
    await expect(main).toContainText("Lalao owes Hery");
    await expect(page.getByRole("button", { name: "Run clearing", exact: true })).toBeEnabled();
    await expect(page.getByRole("button", { name: /^Notifications/ })).toHaveCount(0);
  });

  test("as Soa, the market shows only her debts and her own result", async ({ page }) => {
    await page.goto("/");
    await viewAs(page, "soa");
    const main = page.getByRole("main");
    await expect(page.getByRole("heading", { name: "Hello Soa." })).toBeVisible();
    // Soa owes $410 and is owed $240 on the 8 seed debts.
    await expect(main).toContainText("After clearing, you pay $170.");
    await expect(main).toContainText("The clearing house runs the next round.");
    await expect(page.getByRole("button", { name: "Run clearing", exact: true })).toHaveCount(0);

    // Soa is on 4 of the 8 seed debts. A debt between two other traders is not in the network or the ledger.
    const rows = main.locator("[data-status]");
    await expect(rows).toHaveCount(4);
    for (const row of await rows.all()) await expect(row).toContainText("Soa");
    await expect(main).toContainText("Soa owes Hery");
    await expect(main).not.toContainText("Lalao owes Hery");
    await expect(main).not.toContainText("$940");
  });

  test("the demo guide starts, moves to the next step and closes", async ({ page }) => {
    await page.goto("/");
    const guide = page.getByRole("complementary", { name: "Demo guide" });
    await guide.getByRole("button", { name: "Start", exact: true }).click();
    await expect(guide).toContainText("Step 1 of 5");

    await guide.getByRole("button", { name: "Next", exact: true }).click();
    await expect(guide).toContainText("Step 2 of 5");
    await expect(guide.getByRole("link", { name: "Go to step 2" })).toHaveAttribute("href", "/add");

    await guide.getByRole("button", { name: "Close", exact: true }).click();
    await expect(guide).toHaveCount(0);
  });
});

import { expect, test } from "@playwright/test";
import { addNinthDebt, listDebts, resetDemo } from "./helpers";

test.describe("Market view", () => {
  test.beforeEach(async ({ request }) => {
    await resetDemo(request);
  });

  test("shows the 8 seed debts, the $940 total and the five traders", async ({ page }) => {
    await page.goto("/");
    const main = page.getByRole("main");
    await expect(page.getByRole("gridcell", { name: "confirmed", exact: true })).toHaveCount(8);
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
    const confirmedCells = page.getByRole("gridcell", { name: "confirmed", exact: true });
    await expect(confirmedCells).toHaveCount(9);
    await expect(main).toContainText("$990");

    await page.getByRole("button", { name: /reset/i }).click();

    await expect(confirmedCells).toHaveCount(8);
    await expect(main).toContainText("$940");
    await expect(main).not.toContainText("$990");
    expect(await listDebts(request)).toHaveLength(8);
  });
});

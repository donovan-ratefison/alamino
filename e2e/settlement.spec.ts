import { expect, test } from "@playwright/test";
import { latestRound, listDebts, resetDemo, startRound, viewAs } from "./helpers";

test.describe("Settle a round with simulated PayPal", () => {
  test.beforeEach(async ({ request }) => {
    await resetDemo(request);
    await startRound(request);
  });

  test("three pay-ins, then payouts, finish the round", async ({ page, request }) => {
    test.setTimeout(90_000);
    await page.goto("/rounds/latest");
    await viewAs(page, "house");
    const sendPayouts = page.getByRole("button", { name: /payout/i });
    const main = page.getByRole("main");
    await expect(main).toContainText("0 of 3 paid in");
    await expect(main).not.toContainText(/done/i);

    for (const [traderId, amount] of [
      ["soa", "\\$170"],
      ["lalao", "\\$140"],
      ["fidy", "\\$10"],
    ]) {
      await expect(sendPayouts).toHaveCount(0);
      await viewAs(page, traderId);
      // A trader sees a count of the other pay-ins, never the names, and never the payout button.
      if (traderId === "soa") await expect(main).toContainText("2 other traders still to pay");
      await page.getByRole("button", { name: new RegExp(`pay.*${amount}(?!\\d)`, "i") }).click();
      await expect
        .poll(async () => (await latestRound(request)).settlements.find((s) => s.traderId === traderId)?.status)
        .toBe("captured");
    }

    await viewAs(page, "house");
    await expect(main).toContainText("3 of 3 paid in");
    await expect(sendPayouts).toBeVisible();
    await sendPayouts.click();

    await expect.poll(async () => (await latestRound(request)).status, { timeout: 30_000 }).toBe("done");
    const round = await latestRound(request);
    for (const s of round.settlements) expect(["captured", "confirmed"]).toContain(s.status);
    await expect(main).toContainText(/done/i);
    await expect(main).not.toContainText(/\d of 3 paid in/);
    // The first card is the final state. The house sees the counts and a link to Finance.
    await expect(main).toContainText("3 paid in, 2 paid out");
    await expect(main.getByRole("link", { name: "Open Finance" })).toHaveAttribute("href", "/finance");
    // A trader sees their own result and a link to their statement.
    await viewAs(page, "soa");
    await expect(main).toContainText("You paid $170");
    await expect(main.getByRole("heading", { level: 1 })).toHaveText(/^You settled .* with \$170$/);
    await expect(main.getByRole("link", { name: "Read statement" })).toHaveAttribute("href", "/statement");

    const debts = await listDebts(request);
    const count = (status: string) => debts.filter((d) => d.status === status).length;
    expect({ confirmed: count("confirmed"), cleared: count("cleared"), settled: count("settled") }).toEqual({
      confirmed: 0,
      cleared: 3,
      settled: 6,
    });
  });
});

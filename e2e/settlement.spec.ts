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
    const sendPayouts = page.getByRole("button", { name: /payout/i });

    for (const [traderId, amount] of [
      ["soa", "\\$170"],
      ["lalao", "\\$140"],
      ["fidy", "\\$10"],
    ]) {
      await expect(sendPayouts).toHaveCount(0);
      await viewAs(page, traderId);
      await page.getByRole("button", { name: new RegExp(`pay.*${amount}(?!\\d)`, "i") }).click();
      await expect
        .poll(async () => (await latestRound(request)).settlements.find((s) => s.traderId === traderId)?.status)
        .toBe("captured");
    }

    await sendPayouts.click();

    await expect.poll(async () => (await latestRound(request)).status, { timeout: 30_000 }).toBe("done");
    const round = await latestRound(request);
    for (const s of round.settlements) expect(["captured", "confirmed"]).toContain(s.status);
    await expect(page.getByRole("main")).toContainText(/done/i);

    const debts = await listDebts(request);
    const count = (status: string) => debts.filter((d) => d.status === status).length;
    expect({ confirmed: count("confirmed"), cleared: count("cleared"), settled: count("settled") }).toEqual({
      confirmed: 0,
      cleared: 3,
      settled: 6,
    });
  });
});

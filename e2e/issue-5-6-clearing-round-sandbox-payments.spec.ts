import { expect, test, type Page } from "@playwright/test";
import { latestRound, resetDemo, viewAs } from "./helpers";

// Helper to find a specific row in the settlement plan
const settlementRow = (page: Page, traderName: string, amount: string) =>
  page
    .getByRole("listitem")
    .filter({ has: page.getByText(traderName, { exact: true }) })
    .filter({ has: page.getByText(amount, { exact: true }) });

test.describe("Issues #5 & #6: One full clearing round with real sandbox payments", () => {
  test.beforeEach(async ({ request }) => {
    await resetDemo(request);
  });

  test("Complete clearing round with PayPal flow, settlement plan and payouts", async ({ page, request }) => {
    test.setTimeout(120_000);

    // --- STEP 1: Add the 9th debt (Rivo owes Hery $50) ---
    await page.goto("/add");
    await viewAs(page, "rivo");
    await page.getByRole("textbox").fill("I owe Hery 50 for rice");
    await page.getByRole("button", { name: /read/i }).click();
    await expect(page.getByText("1 ready", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: /save 1 debt/i }).click();
    await expect(page.getByText("Saved", { exact: true })).toBeVisible();

    // --- STEP 2: Hery confirms the debt on /confirm ---
    await page.goto("/confirm");
    await viewAs(page, "hery");
    const approveBtn = page.getByRole("button", { name: /approve.*\$50/i });
    await expect(approveBtn).toBeVisible();
    await page.screenshot({ path: "test-results/screenshots/issue-5-confirm-debt.png" });
    await approveBtn.click();
    await expect(page.getByText("Nothing to confirm", { exact: true })).toBeVisible({ timeout: 15_000 });

    // --- STEP 3: Market page shows 9 confirmed debts for $990 ---
    await page.goto("/");
    const main = page.getByRole("main");
    await expect(main).toContainText("$990");
    await page.screenshot({ path: "test-results/screenshots/issue-5-market-990.png", fullPage: true });

    // --- STEP 4: Run Clearing ---
    await page.getByRole("button", { name: /run clearing/i }).click();
    await expect(page).toHaveURL(/\/rounds\/(?!latest)[^/?#]+$/);

    // Verify Issue #5 expectations:
    // $990 gross debt, $570 cancelled in circles, $320 cash moved
    for (const text of ["$990", "$570", "$320"]) {
      await expect(main).toContainText(text);
    }

    // Inspect circles cancelled
    await page.getByText("Circles and payment plan", { exact: true }).click();
    await page.screenshot({ path: "test-results/screenshots/issue-5-round-cleared.png", fullPage: true });

    // --- STEP 5: Verify Settlement Plan (Issue #6, Point 2: balances) ---
    // Expected Pay-ins: Soa $170, Lalao $140, Fidy $10
    // Expected Pay-outs: Hery $290, Rivo $30
    await expect(settlementRow(page, "Soa", "$170")).toBeVisible();
    await expect(settlementRow(page, "Lalao", "$140")).toBeVisible();
    await expect(settlementRow(page, "Fidy", "$10")).toBeVisible();
    await expect(settlementRow(page, "Hery", "$290")).toBeVisible();
    await expect(settlementRow(page, "Rivo", "$30")).toBeVisible();
    await page.screenshot({ path: "test-results/screenshots/issue-6-settlement-plan.png" });

    // --- STEP 6: Execute Pay-ins (Issue #6, Point 1: business funded before payouts) ---
    const sendPayoutsBtn = page.getByRole("button", { name: /send payouts/i });
    // Before all pay-ins are captured, Send payouts cannot be sent
    await expect(sendPayoutsBtn).toHaveCount(0);

    const payIns: [string, RegExp][] = [
      ["soa", /pay.*\$170/i],
      ["lalao", /pay.*\$140/i],
      ["fidy", /pay.*\$10/i],
    ];
    for (const [traderId, amountRegex] of payIns) {
      await viewAs(page, traderId);
      const payBtn = page.getByRole("button", { name: amountRegex });
      await expect(payBtn).toBeVisible();
      await payBtn.click();
      await expect
        .poll(async () => (await latestRound(request)).settlements.find((s) => s.traderId === traderId)?.status)
        .toBe("captured");
    }

    // All pay-ins are now captured
    await page.screenshot({ path: "test-results/screenshots/issue-5-all-payins-captured.png" });

    // --- STEP 7: Send Payouts & Poll to Done (Issue #6, Point 3: polling) ---
    await expect(sendPayoutsBtn).toBeVisible();
    await sendPayoutsBtn.click();

    // Polling verifies transition from paying to done
    await expect.poll(async () => (await latestRound(request)).status, { timeout: 30_000 }).toBe("done");
    await expect(main).toContainText(/done/i);
    await page.screenshot({ path: "test-results/screenshots/issue-5-round-done.png", fullPage: true });

    // Verify all settlements are completed
    const finishedRound = await latestRound(request);
    for (const s of finishedRound.settlements) {
      expect(["captured", "confirmed"]).toContain(s.status);
    }

    // --- STEP 8: Personal Statements ---
    await page.goto("/statement");
    await viewAs(page, "hery");
    await expect(main).toContainText("You receive $290");
    await page.screenshot({ path: "test-results/screenshots/issue-5-statement-hery.png" });

    await viewAs(page, "soa");
    await expect(main).toContainText(/You pay (in )?\$170/);
    await page.screenshot({ path: "test-results/screenshots/issue-5-statement-soa.png" });
  });
});

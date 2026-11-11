import { expect, test, type Page } from "@playwright/test";
import { addNinthDebt, latestRound, listTraders, resetDemo, startRound } from "./helpers";

// One row of the settlement plan: the trader name and the amount, each as its own text.
const planRow = (page: Page, name: string, amount: string) =>
  page
    .getByRole("listitem")
    .filter({ has: page.getByText(name, { exact: true }) })
    .filter({ has: page.getByText(amount, { exact: true }) });

test.describe("Clearing round", () => {
  test.beforeEach(async ({ request }) => {
    await resetDemo(request);
  });

  test("Run clearing settles $990 of debt with $320", async ({ page, request }) => {
    await addNinthDebt(request);
    await page.goto("/");
    await page.getByRole("button", { name: /run clearing/i }).click();

    await expect(page).toHaveURL(/\/rounds\/(?!latest)[^/?#]+$/);
    const round = await latestRound(request);
    expect(page.url()).toMatch(new RegExp(`/rounds/${round.id}$`));

    const main = page.getByRole("main");
    // Nobody has paid yet: the title does not say "settled".
    await expect(main.getByRole("heading", { level: 1 })).toHaveText(/\$990 of debt to settle with \$320/);
    for (const text of ["$990", "$570", "$320", "67.7%"]) await expect(main).toContainText(text);

    // One network with a Before / After toggle. The replay plays once by itself, then rests on After.
    const before = main.getByRole("button", { name: "Before", exact: true });
    const after = main.getByRole("button", { name: "After", exact: true });
    await expect(after).toHaveAttribute("aria-pressed", "true", { timeout: 20_000 });
    await expect(main.getByLabel("Debts after circles cancel")).toBeVisible();
    await expect(main.getByText("Cancelled, no money moved", { exact: true }).locator("..")).toContainText("$570");
    await before.click();
    await expect(before).toHaveAttribute("aria-pressed", "true");
    await expect(after).toHaveAttribute("aria-pressed", "false");
    await expect(main.getByLabel("Debts before the round")).toBeVisible();

    // The circles and the settlement plan are behind one disclosure.
    await page.getByText(/see what cancelled/i).click();

    // Three circles cancel. Each one is listed with its traders in order and its amount.
    expect(round.result.cancellations).toHaveLength(3);
    const traders = await listTraders(request);
    const name = (id: string) => traders.find((t) => t.id === id)!.name;
    for (const c of round.result.cancellations) {
      const pattern = `${c.path.map(name).join(".*")}.*\\$${c.amountCents / 100}\\b`;
      await expect(page.getByRole("button", { name: new RegExp(pattern) })).toBeVisible();
    }

    for (const [trader, amount] of [
      ["Soa", "$170"],
      ["Lalao", "$140"],
      ["Fidy", "$10"],
      ["Hery", "$290"],
      ["Rivo", "$30"],
    ]) {
      await expect(planRow(page, trader, amount)).toBeVisible();
    }

    const plan = (direction: string) =>
      round.settlements
        .filter((s) => s.direction === direction)
        .map((s) => [s.traderId, s.amountCents])
        .sort();
    expect(plan("pay_in")).toEqual([
      ["fidy", 1000],
      ["lalao", 14000],
      ["soa", 17000],
    ]);
    expect(plan("pay_out")).toEqual([
      ["hery", 29000],
      ["rivo", 3000],
    ]);
  });

  test("the market offers to continue an open round, not to run a new one", async ({ page, request }) => {
    const round = await startRound(request);
    await page.goto("/");

    await expect(page.getByRole("link", { name: /continue/i })).toHaveAttribute("href", `/rounds/${round.id}`);
    await expect(page.getByRole("button", { name: /run clearing/i })).toHaveCount(0);
  });
});

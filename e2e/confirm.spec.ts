import { expect, test, type APIRequestContext } from "@playwright/test";
import type { Debt } from "../src/lib/types";
import { api, listDebts, proposeNinthDebt, resetDemo, viewAs } from "./helpers";

const debtById = async (request: APIRequestContext, id: string) => (await listDebts(request)).find((d) => d.id === id);

test.describe("Confirm a debt", () => {
  let debt: Debt;

  test.beforeEach(async ({ request }) => {
    await resetDemo(request);
    debt = await proposeNinthDebt(request);
  });

  test("Hery approves the debt that Rivo added", async ({ page, request }) => {
    await page.goto("/confirm");
    await viewAs(page, "hery");

    // The header link to Confirm shows a count while a debt waits for the current trader.
    const confirmLink = page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: /confirm/i });
    await expect(confirmLink).toHaveAccessibleName(/1/);

    const waitingForYou = page.locator("section").filter({ has: page.getByRole("heading", { name: /waiting for you/i }) });
    await waitingForYou.getByRole("button", { name: /approve/i }).click();

    await expect.poll(async () => (await debtById(request, debt.id))?.status).toBe("confirmed");
    await expect(confirmLink).not.toHaveAccessibleName(/\d/);
  });

  test("Hery gives a different amount, then Rivo accepts it", async ({ page, request }) => {
    await page.goto("/confirm");
    await viewAs(page, "hery");

    await page.getByRole("button", { name: /different amount/i }).click();
    await page.getByLabel(/amount/i).fill("60");
    await page.getByRole("button", { name: /send/i }).click();

    await expect
      .poll(async () => {
        const d = await debtById(request, debt.id);
        return { status: d?.status, counterAmountCents: d?.counterAmountCents };
      })
      .toEqual({ status: "disputed", counterAmountCents: 6000 });

    await viewAs(page, "rivo");
    await page.getByRole("button", { name: /accept.*\$60(?!\d)/i }).click();

    await expect
      .poll(async () => {
        const d = await debtById(request, debt.id);
        return { status: d?.status, amountCents: d?.amountCents };
      })
      .toEqual({ status: "confirmed", amountCents: 6000 });
  });

  test("Ask the AI shows a suggestion on a disputed debt", async ({ page, request }) => {
    await api(request, `/api/debts/${debt.id}/confirm`, { traderId: "hery", ok: false, counterAmountCents: 6000 });
    await page.goto("/confirm");
    await viewAs(page, "hery");

    const [response] = await Promise.all([
      page.waitForResponse((r) => r.url().endsWith(`/api/debts/${debt.id}/resolve`)),
      page.getByRole("button", { name: /ask the ai/i }).click(),
    ]);
    const { suggestion } = (await response.json()) as { suggestion: string };
    expect(suggestion.trim()).not.toBe("");
    await expect(page.getByText(suggestion)).toBeVisible();
  });
});

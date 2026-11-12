import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import type { Debt } from "../src/lib/types";
import { api, listDebts, proposeNinthDebt, resetDemo, viewAs } from "./helpers";

const debtById = async (request: APIRequestContext, id: string) => (await listDebts(request)).find((d) => d.id === id);

// The header link to Confirm carries the count of debts waiting for the current
// trader. The nav that holds it depends on the width: Main on a laptop, Phone on a phone.
const confirmLink = (page: Page) =>
  (page.viewportSize()?.width ?? 1280) < 640
    ? page.getByRole("navigation", { name: "Phone" }).getByRole("link", { name: /confirm/i })
    : page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: /confirm/i });

test.describe("Confirm a debt", () => {
  let debt: Debt;

  test.beforeEach(async ({ request }) => {
    await resetDemo(request);
    debt = await proposeNinthDebt(request);
  });

  test("the clearing house does not confirm debts", async ({ page }) => {
    await page.goto("/confirm");
    await viewAs(page, "house");
    await expect(page.getByRole("main")).toContainText("The clearing house does not add or confirm debts. Choose a trader in View as.");
    await expect(page.getByRole("button", { name: /approve/i })).toHaveCount(0);
  });

  test("Hery approves the debt that Rivo added", async ({ page, request }) => {
    await page.goto("/confirm");
    await viewAs(page, "hery");

    // The header link to Confirm shows a count while a debt waits for the current trader.
    await expect(confirmLink(page)).toHaveAccessibleName(/1/);

    const waitingForYou = page.locator("section").filter({ has: page.getByRole("heading", { name: /waiting for you/i }) });
    await expect(waitingForYou.getByText("Rivo approved", { exact: true })).toBeVisible();
    // The debt reads from Hery's side. The amount stands on its own.
    await expect(waitingForYou.getByText("Rivo owes you", { exact: true })).toBeVisible();
    await expect(waitingForYou.getByText("$50", { exact: true })).toBeVisible();
    await waitingForYou.getByRole("button", { name: /approve/i }).click();

    await expect.poll(async () => (await debtById(request, debt.id))?.status).toBe("confirmed");
    await expect(confirmLink(page)).not.toHaveAccessibleName(/\d/);
  });

  test("Hery approves Rivo's debt from the bell", async ({ page, request }) => {
    await page.goto("/");
    await viewAs(page, "hery");

    const bell = page.getByRole("button", { name: /notifications/i });
    await expect(bell).toHaveAccessibleName("Notifications, 1 waiting");
    await bell.click();
    await expect(bell).toHaveAttribute("aria-expanded", "true");

    const panel = page.getByRole("dialog", { name: /waiting for you/i });
    await expect(panel).toContainText(/Rivo says: Rivo owes you \$50, rice/);
    await panel.getByRole("button", { name: /approve/i }).click();

    await expect(panel.getByRole("status")).toHaveText("Confirmed.");
    await expect.poll(async () => (await debtById(request, debt.id))?.status).toBe("confirmed");
    await expect(bell).toHaveAccessibleName("Notifications");
    await expect(panel).toContainText(/nothing waits for you/i);

    await page.keyboard.press("Escape");
    await expect(panel).toHaveCount(0);
  });

  test("Hery changes the amount, then Rivo accepts it", async ({ page, request }) => {
    await page.goto("/confirm");
    await viewAs(page, "hery");

    await page.getByRole("button", { name: "Change amount", exact: true }).click();
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

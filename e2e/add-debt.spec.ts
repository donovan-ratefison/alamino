import { expect, test } from "@playwright/test";
import { listDebts, resetDemo, viewAs } from "./helpers";

test.describe("Add a debt by text", () => {
  test.beforeEach(async ({ request, page }) => {
    await resetDemo(request);
    await page.goto("/add");
    await viewAs(page, "rivo");
  });

  test("Rivo adds 'I owe Hery 50 for rice' and the debt waits for Hery", async ({ page, request }) => {
    await page.getByRole("textbox").fill("I owe Hery 50 for rice");
    await page.getByRole("button", { name: /read/i }).click();

    await expect(page.getByLabel(/debtor/i)).toHaveValue("rivo");
    await expect(page.getByLabel(/creditor/i)).toHaveValue("hery");
    await expect(page.getByLabel(/amount/i)).toHaveValue("50");

    await page.getByRole("button", { name: /save/i }).click();

    await expect
      .poll(async () =>
        (await listDebts(request))
          .filter((d) => d.status === "proposed")
          .map(({ debtorId, creditorId, amountCents, debtorOk, creditorOk }) => ({ debtorId, creditorId, amountCents, debtorOk, creditorOk })),
      )
      .toEqual([{ debtorId: "rivo", creditorId: "hery", amountCents: 5000, debtorOk: true, creditorOk: false }]);
  });

  test("a draft with an unknown name cannot be saved until a creditor is chosen", async ({ page, request }) => {
    await page.getByRole("textbox").fill("I owe Zaza 50");
    await page.getByRole("button", { name: /read/i }).click();

    const creditor = page.getByLabel(/creditor/i);
    const save = page.getByRole("button", { name: /save/i });
    await expect(creditor).toHaveValue("");
    await expect(save).toBeDisabled();

    await creditor.selectOption("hery");
    await expect(save).toBeEnabled();
    expect((await listDebts(request)).filter((d) => d.status === "proposed")).toHaveLength(0);
  });
});

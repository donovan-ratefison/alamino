import { expect, test } from "@playwright/test";
import { listDebts, resetDemo, viewAs } from "./helpers";

// A 1 x 1 PNG: enough for the photo path. Without an AI key the fallback cannot read it.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");

test.describe("Add a debt", () => {
  test.beforeEach(async ({ request, page }) => {
    await resetDemo(request);
    await page.goto("/add");
    await viewAs(page, "rivo");
  });

  test("Rivo adds 'I owe Hery 50 for rice' and the debt waits for Hery", async ({ page, request }) => {
    await page.getByRole("textbox").fill("I owe Hery 50 for rice");
    await page.getByRole("button", { name: /read/i }).click();

    await expect(page.getByText("You owe Hery", { exact: true })).toBeVisible();
    await expect(page.getByText("$50", { exact: true })).toBeVisible();
    await expect(page.getByText("1 ready", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: /edit/i }).click();
    await expect(page.getByLabel(/debtor/i)).toHaveValue("rivo");
    await expect(page.getByLabel(/creditor/i)).toHaveValue("hery");
    await expect(page.getByLabel(/amount/i)).toHaveValue("50");

    await page.getByRole("button", { name: /save 1 debt/i }).click();
    await expect(page.getByText("Saved", { exact: true })).toBeVisible();

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
    await expect(page.getByText(/who is "zaza"/i)).toBeVisible();
    await expect(creditor).toHaveValue("");
    await expect(save).toBeDisabled();

    await creditor.selectOption("hery");
    await expect(save).toBeEnabled();
    expect((await listDebts(request)).filter((d) => d.status === "proposed")).toHaveLength(0);
  });

  test("a photo without an AI key gives a draft that needs an answer", async ({ page, request }) => {
    await page.getByLabel("Choose a photo").setInputFiles({ name: "page.png", mimeType: "image/png", buffer: PNG });

    await expect(page.getByRole("img", { name: /notebook page/i })).toBeVisible();
    await expect(page.getByText(/read without ai/i)).toBeVisible();
    await expect(page.getByText(/needs an ai key/i)).toBeVisible();
    await expect(page.getByText("0 ready, 1 needs an answer", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /save/i })).toBeDisabled();
    expect((await listDebts(request)).filter((d) => d.status === "proposed")).toHaveLength(0);
  });
});

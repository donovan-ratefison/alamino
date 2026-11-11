import { expect, test } from "@playwright/test";
import path from "node:path";
import fs from "node:fs";
import type { DebtDraft } from "../src/lib/types";
import { listDebts, resetDemo, viewAs } from "./helpers";

const PHOTO_DIR = fs.existsSync("docs/test-photos") ? "docs/test-photos" : "test-photos";
const PHOTO_1 = path.resolve(process.cwd(), `${PHOTO_DIR}/photo-1-rivo-hery-50.jpg`);
const PHOTO_2 = path.resolve(process.cwd(), `${PHOTO_DIR}/photo-2-liste-4-dettes.jpg`);

test.describe("Issue #7: Test photo capture with handwritten notebook pages", () => {
  test.beforeEach(async ({ request }) => {
    await resetDemo(request);
  });

  test("Upload real notebook photo and verify preview and fallback without AI key", async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto("/add");
    await viewAs(page, "rivo");

    expect(fs.existsSync(PHOTO_1)).toBe(true);
    await page.getByLabel("Choose a photo").setInputFiles(PHOTO_1);

    // Verify notebook photo preview renders on page
    await expect(page.getByRole("img", { name: /notebook page/i })).toBeVisible();

    // In test environment without API keys, fallback capture explains that an AI key is needed
    await expect(page.getByText(/read without ai/i).first()).toBeVisible();
    await page.screenshot({ path: "test-results/screenshots/issue-7-photo-fallback.png", fullPage: true });
  });

  test("Upload handwritten photo with AI extraction and save to ledger", async ({ page, request }) => {
    test.setTimeout(90_000);

    // Mock the capture API contract to verify draft review and saving.
    // OCR accuracy itself requires a separate run with a configured model.
    await page.route("**/api/capture", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          engine: "model",
          drafts: [
            {
              debtorId: "rivo",
              creditorId: "hery",
              debtorText: "Rivo",
              creditorText: "Hery",
              counterpartyId: "hery",
              counterpartyText: "Hery",
              direction: "you_owe",
              amountCents: 5000,
              note: "rice for wholesale",
              confidence: "high",
            } satisfies DebtDraft,
          ],
        }),
      });
    });

    await page.goto("/add");
    await viewAs(page, "rivo");

    expect(fs.existsSync(PHOTO_1)).toBe(true);
    await page.getByLabel("Choose a photo").setInputFiles(PHOTO_1);

    // Draft card should display parsed fields
    await expect(page.getByText("You owe Hery", { exact: true })).toBeVisible();
    await expect(page.getByText("$50", { exact: true })).toBeVisible();
    await expect(page.getByText("1 ready", { exact: true })).toBeVisible();

    // Visual screenshot of AI extracted draft card
    await page.screenshot({ path: "test-results/screenshots/issue-7-ai-extracted-single.png", fullPage: true });

    // Save the debt
    await page.getByRole("button", { name: /save 1 debt/i }).click();
    await expect(page.getByText("Saved", { exact: true })).toBeVisible();

    // Verify in SQLite database that debt was saved as proposed
    await expect
      .poll(async () =>
        (await listDebts(request))
          .filter((d) => d.status === "proposed")
          .map(({ debtorId, creditorId, amountCents, source }) => ({ debtorId, creditorId, amountCents, source })),
      )
      .toEqual([{ debtorId: "rivo", creditorId: "hery", amountCents: 5000, source: "photo" }]);
  });

  test("Upload handwritten photo with 4 debts and save all", async ({ page, request }) => {
    test.setTimeout(90_000);

    // Mock multi-debt extraction from photo-2
    await page.route("**/api/capture", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          engine: "model",
          drafts: [
            { debtorId: "rivo", creditorId: "hery", debtorText: "Rivo", creditorText: "Hery", counterpartyId: "hery", counterpartyText: "Hery", direction: "you_owe", amountCents: 5000, note: "rice", confidence: "high" },
            { debtorId: "rivo", creditorId: "lalao", debtorText: "Rivo", creditorText: "Lalao", counterpartyId: "lalao", counterpartyText: "Lalao", direction: "you_owe", amountCents: 7000, note: "legumes", confidence: "high" },
            { debtorId: "soa", creditorId: "rivo", debtorText: "Soa", creditorText: "Rivo", counterpartyId: "soa", counterpartyText: "Soa", direction: "owed_to_you", amountCents: 11000, note: "viande", confidence: "high" },
            { debtorId: "fidy", creditorId: "rivo", debtorText: "Fidy", creditorText: "Rivo", counterpartyId: "fidy", counterpartyText: "Fidy", direction: "owed_to_you", amountCents: 4000, note: "livraison", confidence: "high" },
          ] satisfies DebtDraft[],
        }),
      });
    });

    await page.goto("/add");
    await viewAs(page, "rivo");

    expect(fs.existsSync(PHOTO_2)).toBe(true);
    await page.getByLabel("Choose a photo").setInputFiles(PHOTO_2);
    await expect(page.getByText("4 ready", { exact: true })).toBeVisible();

    // Visual screenshot of 4 drafts ready
    await page.screenshot({ path: "test-results/screenshots/issue-7-multi-debt-drafts.png", fullPage: true });

    await page.getByRole("button", { name: /save 4 debts/i }).click();
    await expect(page.getByText(/all debts are saved/i)).toBeVisible();

    // Verify all 4 debts were saved in the database
    await expect
      .poll(async () => (await listDebts(request)).filter((d) => d.status === "proposed"))
      .toHaveLength(4);
  });
});

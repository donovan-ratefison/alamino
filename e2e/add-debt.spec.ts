import { expect, test } from "@playwright/test";
import { listDebts, listTraders, resetDemo, viewAs } from "./helpers";

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

    const draft = page.getByRole("group", { name: "Draft 1", exact: true });
    await draft.getByRole("button", { name: /edit/i }).click();
    await expect(draft.getByLabel("Other trader")).toHaveValue("hery");
    await expect(draft.getByRole("radio", { name: "You owe", exact: true })).toBeChecked();
    await expect(draft.getByRole("radio", { name: "Owes you", exact: true })).not.toBeChecked();
    await expect(draft.getByLabel(/amount/i)).toHaveValue("50");

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

  test("a draft with an unknown name cannot be saved until the other trader is chosen", async ({ page, request }) => {
    await page.getByRole("textbox").fill("I owe Zaza 50");
    await page.getByRole("button", { name: /read/i }).click();

    const draft = page.getByRole("group", { name: "Draft 1", exact: true });
    const save = page.getByRole("button", { name: /save/i });
    await expect(draft.getByText('Who is "Zaza"?', { exact: true })).toBeVisible();
    await expect(page.getByText('You owe "Zaza"', { exact: true })).toBeVisible();
    await expect(save).toBeDisabled();
    // The current trader is never the other side.
    await expect(draft.getByRole("button", { name: "Hery", exact: true })).toBeVisible();
    await expect(draft.getByRole("button", { name: "Rivo", exact: true })).toHaveCount(0);

    await draft.getByRole("button", { name: "Hery", exact: true }).click();
    await expect(page.getByText("You owe Hery", { exact: true })).toBeVisible();
    await expect(save).toBeEnabled();
    expect((await listDebts(request)).filter((d) => d.status === "proposed")).toHaveLength(0);
  });

  test("'Not in this market' discards the line", async ({ page }) => {
    await page.getByRole("textbox").fill("I owe Zaza 50");
    await page.getByRole("button", { name: /read/i }).click();

    await page.getByRole("group", { name: "Draft 1", exact: true }).getByRole("button", { name: "Not in this market" }).click();
    await expect(page.getByRole("group", { name: "Draft 1", exact: true })).toHaveCount(0);
    await expect(page.getByText(/no debt to check/i)).toBeVisible();
  });

  test("a remembered nickname matches the trader on the next reading", async ({ page, request }) => {
    // beforeEach resets the demo: "Zaza" is not an alias yet. Hery reads, so Rivo can be the other side.
    await viewAs(page, "hery");
    await page.getByRole("textbox").fill("I owe Zaza 50");
    await page.getByRole("button", { name: /read/i }).click();

    const draft = page.getByRole("group", { name: "Draft 1", exact: true });
    await draft.getByRole("button", { name: "Rivo", exact: true }).click();
    await draft.getByRole("button", { name: 'Remember "Zaza" as Rivo', exact: true }).click();
    await expect(draft.getByText("Remembered", { exact: true })).toBeVisible();
    expect((await listTraders(request)).find((t) => t.id === "rivo")?.aliases).toContain("Zaza");

    await page.getByRole("button", { name: "Read another page" }).click();
    await page.getByRole("textbox").fill("I owe Zaza 20");
    await page.getByRole("button", { name: /read/i }).click();
    await expect(page.getByText("You owe Rivo", { exact: true })).toBeVisible();
    await expect(page.getByText("$20", { exact: true })).toBeVisible();
    await expect(page.getByText("1 ready", { exact: true })).toBeVisible();
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

  test("a line added by hand is saved with the drafts", async ({ page, request }) => {
    await page.getByRole("textbox").fill("I owe Hery 50 for rice");
    await page.getByRole("button", { name: /read/i }).click();
    await expect(page.getByText("1 ready", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Add a line" }).click();
    const line = page.getByRole("group", { name: "Draft 2", exact: true });
    await expect(line.getByLabel("Other trader")).toBeFocused();
    await expect(line.getByText("Fill this line.", { exact: true })).toBeVisible();
    await expect(page.getByText("1 ready, 1 needs an answer", { exact: true })).toBeVisible();

    await line.getByRole("radio", { name: "Owes you", exact: true }).check();
    await line.getByLabel("Other trader").selectOption("soa");
    await line.getByLabel(/amount/i).fill("35");
    await line.getByLabel("Note", { exact: true }).fill("meat");
    await expect(line.getByText("Soa owes you", { exact: true })).toBeVisible();
    await expect(page.getByText("2 ready", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: /save 2 debts/i }).click();
    await expect(page.getByText(/all debts are saved/i)).toBeVisible();

    await expect
      .poll(async () =>
        (await listDebts(request))
          .filter((d) => d.status === "proposed")
          .map(({ debtorId, creditorId, amountCents, debtorOk, creditorOk }) => ({ debtorId, creditorId, amountCents, debtorOk, creditorOk }))
          .sort((a, b) => b.amountCents - a.amountCents),
      )
      .toEqual([
        { debtorId: "rivo", creditorId: "hery", amountCents: 5000, debtorOk: true, creditorOk: false },
        { debtorId: "soa", creditorId: "rivo", amountCents: 3500, debtorOk: false, creditorOk: true },
      ]);
    const added = (await listDebts(request)).find((d) => d.status === "proposed" && d.debtorId === "soa");
    expect(added).toMatchObject({ note: "meat", source: "text" });
  });

  test("another trader in View as clears the drafts", async ({ page }) => {
    await page.getByRole("textbox").fill("I owe Hery 50 for rice");
    await page.getByRole("button", { name: /read/i }).click();
    await expect(page.getByText("You owe Hery", { exact: true })).toBeVisible();

    await viewAs(page, "hery");
    await expect(page.getByText("Trader changed. Read the page again.", { exact: true })).toBeVisible();
    await expect(page.getByText("You owe Hery", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("group", { name: "Draft 1", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Read the sentence" })).toBeEnabled();
  });
});

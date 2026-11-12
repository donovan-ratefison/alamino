import { expect, test } from "@playwright/test";
import { finishRound, resetDemo } from "./helpers";

test.describe("AI Finance Dashboard", () => {
  test.beforeEach(async ({ request }) => {
    await resetDemo(request);
  });

  test("loads the financial workspace and shows empty state when no round is settled", async ({ page }) => {
    await page.goto("/finance");

    // Header
    await expect(page.getByRole("heading", { level: 1 })).toContainText("AI Finance");
    await expect(page.getByText("Money in and out of the Alamino clearing account.")).toBeVisible();

    // Default source is ledger, which has no payments yet
    await expect(page.getByText("No payment yet.")).toBeVisible();
    await expect(page.getByRole("link", { name: "Go to the market page" })).toBeVisible();

    // Settings toggle
    const settingsButton = page.getByRole("button", { name: "Settings" });
    await expect(settingsButton).toBeVisible();
  });

  test("toggles settings panel and opens the operator sign-in dialog", async ({ page }) => {
    await page.goto("/finance");

    const settingsButton = page.getByRole("button", { name: "Settings" });
    await settingsButton.click();

    const settingsSection = page.locator("#finance-settings");
    await expect(settingsSection).toBeVisible();

    // Data source select
    const sourceSelect = settingsSection.getByLabel(/data source/i);
    await expect(sourceSelect).toBeVisible();
    await expect(sourceSelect).toHaveValue("ledger");

    // Operator sign in
    const signInButton = settingsSection.getByRole("button", { name: "Operator sign-in" });
    await expect(signInButton).toBeVisible();
    await signInButton.click();

    // Sign-in dialog
    const dialog = page.getByRole("dialog", { name: "Sign in as the clearing house operator" });
    await expect(dialog.getByLabel("Operator password")).toBeVisible();
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toBeHidden();
  });

  test("switches to demo source to display demonstration fixtures and KPIs", async ({ page }) => {
    await page.goto("/finance");

    // Open settings and switch to demo
    await page.getByRole("button", { name: "Settings" }).click();
    const sourceSelect = page.locator("#finance-settings").getByLabel(/data source/i);
    await sourceSelect.selectOption("demo");

    // Financial KPI stats
    await expect(page.getByText("Received", { exact: true })).toBeVisible();
    await expect(page.getByText("Paid out", { exact: true })).toBeVisible();
    await expect(page.getByText("Refunded", { exact: true })).toBeVisible();
    await expect(page.getByText("Pending / failed", { exact: true })).toBeVisible();
  });

  test("displays clearing payments when a round is completed", async ({ page, request }) => {
    await finishRound(request);

    await page.goto("/finance");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("AI Finance");
    // After finishRound, the ledger has settlements recorded
    await expect(page.getByText("Received", { exact: true })).toBeVisible();
    await expect(page.getByText("Paid out", { exact: true })).toBeVisible();
  });

  test("navigates between Market and AI Finance from the header navigation", async ({ page }) => {
    test.skip(
      (page.viewportSize()?.width ?? 1280) < 640,
      "on a phone the header nav is hidden: the bottom bar and the More menu take over",
    );
    await page.goto("/");
    const nav = page.getByRole("navigation", { name: "Main" });
    await nav.getByRole("link", { name: "AI Finance" }).click();

    await expect(page).toHaveURL(/\/finance$/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("AI Finance");

    // Navigate back to Market
    await nav.getByRole("link", { name: "Market" }).click();
    await expect(page).toHaveURL(/\/$/);
  });
});

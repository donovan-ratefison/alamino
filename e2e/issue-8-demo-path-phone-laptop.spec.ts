import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import type { Round } from "../src/lib/types";
import { api, latestRound, proposeNinthDebt, resetDemo, viewAs } from "./helpers";

// Issue #8: walk every screen of the demo path (Market, Add, Confirm, Round,
// Statement) on a phone and on a laptop, and check that no UI sits in the wrong
// place. Every step takes a screenshot, so the walk can be replayed visually in
// Playwright UI mode: `npm run test:e2e:issues:ui`.
// Done when: every screen that looks broken or confusing is listed, most important first.

const SHOTS = "test-results/screenshots/issue-8";

const shot = (page: Page, name: string) => page.screenshot({ path: `${SHOTS}/${name}.png` });

// One row of the settlement plan: the trader name and the amount, each as its own text.
const planRow = (page: Page, trader: string, amount: string) =>
  page
    .getByRole("listitem")
    .filter({ has: page.getByText(trader, { exact: true }) })
    .filter({ has: page.getByText(amount, { exact: true }) });

// The section of /confirm that holds the debts waiting for the current trader.
const waitingForYou = (page: Page) =>
  page.locator("section").filter({ has: page.getByRole("heading", { name: /waiting for you/i }) });

// ---------------------------------------------------------------------------
// The layout audit. A screen sits right when the page never scrolls sideways,
// when every control stays inside the window, and when each control is big
// enough to tap. The checks are soft: the walk continues and every finding is
// listed at the end, which is exactly the comment issue #8 asks for.
// ---------------------------------------------------------------------------

async function auditLayout(page: Page, screen: string) {
  const findings = await page.evaluate((): string[] => {
    const issues: string[] = [];
    const width = window.innerWidth;

    const name = (el: Element) =>
      (el.getAttribute("aria-label") ?? el.textContent ?? el.tagName.toLowerCase())
        .trim()
        .replace(/\s+/g, " ")
        .slice(0, 48);

    // True when an ancestor scrolls or clips horizontally on purpose: inside the
    // market table, the header nav or a virtualised grid, what hangs off the edge
    // is the container's own scroll, not a misplaced UI.
    const clipped = (el: Element) => {
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
        const overflow = getComputedStyle(p).overflowX;
        if (overflow === "auto" || overflow === "scroll" || overflow === "hidden") return true;
      }
      return false;
    };

    for (const el of document.querySelectorAll<HTMLElement>('a[href], button, select, input, textarea, [role="button"]')) {
      const r = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      if (r.width === 0 || r.height === 0 || style.visibility === "hidden" || style.display === "none") continue;
      // Screen-reader-only inputs (custom radios) have no real box to judge.
      if (r.width <= 1 && r.height <= 1) continue;
      if (!clipped(el) && (r.left < -1 || r.right > width + 1))
        issues.push(`"${name(el)}" sticks out of the window (x ${Math.round(r.left)}→${Math.round(r.right)} of ${width}px)`);

      // WCAG 2.2 AA, target size minimum: 24x24 CSS pixels. Text-only links keep
      // the inline exception (their height is the line height), and native radio
      // inputs keep the browser's own size.
      const isTextLink = el.tagName === "A" && !el.querySelector("svg, img");
      if (!clipped(el) && !isTextLink && (r.width < 24 || r.height < 24))
        issues.push(`"${name(el)}" is a small tap target (${Math.round(r.width)}x${Math.round(r.height)}px)`);
    }
    return issues;
  });
  expect.soft(findings, `${screen}: UI outside the window or too small`).toEqual([]);
}

// ---------------------------------------------------------------------------
// Walk 1 — the full demo path, with one screenshot per step. This is the walk
// of issue #8, played as a user plays it, twice: on a phone and on a laptop.
// ---------------------------------------------------------------------------

async function walkDemoPath(page: Page, request: APIRequestContext, phone: boolean) {
  const device = phone ? "phone" : "laptop";
  const take = (page: Page, name: string) => shot(page, `${device}-${name}`);
  // Market: the clearing house sees the eight seed debts.
  await test.step("Market — first look as the clearing house", async () => {
    await page.goto("/");
    await expect(page.getByRole("main").locator("[data-status]").first()).toBeVisible();
    await expect(page.getByRole("main")).toContainText("$940");
    await take(page, "01-market-first-look");
    await auditLayout(page, "01 Market first look");
  });

  // Add: Rivo types the sentence, checks the draft, saves it.
  await test.step("Add — Rivo reads “I owe Hery 50 for rice”", async () => {
    await page.goto("/add");
    await viewAs(page, "rivo");
    if (phone) {
      // On a phone the camera comes first; the sentence field opens on demand.
      await expect(page.getByText("Photograph your notebook")).toBeVisible();
      await take(page, "02-add-camera-first");
      await auditLayout(page, "02 Add camera first");
      await page.getByRole("button", { name: "Type a sentence" }).click();
    }
    await page.getByRole("textbox").fill("I owe Hery 50 for rice");
    await page.getByRole("button", { name: /read/i }).click();
    await expect(page.getByText("You owe Hery", { exact: true })).toBeVisible();
    await expect(page.getByText("1 ready", { exact: true })).toBeVisible();
    await take(page, "03-add-draft");
    await auditLayout(page, "03 Add draft");
    await page.getByRole("button", { name: /save 1 debt/i }).click();
    await expect(page.getByText("Saved", { exact: true })).toBeVisible();
    await take(page, "04-add-saved");
  });

  // Confirm: Hery approves the debt that waits for her.
  await test.step("Confirm — Hery approves the debt", async () => {
    await page.goto("/confirm");
    await viewAs(page, "hery");
    await expect(waitingForYou(page).getByText("Rivo approved", { exact: true })).toBeVisible();
    await expect(waitingForYou(page).getByText("Rivo owes you", { exact: true })).toBeVisible();
    await take(page, "05-confirm-waiting");
    await auditLayout(page, "05 Confirm waiting");
    await waitingForYou(page).getByRole("button", { name: /approve/i }).click();
    await expect(page.getByText("Nothing to confirm", { exact: true })).toBeVisible({ timeout: 15_000 });
    await take(page, "06-confirm-approved");
  });

  // Market: nine confirmed debts, the house runs clearing.
  await test.step("Market — nine debts, run clearing", async () => {
    await page.goto("/");
    await viewAs(page, "house");
    await expect(page.getByRole("main")).toContainText("$990");
    await take(page, "07-market-nine-debts");
    await auditLayout(page, "07 Market nine debts");
    await page.getByRole("button", { name: "Run clearing", exact: true }).click();
    await expect(page).toHaveURL(/\/rounds\/(?!latest)[^/?#]+$/);
  });

  // Round: the circles cancel, the settlement plan is on the screen.
  await test.step("Round — circles cancel, the plan is set", async () => {
    const main = page.getByRole("main");
    for (const text of ["$990", "$570", "$320"]) await expect(main).toContainText(text);
    // The replay plays once by itself, then rests on After. It starts a moment after
    // the page opens: wait for it to run and to finish before the next steps.
    await expect(main.getByRole("button", { name: "After", exact: true })).toBeDisabled({ timeout: 10_000 });
    await expect(main.getByRole("button", { name: "After", exact: true })).toBeEnabled({ timeout: 30_000 });
    await expect(main.getByRole("button", { name: "After", exact: true })).toHaveAttribute("aria-pressed", "true");
    await take(page, "08-round-replay");
    await page.getByText("Circles and payment plan", { exact: true }).click();
    for (const [trader, amount] of [["Soa", "$170"], ["Lalao", "$140"], ["Fidy", "$10"], ["Hery", "$290"], ["Rivo", "$30"]]) {
      await expect(planRow(page, trader, amount)).toBeVisible();
    }
    await take(page, "09-round-plan");
    await auditLayout(page, "09 Round plan");
  });

  // Round: each trader who owes pays in. PayPal is simulated, so one click pays.
  for (const [id, amount] of [["soa", "$170"], ["lalao", "$140"], ["fidy", "$10"]] as const) {
    await test.step(`Round — ${id} pays ${amount}`, async () => {
      await viewAs(page, id);
      await page.getByRole("button", { name: new RegExp(`Pay \\${amount} \\(simulated\\)`) }).click();
      await expect
        .poll(async () => (await latestRound(request)).settlements.find((s) => s.traderId === id)?.status, { timeout: 30_000 })
        .toBe("captured");
      await take(page, `10-payin-${id}`);
    });
  }

  // Round: the clearing account pays the traders who are owed.
  await test.step("Round — the house sends the payouts", async () => {
    await viewAs(page, "house");
    const send = page.getByRole("button", { name: /send payouts/i });
    await expect(send).toBeVisible();
    await take(page, "11-round-all-paid-in");
    await send.click();
    await expect.poll(async () => (await latestRound(request)).status, { timeout: 60_000 }).toBe("done");
    await expect(page.getByRole("main")).toContainText(/done/i);
    await take(page, "12-round-done");
    await auditLayout(page, "12 Round done");
  });

  // Statement: what cancelled, what is left, and why.
  await test.step("Statement — Soa pays, Hery receives", async () => {
    await viewAs(page, "soa");
    await page.getByRole("link", { name: "Read statement", exact: true }).click();
    await expect(page).toHaveURL(/\/statement$/);
    const main = page.getByRole("main");
    await expect(main.getByRole("heading", { level: 1 })).toHaveText(/pay[^.]*\$170(?!\d)/i);
    await expect(main).toContainText("Cleared by Alamino");
    await take(page, "13-statement-soa");
    await auditLayout(page, "13 Statement Soa");

    await viewAs(page, "hery");
    await expect(main.getByRole("heading", { level: 1 })).toHaveText(/receive[^.]*\$290(?!\d)/i);
    await take(page, "14-statement-hery");
    await auditLayout(page, "14 Statement Hery");
  });
}

// ---------------------------------------------------------------------------
// Walk 2 — every screen in every state, audited for misplaced UI. The states
// build up in the order the demo path goes through them: no round yet, a debt
// waiting, a round open, a round done.
// ---------------------------------------------------------------------------

async function auditEveryScreen(page: Page, request: APIRequestContext, phone: boolean) {
  const step = async (screen: string, body: () => Promise<unknown>) => {
    await test.step(screen, async () => {
      await body();
      await auditLayout(page, screen);
    });
  };

  // No round yet: the Payments link lands on an empty state.
  await step("Payments — no round yet", async () => {
    await page.goto("/rounds/latest");
    await expect(page.getByRole("main")).toContainText("No clearing round yet");
  });

  // Market states, before any round.
  await step("Market — the clearing house sees the seed data", async () => {
    await page.goto("/");
    await expect(page.getByRole("main").locator("[data-status]").first()).toBeVisible();
    await expect(page.getByRole("main")).toContainText("$940");
  });

  await step("Market — Soa sees her own market", async () => {
    await viewAs(page, "soa");
    await expect(page.getByRole("heading", { name: "Hello Soa." })).toBeVisible();
  });

  await step(phone ? "Add — Rivo, camera first, then the sentence" : "Add — Rivo, the sentence field", async () => {
    await page.goto("/add");
    await viewAs(page, "rivo");
    if (phone) {
      await expect(page.getByText("Photograph your notebook")).toBeVisible();
      await page.getByRole("button", { name: "Type a sentence" }).click();
    }
    await expect(page.getByRole("textbox")).toBeVisible();
  });

  // The ninth debt, proposed by Rivo: Confirm has content, and the round starts on nine debts.
  const debt = await proposeNinthDebt(request);

  await step("Confirm — the clearing house is not a trader", async () => {
    await page.goto("/confirm");
    await viewAs(page, "house");
    await expect(page.getByRole("main")).toContainText("The clearing house does not add or confirm debts");
  });

  await step("Confirm — Hery sees the debt that waits for her", async () => {
    await page.goto("/confirm");
    await viewAs(page, "hery");
    await expect(waitingForYou(page).getByText("Rivo approved", { exact: true })).toBeVisible();
  });

  // Statement, no round yet: the empty state with a link back to the market.
  await step("Statement — no round yet", async () => {
    await page.goto("/statement");
    await viewAs(page, "soa");
    await expect(page.getByRole("main")).toContainText(/no .*round/i);
  });

  // Hery approves through the API, then the round opens on nine debts ($990).
  await api(request, `/api/debts/${debt.id}/confirm`, { traderId: "hery", ok: true });
  const round = await api<Round>(request, "/api/rounds", {});

  await step("Round — the clearing house waits for the pay-ins", async () => {
    await page.goto(`/rounds/${round.id}`);
    await viewAs(page, "house");
    await expect(page.getByRole("main")).toContainText("$990");
  });

  await step("Round — Soa is asked to pay $170", async () => {
    await viewAs(page, "soa");
    await expect(page.getByRole("button", { name: /pay \$170/i })).toBeVisible();
  });

  // The round finishes through the API; the walk continues on the settled screens.
  await test.step("Finish the round through the API", async () => {
    for (const s of round.settlements.filter((x) => x.direction === "pay_in")) {
      const base = `/api/rounds/${round.id}/payin/${s.traderId}`;
      const { orderId } = await api<{ orderId: string }>(request, `${base}/order`, {});
      await api(request, `${base}/capture`, { orderId });
    }
    await api(request, `/api/rounds/${round.id}/payout`, {});
    await api(request, `/api/rounds/${round.id}/payout/refresh`, {});
  });

  await step("Statement — Soa pays $170", async () => {
    await page.goto("/statement");
    await viewAs(page, "soa");
    const main = page.getByRole("main");
    await expect(main.getByRole("heading", { level: 1 })).toHaveText(/pay[^.]*\$170(?!\d)/i);
    await expect(main).toContainText("Cleared by Alamino");
  });

  await step("Statement — Hery receives $290", async () => {
    await viewAs(page, "hery");
    await expect(page.getByRole("main").getByRole("heading", { level: 1 })).toHaveText(/receive[^.]*\$290(?!\d)/i);
  });

  await step("Statement — the clearing house has no statement", async () => {
    await viewAs(page, "house");
    await expect(page.getByRole("main")).toContainText("Statements are personal");
  });

  await step("Payments — the done round", async () => {
    await page.goto("/rounds/latest");
    await viewAs(page, "house");
    await expect(page.getByRole("main")).toContainText(/done/i);
  });

  await step("Market — after the round", async () => {
    await page.goto("/");
    await expect(page.getByRole("main").locator("[data-status]").first()).toBeVisible();
  });

  await step("AI Finance — the dashboard", async () => {
    await page.goto("/finance");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("AI Finance");
  });

  await step("More — the menu opens and stays in the window", async () => {
    await page.goto("/");
    await page.getByRole("button", { name: "More", exact: true }).click();
    await expect(page.locator("#more-panel")).toBeVisible();
  });

  // The chrome of each device, around the screens.
  if (phone) {
    await test.step("Phone chrome — one-row header, bottom bar at the edge, footer hidden on a task page", async () => {
      await page.goto("/add");
      await viewAs(page, "rivo");
      const header = await page.locator("header").boundingBox();
      expect(header!.height, "the header is one row").toBeLessThanOrEqual(64);

      const bar = page.locator(".bottom-bar");
      await expect(bar).toBeVisible();
      const box = await bar.boundingBox();
      expect(Math.abs(box!.y + box!.height - 800), "the bottom bar touches the bottom edge").toBeLessThanOrEqual(1);
      expect(Math.abs(box!.x + box!.width / 2 - 187.5), "the bottom bar is centred").toBeLessThanOrEqual(1);

      // On a task page the bottom bar is the navigation: the footer is hidden.
      await expect(page.locator("footer")).toBeHidden();
    });
  } else {
    await test.step("Laptop chrome — the nav, the footer and the centred content", async () => {
      await page.goto("/");
      await expect(page.locator("header .main-nav")).toBeVisible();
      await expect(page.locator("footer")).toBeVisible();
      const content = await page.locator(".app-content").first().boundingBox();
      expect(
        Math.abs(content!.x - (1366 - content!.width) / 2),
        "the content is centred",
      ).toBeLessThanOrEqual(2);
    });
  }
}

// ---------------------------------------------------------------------------
// Add to Home screen. The phone menu offers the install only when the manifest
// is right: name, standalone display, start URL, and icons that load.
// ---------------------------------------------------------------------------

test("Add to Home screen — the manifest makes the site installable", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/Alamino/);

  const link = page.locator('link[rel="manifest"]');
  await expect(link).toHaveCount(1);
  const href = await link.getAttribute("href");

  const res = await page.request.get(href!);
  expect(res.ok(), `${href} returns the manifest`).toBe(true);
  const manifest = (await res.json()) as {
    name?: string;
    short_name?: string;
    start_url?: string;
    display?: string;
    theme_color?: string;
    background_color?: string;
    icons: { src: string; sizes: string; type?: string; purpose?: string }[];
  };

  expect(manifest.name, "the name under the icon").toBe("Alamino");
  expect(manifest.short_name, "the short name").toBe("Alamino");
  expect(manifest.start_url, "the app opens on the market").toBe("/");
  expect(manifest.display, "the app opens without browser chrome").toBe("standalone");
  expect(manifest.theme_color, "the theme colour").toMatch(/^#[0-9a-f]{6}$/i);
  expect(manifest.background_color, "the splash colour").toMatch(/^#[0-9a-f]{6}$/i);

  // Android installs need a 192px icon, a 512px icon, and a maskable one.
  for (const want of ["192x192", "512x512"]) {
    expect(
      manifest.icons.some((i) => i.sizes === want),
      `an icon of ${want}`,
    ).toBe(true);
  }
  expect(manifest.icons.some((i) => i.purpose === "maskable"), "a maskable icon").toBe(true);

  for (const icon of manifest.icons) {
    const image = await page.request.get(icon.src);
    expect(image.ok(), `${icon.src} loads`).toBe(true);
    expect(image.headers()["content-type"], `${icon.src} is a PNG`).toContain("image/png");
  }
});

// ---------------------------------------------------------------------------
// The two walks. One database: each test resets the demo first.
// ---------------------------------------------------------------------------

test.describe("Issue #8 — the demo path on a phone (375px)", () => {
  test.use({ viewport: { width: 375, height: 800 } });
  test.beforeEach(async ({ request }) => resetDemo(request));

  test("walk the whole demo path and watch for misplaced UI", async ({ page, request }) => {
    test.setTimeout(180_000);
    await walkDemoPath(page, request, true);
  });

  test("every screen keeps its UI inside the window", async ({ page, request }) => {
    test.setTimeout(180_000);
    await auditEveryScreen(page, request, true);
  });
});

test.describe("Issue #8 — the demo path on a laptop (1366px)", () => {
  test.use({ viewport: { width: 1366, height: 768 } });
  test.beforeEach(async ({ request }) => resetDemo(request));

  test("walk the whole demo path and watch for misplaced UI", async ({ page, request }) => {
    test.setTimeout(180_000);
    await walkDemoPath(page, request, false);
  });

  test("every screen keeps its UI inside the window", async ({ page, request }) => {
    test.setTimeout(180_000);
    await auditEveryScreen(page, request, false);
  });
});

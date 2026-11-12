import { expect, type APIRequestContext, type Page } from "@playwright/test";
import type { Debt, Round, Trader } from "../src/lib/types";

// GET when body is undefined, else POST with a JSON body. Fails the test on an HTTP error.
export async function api<T>(request: APIRequestContext, path: string, body?: object): Promise<T> {
  const res = body === undefined ? await request.get(path) : await request.post(path, { data: body });
  expect(res.ok(), `${path} returned ${res.status()}: ${await res.text()}`).toBe(true);
  return res.json();
}

export const resetDemo = (request: APIRequestContext) => api(request, "/api/demo/reset", {});
export const listDebts = (request: APIRequestContext) => api<Debt[]>(request, "/api/debts");
export const latestRound = (request: APIRequestContext) => api<Round>(request, "/api/rounds/latest");
export const listTraders = (request: APIRequestContext) => api<Trader[]>(request, "/api/traders");

// The ninth demo debt, Rivo owes Hery $50, created by Rivo. Status `proposed`.
export const proposeNinthDebt = (request: APIRequestContext) =>
  api<Debt>(request, "/api/debts", {
    debtorId: "rivo",
    creditorId: "hery",
    amountCents: 5000,
    note: "rice",
    source: "text",
    createdBy: "rivo",
  });

// The ninth demo debt, approved by Hery. Status `confirmed`.
export async function addNinthDebt(request: APIRequestContext): Promise<Debt> {
  const debt = await proposeNinthDebt(request);
  return api<Debt>(request, `/api/debts/${debt.id}/confirm`, { traderId: "hery", ok: true });
}

// Adds the ninth debt and runs clearing on the nine debts. The round waits for pay-ins.
export async function startRound(request: APIRequestContext): Promise<Round> {
  await addNinthDebt(request);
  return api<Round>(request, "/api/rounds", {});
}

// Runs a full round through the API: pay-ins, payouts, refresh. Simulated PayPal finishes it at once.
export async function finishRound(request: APIRequestContext): Promise<Round> {
  const round = await startRound(request);
  for (const s of round.settlements.filter((x) => x.direction === "pay_in")) {
    const base = `/api/rounds/${round.id}/payin/${s.traderId}`;
    const { orderId } = await api<{ orderId: string }>(request, `${base}/order`, {});
    await api(request, `${base}/capture`, { orderId });
  }
  await api(request, `/api/rounds/${round.id}/payout`, {});
  const done = await api<Round>(request, `/api/rounds/${round.id}/payout/refresh`, {});
  expect(done.status).toBe("done");
  return done;
}

// Picks the viewer in the header "View as" select, as a user does: a trader id, or "house" for the clearing house.
// Without a choice, the app shows the clearing house.
export async function viewAs(page: Page, traderId: string): Promise<void> {
  const select = page.getByLabel(/view as/i);
  // Wait for the trader list: before it loads, the select has only "Clearing house" and a placeholder.
  await expect.poll(() => select.locator("option").count()).toBeGreaterThanOrEqual(6);
  await select.selectOption(traderId);
  await expect(select).toHaveValue(traderId);
}

// On a phone the camera comes first: the sentence field opens on demand, behind the
// "Type a sentence" button. On a laptop the form is open from the start.
export async function openSentenceField(page: Page): Promise<void> {
  if ((page.viewportSize()?.width ?? 1280) < 640) {
    await page.getByRole("button", { name: "Type a sentence" }).click();
    await expect(page.getByRole("textbox")).toBeVisible();
  }
}

import { expect, test } from "@playwright/test";
import { api, listDebts, listTraders, resetDemo } from "./helpers";
import type { Debt, Round, Trader } from "../src/lib/types";

test.describe("API End-to-End Suite", () => {
  test.beforeEach(async ({ request }) => {
    await resetDemo(request);
  });

  test("config and traders endpoints return system configuration and market traders", async ({ request }) => {
    const config = await api<{ paypalMode: string; aiMode: string }>(request, "/api/config");
    expect(config.paypalMode).toBe("simulated");
    expect(config.aiMode).toBe("fallback");

    const traders = await listTraders(request);
    expect(traders).toHaveLength(5);
    expect(traders.map((t) => t.id)).toEqual(["hery", "soa", "rivo", "lalao", "fidy"]);

    // Add an alias via API
    const updatedHery = await api<Trader>(request, "/api/traders/hery/aliases", { alias: "Vary Madagasikara" });
    expect(updatedHery.aliases).toContain("Vary Madagasikara");
  });

  test("debts endpoint handles listing, creating, confirming, and resolving debts", async ({ request }) => {
    const initialDebts = await listDebts(request);
    expect(initialDebts).toHaveLength(8);

    // Filter confirmed debts
    const confirmedRes = await request.get("/api/debts?status=confirmed");
    expect(confirmedRes.ok()).toBe(true);
    const confirmedDebts: Debt[] = await confirmedRes.json();
    expect(confirmedDebts).toHaveLength(8);

    // Create a new debt: Rivo owes Hery $50
    const newDebt = await api<Debt>(request, "/api/debts", {
      debtorId: "rivo",
      creditorId: "hery",
      amountCents: 5000,
      note: "E2E rice test",
      source: "text",
      createdBy: "rivo",
    });
    expect(newDebt.status).toBe("proposed");
    expect(newDebt.debtorOk).toBe(true);
    expect(newDebt.creditorOk).toBe(false);

    // Hery disputes with counter amount $60
    const disputed = await api<Debt>(request, `/api/debts/${newDebt.id}/confirm`, {
      traderId: "hery",
      ok: false,
      counterAmountCents: 6000,
    });
    expect(disputed.status).toBe("disputed");
    expect(disputed.counterAmountCents).toBe(6000);

    // Resolve endpoint returns suggestion for disputed debt
    const resolveRes = await api<{ suggestion: string; proposedAmountCents: number | null }>(
      request,
      `/api/debts/${newDebt.id}/resolve`,
      {},
    );
    expect(typeof resolveRes.suggestion).toBe("string");

    // Rivo accepts the counter amount
    const confirmed = await api<Debt>(request, `/api/debts/${newDebt.id}/confirm`, {
      traderId: "rivo",
      ok: true,
      counterAmountCents: 6000,
    });
    expect(confirmed.status).toBe("confirmed");
    expect(confirmed.amountCents).toBe(6000);
  });

  test("capture endpoint extracts structured draft debts from natural language text", async ({ request }) => {
    const captureResult = await api<{ drafts: Array<{ direction: string; counterpartyId: string; amountCents: number }> }>(
      request,
      "/api/capture",
      {
        text: "I owe Hery 50 for rice",
        createdBy: "rivo",
      },
    );
    expect(captureResult.drafts).toHaveLength(1);
    expect(captureResult.drafts[0].direction).toBe("you_owe");
    expect(captureResult.drafts[0].counterpartyId).toBe("hery");
    expect(captureResult.drafts[0].amountCents).toBe(5000);
  });

  test("rounds lifecycle and statements operate end-to-end", async ({ request }) => {
    // Add ninth debt and check preview
    await api<Debt>(request, "/api/debts", {
      debtorId: "rivo",
      creditorId: "hery",
      amountCents: 5000,
      note: "rice",
      source: "text",
      createdBy: "rivo",
    }).then((d) => api(request, `/api/debts/${d.id}/confirm`, { traderId: "hery", ok: true }));

    const preview = await api<{ stats: { grossCents: number; cashMovedCents: number } }>(request, "/api/rounds/preview");
    expect(preview.stats.grossCents).toBe(99000);
    expect(preview.stats.cashMovedCents).toBe(32000);

    // Execute clearing round
    const round = await api<Round>(request, "/api/rounds", {});
    expect(round.status).toBe("cleared");

    // Check latest round endpoint
    const latest = await api<Round>(request, "/api/rounds/latest");
    expect(latest.id).toBe(round.id);

    // Check statement endpoint (?text=plain)
    const statement = await api<{ roundId: string; traderId: string; action: string; netCents: number }>(
      request,
      `/api/rounds/${round.id}/statement/soa?text=plain`,
    );
    expect(statement.roundId).toBe(round.id);
    expect(statement.traderId).toBe("soa");
    expect(statement.action).toBe("pay_in");
    expect(statement.netCents).toBe(-17000);

    // Pay-ins
    for (const s of round.settlements.filter((x) => x.direction === "pay_in")) {
      const { orderId } = await api<{ orderId: string }>(request, `/api/rounds/${round.id}/payin/${s.traderId}/order`, {});
      const captured = await api<{ status: string }>(request, `/api/rounds/${round.id}/payin/${s.traderId}/capture`, { orderId });
      expect(captured.status).toBe("captured");
    }

    // Payout
    const paying = await api<Round>(request, `/api/rounds/${round.id}/payout`, {});
    expect(paying.status).toBe("paying");

    // Refresh payout -> done
    const done = await api<Round>(request, `/api/rounds/${round.id}/payout/refresh`, {});
    expect(done.status).toBe("done");
  });

  test("privacy: a trader sees only their part and cannot act for the house", async ({ request }) => {
    const as = (viewer: string) => ({ headers: { "x-alamino-viewer": viewer } });
    const touchesSoa = (e: { debtorId: string; creditorId: string }) => e.debtorId === "soa" || e.creditorId === "soa";

    // Soa does not get a debt between two other traders.
    const debtsRes = await request.get("/api/debts", as("soa"));
    expect(debtsRes.ok()).toBe(true);
    const debts: Debt[] = await debtsRes.json();
    expect(debts).toHaveLength(4);
    expect(debts.every(touchesSoa)).toBe(true);
    expect((await request.get("/api/debts", as("bema"))).status()).toBe(400);

    // Soa's preview holds her own numbers, not the market totals.
    const preview = await (await request.get("/api/rounds/preview", as("soa"))).json();
    expect(preview.stats.grossCents).toBe(65000);
    expect(preview.amountCents).toBe(17000);
    expect(preview.action).toBe("pay_in");

    // Soa cannot run clearing. The house can.
    expect((await request.post("/api/rounds", { ...as("soa"), data: {} })).status()).toBe(403);
    const round = await api<Round>(request, "/api/rounds", {});

    // Soa gets only her part of the round.
    const mine: Round = await (await request.get("/api/rounds/latest", as("soa"))).json();
    expect(mine.id).toBe(round.id);
    expect(mine.debtsBefore.every(touchesSoa)).toBe(true);
    expect(mine.result.remaining.every(touchesSoa)).toBe(true);
    expect(mine.settlements.map((s) => s.traderId)).toEqual(["soa"]);
    expect(mine.privacy?.viewer).toBe("soa");

    // Hery cannot read Soa's statement, or pay her pay-in.
    expect((await request.get(`/api/rounds/${round.id}/statement/soa?text=plain`, as("hery"))).status()).toBe(403);
    expect((await request.get(`/api/rounds/${round.id}/statement/soa?text=plain`, as("soa"))).ok()).toBe(true);
    expect((await request.post(`/api/rounds/${round.id}/payin/soa/order`, { ...as("hery"), data: {} })).status()).toBe(403);
  });

  test("finance API returns session info, demo data and responds to questions", async ({ request }) => {
    const session = await api<{ authenticated: boolean; passwordConfigured: boolean }>(request, "/api/finance/session");
    expect(session.authenticated).toBe(false);

    const start = "2026-10-01T00:00:00.000Z";
    const end = "2026-11-01T00:00:00.000Z";
    const data = await api<{ source: string; transactions: unknown[]; warnings: string[] }>(
      request,
      `/api/finance/data?source=demo&start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`,
    );
    expect(data.source).toBe("demo");
    expect(data.transactions.length).toBeGreaterThan(0);

    // Assistant endpoint (fallback mode)
    const assistantRes = await request.post("/api/finance/assistant", {
      headers: { origin: "http://localhost:3210" },
      data: {
        messages: [{ role: "user", content: "What were my sales?" }],
        source: "demo",
      },
    });
    expect(assistantRes.ok()).toBe(true);
    const assistant = await assistantRes.json();
    expect(assistant.engine).toBe("fallback");
    expect(typeof assistant.answer).toBe("string");
  });
});

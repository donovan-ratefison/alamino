import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.DATABASE_PATH = join(mkdtempSync(join(tmpdir(), "alamino-api-traders-")), "test.db");

const { reset } = await import("@/lib/seed");
const { listTraders } = await import("@/lib/db");
const { GET: getTraders } = await import("@/app/api/traders/route");
const { POST: addAliasRoute } = await import("@/app/api/traders/[id]/aliases/route");

beforeEach(() => {
  reset();
});

test("GET /api/traders returns the 5 market traders with details", async () => {
  const res = await getTraders();
  assert.equal(res.status, 200);
  const traders = await res.json();
  assert.equal(Array.isArray(traders), true);
  assert.equal(traders.length, 5);
  const ids = traders.map((t: { id: string }) => t.id);
  assert.deepEqual(ids, ["hery", "soa", "rivo", "lalao", "fidy"]);

  for (const trader of traders) {
    assert.ok(typeof trader.id === "string");
    assert.ok(typeof trader.name === "string");
    assert.ok(typeof trader.business === "string");
    assert.ok(Array.isArray(trader.aliases));
    assert.ok(typeof trader.paypalEmail === "string" && trader.paypalEmail.includes("@"));
  }
});

test("POST /api/traders/[id]/aliases adds a valid alias and trims whitespace", async () => {
  const req = new Request("http://localhost/api/traders/hery/aliases", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ alias: "  Mpivarotra vary be  " }),
  });
  const res = await addAliasRoute(req, { params: Promise.resolve({ id: "hery" }) });
  assert.equal(res.status, 200);
  const updatedTrader = await res.json();
  assert.ok(updatedTrader.aliases.includes("Mpivarotra vary be"));

  const hery = listTraders().find((t) => t.id === "hery")!;
  assert.ok(hery.aliases.includes("Mpivarotra vary be"));
});

test("POST /api/traders/[id]/aliases validates alias length, uniqueness and trader existence", async () => {
  // Alias too short (< 2 chars)
  const shortReq = new Request("http://localhost/api/traders/hery/aliases", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ alias: "X" }),
  });
  const shortRes = await addAliasRoute(shortReq, { params: Promise.resolve({ id: "hery" }) });
  assert.equal(shortRes.status, 400);

  // Alias too long (> 40 chars)
  const longReq = new Request("http://localhost/api/traders/hery/aliases", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ alias: "a".repeat(45) }),
  });
  const longRes = await addAliasRoute(longReq, { params: Promise.resolve({ id: "hery" }) });
  assert.equal(longRes.status, 400);

  // Alias already taken
  const conflictReq = new Request("http://localhost/api/traders/hery/aliases", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ alias: "Soa hotely" }),
  });
  const conflictRes = await addAliasRoute(conflictReq, { params: Promise.resolve({ id: "hery" }) });
  assert.equal(conflictRes.status, 409);

  // Unknown trader
  const unknownReq = new Request("http://localhost/api/traders/nonexistent/aliases", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ alias: "New Alias" }),
  });
  const unknownRes = await addAliasRoute(unknownReq, { params: Promise.resolve({ id: "nonexistent" }) });
  assert.equal(unknownRes.status, 404);

  // Malformed JSON body
  const malformedReq = new Request("http://localhost/api/traders/hery/aliases", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "not-json",
  });
  const malformedRes = await addAliasRoute(malformedReq, { params: Promise.resolve({ id: "hery" }) });
  assert.equal(malformedRes.status, 400);
});

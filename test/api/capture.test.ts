import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.DATABASE_PATH = join(mkdtempSync(join(tmpdir(), "alamino-api-capture-")), "test.db");

const { reset } = await import("@/lib/seed");
const { POST: captureRoute } = await import("@/app/api/capture/route");

beforeEach(() => {
  reset();
});

test("POST /api/capture parses natural language debts into drafts", async () => {
  const req = new Request("http://localhost/api/capture", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text: "I owe Hery 50 for rice. Soa owes me 30 for meat.",
      createdBy: "rivo",
    }),
  });
  const res = await captureRoute(req);
  assert.equal(res.status, 200);
  const result = await res.json();
  assert.equal(Array.isArray(result.drafts), true);
  assert.equal(result.drafts.length, 2);

  const draft1 = result.drafts[0];
  assert.equal(draft1.direction, "you_owe");
  assert.equal(draft1.counterpartyId, "hery");
  assert.equal(draft1.amountCents, 5000);
  assert.equal(draft1.debtorId, "rivo");
  assert.equal(draft1.creditorId, "hery");

  const draft2 = result.drafts[1];
  assert.equal(draft2.direction, "owed_to_you");
  assert.equal(draft2.counterpartyId, "soa");
  assert.equal(draft2.amountCents, 3000);
  assert.equal(draft2.debtorId, "soa");
  assert.equal(draft2.creditorId, "rivo");
});

test("POST /api/capture validates request schema and size limits", async () => {
  // Invalid / non-object body
  const badBodyRes = await captureRoute(new Request("http://localhost/api/capture", { method: "POST", body: "invalid-json" }));
  assert.equal(badBodyRes.status, 400);

  // Unknown createdBy
  const badTraderRes = await captureRoute(
    new Request("http://localhost/api/capture", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "I owe Hery 50", createdBy: "stranger" }),
    }),
  );
  assert.equal(badTraderRes.status, 400);

  // Text too long (> 2000 chars)
  const longTextRes = await captureRoute(
    new Request("http://localhost/api/capture", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "x".repeat(2005), createdBy: "rivo" }),
    }),
  );
  assert.equal(longTextRes.status, 400);

  // Invalid imageBase64 string
  const badImgRes = await captureRoute(
    new Request("http://localhost/api/capture", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageBase64: "not valid base64!", createdBy: "rivo" }),
    }),
  );
  assert.equal(badImgRes.status, 400);

  // Unsupported mediaType
  const badMediaRes = await captureRoute(
    new Request("http://localhost/api/capture", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "test", mediaType: "application/pdf", createdBy: "rivo" }),
    }),
  );
  assert.equal(badMediaRes.status, 400);

  // Missing both text and image
  const emptyRes = await captureRoute(
    new Request("http://localhost/api/capture", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ createdBy: "rivo" }),
    }),
  );
  assert.equal(emptyRes.status, 400);
});

import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.DATABASE_PATH = join(mkdtempSync(join(tmpdir(), "alamino-api-config-")), "test.db");

const { reset } = await import("@/lib/seed");
const { listDebts, listTraders } = await import("@/lib/db");
const { GET: getConfig } = await import("@/app/api/config/route");
const { POST: resetDemo } = await import("@/app/api/demo/reset/route");

beforeEach(() => {
  reset();
});

test("GET /api/config returns simulated PayPal and fallback AI by default", async () => {
  const origPaypalId = process.env.PAYPAL_CLIENT_ID;
  const origPaypalSecret = process.env.PAYPAL_CLIENT_SECRET;
  const origAiKey = process.env.AI_API_KEY;

  delete process.env.PAYPAL_CLIENT_ID;
  delete process.env.PAYPAL_CLIENT_SECRET;
  delete process.env.AI_API_KEY;

  try {
    const res = await getConfig();
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.deepEqual(data, { paypalMode: "simulated", aiMode: "fallback" });
  } finally {
    if (origPaypalId) process.env.PAYPAL_CLIENT_ID = origPaypalId;
    if (origPaypalSecret) process.env.PAYPAL_CLIENT_SECRET = origPaypalSecret;
    if (origAiKey) process.env.AI_API_KEY = origAiKey;
  }
});

test("GET /api/config recognizes PayPal sandbox and AI model configurations", async () => {
  const origPaypalId = process.env.PAYPAL_CLIENT_ID;
  const origPaypalSecret = process.env.PAYPAL_CLIENT_SECRET;
  const origAiKey = process.env.AI_API_KEY;

  process.env.PAYPAL_CLIENT_ID = "test_client_id";
  process.env.PAYPAL_CLIENT_SECRET = "test_client_secret";
  process.env.AI_API_KEY = "test_ai_key";

  try {
    const res = await getConfig();
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.deepEqual(data, { paypalMode: "sandbox", aiMode: "model" });
  } finally {
    delete process.env.PAYPAL_CLIENT_ID;
    delete process.env.PAYPAL_CLIENT_SECRET;
    delete process.env.AI_API_KEY;
    if (origPaypalId) process.env.PAYPAL_CLIENT_ID = origPaypalId;
    if (origPaypalSecret) process.env.PAYPAL_CLIENT_SECRET = origPaypalSecret;
    if (origAiKey) process.env.AI_API_KEY = origAiKey;
  }
});

test("POST /api/demo/reset reinitializes the database to initial seed state", async () => {
  const res = await resetDemo();
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.deepEqual(data, { ok: true });

  const traders = listTraders();
  assert.equal(traders.length, 5);
  const debts = listDebts();
  assert.equal(debts.length, 8);
});

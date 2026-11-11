import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.DATABASE_PATH = join(mkdtempSync(join(tmpdir(), "alamino-api-finance-")), "test.db");

const { sessionCookie } = await import("@/lib/finance/auth");
const { GET: getSession, POST: loginSession, DELETE: logoutSession } = await import("@/app/api/finance/session/route");
const { GET: getFinanceData } = await import("@/app/api/finance/data/route");
const { GET: getDashboard, POST: postDashboard } = await import("@/app/api/finance/dashboard/route");
const { POST: assistantRoute } = await import("@/app/api/finance/assistant/route");

const TEST_PASSWORD = "finance-admin-secret-test-pass";

test("GET /api/finance/session reports current authentication status", async () => {
  const res = await getSession(new Request("http://localhost/api/finance/session"));
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(typeof data.authenticated, "boolean");
  assert.equal(typeof data.passwordConfigured, "boolean");
});

test("POST /api/finance/session and DELETE /api/finance/session manage admin session", async () => {
  process.env.FINANCE_ADMIN_PASSWORD = TEST_PASSWORD;
  const origin = "http://localhost:3000";

  try {
    // Wrong password -> 401
    const badRes = await loginSession(
      new Request("http://localhost:3000/api/finance/session", {
        method: "POST",
        headers: { "Content-Type": "application/json", origin, host: "localhost:3000" },
        body: JSON.stringify({ password: "wrong-password" }),
      }),
    );
    assert.equal(badRes.status, 401);

    // Correct password -> 200 with Set-Cookie
    const goodRes = await loginSession(
      new Request("http://localhost:3000/api/finance/session", {
        method: "POST",
        headers: { "Content-Type": "application/json", origin, host: "localhost:3000" },
        body: JSON.stringify({ password: TEST_PASSWORD }),
      }),
    );
    assert.equal(goodRes.status, 200);
    const setCookie = goodRes.headers.get("Set-Cookie");
    assert.ok(setCookie && setCookie.includes("alamino-finance="));

    // Sign out -> 200 with cleared cookie
    const logoutRes = await logoutSession(
      new Request("http://localhost:3000/api/finance/session", {
        method: "DELETE",
        headers: { origin, host: "localhost:3000" },
      }),
    );
    assert.equal(logoutRes.status, 200);
    const logoutCookie = logoutRes.headers.get("Set-Cookie");
    assert.ok(logoutCookie && logoutCookie.includes("Max-Age=0"));
  } finally {
    delete process.env.FINANCE_ADMIN_PASSWORD;
  }
});

test("GET /api/finance/data retrieves demo data and enforces parameter validation", async () => {
  // Demo data query
  const start = "2026-10-01T00:00:00.000Z";
  const end = "2026-11-01T00:00:00.000Z";
  const res = await getFinanceData(
    new Request(`http://localhost/api/finance/data?source=demo&start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`),
  );
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.source, "demo");
  assert.ok(Array.isArray(data.transactions));
  assert.ok(Array.isArray(data.warnings));

  // Invalid source -> 400
  const badSourceRes = await getFinanceData(new Request("http://localhost/api/finance/data?source=invalid"));
  assert.equal(badSourceRes.status, 400);

  // Invalid date range -> 400
  const badDateRes = await getFinanceData(
    new Request("http://localhost/api/finance/data?source=demo&start=not-a-date&end=2026-11-01"),
  );
  assert.equal(badDateRes.status, 400);

  // Sandbox without auth -> 401
  const unauthSandboxRes = await getFinanceData(
    new Request(`http://localhost/api/finance/data?source=sandbox&start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`),
  );
  assert.equal(unauthSandboxRes.status, 401);
});

test("GET /api/finance/dashboard and POST /api/finance/dashboard require admin authorization", async () => {
  process.env.FINANCE_ADMIN_PASSWORD = TEST_PASSWORD;
  const origin = "http://localhost:3000";
  const authCookie = sessionCookie(new Request("http://localhost:3000")).split(";")[0];

  try {
    // Unauthenticated GET -> 401
    const unauthGet = await getDashboard(new Request("http://localhost:3000/api/finance/dashboard"));
    assert.equal(unauthGet.status, 401);

    // Authenticated GET -> 200
    const authGet = await getDashboard(
      new Request("http://localhost:3000/api/finance/dashboard", { headers: { cookie: authCookie } }),
    );
    assert.equal(authGet.status, 200);

    // Authenticated POST with invalid shape -> 400
    const badPost = await postDashboard(
      new Request("http://localhost:3000/api/finance/dashboard", {
        method: "POST",
        headers: { "Content-Type": "application/json", cookie: authCookie, origin, host: "localhost:3000" },
        body: JSON.stringify({ state: { invalid: true } }),
      }),
    );
    assert.equal(badPost.status, 400);

    // Authenticated POST with valid pages state -> 200
    const goodPost = await postDashboard(
      new Request("http://localhost:3000/api/finance/dashboard", {
        method: "POST",
        headers: { "Content-Type": "application/json", cookie: authCookie, origin, host: "localhost:3000" },
        body: JSON.stringify({ state: { pages: [{ id: "test-page", name: "Overview" }] } }),
      }),
    );
    assert.equal(goodPost.status, 200);
    const postResData = await goodPost.json();
    assert.deepEqual(postResData, { ok: true });
  } finally {
    delete process.env.FINANCE_ADMIN_PASSWORD;
  }
});

test("POST /api/finance/assistant handles questions with deterministic financial logic", async () => {
  const origin = "http://localhost:3000";

  // Empty question -> 400
  const emptyRes = await assistantRoute(
    new Request("http://localhost:3000/api/finance/assistant", {
      method: "POST",
      headers: { "Content-Type": "application/json", origin, host: "localhost:3000" },
      body: JSON.stringify({ messages: [] }),
    }),
  );
  assert.equal(emptyRes.status, 400);

  // Valid question -> 200 with answer
  const validRes = await assistantRoute(
    new Request("http://localhost:3000/api/finance/assistant", {
      method: "POST",
      headers: { "Content-Type": "application/json", origin, host: "localhost:3000" },
      body: JSON.stringify({
        messages: [{ role: "user", content: "What were my sales this month?" }],
        source: "demo",
      }),
    }),
  );
  assert.equal(validRes.status, 200);
  const data = await validRes.json();
  assert.ok(typeof data.answer === "string");
  assert.equal(data.engine, "fallback");
});

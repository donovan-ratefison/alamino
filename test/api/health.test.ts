import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const release = mkdtempSync(join(tmpdir(), "alamino-health-"));
process.env.DATABASE_PATH = join(release, "test.db");
const { GET } = await import("@/app/api/health/route");
const commit = "a".repeat(40);

test("health verifies the actual release marker and exposes no configuration", async () => {
  const previousCwd = process.cwd();
  const previousSha = process.env.DEPLOY_SHA;
  writeFileSync(join(release, ".deploy-sha"), commit);
  try {
    process.chdir(release);
    process.env.DEPLOY_SHA = commit;
    const response = await GET();
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store, max-age=0");
    assert.deepEqual(await response.json(), { status: "ok", commit });
  } finally {
    process.chdir(previousCwd);
    if (previousSha === undefined) delete process.env.DEPLOY_SHA; else process.env.DEPLOY_SHA = previousSha;
  }
});

test("health refuses a PM2 SHA that does not match the running directory", async () => {
  const previousCwd = process.cwd();
  const previousSha = process.env.DEPLOY_SHA;
  try {
    process.chdir(release);
    process.env.DEPLOY_SHA = "b".repeat(40);
    const response = await GET();
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { status: "unavailable" });
  } finally {
    process.chdir(previousCwd);
    if (previousSha === undefined) delete process.env.DEPLOY_SHA; else process.env.DEPLOY_SHA = previousSha;
  }
});

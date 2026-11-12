const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const bash = process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : 'bash';
const posix = p => p.replace(/\\/g, '/').replace(/^([A-Za-z]):/, (_, drive) => '/' + drive.toLowerCase());

function fixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'alamino-release-test-'));
  const root = path.join(directory, 'app');
  const bin = path.join(directory, 'bin');
  const source = path.join(directory, 'source');
  for (const dir of [path.join(root, '.git'), path.join(root, 'data'), path.join(root, '.next'), path.join(root, 'deploy'), path.join(source, 'deploy'), path.join(source, 'src/app/api/health'), bin]) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(root, '.env.local'), 'PRIVATE_FIXTURE=preserved\n');
  fs.writeFileSync(path.join(root, 'data/app.db'), 'persistent-database-fixture');
  fs.writeFileSync(path.join(root, '.next/BUILD_ID'), 'old-build');
  fs.writeFileSync(path.join(root, 'deploy/ecosystem.config.cjs'), 'module.exports={}');
  fs.writeFileSync(path.join(source, 'deploy/ecosystem.config.cjs'), 'module.exports={}');
  fs.writeFileSync(path.join(source, 'src/app/api/health/route.ts'), 'export {}');
  const scripts = {
    node: 'echo v24.21.0',
    npm: 'echo "$*" >> "$FAKE_LOG"\nif [[ "$1" == run && "$2" == build ]]; then exit 1; fi',
    pm2: 'echo "PM2 $*" >> "$FAKE_LOG"',
    curl: 'exit 1',
    sqlite3: 'exit 1',
    flock: 'exit "${FAKE_LOCK_BUSY:-0}"',
    git: 'shift 2\ncase "$1" in rev-parse) echo "$FAKE_SHA";; archive) tar -cf - -C "$FAKE_SOURCE" .;; esac',
  };
  for (const [name, content] of Object.entries(scripts)) fs.writeFileSync(path.join(bin, name), '#!/usr/bin/env bash\n' + content + '\n', { mode: 0o755 });
  return { root, log: path.join(directory, 'commands.log'), env: { ...process.env, ALAMINO_ROOT: posix(root), ALAMINO_NODE_BIN: posix(bin), ALAMINO_TEST_MODE: '1', FAKE_SOURCE: posix(source), FAKE_SHA: 'a'.repeat(40), FAKE_LOG: posix(path.join(directory, 'commands.log')) } };
}

for (const scenario of ['invalid commit', 'busy lock', 'build failure']) {
  test(`${scenario} keeps the live environment, database and PM2 untouched`, () => {
    const f = fixture();
    if (scenario === 'busy lock') f.env.FAKE_LOCK_BUSY = '1';
    const result = spawnSync(bash, ['deploy/release.sh', 'deploy', scenario === 'invalid commit' ? 'main;bad' : 'a'.repeat(40)], { cwd: path.resolve(__dirname, '../..'), env: f.env, encoding: 'utf8', timeout: 20000 });
    assert.notEqual(result.status, 0, result.stdout);
    assert.equal(result.error, undefined);
    const expected = { 'invalid commit': 'full, verified commit SHA', 'busy lock': 'Another deployment', 'build failure': '' }[scenario];
    if (expected) assert.ok(result.stderr.includes(expected), result.stderr);
    const calls = fs.existsSync(f.log) ? fs.readFileSync(f.log, 'utf8') : '';
    if (scenario === 'build failure') assert.ok(calls.includes('run build'), result.stderr);
    assert.ok(!calls.includes('PM2'), calls);
    assert.equal(fs.readFileSync(path.join(f.root, '.env.local'), 'utf8'), 'PRIVATE_FIXTURE=preserved\n');
    assert.equal(fs.readFileSync(path.join(f.root, 'data/app.db'), 'utf8'), 'persistent-database-fixture');
    assert.equal(fs.readFileSync(path.join(f.root, '.next/BUILD_ID'), 'utf8'), 'old-build');
  });
}

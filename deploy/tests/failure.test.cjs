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
  fs.writeFileSync(path.join(directory, 'active'), posix(root));
  const scripts = {
    node: 'if [[ "$1" == --version ]]; then echo v24.21.0; else exec "$FAKE_REAL_NODE" "$@"; fi',
    npm: 'echo "$*" >> "$FAKE_LOG"\nif [[ "$1" == run && "$2" == build ]]; then [[ "${FAKE_BUILD_SUCCESS:-0}" == 1 ]] || exit 1; [[ ! -e data && ! -L data ]] || exit 1; mkdir -p .next; echo new-build >.next/BUILD_ID; fi',
    pm2: `
case "$1" in
  jlist) if [[ -s "$FAKE_ACTIVE" ]]; then echo '[{"name":"alamino"},{"name":"other-app"}]'; else echo '[{"name":"other-app"}]'; fi; exit 0;;
esac
echo "PM2 $*" >> "$FAKE_LOG"
case "$1" in
  delete) [[ "$2" == alamino ]] || exit 1; : >"$FAKE_ACTIVE";;
  start) [[ "$3" == --only && "$4" == alamino ]] || exit 1
    if [[ "\${FAKE_ACTIVATION_FAIL:-0}" == 1 && "$PWD" != "$ALAMINO_ROOT" ]]; then exit 1; fi
    printf '%s' "$PWD" >"$FAKE_ACTIVE";;
  save) :;;
  *) exit 1;;
esac`,
    curl: `
response=''
while (($#)); do if [[ "$1" == --output ]]; then response=$2; shift; fi; shift; done
active=$(cat "$FAKE_ACTIVE")
[[ -n "$active" ]] || exit 1
commit=unmanaged
if [[ -f "$active/.deploy-sha" ]]; then commit=$(cat "$active/.deploy-sha"); fi
printf '{"status":"ok","commit":"%s"}' "$commit" >"$response"
printf 200`,
    sqlite3: `
if [[ "\${4:-}" == ".backup '"* ]]; then
  backup=\${4#".backup '"}; backup=\${backup%"'"}
  cp "$2" "$backup"
else echo ok; fi`,
    flock: 'exit "${FAKE_LOCK_BUSY:-0}"',
    git: 'shift 2\ncase "$1" in rev-parse) echo "$FAKE_SHA";; archive) tar -cf - -C "$FAKE_SOURCE" .;; esac',
  };
  for (const [name, content] of Object.entries(scripts)) fs.writeFileSync(path.join(bin, name), '#!/usr/bin/env bash\n' + content + '\n', { mode: 0o755 });
  return { root, active: path.join(directory, 'active'), log: path.join(directory, 'commands.log'), env: { ...process.env, ALAMINO_ROOT: posix(root), ALAMINO_NODE_BIN: posix(bin), ALAMINO_TEST_MODE: '1', FAKE_SOURCE: posix(source), FAKE_SHA: 'a'.repeat(40), FAKE_LOG: posix(path.join(directory, 'commands.log')), FAKE_ACTIVE: posix(path.join(directory, 'active')), FAKE_REAL_NODE: posix(process.execPath) } };
}

function run(f, mode = 'deploy') {
  return spawnSync(bash, ['deploy/release.sh', mode, 'a'.repeat(40)], { cwd: path.resolve(__dirname, '../..'), env: f.env, encoding: 'utf8', timeout: 20000 });
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

const posixOnly = { skip: process.platform === 'win32' ? 'Requires native POSIX symlinks; runs on the Linux CI runner' : false };

test('activation replaces the old PM2 working directory and manual rollback restores it', posixOnly, () => {
  const f = fixture();
  f.env.FAKE_BUILD_SUCCESS = '1';
  const deployed = run(f);
  assert.equal(deployed.status, 0, deployed.stderr + deployed.stdout);
  const current = path.join(f.root, '.deploy/current');
  const release = fs.realpathSync(current);
  assert.equal(fs.realpathSync(path.join(release, 'data')), fs.realpathSync(path.join(f.root, 'data')));
  assert.equal(fs.readFileSync(f.active, 'utf8'), posix(release));
  assert.equal(fs.readFileSync(path.join(release, '.deploy-sha'), 'utf8').trim(), 'a'.repeat(40));
  assert.equal(fs.realpathSync(path.join(f.root, '.deploy/previous')), fs.realpathSync(f.root));
  const rolledBack = run(f, 'rollback');
  assert.equal(rolledBack.status, 0, rolledBack.stderr + rolledBack.stdout);
  assert.equal(fs.realpathSync(current), fs.realpathSync(f.root));
  assert.equal(fs.readFileSync(f.active, 'utf8'), posix(f.root));
  assert.equal(fs.readFileSync(path.join(f.root, 'data/app.db'), 'utf8'), 'persistent-database-fixture');
  assert.equal(fs.readFileSync(path.join(f.root, '.env.local'), 'utf8'), 'PRIVATE_FIXTURE=preserved\n');
});

test('failed PM2 activation automatically restores the previous application', posixOnly, () => {
  const f = fixture();
  f.env.FAKE_BUILD_SUCCESS = '1';
  f.env.FAKE_ACTIVATION_FAIL = '1';
  const result = run(f);
  assert.equal(result.status, 1, result.stderr + result.stdout);
  assert.ok(result.stderr.includes('restoring the preceding application version'), result.stderr);
  assert.equal(fs.realpathSync(path.join(f.root, '.deploy/current')), fs.realpathSync(f.root));
  assert.equal(fs.readFileSync(f.active, 'utf8'), posix(f.root));
  assert.ok(fs.readFileSync(f.log, 'utf8').includes('PM2 save'));
  assert.equal(fs.readFileSync(path.join(f.root, 'data/app.db'), 'utf8'), 'persistent-database-fixture');
});

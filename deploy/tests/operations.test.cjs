const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { gunzipSync } = require('node:zlib');
const Database = require('better-sqlite3');
const ops = require('../ops.cjs');

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'alamino-operations-'));
  for (const directory of ['data', '.deploy', 'data/backups', '.deploy/releases', '.deploy/logs']) fs.mkdirSync(path.join(root, directory), { recursive: true });
  return root;
}

function link(target, destination) {
  fs.symlinkSync(target, destination, process.platform === 'win32' ? 'junction' : 'dir');
}

test('online backup includes committed WAL data and a restore rehearsal leaves the live database intact', async () => {
  const root = fixture();
  const file = path.join(root, 'data/app.db');
  const live = new Database(file);
  try {
    live.pragma('journal_mode = WAL');
    live.pragma('wal_autocheckpoint = 0');
    live.exec('CREATE TABLE amounts (cents INTEGER); INSERT INTO amounts VALUES (17000); BEGIN; INSERT INTO amounts VALUES (99999);');
    const originalInode = fs.statSync(file).ino;
    const backup = await ops.backupDatabase(root);
    const copy = new Database(path.join(root, 'data/backups', backup.file), { readonly: true, fileMustExist: true });
    try { assert.deepEqual(copy.prepare('SELECT cents FROM amounts').all(), [{ cents: 17000 }]); } finally { copy.close(); }
    live.exec('ROLLBACK; INSERT INTO amounts VALUES (3000);');
    assert.equal(ops.verifyBackup(root, backup.file).restoredCopy, true);
    assert.equal(fs.statSync(file).ino, originalInode);
    assert.deepEqual(live.prepare('SELECT cents FROM amounts').all(), [{ cents: 17000 }, { cents: 3000 }]);
    assert.ok(!fs.readdirSync(path.join(root, '.deploy')).some(name => name.startsWith('restore-check-')));
  } finally { live.close(); }
});

test('backup rehearsal rejects paths outside managed backups and corrupted snapshots', () => {
  const root = fixture();
  assert.throws(() => ops.verifyBackup(root, '../app.db'));
  fs.writeFileSync(path.join(root, 'data/backups/snapshot-broken.db'), 'not SQLite');
  assert.throws(() => ops.verifyBackup(root, 'snapshot-broken.db'));
  assert.ok(!fs.readdirSync(path.join(root, '.deploy')).some(name => name.startsWith('restore-check-')));
});

test('release retention preserves current, previous, persistent data and unknown directories', () => {
  const root = fixture();
  const folder = path.join(root, '.deploy/releases');
  const data = path.join(root, 'data');
  fs.writeFileSync(path.join(data, 'app.db'), 'keep live data');
  const releases = ['a', 'b', 'c', 'd', 'e'].map((letter, i) => {
    const sha = letter.repeat(40);
    const release = path.join(folder, sha + '.fixture');
    fs.mkdirSync(release);
    fs.writeFileSync(path.join(release, '.deploy-sha'), sha);
    link(data, path.join(release, 'data'));
    fs.utimesSync(release, new Date(1000 * i + 1000), new Date(1000 * i + 1000));
    return release;
  });
  fs.mkdirSync(path.join(folder, 'unmanaged-important'));
  link(releases[0], path.join(root, '.deploy/current'));
  link(releases[1], path.join(root, '.deploy/previous'));
  const plan = ops.pruneReleases(root, { dryRun: true, keep: 2 });
  assert.deepEqual(plan, [path.basename(releases[2])]);
  assert.ok(fs.existsSync(releases[2]));
  assert.deepEqual(ops.pruneReleases(root, { keep: 2 }), plan);
  assert.ok(!fs.existsSync(releases[2]));
  for (const index of [0, 1, 3, 4]) assert.ok(fs.existsSync(releases[index]));
  assert.equal(fs.readFileSync(path.join(data, 'app.db'), 'utf8'), 'keep live data');
  assert.ok(fs.existsSync(path.join(folder, 'unmanaged-important')));
});

test('release cleanup refuses escaped pointers', () => {
  const root = fixture();
  link(root, path.join(root, '.deploy/current'));
  link(path.join(root, 'data'), path.join(root, '.deploy/previous'));
  assert.throws(() => ops.pruneReleases(root), /escaped/);
});

test('operations scripts stay available after rolling back to older application code', () => {
  const root = fixture();
  link(root, path.join(root, '.deploy/current'));
  link(root, path.join(root, '.deploy/previous'));
  const releases = ['a', 'b', 'c'].map((letter, i) => {
    const sha = letter.repeat(40);
    const release = path.join(root, '.deploy/releases', sha + '.fixture');
    fs.mkdirSync(release);
    fs.writeFileSync(path.join(release, '.deploy-sha'), sha);
    fs.utimesSync(release, new Date(1000 * i + 1000), new Date(1000 * i + 1000));
    return release;
  });
  link(releases[0], path.join(root, '.deploy/operations'));
  assert.deepEqual(ops.pruneReleases(root, { keep: 2 }), []);
  assert.ok(fs.existsSync(path.join(root, '.deploy/operations/.deploy-sha')));
});

test('incomplete builds are kept for a day and then removed without touching current', () => {
  const root = fixture();
  link(root, path.join(root, '.deploy/current'));
  link(root, path.join(root, '.deploy/previous'));
  const old = path.join(root, '.deploy/releases', 'a'.repeat(40) + '.failed');
  const fresh = path.join(root, '.deploy/releases', 'b'.repeat(40) + '.building');
  fs.mkdirSync(old); fs.mkdirSync(fresh);
  fs.utimesSync(old, new Date(1000), new Date(1000));
  assert.deepEqual(ops.pruneReleases(root), [path.basename(old)]);
  assert.ok(fs.existsSync(fresh));
  assert.ok(fs.existsSync(root));
});

test('backup retention keeps the newest snapshots and ignores files outside the managed naming scheme', () => {
  const root = fixture();
  const folder = path.join(root, 'data/backups');
  for (let i = 0; i < 5; i++) {
    const file = path.join(folder, 'snapshot-' + i + '.db');
    fs.writeFileSync(file, 'fixture');
    fs.utimesSync(file, new Date(1000 * i + 1000), new Date(1000 * i + 1000));
  }
  fs.writeFileSync(path.join(folder, 'operator-backup.db'), 'preserve');
  const removed = ops.pruneBackups(root, { snapshots: 2 });
  assert.deepEqual(removed, ['snapshot-2.db', 'snapshot-1.db', 'snapshot-0.db']);
  assert.ok(fs.existsSync(path.join(folder, 'snapshot-4.db')));
  assert.ok(fs.existsSync(path.join(folder, 'operator-backup.db')));
});

test('log rotation keeps the active descriptor and compresses only Alamino logs', async () => {
  const root = fixture();
  const folder = path.join(root, '.deploy/logs');
  const active = path.join(folder, 'alamino-out.log');
  fs.writeFileSync(active, 'original log data');
  fs.writeFileSync(path.join(folder, 'other-app.log'), 'do not touch');
  const inode = fs.statSync(active).ino;
  assert.deepEqual(await ops.rotateLogs(root, { maxBytes: 1 }), ['alamino-out']);
  assert.equal(fs.statSync(active).ino, inode);
  assert.equal(fs.readFileSync(active, 'utf8'), '');
  const archive = fs.readdirSync(folder).find(name => name.endsWith('.gz'));
  assert.equal(gunzipSync(fs.readFileSync(path.join(folder, archive))).toString(), 'original log data');
  assert.equal(fs.readFileSync(path.join(folder, 'other-app.log'), 'utf8'), 'do not touch');
});

test('cron installation is idempotent and preserves unrelated schedules and environment settings', () => {
  const existing = '# operator jobs\nPATH=/operator/bin\n5 * * * * /other-app/job\n';
  const result = ops.managedCrontab(existing);
  assert.ok(result.startsWith(existing));
  assert.equal(ops.managedCrontab(result), result);
  assert.ok(result.includes('17 */6 * * *'));
  assert.equal(result.split('\n').filter(line => line.includes('/operations/deploy/ops.sh')).length, 2);
  assert.throws(() => ops.managedCrontab('# BEGIN ALAMINO OPERATIONS\n'), /Unterminated/);
});

test('health checks require a managed commit and detect a mismatched version', () => {
  const commit = 'a'.repeat(40);
  assert.equal(ops.validateHealth({ status: 'ok', commit }, commit).commit, commit);
  for (const response of [{ status: 'unavailable' }, { status: 'ok', commit: 'unmanaged' }]) assert.throws(() => ops.validateHealth(response));
  assert.throws(() => ops.validateHealth({ status: 'ok', commit }, 'b'.repeat(40)), /does not match/);
});

test('HTTP monitoring rejects cached responses, redirects and server failures', async t => {
  let status = 200;
  let cache = 'no-store';
  const server = http.createServer((req, res) => {
    res.writeHead(status, { 'Cache-Control': cache, 'Content-Type': 'application/json', Location: '/api/health' });
    res.end(JSON.stringify({ status: 'ok', commit: 'a'.repeat(40) }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const url = 'http://127.0.0.1:' + server.address().port;
  await ops.checkPublic(url);
  cache = 'public, max-age=3600';
  await assert.rejects(ops.checkPublic(url), /uncached/);
  cache = 'no-store'; status = 503;
  await assert.rejects(ops.checkPublic(url));
  status = 302;
  await assert.rejects(ops.checkPublic(url));
});

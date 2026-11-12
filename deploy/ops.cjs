#!/usr/bin/env node
// Operations for this single VPS. No payment call, live restore or PM2 restart.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { randomUUID } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { pipeline } = require('node:stream/promises');
const { createGzip } = require('node:zlib');

const DEFAULT_ROOT = '/home/debian/alamino';
const PUBLIC_URL = 'https://alamino.live-preprod.site';
const RELEASE_NAME = /^[0-9a-f]{40}\.[A-Za-z0-9]+$/;
const BACKUP_NAME = /^(snapshot-|pre-)[A-Za-z0-9.-]+\.db$/;
const BEGIN_CRON = '# BEGIN ALAMINO OPERATIONS';
const END_CRON = '# END ALAMINO OPERATIONS';

function directory(file, create = false) {
  if (create && !fs.existsSync(file)) fs.mkdirSync(file, { mode: 0o700 });
  const stat = fs.lstatSync(file);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Expected an ordinary directory: ' + file);
  return fs.realpathSync(file);
}

function locations(root = DEFAULT_ROOT) {
  root = directory(root);
  const data = directory(path.join(root, 'data'));
  return { root, data, state: path.join(root, '.deploy'), backups: path.join(data, 'backups') };
}

function inside(parent, file) {
  const relative = path.relative(parent, file);
  return relative !== '' && relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative);
}

function removeTree(parent, file) {
  const stat = fs.lstatSync(file);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Refusing to remove a directory link');
  const canonical = fs.realpathSync(file);
  if (canonical !== path.resolve(file) || !inside(fs.realpathSync(parent), canonical)) throw new Error('Removal escaped the managed directory');
  fs.rmSync(canonical, { recursive: true });
}

function verifyDatabase(file) {
  const Database = require('better-sqlite3');
  const connection = new Database(file, { readonly: true, fileMustExist: true, timeout: 10000 });
  try {
    if (connection.pragma('quick_check', { simple: true }) !== 'ok') throw new Error('SQLite integrity check failed');
    return { integrity: 'ok', tables: connection.prepare("SELECT count(*) AS n FROM sqlite_master WHERE type = 'table'").get().n };
  } finally { connection.close(); }
}

async function backupDatabase(root) {
  const p = locations(root);
  directory(p.state, true);
  directory(p.backups, true);
  const source = path.join(p.data, 'app.db');
  if (!fs.lstatSync(source).isFile()) throw new Error('Persistent database must be an ordinary file');
  const temporary = fs.mkdtempSync(path.join(p.backups, '.snapshot-'));
  const destination = path.join(temporary, 'snapshot.db');
  const Database = require('better-sqlite3');
  const connection = new Database(source, { readonly: true, fileMustExist: true, timeout: 10000 });
  try {
    const deadline = Date.now() + 180000;
    await connection.backup(destination, { progress() { if (Date.now() > deadline) throw new Error('Backup timed out'); } });
    verifyDatabase(destination);
    fs.chmodSync(destination, 0o600);
    const name = 'snapshot-' + new Date().toISOString().replace(/[:.]/g, '-') + '-' + randomUUID() + '.db';
    const output = path.join(p.backups, name);
    fs.renameSync(destination, output);
    return { file: name, bytes: fs.statSync(output).size, integrity: 'ok' };
  } finally {
    connection.close();
    removeTree(p.backups, temporary);
  }
}

function backupFiles(root) {
  const p = locations(root);
  const folder = directory(p.backups);
  return fs.readdirSync(folder).filter(name => BACKUP_NAME.test(name)).flatMap(name => {
    const file = path.join(folder, name);
    const stat = fs.lstatSync(file);
    return stat.isFile() ? [{ name, file, modified: stat.mtimeMs, bytes: stat.size }] : [];
  }).sort((a, b) => b.modified - a.modified || b.name.localeCompare(a.name));
}

function verifyBackup(root, name) {
  const p = locations(root);
  const backups = backupFiles(root);
  name = name || backups[0]?.name;
  if (!name || !BACKUP_NAME.test(name)) throw new Error('Specify an existing managed backup filename');
  const found = backups.find(item => item.name === name);
  if (!found) throw new Error('Backup not found');
  directory(p.state, true);
  const temporary = fs.mkdtempSync(path.join(p.state, 'restore-check-'));
  try {
    const restored = path.join(temporary, 'restored.db');
    fs.copyFileSync(found.file, restored, fs.constants.COPYFILE_EXCL);
    fs.chmodSync(restored, 0o600);
    return { file: name, ...verifyDatabase(restored), restoredCopy: true };
  } finally { removeTree(p.state, temporary); }
}

function pruneBackups(root, { dryRun = false, snapshots = 28, beforeDeploy = 10 } = {}) {
  if (snapshots < 2 || beforeDeploy < 2) throw new Error('Keep at least two backups of each kind');
  const files = backupFiles(root);
  const removed = [];
  for (const [prefix, keep] of [['snapshot-', snapshots], ['pre-', beforeDeploy]]) {
    for (const file of files.filter(item => item.name.startsWith(prefix)).slice(keep)) {
      if (!dryRun) fs.unlinkSync(file.file);
      removed.push(file.name);
    }
  }
  return removed;
}

function pruneReleases(root, { dryRun = false, keep = 3 } = {}) {
  if (keep < 2) throw new Error('Keep at least two recent releases');
  const p = locations(root);
  const folder = directory(path.join(directory(p.state), 'releases'));
  const protectedPaths = new Set([p.root]);
  // Missing or invalid pointers stop cleanup; never guess what is safe to delete.
  for (const name of ['current', 'previous', 'operations']) {
    const link = path.join(p.state, name);
    let stat;
    try { stat = fs.lstatSync(link); } catch (error) { if (name === 'operations' && error.code === 'ENOENT') continue; throw error; }
    if (!stat.isSymbolicLink()) throw new Error('Missing release pointer: ' + name);
    const target = fs.realpathSync(link);
    if (target !== p.root && (path.dirname(target) !== folder || !RELEASE_NAME.test(path.basename(target)))) throw new Error('Release pointer escaped the release directory');
    protectedPaths.add(target);
  }
  const abandoned = [];
  const releases = fs.readdirSync(folder).filter(name => RELEASE_NAME.test(name)).flatMap(name => {
    const file = path.join(folder, name);
    if (!fs.lstatSync(file).isDirectory() || fs.lstatSync(file).isSymbolicLink()) return [];
    if (!fs.existsSync(path.join(file, '.deploy-sha'))) {
      if (Date.now() - fs.statSync(file).mtimeMs > 24 * 60 * 60 * 1000 && !protectedPaths.has(fs.realpathSync(file))) abandoned.push({ name, file });
      return [];
    }
    if (fs.readFileSync(path.join(file, '.deploy-sha'), 'utf8').trim() !== name.slice(0, 40)) return [];
    return [{ name, file, modified: fs.statSync(file).mtimeMs }];
  }).sort((a, b) => b.modified - a.modified);
  const removed = releases.slice(keep).filter(item => !protectedPaths.has(fs.realpathSync(item.file))).concat(abandoned);
  for (const item of removed) if (!dryRun) removeTree(folder, item.file);
  return removed.map(item => item.name);
}

async function rotateLogs(root, { dryRun = false, maxBytes = 10 * 1024 * 1024, keep = 7 } = {}) {
  const p = locations(root);
  directory(p.state, true);
  const folder = directory(path.join(p.state, 'logs'), true);
  const rotated = [];
  for (const name of ['alamino-out', 'alamino-error', 'operations']) {
    const file = path.join(folder, name + '.log');
    if (!fs.existsSync(file)) continue;
    const stat = fs.lstatSync(file);
    if (!stat.isFile()) throw new Error('Refusing a non-regular log file');
    if (stat.size < maxBytes) continue;
    rotated.push(name);
    if (dryRun) continue;
    const copy = path.join(folder, name + '-' + new Date().toISOString().replace(/[:.]/g, '-') + '-' + randomUUID() + '.log');
    fs.copyFileSync(file, copy, fs.constants.COPYFILE_EXCL);
    fs.chmodSync(copy, 0o600);
    // Keep the descriptor open in PM2 valid. Copy/truncate has a small log-loss window.
    fs.truncateSync(file, 0);
    const archive = copy + '.gz';
    await pipeline(fs.createReadStream(copy), createGzip(), fs.createWriteStream(archive, { flags: 'wx', mode: 0o600 }));
    fs.unlinkSync(copy);
  }
  if (!dryRun) {
    for (const name of ['alamino-out', 'alamino-error', 'operations']) {
      const archives = fs.readdirSync(folder).filter(file => file.startsWith(name + '-') && /^[A-Za-z0-9.-]+\.log\.gz$/.test(file))
        .map(name => ({ name, stat: fs.lstatSync(path.join(folder, name)) })).filter(x => x.stat.isFile()).sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs);
      for (const archive of archives.slice(keep)) fs.unlinkSync(path.join(folder, archive.name));
    }
  }
  return rotated;
}

function managedCrontab(existing) {
  const lines = existing.replace(/\r\n/g, '\n').split('\n');
  const result = [];
  let inBlock = false;
  let blocks = 0;
  for (const line of lines) {
    if (line === BEGIN_CRON) { if (inBlock || ++blocks > 1) throw new Error('Malformed Alamino cron block'); inBlock = true; continue; }
    if (line === END_CRON) { if (!inBlock) throw new Error('Malformed Alamino cron block'); inBlock = false; continue; }
    if (!inBlock) result.push(line);
  }
  if (inBlock) throw new Error('Unterminated Alamino cron block');
  while (result.at(-1) === '') result.pop();
  const command = '/usr/bin/timeout 300 /bin/bash /home/debian/alamino/.deploy/operations/deploy/ops.sh ';
  const log = ' >>/home/debian/alamino/.deploy/logs/operations.log 2>&1';
  return result.concat([
    BEGIN_CRON,
    '17 */6 * * * ' + command + 'backup' + log,
    '37 * * * * ' + command + 'maintenance' + log,
    END_CRON, '',
  ]).join('\n');
}

function installCron(root) {
  if (root !== DEFAULT_ROOT || os.userInfo().username !== 'debian') throw new Error('Install only as debian in the configured VPS root');
  const p = locations(root);
  directory(p.state, true);
  directory(path.join(p.state, 'logs'), true);
  const current = fs.realpathSync(path.join(p.state, 'current'));
  if (!inside(path.join(p.state, 'releases'), current)) throw new Error('A managed current release is required');
  for (const file of ['ops.sh', 'ops.cjs']) if (!fs.statSync(path.join(current, 'deploy', file)).isFile()) throw new Error('Deploy the operations scripts first');
  const pointer = path.join(p.state, 'operations');
  if (fs.existsSync(pointer) && !fs.lstatSync(pointer).isSymbolicLink()) throw new Error('Refusing to replace an ordinary operations directory');
  const temporary = pointer + '.' + randomUUID();
  fs.symlinkSync(current, temporary, 'dir');
  fs.renameSync(temporary, pointer);
  const existing = spawnSync('crontab', ['-l'], { encoding: 'utf8' });
  if (existing.error || (existing.status !== 0 && !/no crontab/i.test(existing.stderr))) throw new Error('Cannot read the existing crontab');
  const expected = managedCrontab(existing.status === 0 ? existing.stdout : '');
  const result = spawnSync('crontab', ['-'], { input: expected, encoding: 'utf8' });
  if (result.status !== 0) throw new Error('Cannot install the Alamino cron block');
  const verified = spawnSync('crontab', ['-l'], { encoding: 'utf8' });
  if (verified.status !== 0 || verified.stdout !== expected) throw new Error('Installed crontab verification failed');
  return { installed: true, backups: 'every 6 hours', maintenance: 'hourly', timezone: 'VPS cron timezone' };
}

function validateHealth(response, expectedSha) {
  if (!response || response.status !== 'ok' || !/^[0-9a-f]{40}$/.test(response.commit)) throw new Error('Unhealthy or unmanaged application version');
  if (expectedSha && response.commit !== expectedSha) throw new Error('Application version does not match the verified commit');
  return response;
}

async function checkPublic(baseUrl = PUBLIC_URL, expectedSha) {
  const base = new URL(baseUrl);
  if (base.protocol !== 'https:' && !(base.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(base.hostname))) throw new Error('HTTPS is required');
  const response = await fetch(new URL('/api/health', base), { redirect: 'error', signal: AbortSignal.timeout(10000), headers: { 'Cache-Control': 'no-cache' } });
  if (response.status !== 200 || !response.headers.get('cache-control')?.includes('no-store')) throw new Error('Health endpoint must return uncached HTTP 200');
  return validateHealth(await response.json(), expectedSha);
}

async function status(root) {
  const p = locations(root);
  const current = fs.realpathSync(path.join(p.state, 'current'));
  const previous = fs.realpathSync(path.join(p.state, 'previous'));
  const expected = fs.readFileSync(path.join(current, '.deploy-sha'), 'utf8').trim();
  const local = await checkPublic('http://127.0.0.1:3100', expected);
  const publicHealth = await checkPublic(PUBLIC_URL, expected);
  const backups = backupFiles(root);
  const disk = fs.statfsSync(p.root);
  return { local, public: publicHealth, current, previous, latestBackup: backups[0]?.name || null,
    diskAvailableBytes: disk.bavail * disk.bsize, memoryAvailableBytes: os.freemem() };
}

async function main() {
  process.umask(0o077);
  const [command = 'status', argument] = process.argv.slice(2);
  const root = process.env.ALAMINO_ROOT || DEFAULT_ROOT;
  const dryRun = argument === '--dry-run';
  let result;
  switch (command) {
    case 'public-health': {
      let failure;
      for (let attempt = 0; attempt < 5; attempt++) {
        try { result = await checkPublic(); break; } catch (error) { failure = error; if (attempt < 4) await new Promise(resolve => setTimeout(resolve, 3000)); }
      }
      if (!result) throw failure;
      break;
    }
    case 'status': result = await status(root); break;
    case 'backup': {
      const backup = await backupDatabase(root);
      result = { backup, rehearsal: verifyBackup(root, backup.file), removed: pruneBackups(root) };
      break;
    }
    case 'verify-backup': result = verifyBackup(root, argument); break;
    case 'maintenance':
      result = { dryRun, releases: pruneReleases(root, { dryRun }), backups: pruneBackups(root, { dryRun }), logs: await rotateLogs(root, { dryRun }) };
      break;
    case 'install-cron': result = installCron(root); break;
    default: throw new Error('Use: ops.sh status | backup | verify-backup [filename] | maintenance [--dry-run] | install-cron | public-health');
  }
  console.log(JSON.stringify({ at: new Date().toISOString(), command, ...result }));
}

module.exports = { backupDatabase, verifyBackup, pruneBackups, pruneReleases, rotateLogs, managedCrontab, validateHealth, checkPublic };
if (require.main === module) main().catch(error => { console.error('Alamino operations failed: ' + error.message); process.exitCode = 1; });

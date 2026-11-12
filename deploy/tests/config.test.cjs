const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const yaml = require('js-yaml');
const root = path.resolve(__dirname, '../..');

test('workflow verifies the exact commit before a serialized main-only deployment', () => {
  const workflow = yaml.load(fs.readFileSync(path.join(root, '.github/workflows/deploy.yml'), 'utf8'));
  assert.deepEqual(workflow.on.push.branches, ['main']);
  assert.ok(Object.hasOwn(workflow.on, 'workflow_dispatch'));
  assert.equal(workflow.permissions.contents, 'read');
  assert.equal(workflow.jobs.deploy.needs, 'verify');
  assert.equal(workflow.jobs.deploy.if, "github.ref == 'refs/heads/main'");
  assert.equal(workflow.jobs.deploy.concurrency['cancel-in-progress'], false);
  for (const job of Object.values(workflow.jobs)) {
    for (const step of job.steps.filter(s => s.uses)) assert.match(step.uses, /@[0-9a-f]{40}$/);
    const checkout = job.steps.find(s => s.uses?.startsWith('actions/checkout@'));
    assert.equal(checkout.with.ref, '${{ github.sha }}');
    assert.equal(checkout.with['persist-credentials'], false);
  }
  const commands = workflow.jobs.verify.steps.map(s => s.run || '').join('\n');
  for (const command of ['npm ci', 'npm test', 'npm run typecheck', 'npm run lint', 'npm run build']) assert.ok(commands.includes(command));
});

test('PM2 targets only alamino, loopback 3100 and the persistent database', () => {
  const { apps } = require('../ecosystem.config.cjs');
  assert.equal(apps.length, 1);
  assert.equal(apps[0].name, 'alamino');
  assert.equal(apps[0].instances, 1);
  assert.equal(apps[0].interpreter, '/home/debian/.nvm/versions/node/v24.21.0/bin/node');
  assert.deepEqual(apps[0].args, ['start', '--hostname', '127.0.0.1', '--port', '3100']);
  assert.equal(apps[0].env.DATABASE_PATH, '/home/debian/alamino/data/app.db');
  assert.equal(apps[0].cwd, root);
});

test('SSH identity is pinned; deployment has rollback and online backup safeguards', () => {
  const ssh = fs.readFileSync(path.join(root, 'deploy/github-deploy.sh'), 'utf8');
  const release = fs.readFileSync(path.join(root, 'deploy/release.sh'), 'utf8');
  assert.ok(ssh.includes('StrictHostKeyChecking=yes'));
  assert.ok(ssh.includes('UserKnownHostsFile='));
  assert.ok(!ssh.includes('StrictHostKeyChecking=no'));
  assert.ok(release.includes('flock -n 9'));
  assert.ok(release.includes('--only alamino'));
  assert.ok(release.includes('.backup'));
  assert.ok(release.includes('trap - ERR INT TERM HUP EXIT'));
  assert.ok(release.includes('Current version changed; refusing a stale rollback.'));
  assert.ok(!/git (reset|clean)|pm2 (restart|reload|delete) all/.test(release));
});

# Automatic VPS deployment

Status: the repository contains the implementation; adding files locally does not activate GitHub Actions. Activation requires these files on `main`, SSH secrets, and the VPS prerequisites below. No live deployment is implied by local checks.

## What runs

`.github/workflows/deploy.yml` runs for pushes to `main` and manual dispatches. CI uses Node **24.21.0**, runs `npm ci`, deployment contract/syntax checks, `npm test`, typecheck, lint and build. No PayPal or AI secrets are supplied to CI. A separate deployment job requires successful CI and `refs/heads/main`; a manual dispatch on another branch never deploys.

Actions are pinned to full commit hashes. The deployment job uses the `preproduction` environment, `contents: read`, and a non-cancelling concurrency group. Up to 100 pending deployments can queue; an older job cannot replace a newer active commit. A VPS `flock` also prevents concurrent manual rollbacks or deployments.

## VPS prerequisites — once, via a trusted administrator session

The existing running app and its original `deploy/ecosystem.config.cjs` must remain available for the first rollback. Do not overwrite that existing configuration as part of bootstrap.

```bash
sudo apt-get update
sudo apt-get install -y git curl sqlite3 util-linux build-essential python3
sudo -iu debian
export PATH=/home/debian/.nvm/versions/node/v24.21.0/bin:$PATH
node --version                        # v24.21.0
command -v npm pm2
pm2 describe alamino
test -d /home/debian/alamino/.git
test -f /home/debian/alamino/.env.local
test -s /home/debian/alamino/data/app.db
test -s /home/debian/alamino/.next/BUILD_ID
test -f /home/debian/alamino/deploy/ecosystem.config.cjs
git -C /home/debian/alamino ls-remote https://github.com/donovan-ratefison/alamino.git refs/heads/main
```

`debian` must own the checkout and be able to write `.deploy/` and `data/backups/`. The existing PM2 daemon must belong to this user. An installation needing a native SQLite build uses the build tools above. Existing `.env.local` remains on the VPS; configure application keys there, including the public PayPal client ID and any AG Studio licence before building. Do not add server secrets to GitHub build variables or Git.

Nginx must already proxy this domain to `http://127.0.0.1:3100`, including `/api/health`, with a valid publicly trusted HTTPS certificate. This change does not edit Nginx, DNS, firewall rules or other PM2 applications. Disable caching for `/api/health` if your proxy/CDN caches API responses. Port 3100 need not be publicly exposed.

## SSH access and GitHub secrets

Create a dedicated deployment key on a trusted machine, without a passphrase for unattended use:

```bash
ssh-keygen -t ed25519 -f alamino-actions -C alamino-github-actions -N ''
```

Install only `alamino-actions.pub` in `/home/debian/.ssh/authorized_keys` using your existing administrator access. Prefix its line with `restrict` to disable forwarding and PTY access while allowing the deployment command. The `.ssh` directory should be mode 700 and `authorized_keys` mode 600. Keep the private key out of the repository and application directory.

**Verify server identity independently:** from the VPS provider's trusted console, obtain the host-key fingerprint:

```bash
sudo ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub
```

On the trusted machine, collect the corresponding public host key, then compare its fingerprint with that console value before using it:

```bash
ssh-keyscan -p 22 -t ed25519 YOUR_VPS_HOST > alamino-known-hosts
ssh-keygen -lf alamino-known-hosts
```

`ssh-keyscan` alone does not verify identity. For a nonstandard port, use that port; known-hosts records then use `[host]:port`. The host in the record must match `DEPLOY_HOST` exactly.

In **donovan-ratefison/alamino → Settings → Environments → preproduction → Secrets**, or repository **Actions secrets**, configure:

| Secret | Required value |
| --- | --- |
| `DEPLOY_HOST` | SSH hostname or IP of the VPS; not necessarily the public website hostname if a proxy/CDN is used. |
| `DEPLOY_PORT` | SSH port; optional, defaults to `22`. |
| `DEPLOY_SSH_KEY` | Full private key from `alamino-actions`, with its real newlines. |
| `DEPLOY_KNOWN_HOSTS` | The independently verified contents of `alamino-known-hosts`. |

The SSH user is fixed to `debian`. No GitHub token is required on the VPS for the public repository: fetching uses the explicit public HTTPS URL, without altering `origin`. Never paste private keys into logs or chat. Environment review rules, if configured, still apply to the deployment job.

## Release and verification

`deploy/release.sh` fetches the exact CI SHA and verifies it belongs to `main` history. It does not run `git pull`, `reset`, `clean`, or modify the original working tree. Each build goes into `/home/debian/alamino/.deploy/releases/<SHA>.<unique-id>` with links to the original `.env.local` and `data/`. It runs `npm ci --include=dev` and builds there with the VPS configuration. A failed install/build leaves the running process intact.

Before activation, SQLite's online backup creates a consistent backup including committed WAL data in `data/backups/`, then checks its integrity. The deployment switches `.deploy/current` atomically and loads that release's `deploy/ecosystem.config.cjs` with **`--only alamino`**. Only alamino is restarted. `pm2 save` persists the current process list for reboot; it does not restart other applications.

Health checks require HTTP 200 locally on port 3100 and via the HTTPS domain. `/api/health` checks database access and returns only status and the actual release SHA. It also rejects a mismatch between the running directory's release marker and PM2's SHA. The runner then independently checks HTTPS and the expected SHA. No certificate verification is disabled. Health responses are marked `no-store`.

On activation or health failure, the script restores the preceding code/configuration and rechecks it. A failed external runner check requests a rollback guarded by the failed SHA, so it cannot undo a newer deployment. Before the first managed release, the old working tree is the fallback; its root HTTP 200 is checked because the old app may not yet have `/api/health`.

## Manual rollback

Run on the VPS as `debian`:

```bash
bash /home/debian/alamino/.deploy/current/deploy/release.sh rollback
```

It uses the same lock, preserves `.env.local` and SQLite, and makes the replaced release the next rollback target. Optional `rollback FULL_CURRENT_SHA` refuses to roll back if the current version has changed. Scripts retain old releases and backups; monitor free disk space and remove obsolete versions only after identifying `.deploy/current` and `.deploy/previous`. The deployment never restores an old database automatically: doing so could discard new payments. Schema changes must remain backwards compatible; a database recovery requires a separate operator decision.

## Activation checklist

1. Merge these files into `main` and configure the verified SSH secrets and prerequisites above.
2. Open **Actions → Verify and deploy Alamino → Run workflow**, selecting **main**, or push to main.
3. Confirm both jobs are green and the expected commit is returned by `https://alamino.live-preprod.site/api/health`.
4. On the VPS, inspect `pm2 describe alamino`, `.deploy/current` and `.deploy/previous`. Verify the original `.env.local` and `data/app.db` are still the shared files.
5. Exercise a manual rollback during a suitable deployment window and redeploy the desired main SHA.

Until a real run and its health checks have been observed, automation remains **configured in code, not verified active**.

References: [GitHub concurrency](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency), [PM2 configuration](https://pm2.keymetrics.io/docs/usage/application-declaration/), [SQLite online backup](https://sqlite.org/backup.html).

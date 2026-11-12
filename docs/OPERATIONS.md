# Alamino VPS operations

The application runs as `debian` on `127.0.0.1:3100` behind Nginx and HTTPS at **https://alamino.live-preprod.site**. The shared VPS has other applications: Alamino deployment recreates only the PM2 registration named `alamino`.

## Verification and deployment

- [Verify and deploy](https://github.com/donovan-ratefison/alamino/actions/workflows/deploy.yml) runs for pull requests to `main`, pushes to `main` and manual dispatches.
- Deployment requires both unit/API/type/lint/build checks and the desktop/mobile browser suite. Pull requests do not deploy.
- Browser tests run against their own local SQLite database with simulated PayPal and AI fallback. Reports, screenshots and failure traces are retained for seven days in the Actions run.
- [Monitor preproduction](https://github.com/donovan-ratefison/alamino/actions/workflows/monitor.yml) checks HTTPS approximately every 15 minutes and can be run manually. It verifies HTTP 200, `no-store` and a valid release SHA. Transient failures retry before the job fails. GitHub schedule execution can be delayed; this is not a continuous uptime guarantee.
- The monitor needs no SSH or PayPal/AI secrets. A failed job appears in Actions; notification delivery follows each collaborator's GitHub notification preferences. No email, Slack or webhook integration is configured by these scripts.
- Dependabot proposes weekly npm and GitHub Actions updates. It does not merge them automatically.

An administrator can require the `verify` and `browser` checks in the `main` branch rules and disallow force pushes. Repository rules require GitHub administration access and are separate from the workflow's deployment gate.

## Initial operations installation

After the operations files have passed CI and are the current deployed release, run on the VPS:

```bash
sudo -iu debian
export PATH=/home/debian/.nvm/versions/node/v24.21.0/bin:$PATH
cd /home/debian/alamino
chmod 600 .env.local
bash .deploy/current/deploy/ops.sh backup
bash .deploy/current/deploy/ops.sh maintenance --dry-run
bash .deploy/current/deploy/ops.sh install-cron
```

The installer updates only the marked Alamino block in `debian`'s crontab and preserves other jobs and their settings. It is idempotent. It also creates `.deploy/operations` pointing at the verified release that supplies these scripts. Cron uses this stable pointer, so a rollback to application code without operations scripts does not stop backups. Healthy deployments refresh this pointer when the target contains operations scripts. The cron service must be active.

| Task | Schedule, in the VPS cron timezone |
| --- | --- |
| SQLite online backup and restore rehearsal | Minute 17, every six hours |
| Release/backup retention and log rotation | Minute 37, hourly |

Mutating operations acquire the same `.deploy/deploy.lock` as deployment and rollback. A scheduled operation skips when this lock is busy. It does not restart a process or replay a payment.

## Status, backups and restore verification

```bash
cd /home/debian/alamino
bash .deploy/current/deploy/ops.sh status
bash .deploy/current/deploy/ops.sh backup
bash .deploy/current/deploy/ops.sh verify-backup
bash .deploy/current/deploy/ops.sh verify-backup SNAPSHOT_FILENAME.db
```

`status` checks the expected SHA locally and through public HTTPS, reports current/previous release paths, the latest backup and available disk/memory. It never prints environment variables.

Scheduled backups are self-contained SQLite snapshots, including committed WAL contents. Each snapshot is checked before publication. A restore rehearsal copies it to a temporary database, checks its integrity there, and removes the temporary copy. It never replaces the live database. Files use private permissions and remain in `/home/debian/alamino/data/backups`.

Retention keeps 28 scheduled snapshots (about seven days at the normal frequency) and 10 backups made before deployments. Backup contents can include financial records; they are not published as GitHub artifacts.

These backups are on the **same VPS**. They do not protect against loss of that server. Off-server storage needs an operator-provided destination and credentials; no destination or remote backup success is invented.

Live database recovery is a separate operator decision: first preserve the newest database, stop only Alamino and account for SQLite WAL files. Do not replace `app.db` under a running process. Recovery can discard payments recorded after the chosen snapshot; code rollback never restores an older database automatically.

## Retention and logs

```bash
cd /home/debian/alamino
bash .deploy/current/deploy/ops.sh maintenance --dry-run
bash .deploy/current/deploy/ops.sh maintenance
tail -n 100 .deploy/logs/alamino-error.log
tail -n 100 .deploy/logs/operations.log
```

Cleanup keeps the three newest completed release directories **plus current, previous and the operations release**, even when those are older. It refuses missing/escaped release pointers and never removes the original checkout. Known incomplete build directories are eligible after 24 hours. Unknown directory names and symlinks are ignored.

PM2 writes to stable files in `.deploy/logs/`. Alamino's two process logs and the operations log rotate at 10 MiB when hourly maintenance runs; seven compressed archives per log are kept. Rotation uses copy/truncate to preserve PM2's descriptor, with a small window in which a log line can be lost. These logs are operational diagnostics, not an accounting audit ledger. Other PM2 applications and their logs are untouched.

## Application rollback

```bash
cd /home/debian/alamino
bash .deploy/current/deploy/release.sh rollback FULL_CURRENT_40_CHARACTER_SHA
bash .deploy/current/deploy/ops.sh status
```

The SHA guard refuses to undo a different, newer release. Rollback preserves `.env.local` and `data/app.db`. If an old release has no operations scripts, use `bash .deploy/operations/deploy/ops.sh status`; the stable operations pointer remains available. Do not run `pm2 restart all` or `pm2 kill` on this shared VPS.

## Reboot and HTTPS

```bash
systemctl is-enabled pm2-debian
systemctl show pm2-debian --property=ExecStart --property=User --property=PIDFile
systemctl is-active nginx
systemctl is-active cron
systemctl is-active certbot.timer
```

The existing `pm2-debian` unit uses the Node 24.21.0 PM2 installation and is enabled for boot. Deployment saves PM2's process list after a healthy activation. Checking this unit does not require restarting the shared daemon. No reboot is performed as part of Alamino deployment.

The existing Certbot timer renews the Nginx certificate. DNS, TLS and Nginx configuration are retained; sensitive PayPal and model calls stay on the backend. See [deployment setup and SSH secrets](DEPLOYMENT.md).

## Demo access

The hosted demo uses labelled simulated payments and AI fallback. Its `View as` selector is a demonstration profile switcher. Real Sandbox pay-ins/payouts and account analytics need the documented app credentials and an operator session. Do not publish the operator password or real payment credentials in an issue or the README.

The complete deployed business walkthrough, repeated twice by contributors, remains the separate acceptance check in [issue #12](https://github.com/donovan-ratefison/alamino/issues/12). Infrastructure health and isolated browser tests do not prove real PayPal/model access.

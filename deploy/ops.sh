#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
ROOT=/home/debian/alamino
NODE_BIN=/home/debian/.nvm/versions/node/v24.21.0/bin
export PATH="$NODE_BIN:$PATH"
export ALAMINO_ROOT="$ROOT"
[[ $(id -un) == debian ]] || { echo 'Run Alamino operations as debian.' >&2; exit 1; }
cd "$ROOT"
[[ -d .deploy && ! -L .deploy ]] || { echo 'Missing deployment state.' >&2; exit 1; }
case "${1:-status}" in
  backup|maintenance|verify-backup|install-cron)
    exec 9>.deploy/deploy.lock
    # A scheduled task must not race a deployment or a manual rollback.
    flock -n 9 || { echo 'Alamino deployment/maintenance in progress; skipped.'; exit 0; }
    ;;
esac
exec "$NODE_BIN/node" "$(dirname "$(readlink -f "$0")")/ops.cjs" "$@"

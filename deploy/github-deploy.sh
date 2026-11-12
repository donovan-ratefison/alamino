#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

: "${DEPLOY_HOST:?Configure the DEPLOY_HOST secret}"
: "${DEPLOY_SSH_KEY:?Configure the DEPLOY_SSH_KEY secret}"
: "${DEPLOY_KNOWN_HOSTS:?Configure the DEPLOY_KNOWN_HOSTS secret}"
: "${DEPLOY_SHA:?Missing verified commit SHA}"
[[ "$DEPLOY_SHA" =~ ^[0-9a-f]{40}$ ]] || { echo 'Invalid commit SHA' >&2; exit 1; }
[[ "$DEPLOY_HOST" =~ ^[A-Za-z0-9][A-Za-z0-9.:-]*$ ]] || { echo 'Invalid SSH host' >&2; exit 1; }
port=${DEPLOY_PORT:-22}
[[ "$port" =~ ^[0-9]{1,5}$ ]] && ((10#$port >= 1 && 10#$port <= 65535)) || { echo 'Invalid SSH port' >&2; exit 1; }
temporary=$(mktemp -d "${RUNNER_TEMP:-/tmp}/alamino-ssh.XXXXXX")
cleanup() { rm -f -- "$temporary/key" "$temporary/known_hosts" "$temporary/health.json"; rmdir -- "$temporary"; }
trap cleanup EXIT
printf '%s\n' "$DEPLOY_SSH_KEY" >"$temporary/key"
printf '%s\n' "$DEPLOY_KNOWN_HOSTS" >"$temporary/known_hosts"
unset DEPLOY_SSH_KEY DEPLOY_KNOWN_HOSTS
ssh-keygen -y -P '' -f "$temporary/key" >/dev/null
ssh_options=(-F /dev/null -T -i "$temporary/key" -p "$port" -l debian -o BatchMode=yes -o IdentitiesOnly=yes -o StrictHostKeyChecking=yes -o "UserKnownHostsFile=$temporary/known_hosts" -o GlobalKnownHostsFile=/dev/null -o ConnectTimeout=15 -o ServerAliveInterval=15 -o ServerAliveCountMax=8)
# Only a validated hexadecimal SHA is interpolated in the remote command.
deployment_status=0
ssh "${ssh_options[@]}" "$DEPLOY_HOST" "bash -s -- deploy $DEPLOY_SHA" <deploy/release.sh || deployment_status=$?
if ((deployment_status == 20)); then echo 'Skipped stale deployment: a newer commit is already active.'; exit 0; fi
if ((deployment_status != 0)); then exit "$deployment_status"; fi
healthy=0
for ((attempt=1; attempt<=12; attempt++)); do
  code=$(curl --disable --proto '=https' --silent --show-error --output "$temporary/health.json" --write-out '%{http_code}' --connect-timeout 3 --max-time 5 -H 'Cache-Control: no-cache' "https://alamino.live-preprod.site/api/health?deployment=$DEPLOY_SHA") || code=000
  if [[ "$code" == 200 ]] && python3 -c 'import json,sys; d=json.load(open(sys.argv[1])); sys.exit(0 if d.get("status")=="ok" and d.get("commit")==sys.argv[2] else 1)' "$temporary/health.json" "$DEPLOY_SHA"; then healthy=1; break; fi
  sleep 2
done
if ((healthy == 0)); then
  echo 'External HTTPS verification failed; requesting a guarded rollback.' >&2
  ssh "${ssh_options[@]}" "$DEPLOY_HOST" "bash -s -- rollback $DEPLOY_SHA" <deploy/release.sh || echo 'Automatic rollback failed or the active commit changed. Check the VPS.' >&2
  exit 1
fi
echo "Verified deployment $DEPLOY_SHA on https://alamino.live-preprod.site"

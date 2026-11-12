#!/usr/bin/env bash
# Executed as debian. Never checks out or cleans the live working tree.
set -Eeuo pipefail
umask 077

ROOT=${ALAMINO_ROOT:-/home/debian/alamino}
NODE_BIN=${ALAMINO_NODE_BIN:-/home/debian/.nvm/versions/node/v24.21.0/bin}
REPOSITORY=${ALAMINO_REPOSITORY:-https://github.com/donovan-ratefison/alamino.git}
PUBLIC_URL=https://alamino.live-preprod.site
export PATH="$NODE_BIN:$PATH"
export GIT_TERMINAL_PROMPT=0
MODE=${1:-}
SHA=${2:-}
STATE="$ROOT/.deploy"
RELEASES="$STATE/releases"
switched=0
old=''

die() { printf 'Deployment error: %s\n' "$*" >&2; exit 1; }
[[ "$MODE" == deploy || "$MODE" == rollback ]] || die 'Use: release.sh deploy <40-character SHA> | rollback [expected-current-SHA]'
[[ -d "$ROOT/.git" && -f "$ROOT/.env.local" && -s "$ROOT/data/app.db" ]] || die 'Existing checkout, .env.local and data/app.db are required.'
[[ $(id -un) == debian || ${ALAMINO_TEST_MODE:-0} == 1 ]] || die 'Run as debian, not root.'
for tool in git curl flock sqlite3 node npm pm2; do command -v "$tool" >/dev/null || die "Missing prerequisite: $tool"; done
[[ $(node --version) == v24.21.0 || ${ALAMINO_TEST_MODE:-0} == 1 ]] || die 'Expected Node v24.21.0.'
mkdir -p "$RELEASES" "$ROOT/data/backups"
exec 9>"$STATE/deploy.lock"
flock -n 9 || die 'Another deployment or rollback is running.'

valid_release() {
  local target
  target=$(realpath -e -- "$1") || return 1
  [[ "$target" == "$ROOT" || "$target" == "$RELEASES/"* ]] &&
    [[ -f "$target/deploy/ecosystem.config.cjs" && -s "$target/.next/BUILD_ID" ]]
}
point() {
  local name=$1 target=$2 temporary="$STATE/$1.tmp.$$.$RANDOM"
  [[ ! -e "$STATE/$name" || -L "$STATE/$name" ]] || die "Refusing to replace a non-symlink: $name"
  ln -s -- "$target" "$temporary"
  mv -Tf -- "$temporary" "$STATE/$name"
}
activate() {
  local target=$1 commit=unmanaged
  if [[ -f "$target/.deploy-sha" ]]; then commit=$(cat "$target/.deploy-sha"); fi
  # Close the deployment lock in PM2 and its daemon, so it cannot retain the lock.
  (trap - ERR; cd "$target"; ALAMINO_DEPLOY_SHA="$commit" pm2 startOrReload "$target/deploy/ecosystem.config.cjs" --only alamino --update-env 9>&-)
}
health() {
  local target=$1 expected='' endpoint=/ response code url attempt
  if [[ -f "$target/.deploy-sha" ]]; then expected=$(cat "$target/.deploy-sha"); endpoint="/api/health?deployment=$expected"; fi
  response=$(mktemp "$STATE/health.XXXXXX")
  for url in "http://127.0.0.1:3100$endpoint" "$PUBLIC_URL$endpoint"; do
    for ((attempt=1; attempt<=20; attempt++)); do
      code=$(curl --disable --proto '=http,https' --noproxy '*' --silent --show-error --output "$response" --write-out '%{http_code}' --connect-timeout 2 --max-time 4 -H 'Cache-Control: no-cache' "$url") || code=000
      if [[ "$code" == 200 ]]; then
        if [[ -z "$expected" ]] || node -e 'const fs=require("node:fs");try{const j=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));process.exit(j.status==="ok"&&j.commit===process.argv[2]?0:1)}catch{process.exit(1)}' "$response" "$expected"; then break; fi
      fi
      sleep 2
    done
    if ((attempt > 20)); then rm -f -- "$response"; return 1; fi
  done
  rm -f -- "$response"
}
restore_on_failure() {
  local code=${1:-$?}
  trap - ERR INT TERM HUP EXIT
  set +e
  if ((switched)); then
    printf 'Activation failed; restoring the preceding application version.\n' >&2
    point current "$old"
    if activate "$old" && health "$old"; then pm2 save 9>&-; else printf 'ROLLBACK FAILED: inspect alamino immediately.\n' >&2; fi
  fi
  exit "$code"
}
trap 'restore_on_failure $?' ERR
trap 'restore_on_failure 130' INT
trap 'restore_on_failure 143' TERM HUP
trap 'code=$?; if ((code != 0 && switched)); then restore_on_failure "$code"; fi' EXIT

if [[ -L "$STATE/current" ]]; then old=$(realpath -e "$STATE/current"); else old=$ROOT; fi
valid_release "$old" || die 'Cannot identify a runnable previous version; retain the existing PM2 config and .next build.'

if [[ "$MODE" == deploy ]]; then
  [[ "$SHA" =~ ^[0-9a-f]{40}$ ]] || die 'A full, verified commit SHA is required.'
  # Fetch both the branch and the exact object, without changing HEAD or local files.
  git -C "$ROOT" fetch --no-tags "$REPOSITORY" '+refs/heads/main:refs/remotes/alamino-deploy/main' "$SHA"
  [[ $(git -C "$ROOT" rev-parse "$SHA^{commit}") == "$SHA" ]] || die 'Commit object mismatch.'
  git -C "$ROOT" merge-base --is-ancestor "$SHA" refs/remotes/alamino-deploy/main || die 'Commit is not in main history.'
  if [[ -f "$old/.deploy-sha" ]]; then
    current_sha=$(cat "$old/.deploy-sha")
    if [[ "$SHA" != "$current_sha" ]] && git -C "$ROOT" merge-base --is-ancestor "$SHA" "$current_sha"; then
      printf 'Skipping stale deployment: a newer validated commit is already active.\n'
      exit 20
    fi
  fi
  target=$(mktemp -d "$RELEASES/$SHA.XXXXXX")
  git -C "$ROOT" archive "$SHA" | tar -x -C "$target"
  [[ ! -e "$target/.env.local" && ! -L "$target/.env.local" && ! -e "$target/data" && ! -L "$target/data" ]] || die 'Persistent paths must not be tracked in Git.'
  ln -s -- "$ROOT/.env.local" "$target/.env.local"
  ln -s -- "$ROOT/data" "$target/data"
  [[ -f "$target/deploy/ecosystem.config.cjs" && -f "$target/src/app/api/health/route.ts" ]] || die 'Commit does not contain the deployment configuration and health route.'
  (trap - ERR; cd "$target"; npm ci --include=dev; DATABASE_PATH="$ROOT/data/app.db" npm run build)
  [[ -s "$target/.next/BUILD_ID" ]] || die 'Build output is missing.'
  printf '%s\n' "$SHA" >"$target/.deploy-sha"
  backup="$ROOT/data/backups/pre-$SHA-$(date -u +%Y%m%dT%H%M%SZ)-$$.db"
  # Online SQLite backup includes committed WAL contents; copying app.db alone is unsafe.
  sqlite3 -readonly "$ROOT/data/app.db" '.timeout 10000' ".backup '$backup'"
  [[ $(sqlite3 -readonly "$backup" 'PRAGMA quick_check;') == ok ]] || die 'SQLite backup verification failed.'
else
  [[ -L "$STATE/previous" ]] || die 'No previous version recorded.'
  if [[ -n "$SHA" ]]; then
    [[ "$SHA" =~ ^[0-9a-f]{40}$ && -f "$old/.deploy-sha" && $(cat "$old/.deploy-sha") == "$SHA" ]] || die 'Current version changed; refusing a stale rollback.'
  fi
  target=$(realpath -e "$STATE/previous")
  valid_release "$target" || die 'Previous release is not runnable.'
fi

switched=1
point current "$target"
activate "$target"
health "$target"
pm2 save 9>&-
point previous "$old"
switched=0
printf 'Alamino %s successful. Active version: %s\n' "$MODE" "$target"

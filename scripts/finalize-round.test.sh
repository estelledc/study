#!/usr/bin/env bash

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$ROOT/scripts/lib/publish-main.sh"

TMP_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/study-finalize-test.XXXXXX")"
REMOTE="$TMP_ROOT/origin.git"
PUBLISHER="$TMP_ROOT/publisher"
INTRUDER="$TMP_ROOT/intruder"
OUTPUT="$TMP_ROOT/publish.out"
trap 'rm -rf "$TMP_ROOT"' EXIT

git init --bare "$REMOTE" >/dev/null
git clone "$REMOTE" "$PUBLISHER" >/dev/null 2>&1
git -C "$PUBLISHER" config user.name "Study Test"
git -C "$PUBLISHER" config user.email "study-test@example.invalid"
printf 'initial\n' > "$PUBLISHER/README.md"
git -C "$PUBLISHER" add README.md
git -C "$PUBLISHER" commit -m initial >/dev/null
git -C "$PUBLISHER" branch -M main
git -C "$PUBLISHER" push -u origin main >/dev/null 2>&1
git --git-dir="$REMOTE" symbolic-ref HEAD refs/heads/main

commit_readme() {
  local repo="$1"
  local message="$2"
  printf '%s\n' "$message" >> "$repo/README.md"
  git -C "$repo" add README.md
  git -C "$repo" commit -m "$message" >/dev/null
  git -C "$repo" rev-parse HEAD
}

expect_publish_exit() {
  local expected_exit="$1"
  local repo="$2"
  local expected_sha="$3"
  local verifier="$4"
  local allowed_identity="${5:-file:$REMOTE}"
  local status
  set +e
  publish_main "$repo" "$expected_sha" "$verifier" origin main "$allowed_identity" >"$OUTPUT" 2>&1
  status=$?
  set -e
  if [[ "$status" -ne "$expected_exit" ]]; then
    echo "expected publish exit $expected_exit, got $status" >&2
    sed -n '1,160p' "$OUTPUT" >&2
    exit 1
  fi
}

expect_transport_rejected() {
  local actual_exit="$1"
  local label="$2"
  if [[ "$actual_exit" -ne 40 ]] || [[ "$PUBLISH_FAILURE_STAGE" != transport-policy ]]; then
    echo "$label bypassed transport policy: exit=$actual_exit stage=${PUBLISH_FAILURE_STAGE:-<empty>}" >&2
    sed -n '1,160p' "$OUTPUT" >&2
    exit 1
  fi
}

# Success requires exact remote SHA proof.
SUCCESS_HEAD="$(commit_readme "$PUBLISHER" success)"
PUBLISH_TRACE="$TMP_ROOT/publish.trace"
GIT_TRACE="$PUBLISH_TRACE" publish_main \
  "$PUBLISHER" "$SUCCESS_HEAD" "$ROOT/scripts/lib/verify-remote-head.mjs" origin main "file:$REMOTE" \
  >"$OUTPUT" 2>&1
[[ "$PUBLISH_PUSH_SENT" == true ]]
[[ "$PUBLISH_REMOTE_SHA" == "$SUCCESS_HEAD" ]]
[[ "$(git ls-remote --refs "$REMOTE" refs/heads/main | cut -f1)" == "$SUCCESS_HEAD" ]]
[[ "$(rg -c -- '-c http.followRedirects=false (fetch|push|ls-remote)' "$PUBLISH_TRACE")" -ge 3 ]]

# A diverged remote fails before push; no rebase or retry changes local HEAD.
LOCAL_DIVERGED_HEAD="$(commit_readme "$PUBLISHER" local-diverged)"
git clone "$REMOTE" "$INTRUDER" >/dev/null 2>&1
git -C "$INTRUDER" config user.name "Study Test"
git -C "$INTRUDER" config user.email "study-test@example.invalid"
REMOTE_DIVERGED_HEAD="$(commit_readme "$INTRUDER" remote-diverged)"
git -C "$INTRUDER" push origin main >/dev/null 2>&1
expect_publish_exit 42 "$PUBLISHER" "$LOCAL_DIVERGED_HEAD" "$ROOT/scripts/lib/verify-remote-head.mjs"
[[ "$PUBLISH_FAILURE_STAGE" == non-fast-forward ]]
[[ "$PUBLISH_PUSH_SENT" == false ]]
[[ "$(git -C "$PUBLISHER" rev-parse HEAD)" == "$LOCAL_DIVERGED_HEAD" ]]
[[ "$(git ls-remote --refs "$REMOTE" refs/heads/main | cut -f1)" == "$REMOTE_DIVERGED_HEAD" ]]

# A server-side rejection fails once and preserves the local commit.
git -C "$PUBLISHER" reset --hard FETCH_HEAD >/dev/null
REJECTED_HEAD="$(commit_readme "$PUBLISHER" rejected)"
printf '#!/usr/bin/env bash\nexit 1\n' > "$REMOTE/hooks/pre-receive"
chmod +x "$REMOTE/hooks/pre-receive"
expect_publish_exit 43 "$PUBLISHER" "$REJECTED_HEAD" "$ROOT/scripts/lib/verify-remote-head.mjs"
[[ "$PUBLISH_FAILURE_STAGE" == push ]]
[[ "$PUBLISH_PUSH_SENT" == false ]]
[[ "$(git -C "$PUBLISHER" rev-parse HEAD)" == "$REJECTED_HEAD" ]]
rm -f "$REMOTE/hooks/pre-receive"

# A successful push followed by an unverifiable remote is not success.
printf 'process.exit(1);\n' > "$TMP_ROOT/reject-verification.mjs"
expect_publish_exit 44 "$PUBLISHER" "$REJECTED_HEAD" "$TMP_ROOT/reject-verification.mjs"
[[ "$PUBLISH_FAILURE_STAGE" == remote-head ]]
[[ "$PUBLISH_PUSH_SENT" == true ]]
[[ "$PUBLISH_REMOTE_SHA" == "" ]]

# Fetch/network failures are terminal and leave the local commit untouched.
mv "$REMOTE" "$REMOTE.offline"
expect_publish_exit 41 "$PUBLISHER" "$REJECTED_HEAD" "$ROOT/scripts/lib/verify-remote-head.mjs"
[[ "$PUBLISH_FAILURE_STAGE" == fetch ]]
[[ "$PUBLISH_PUSH_SENT" == false ]]
[[ "$(git -C "$PUBLISHER" rev-parse HEAD)" == "$REJECTED_HEAD" ]]
mv "$REMOTE.offline" "$REMOTE"

# Transport policy is fail-closed before any network operation.
git -C "$PUBLISHER" config http.sslVerify false
expect_publish_exit 40 "$PUBLISHER" "$REJECTED_HEAD" "$ROOT/scripts/lib/verify-remote-head.mjs" "file:$REMOTE"
[[ "$PUBLISH_FAILURE_STAGE" == transport-policy ]]
git -C "$PUBLISHER" config --unset http.sslVerify

set +e
GIT_SSL_NO_VERIFY=1 publish_main \
  "$PUBLISHER" "$REJECTED_HEAD" "$ROOT/scripts/lib/verify-remote-head.mjs" origin main "file:$REMOTE" \
  >"$OUTPUT" 2>&1
TLS_ENV_STATUS=$?
set -e
expect_transport_rejected "$TLS_ENV_STATUS" GIT_SSL_NO_VERIFY

# Git command-scope config environment must not bypass transport policy.
TLS_CONFIG_KEY='http.sslVerify'
set +e
GIT_CONFIG_COUNT=1 \
  GIT_CONFIG_KEY_0="$TLS_CONFIG_KEY" \
  GIT_CONFIG_VALUE_0=false \
  publish_main \
    "$PUBLISHER" "$REJECTED_HEAD" "$ROOT/scripts/lib/verify-remote-head.mjs" origin main "file:$REMOTE" \
    >"$OUTPUT" 2>&1
TLS_COUNT_STATUS=$?
set -e
expect_transport_rejected "$TLS_COUNT_STATUS" GIT_CONFIG_COUNT

set +e
GIT_CONFIG_PARAMETERS="'${TLS_CONFIG_KEY}=false'" \
  publish_main \
    "$PUBLISHER" "$REJECTED_HEAD" "$ROOT/scripts/lib/verify-remote-head.mjs" origin main "file:$REMOTE" \
    >"$OUTPUT" 2>&1
TLS_PARAMETERS_STATUS=$?
set -e
expect_transport_rejected "$TLS_PARAMETERS_STATUS" GIT_CONFIG_PARAMETERS

SYSTEM_CONFIG="$TMP_ROOT/system.gitconfig"
git config --file "$SYSTEM_CONFIG" "$TLS_CONFIG_KEY" false
set +e
GIT_CONFIG_SYSTEM="$SYSTEM_CONFIG" GIT_CONFIG_GLOBAL=/dev/null \
  publish_main \
    "$PUBLISHER" "$REJECTED_HEAD" "$ROOT/scripts/lib/verify-remote-head.mjs" origin main "file:$REMOTE" \
    >"$OUTPUT" 2>&1
TLS_SYSTEM_STATUS=$?
set -e
expect_transport_rejected "$TLS_SYSTEM_STATUS" GIT_CONFIG_SYSTEM

set +e
GIT_CONFIG_NOSYSTEM=1 \
  publish_main \
    "$PUBLISHER" "$REJECTED_HEAD" "$ROOT/scripts/lib/verify-remote-head.mjs" origin main "file:$REMOTE" \
    >"$OUTPUT" 2>&1
TLS_NOSYSTEM_STATUS=$?
set -e
expect_transport_rejected "$TLS_NOSYSTEM_STATUS" GIT_CONFIG_NOSYSTEM

GLOBAL_CONFIG="$TMP_ROOT/global.gitconfig"
GIT_CONFIG_GLOBAL="$GLOBAL_CONFIG" git config --global http.sslVerify false
set +e
GIT_CONFIG_GLOBAL="$GLOBAL_CONFIG" publish_main \
  "$PUBLISHER" "$REJECTED_HEAD" "$ROOT/scripts/lib/verify-remote-head.mjs" origin main "file:$REMOTE" \
  >"$OUTPUT" 2>&1
TLS_GLOBAL_STATUS=$?
set -e
expect_transport_rejected "$TLS_GLOBAL_STATUS" GIT_CONFIG_GLOBAL

# A different push URL is a repository-identity redirect and is rejected.
ATTACKER_REMOTE="$TMP_ROOT/attacker.git"
git init --bare "$ATTACKER_REMOTE" >/dev/null
git -C "$PUBLISHER" remote set-url --add --push origin "$ATTACKER_REMOTE"
expect_publish_exit 40 "$PUBLISHER" "$REJECTED_HEAD" "$ROOT/scripts/lib/verify-remote-head.mjs" "file:$REMOTE"
[[ "$PUBLISH_FAILURE_STAGE" == remote-identity ]]
git -C "$PUBLISHER" config --unset-all remote.origin.pushurl

# A verifier that moves local HEAD after the push must be caught by the final CAS.
DRIFT_HEAD="$(commit_readme "$PUBLISHER" drift-source)"
cat > "$TMP_ROOT/drift-verifier.mjs" <<'EOF'
import { execFileSync } from 'node:child_process';
const repo = process.argv[process.argv.indexOf('--repo') + 1];
execFileSync('git', ['commit', '--allow-empty', '-m', 'concurrent drift'], { cwd: repo });
EOF
expect_publish_exit 45 "$PUBLISHER" "$DRIFT_HEAD" "$TMP_ROOT/drift-verifier.mjs" "file:$REMOTE"
[[ "$PUBLISH_FAILURE_STAGE" == local-head-drift ]]
[[ "$PUBLISH_REMOTE_SHA" == "" ]]

# Dry-run may describe network commands but must not execute any of them.
TRACE_FILE="$TMP_ROOT/git.trace"
DRY_OUTPUT="$TMP_ROOT/dry-run.out"
GIT_TRACE="$TRACE_FILE" PUBLISH_ALLOWED_IDENTITY=attacker.invalid/repository \
  DRY_RUN=1 PUSH_REMOTE=1 SYNC_WORKTREES=0 \
  bash "$ROOT/scripts/finalize-round.sh" >"$DRY_OUTPUT" 2>&1
if rg -q " (fetch|push|ls-remote)( |')" "$TRACE_FILE"; then
  echo "dry-run executed a network Git command" >&2
  sed -n '1,160p' "$TRACE_FILE" >&2
  exit 1
fi
rg -q "DRY RUN COMPLETE" "$DRY_OUTPUT"
rg -q "github.com/estelledc/study" "$DRY_OUTPUT"
if rg -q "attacker.invalid" "$DRY_OUTPUT"; then
  echo "environment overrode the canonical publication identity" >&2
  exit 1
fi

# Static safety assertions guard against reintroducing the legacy bypass/retry.
TLS_KEY='sslVerify'
TLS_DISABLED_PATTERN="${TLS_KEY}=false"
if rg -q "$TLS_DISABLED_PATTERN|rebase origin/main|cherry-pick.*theirs|DONE" \
    "$ROOT/scripts/finalize-round.sh" \
    "$ROOT/scripts/lib/publish-main.sh" \
    "$ROOT/scripts/sync-and-merge-single.mjs"; then
  echo "legacy publish or merge bypass returned" >&2
  exit 1
fi

echo "finalize-round publish tests: PASS"

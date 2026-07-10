#!/usr/bin/env bash

# Fail-closed publication helper for finalize-round.sh. The caller must run it
# in the foreground and stop before syncing worktrees when it returns non-zero.
# shellcheck disable=SC2034 # Status variables are the function's caller-facing result.

PUBLISH_FAILURE_STAGE=""
PUBLISH_REMOTE_SHA=""
PUBLISH_PUSH_SENT=false

publish_tls_disabled_in_scope() {
  local repo="$1"
  local scope="$2"
  local key value
  while read -r key value; do
    [[ -n "${key:-}" ]] || continue
    case "${value,,}" in
      false|no|off|0) return 0 ;;
    esac
  done < <(git -C "$repo" config "$scope" --get-regexp '^http(\..*)?\.ssl[Vv]erify$' 2>/dev/null || true)
  return 1
}

publish_git_config_environment_present() {
  local variable_name
  while IFS= read -r variable_name; do
    [[ -n "$variable_name" ]] && return 0
  done < <(compgen -A variable GIT_CONFIG || true)
  return 1
}

publish_effective_tls_disabled() {
  local repo="$1"
  local output command_status key value
  output="$(git -C "$repo" -c http.followRedirects=false \
    config --get-regexp '^http(\..*)?\.ssl[Vv]erify$' 2>/dev/null)"
  command_status=$?
  if [[ "$command_status" -eq 1 ]]; then
    return 1
  fi
  if [[ "$command_status" -ne 0 ]]; then
    return 2
  fi
  while read -r key value; do
    [[ -n "${key:-}" ]] || continue
    case "${value,,}" in
      false|no|off|0) return 0 ;;
    esac
  done <<< "$output"
  return 1
}

assert_publish_transport_policy() {
  local repo="$1"
  if [[ "${GIT_SSL_NO_VERIFY+x}" == x ]]; then
    echo "ERROR: GIT_SSL_NO_VERIFY must be unset for publication" >&2
    return 1
  fi
  if publish_git_config_environment_present; then
    echo "ERROR: GIT_CONFIG* environment injection is not allowed for publication" >&2
    return 1
  fi
  if publish_tls_disabled_in_scope "$repo" --local; then
    echo "ERROR: repository Git config disables TLS verification" >&2
    return 1
  fi
  if publish_tls_disabled_in_scope "$repo" --global; then
    echo "ERROR: global Git config disables TLS verification" >&2
    return 1
  fi
  if publish_effective_tls_disabled "$repo"; then
    echo "ERROR: effective Git config disables TLS verification" >&2
    return 1
  else
    local effective_status=$?
    if [[ "$effective_status" -eq 2 ]]; then
      echo "ERROR: effective Git TLS configuration could not be verified" >&2
      return 1
    fi
  fi
  return 0
}

assert_publish_head() {
  local repo="$1"
  local expected_sha="$2"
  local actual_sha
  if ! actual_sha="$(git -C "$repo" rev-parse --verify 'HEAD^{commit}')" ||
     [[ "$actual_sha" != "$expected_sha" ]]; then
    echo "ERROR: local HEAD drifted from the publication object $expected_sha" >&2
    return 1
  fi
  return 0
}

verify_publish_remote_identity() {
  local repo="$1"
  local remote="$2"
  local allowed_identity="$3"
  local helper_dir identity_helper
  helper_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  identity_helper="$helper_dir/verify-remote-head.mjs"
  node "$identity_helper" \
    --repo "$repo" \
    --remote "$remote" \
    --allowed-identity "$allowed_identity" \
    --identity-only >/dev/null
}

publish_main() {
  local repo="$1"
  local expected_sha="$2"
  local verify_script="$3"
  local remote="${4:-origin}"
  local branch="${5:-main}"
  local allowed_identity="${6:-}"
  local local_head fetched_head

  PUBLISH_FAILURE_STAGE=""
  PUBLISH_REMOTE_SHA=""
  PUBLISH_PUSH_SENT=false

  if [[ ! "$expected_sha" =~ ^[0-9a-f]{40}$ ]]; then
    PUBLISH_FAILURE_STAGE="local-head"
    echo "ERROR: publish expected HEAD must be a full 40-character SHA" >&2
    return 40
  fi
  if [[ ! "$remote" =~ ^[A-Za-z0-9][A-Za-z0-9._-]*$ ]] ||
     [[ ! "$branch" =~ ^[A-Za-z0-9][A-Za-z0-9._/-]*$ ]] ||
     [[ "$branch" == *..* ]] || [[ "$branch" == */ ]]; then
    PUBLISH_FAILURE_STAGE="arguments"
    echo "ERROR: publish remote or branch is invalid" >&2
    return 40
  fi
  if [[ -z "$allowed_identity" ]]; then
    PUBLISH_FAILURE_STAGE="remote-identity"
    echo "ERROR: publish requires a canonical repository identity allowlist" >&2
    return 40
  fi

  if ! assert_publish_transport_policy "$repo"; then
    PUBLISH_FAILURE_STAGE="transport-policy"
    return 40
  fi

  if ! verify_publish_remote_identity "$repo" "$remote" "$allowed_identity"; then
    PUBLISH_FAILURE_STAGE="remote-identity"
    echo "ERROR: fetch/push URLs do not resolve to the allowlisted repository" >&2
    return 40
  fi

  if ! local_head="$(git -C "$repo" rev-parse --verify 'HEAD^{commit}')" ||
     [[ "$local_head" != "$expected_sha" ]] ||
     ! assert_publish_head "$repo" "$expected_sha"; then
    PUBLISH_FAILURE_STAGE="local-head"
    echo "ERROR: local HEAD changed before publish" >&2
    return 40
  fi

  echo "[publish] fetch $remote/$branch with normal transport verification"
  if ! git -C "$repo" -c http.followRedirects=false fetch --no-tags "$remote" "$branch"; then
    PUBLISH_FAILURE_STAGE="fetch"
    echo "ERROR: fetch failed; check TLS, network, and authentication, then retry explicitly" >&2
    return 41
  fi
  if ! fetched_head="$(git -C "$repo" rev-parse --verify 'FETCH_HEAD^{commit}')"; then
    PUBLISH_FAILURE_STAGE="fetch"
    echo "ERROR: fetch completed without a verifiable remote commit" >&2
    return 41
  fi

  if ! git -C "$repo" merge-base --is-ancestor "$fetched_head" "$expected_sha"; then
    PUBLISH_FAILURE_STAGE="non-fast-forward"
    echo "ERROR: local HEAD is not based on the fetched remote HEAD; no automatic rebase was attempted" >&2
    return 42
  fi
  if ! assert_publish_head "$repo" "$expected_sha"; then
    PUBLISH_FAILURE_STAGE="local-head-drift"
    return 45
  fi

  echo "[publish] push exact local HEAD to $remote/$branch"
  if ! git -C "$repo" -c http.followRedirects=false push --porcelain --no-follow-tags \
      "$remote" "$expected_sha:refs/heads/$branch"; then
    PUBLISH_FAILURE_STAGE="push"
    echo "ERROR: push was rejected; local commit is preserved and no retry/rebase was attempted" >&2
    return 43
  fi
  PUBLISH_PUSH_SENT=true

  if ! verify_publish_remote_identity "$repo" "$remote" "$allowed_identity"; then
    PUBLISH_FAILURE_STAGE="remote-identity"
    echo "ERROR: remote identity changed during publication" >&2
    return 40
  fi

  echo "[publish] verify remote full SHA"
  if ! node "$verify_script" \
    --repo "$repo" \
    --remote "$remote" \
    --branch "$branch" \
    --expected "$expected_sha" \
    --allowed-identity "$allowed_identity"; then
    PUBLISH_FAILURE_STAGE="remote-head"
    echo "ERROR: push returned but the remote HEAD could not be proven; do not sync worktrees" >&2
    return 44
  fi

  if ! assert_publish_head "$repo" "$expected_sha"; then
    PUBLISH_FAILURE_STAGE="local-head-drift"
    echo "ERROR: remote was updated, but local HEAD moved before success could be recorded" >&2
    return 45
  fi

  PUBLISH_REMOTE_SHA="$expected_sha"
  return 0
}

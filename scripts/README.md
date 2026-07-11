# Study Pipeline Scripts

This directory owns the local content pipeline for `explorations/study`.

Current policy: bulk content production and direct `main` publication are disabled. This document explains bounded maintenance primitives; it does not authorize a round, push, merge, deployment, or edits to existing note bodies. The canonical policy is `docs/operations-index.md` plus `data/operations-policy.json`.

The historical `*-audit-*` batch helpers merged with the completed corpus audit are also disabled by the same policy. Their `data/audit-reviews/**` files remain legacy qualitative observations, not `study-review-receipt-v1` evidence, and cannot upgrade a note to VERIFIED. Do not rebuild the pool, claim another audit batch, prepare reviewer contexts, or finalize an audit round without a future operation-bound single-use approval mechanism.

## Queue State

Main queue files:

- `data/candidates.jsonl`: new-note candidates.
- `data/rewrite-pool.jsonl`: rewrite candidates from existing notes.
- `data/priority-queue.jsonl`: optional high-priority candidates.
- `data/graveyard.jsonl`: permanently excluded slugs.

Common statuses:

- `queued`: available for new-note dispatch.
- `available`: available for rewrite dispatch.
- `claimed`: assigned to a worktree; finish or recover before opening a large new batch.
- `written`: already merged into the docs tree.
- `failed`: attempted and failed; inspect `data/pipeline-events.jsonl`.
- `blacklisted`: excluded by red-line or policy filters.

Queue transaction commit and recovery share one POSIX advisory lock through the bundled `scripts/lib/queue-lock.py` helper. Supported macOS/Linux operation therefore requires `python3` with the standard `fcntl` module. Node keeps the inherited lock file descriptor open for the entire critical section, so a helper crash cannot drop the lock early and a parent crash is released by the kernel without PID-file takeover. The ignored `data/.queue-transaction.guard` inode is persistent and must not be deleted while a pipeline process is running.

## Fast Checks

Run the script-level gate before refactoring:

```bash
npm run verify:scripts
```

Run the pipeline rehearsal gate before pilot work:

```bash
npm run verify:pipeline
```

`verify:pipeline` includes script tests, zero-case dispatch checks, worktree doctor, prompt portability tests, pipeline summary, and dry-run finalize/merge shell checks. It intentionally does not run `npm run build`; run the build as the final milestone gate.

For portable PR and Pages verification, run the shared fail-closed contract:

```bash
npm run verify:ci
```

Run the warning-strict build gate:

```bash
npm run build:strict
```

`build:strict` runs the normal Astro build, writes a `/tmp/study-build-*.log`, and fails if the log contains `[WARN]`, `Warning`, or `warning`.

## Worktrees

Check the 8 canonical worktrees:

```bash
npm run doctor:worktrees
node scripts/worktree-doctor.mjs --json
node scripts/worktree-doctor.mjs --fix --dry-run
```

Only `--fix` creates missing worktrees. It refuses dirty, mismatched, or otherwise surprising existing worktrees.

## 4-NEW Small Round Flow (disabled by default)

These commands are available only after explicit authorization of one bounded round. The current repository policy does not authorize running them. A permitted four-item NEW-only round keeps rewrite entries untouched, does not push, and stops on the first failing NoteId or stage.

Preflight before opening the round:

```bash
npm run round:preflight -- --rewrite 0 --new 4
```

Preflight and dispatch now validate the selected candidate metadata before any queue state is claimed. Project candidates must have stars in `meta.col3` and a value description in `meta.col4`; paper candidates must have a 4-digit year in `meta.col3` and a value description in `meta.col4`.

Claim the four candidates. The command first performs the same dry-run and then commits only queue runtime state:

```bash
npm run round:dispatch -- --rewrite 0 --new 4 --round <n>
```

After each worker creates and commits exactly one note, merge one slug at a time:

```bash
npm run round:merge-one -- \
  --slug <slug> --area papers|projects --commit <hash> --lines <count> --round <n> \
  --worktree <assignment-worktree> --branch <assignment-branch> \
  --generation <claim-generation> --claim-token <claim-token>
```

`round:merge-one` acquires the round owner lock and proves that the commit is the current HEAD of the worktree/branch declared by the active `area::slug` claim for that round and generation. Unknown, stale, or token-mismatched sources fail closed. Before cherry-pick it also requires a current review receipt; the source worktree may contain only that receipt and its referenced evidence, and `ACTUAL_RUN` evidence must be staged. The verified bytes are added to the same canonical note commit under an exact companion allowlist and re-verified before any queue row can become `written`. It then records status snapshots, re-runs the target quality gate, runs `build:strict`, commits atlas changes with `chore: 更新 <slug> 索引`, runs `sync-written` plus incremental rewrite-pool rebuild, and commits runtime changes with `chore: 同步 <slug> 写入状态`.

Finish the local round:

```bash
npm run round:final-gate
```

`round:final-gate` runs the publish-prep checks without pushing: local log, `verify:pipeline`, `build:strict`, git status, and pipeline summary. It requires a clean worktree, `claimed=0`, and zero failures in the current lifecycle; historical failure events remain preserved.

Legacy worktree synchronization is intentionally disabled:

```bash
npm run round:sync-worktrees
```

`round:sync-worktrees` always refuses. A clean worktree can still contain branch-only commits, so bulk reset/clean is not a safe health operation. Archive or advance each legacy branch only after a separate per-branch review.

## Semi-Automatic 4-NEW Flow

Prepare a clean machine-readable assignment payload without claiming rows:

```bash
npm run --silent round:auto-prepare -- --rewrite 0 --new 4 > /tmp/study-round.json
```

`round:auto-prepare` runs the same verification gates as preflight, sends logs to stderr, and writes stable JSON to stdout for the main agent to fan out to workers.

After workers return JSON results, advance the claimed round in deterministic order:

```bash
npm run round:auto-advance -- --round <n> --results /tmp/study-worker-results.json
```

`round:auto-advance` is fail-closed while bulk production is disabled. Changing a tracked policy field to `APPROVED` does not unlock it: a future implementation must first add an expiring, operation-bound, single-use approval receipt. The command never synchronizes legacy worktrees.

## Remote publication

Round commands do not push. Direct `main` publication and remote reconfiguration are not active operator commands. The current delivery path is a reviewed branch and draft PR; merge and production deployment require separate authorization. The release helper validates the canonical repository identity, normal TLS configuration and the exact remote commit, but those checks do not grant permission to publish. See `docs/release-and-rollback.md`.

## Dispatch And Pipeline Dry Run

Preview a small assignment:

```bash
node scripts/dispatch-batch.mjs --rewrite 1 --new 1 --dry-run
```

Preview one rendered stage prompt without changing runtime state:

```bash
node scripts/run-pipeline.mjs --area papers|projects --slug <slug> --stage researcher --dump
```

`--dump` does not append to `data/pipeline-events.jsonl`.

## Merge Flow

For the 4-NEW flow, use `round:merge-one` (or `round:auto-advance`). `sync-and-merge-single.mjs` is an internal implementation detail: it requires the live round owner token plus the complete assignment provenance and refuses standalone/manual mutation. It verifies receipt generation, note/source hashes, staged evidence and an exact source-status allowlist before cherry-pick; after adding companion blobs it proves the canonical commit contains only the reviewed note, receipt and referenced evidence. Its rollback first verifies a clean tree, then uses an atomic branch-ref compare-and-swap against the captured picked HEAD before restoring the captured pre-pick HEAD.

`finalize-round.sh` is retired. Its only supported mode is the deterministic no-mutation dry run used by `verify:pipeline`; publish and worktree-sync flags are rejected.

`sync-and-merge.sh` is now a legacy wrapper. It keeps dry-run preflight checks but refuses real batch mutation.

## Status And Recovery

Read current runtime state:

```bash
npm run status:pipeline
node scripts/pipeline-summary.mjs --json
```

When something fails:

- Check the recent failure section in `pipeline-summary`.
- Inspect `data/pipeline-events.jsonl` for the source event.
- For claimed queue entries, finish, mark failed, or sync written before dispatching more work.
- For build failures in finalize, use the recorded changed-file list printed by the script; do not reset unrelated local edits.

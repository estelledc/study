# Study Pipeline Scripts

This directory owns the local content pipeline for `explorations/study`.

Current priority: safe production rehearsal. Do not push, expand to 20,000 notes, or edit existing note bodies unless the operator explicitly asks for it.

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

## 4-NEW Small Round Flow

The default production rehearsal path is a four-item NEW-only round. It keeps rewrite entries untouched, does not push, and stops on the first failing slug or stage.

Preflight before opening the round:

```bash
npm run round:preflight -- --rewrite 0 --new 4
```

Claim the four candidates. The command first performs the same dry-run and then commits only queue runtime state:

```bash
npm run round:dispatch -- --rewrite 0 --new 4
```

After each worker creates and commits exactly one note, merge one slug at a time:

```bash
npm run round:merge-one -- --slug <slug> --area papers|projects --commit <hash> --lines <n>
```

`round:merge-one` records status snapshots, runs `sync-and-merge-single`, re-runs the target quality gate, runs `build:strict`, commits atlas changes with `chore: 更新 <slug> 索引`, runs `sync-written` plus incremental rewrite-pool rebuild, and commits runtime changes with `chore: 同步 <slug> 写入状态`.

Finish the local round:

```bash
npm run round:final-gate
```

`round:final-gate` runs the publish-prep checks without pushing: local log, `verify:pipeline`, `build:strict`, git status, and pipeline summary. It requires a clean worktree, `claimed=0`, and `failures=0`.

Only after the final gate passes, sync the eight canonical worktrees locally:

```bash
npm run round:sync-worktrees
```

`round:sync-worktrees` requires main to be clean, pipeline to have no claimed or failed items, and all eight worktrees to be healthy before resetting them to local main HEAD. It never pushes.

## Dispatch And Pipeline Dry Run

Preview a small assignment:

```bash
node scripts/dispatch-batch.mjs --rewrite 1 --new 1 --dry-run
```

Preview one rendered stage prompt without changing runtime state:

```bash
node scripts/run-pipeline.mjs --slug <slug> --stage researcher --dump
```

`--dump` does not append to `data/pipeline-events.jsonl`.

## Merge Flow

For the 4-NEW small round path, prefer `round:merge-one`. Use the lower-level single-entry merge path only for manual recovery:

```bash
node scripts/sync-and-merge-single.mjs --slug <slug> --commit <hash> --area papers
bash scripts/finalize-round.sh
```

`sync-and-merge-single.mjs` validates branch, clean state, commit hash, slug, area, and target path before cherry-pick. It rolls back only the current picked commit on quality-gate failure.

`finalize-round.sh` is the legacy/full finalize path. It handles atlas/backlink/frontmatter generation, build, whitelist staging, amend, and local worktree sync. It does not push by default; use `PUSH_REMOTE=1 bash scripts/finalize-round.sh` only when publishing is explicitly intended. Its dry-run mode is part of `verify:pipeline`.

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

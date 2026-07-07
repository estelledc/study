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

## Worktrees

Check the 8 canonical worktrees:

```bash
npm run doctor:worktrees
node scripts/worktree-doctor.mjs --json
node scripts/worktree-doctor.mjs --fix --dry-run
```

Only `--fix` creates missing worktrees. It refuses dirty, mismatched, or otherwise surprising existing worktrees.

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

Use the single-entry merge path:

```bash
node scripts/sync-and-merge-single.mjs --slug <slug> --commit <hash> --area papers
bash scripts/finalize-round.sh
```

`sync-and-merge-single.mjs` validates branch, clean state, commit hash, slug, area, and target path before cherry-pick. It rolls back only the current picked commit on quality-gate failure.

`finalize-round.sh` handles atlas/backlink/frontmatter generation, build, whitelist staging, amend, and worktree sync. Its dry-run mode is part of `verify:pipeline`.

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

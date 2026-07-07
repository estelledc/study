#!/usr/bin/env node
// 单 slug cherry-pick + Layer 2 quality gate
// 由 workflow pipeline 内联调用（每个 slug 写完 commit 后立刻跑这个）
// 失败 → drop（不 cherry-pick）+ 写 pipeline-events
//
// 用法：
//   node scripts/sync-and-merge-single.mjs --slug X --commit <hash> --area papers --lines 153

import { emit } from './pipeline-events.mjs';
import {
  currentBranch,
  gitMaybe,
  gitOutput,
  relativeToRoot,
  requireCleanWorktree,
  validateCommitHash,
} from './lib/git.mjs';
import { docsEntryPath, ROOT } from './lib/paths.mjs';
import { validate } from './quality-gate.mjs';

function parseArgs() {
  const args = { slug: null, commit: null, area: null, lines: null, round: null };
  for (let i = 2; i < process.argv.length; i++) {
    const a = process.argv[i];
    if (a === '--slug') args.slug = process.argv[++i];
    else if (a === '--commit') args.commit = process.argv[++i];
    else if (a === '--area') args.area = process.argv[++i];
    else if (a === '--lines') args.lines = parseInt(process.argv[++i], 10);
    else if (a === '--round') args.round = parseInt(process.argv[++i], 10);
  }
  return args;
}

function validateSlug(slug) {
  if (!/^[a-z0-9][a-z0-9_.-]*$/.test(slug || '')) {
    throw new Error(`Invalid slug: ${slug || '<empty>'}`);
  }
  return slug;
}

function validateArea(area) {
  if (area !== 'papers' && area !== 'projects') {
    throw new Error(`Invalid area: ${area || '<empty>'}`);
  }
  return area;
}

export function validateMergeArgs(args) {
  validateSlug(args.slug);
  validateArea(args.area);
  validateCommitHash(args.commit);
  const filePath = docsEntryPath(args.area, args.slug);
  const relativePath = relativeToRoot(filePath);
  const expectedPrefix = `src/content/docs/${args.area}/`;
  if (!relativePath.startsWith(expectedPrefix) || !relativePath.endsWith('.md')) {
    throw new Error(`Invalid target path: ${relativePath}`);
  }
  return { ...args, filePath, relativePath };
}

function preflight() {
  const branch = currentBranch(ROOT);
  if (branch !== 'main') throw new Error(`sync-and-merge-single must run on main, current branch is ${branch || 'detached'}`);
  requireCleanWorktree(ROOT);
}

export function rollbackPickedCommit(gitMaybeFn = gitMaybe) {
  return gitMaybeFn(['reset', '--hard', 'HEAD~1'], { cwd: ROOT });
}

async function main() {
  const args = parseArgs();
  if (!args.slug || !args.commit || !args.area) {
    console.error('usage: node sync-and-merge-single.mjs --slug X --commit <hash> --area papers|projects [--lines N] [--round N]');
    process.exit(2);
  }

  let checked;
  try {
    checked = validateMergeArgs(args);
    preflight();
  } catch (err) {
    console.error(`preflight failed: ${err.message}`);
    process.exit(2);
  }

  const filePath = checked.filePath;
  emit({ event: 'merge-single-start', slug: args.slug, commit: args.commit, area: args.area });

  // 1. cherry-pick
  const cp = gitMaybe(['cherry-pick', '-X', 'theirs', args.commit], { cwd: ROOT });
  if (!cp.ok) {
    // resolve modify/delete by adding the worktree's version
    const status = gitOutput(['status', '--porcelain'], { cwd: ROOT });
    if (status.match(/^DU\s/m) || status.match(/^UD\s/m)) {
      // 有 modify/delete 冲突；接受 cherry-pick 引入的版本
      gitMaybe(['add', checked.relativePath], { cwd: ROOT });
      const cont = gitMaybe(['cherry-pick', '--continue', '--no-edit'], { cwd: ROOT });
      if (!cont.ok) {
        gitMaybe(['cherry-pick', '--abort'], { cwd: ROOT });
        emit({ event: 'merge-single-fail', slug: args.slug, reason: 'cherry-pick-conflict-unresolvable', error: cont.error });
        console.log(JSON.stringify({ slug: args.slug, status: 'failed', reason: 'cherry-pick-conflict' }));
        process.exit(1);
      }
    } else {
      gitMaybe(['cherry-pick', '--abort'], { cwd: ROOT });
      emit({ event: 'merge-single-fail', slug: args.slug, reason: 'cherry-pick-failed', error: cp.error });
      console.log(JSON.stringify({ slug: args.slug, status: 'failed', reason: 'cherry-pick-failed', detail: cp.error.slice(0, 200) }));
      process.exit(1);
    }
  }

  // 2. Layer 2 gate（兜底）
  const gate = await validate(filePath);
  if (!gate.pass) {
    // drop：reset 这个 commit
    rollbackPickedCommit();
    emit({ event: 'merge-single-fail', slug: args.slug, reason: 'layer-2-gate', gate_reasons: gate.reasons });
    console.log(JSON.stringify({ slug: args.slug, status: 'failed', reason: 'layer-2-gate', reasons: gate.reasons }));
    process.exit(1);
  }

  const newHead = gitOutput(['rev-parse', '--short', 'HEAD'], { cwd: ROOT });
  emit({ event: 'merge-single-end', slug: args.slug, main_commit: newHead, lines: args.lines, round: args.round });
  console.log(JSON.stringify({
    slug: args.slug,
    status: 'success',
    main_commit: newHead,
    lines: args.lines,
    gate_pass: true,
  }));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => {
    emit({ event: 'merge-single-driver-error', slug: process.argv.includes('--slug') ? process.argv[process.argv.indexOf('--slug') + 1] : 'unknown', error: String(err) });
    console.error('sync-and-merge-single failed:', err);
    process.exit(1);
  });
}

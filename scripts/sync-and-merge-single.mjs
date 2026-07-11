#!/usr/bin/env node
// 单 slug cherry-pick + Layer 2 quality gate
// 仅由 round.mjs 在持有 owner lock 且完成 assignment provenance 绑定后调用。
// 失败 → drop（不 cherry-pick）+ 写 pipeline-events
//
// 操作者必须使用 round:merge-one / round:auto-advance；本文件不是公开入口。

import fs from 'node:fs';
import path from 'node:path';

import { emit } from './pipeline-events.mjs';
import { readJsonl } from './lib/jsonl.mjs';
import {
  currentBranch,
  gitMaybe,
  gitOutput,
  relativeToRoot,
  requireCleanWorktree,
  validateCommitHash,
} from './lib/git.mjs';
import {
  assertEquivalentCommitScope,
  CommitScopeError,
  validateCommitScope,
} from './lib/git-commit-scope.mjs';
import { isNoteArea, isNoteSlug } from './lib/note-id.mjs';
import {
  installReviewCompanion,
  prepareReviewCompanion,
  ReviewCompanionError,
  verifyInstalledReviewCompanion,
} from './lib/merge-review-companion.mjs';
import {
  CANDIDATES_PATH,
  docsEntryPath,
  PIPELINE_EVENTS_PATH,
  REWRITE_POOL_PATH,
  ROOT,
} from './lib/paths.mjs';
import { allWorktrees } from './lib/worktrees.mjs';
import { validate } from './quality-gate.mjs';
import { readRoundLock, renewLease } from './round-lock.mjs';

export class MergeSourceError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'MergeSourceError';
    this.code = code;
  }
}

function rejectSource(code, message) {
  throw new MergeSourceError(code, message);
}

function parseRegisteredWorktrees(raw) {
  return String(raw || '').trim().split(/\n\s*\n/).filter(Boolean).map((block) => {
    const record = {};
    for (const line of block.split('\n')) {
      const separator = line.indexOf(' ');
      if (separator > 0) record[line.slice(0, separator)] = line.slice(separator + 1);
    }
    return record;
  });
}

function parseArgs() {
  const args = {
    slug: null,
    commit: null,
    area: null,
    lines: null,
    round: null,
    worktree: null,
    branch: null,
    generation: null,
    claimToken: null,
    ownerToken: null,
  };
  for (let i = 2; i < process.argv.length; i++) {
    const a = process.argv[i];
    if (a === '--slug') args.slug = process.argv[++i];
    else if (a === '--commit') args.commit = process.argv[++i];
    else if (a === '--area') args.area = process.argv[++i];
    else if (a === '--lines') args.lines = parseInt(process.argv[++i], 10);
    else if (a === '--round') args.round = parseInt(process.argv[++i], 10);
    else if (a === '--worktree') args.worktree = process.argv[++i];
    else if (a === '--branch') args.branch = process.argv[++i];
    else if (a === '--generation') args.generation = process.argv[++i];
    else if (a === '--claim-token') args.claimToken = process.argv[++i];
    else if (a === '--owner-token') args.ownerToken = process.argv[++i];
    else throw new Error(`Unknown argument: ${a}`);
  }
  return args;
}

function validateSlug(slug) {
  if (!isNoteSlug(slug)) {
    throw new Error(`Invalid slug: ${slug || '<empty>'}`);
  }
  return slug;
}

function validateArea(area) {
  if (!isNoteArea(area)) {
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
  if (!/^(papers|projects)(-[2-4])?$/.test(args.worktree || '') ||
      !/^refactor\/(papers|projects)(-[2-4])?$/.test(args.branch || '') ||
      !Number.isInteger(args.round) || args.round < 0 ||
      !/^[A-Za-z0-9._:-]{8,256}$/.test(args.generation || '') ||
      !/^[A-Za-z0-9._:-]{8,256}$/.test(args.claimToken || '')) {
    throw new Error('Invalid or incomplete merge source declaration');
  }
  if (!/^[A-Za-z0-9._:-]{8,256}$/.test(args.ownerToken || '')) {
    throw new Error('Invalid or missing round lock owner token');
  }
  return { ...args, filePath, relativePath };
}

export function validateMergeSource(args, state, options = {}) {
  const assignment = `${args.area}::${args.slug}`;
  const claimed = [...(state.candidates || []), ...(state.rewritePool || [])]
    .filter((row) => row.area === args.area && row.slug === args.slug && row.status === 'claimed');
  if (claimed.length !== 1) {
    rejectSource('ASSIGNMENT_NOT_CLAIMED', `expected exactly one claimed assignment for ${assignment}`);
  }
  const claim = claimed[0];
  if (claim.claimed_by !== args.worktree) {
    rejectSource('WORKTREE_CLAIM_MISMATCH', 'declared worktree does not own the claimed assignment');
  }
  if (!claim.claim_generation || claim.claim_generation !== args.generation) {
    rejectSource('CLAIM_GENERATION_MISMATCH', 'declared generation does not match the active claim');
  }
  if (!claim.claim_token || claim.claim_token !== args.claimToken) {
    rejectSource('CLAIM_TOKEN_MISMATCH', 'declared claim token does not match the active claim');
  }

  const worktrees = state.worktrees || allWorktrees(options.home);
  const matches = worktrees.filter((worktree) =>
    worktree.name === args.worktree && worktree.area === args.area
  );
  if (matches.length !== 1) {
    rejectSource('WORKTREE_UNKNOWN', 'declared worktree is not an approved assignment worktree');
  }
  const worktree = matches[0];
  if (worktree.branch !== args.branch) {
    rejectSource('WORKTREE_BRANCH_MISMATCH', 'declared branch does not match the assignment worktree');
  }

  const lifecycleMatches = (state.events || []).filter((event) =>
    event && typeof event === 'object' &&
    event.event === 'round-lifecycle-start' &&
    (event.lifecycle_id || event.generation) === args.generation &&
    event.round_n === args.round
  );
  if (lifecycleMatches.length !== 1) {
    rejectSource('ROUND_LIFECYCLE_MISMATCH', 'claim generation has no unique matching round lifecycle');
  }

  const gitOutputFn = options.gitOutputFn || gitOutput;
  const repositoryRoot = options.repositoryRoot || ROOT;
  const realpathFn = options.realpathFn || fs.realpathSync;
  let actualBranch;
  let worktreeHead;
  let worktreeTop;
  let commonDirectory;
  let registeredWorktrees;
  try {
    actualBranch = gitOutputFn(['branch', '--show-current'], { cwd: worktree.path });
    worktreeHead = gitOutputFn(['rev-parse', '--verify', 'HEAD^{commit}'], { cwd: worktree.path });
    worktreeTop = gitOutputFn(['rev-parse', '--show-toplevel'], { cwd: worktree.path });
    commonDirectory = gitOutputFn(['rev-parse', '--git-common-dir'], { cwd: worktree.path });
    registeredWorktrees = gitOutputFn(['worktree', 'list', '--porcelain'], { cwd: repositoryRoot });
  } catch {
    rejectSource('WORKTREE_INSPECTION_FAILED', 'could not inspect the declared assignment worktree');
  }

  let canonicalRepository;
  let canonicalWorktree;
  let canonicalTop;
  let canonicalCommonDirectory;
  try {
    canonicalRepository = realpathFn(repositoryRoot);
    canonicalWorktree = realpathFn(worktree.path);
    canonicalTop = realpathFn(worktreeTop);
    canonicalCommonDirectory = realpathFn(path.resolve(worktree.path, commonDirectory));
  } catch {
    rejectSource('WORKTREE_REPOSITORY_MISMATCH', 'assignment worktree repository paths are not canonical');
  }
  const expectedCommonDirectory = path.join(canonicalRepository, '.git');
  const registered = parseRegisteredWorktrees(registeredWorktrees).some((record) => {
    if (!record.worktree || !record.branch) return false;
    let registeredPath;
    try {
      registeredPath = realpathFn(record.worktree);
    } catch {
      return false;
    }
    return registeredPath === canonicalWorktree && record.branch === `refs/heads/${args.branch}`;
  });
  if (
    canonicalTop !== canonicalWorktree ||
    canonicalCommonDirectory !== expectedCommonDirectory ||
    !registered
  ) {
    rejectSource('WORKTREE_REPOSITORY_MISMATCH', 'assignment path is not a registered worktree of this Study repository');
  }
  if (actualBranch !== args.branch) {
    rejectSource('WORKTREE_BRANCH_MISMATCH', 'assignment worktree is not on the declared branch');
  }
  if (worktreeHead !== args.commit) {
    rejectSource('WORKTREE_HEAD_MISMATCH', 'worker commit is not the declared assignment branch HEAD');
  }

  return { assignment, claim, worktree, lifecycle: lifecycleMatches[0] };
}

export function validateMergeLock(args, lock, options = {}) {
  if (!lock || lock.owner_token !== args.ownerToken) {
    rejectSource('ROUND_LOCK_OWNER_MISMATCH', 'active round lock does not belong to the declared owner');
  }
  if (lock.active_round !== args.round) {
    rejectSource('ROUND_LOCK_ROUND_MISMATCH', 'active round lock does not match the declared round');
  }
  const now = new Date(options.now || Date.now());
  const expiresAt = new Date(lock.expires_at);
  if (!Number.isFinite(now.getTime()) || !Number.isFinite(expiresAt.getTime()) || expiresAt <= now) {
    rejectSource('ROUND_LOCK_EXPIRED', 'active round lock is expired or malformed');
  }
  return lock;
}

async function loadMergeSourceState() {
  const [candidates, rewritePool, events, lock] = await Promise.all([
    readJsonl(CANDIDATES_PATH),
    readJsonl(REWRITE_POOL_PATH),
    readJsonl(PIPELINE_EVENTS_PATH, { missing: 'empty' }),
    readRoundLock(),
  ]);
  return { candidates, rewritePool, events, lock, worktrees: allWorktrees() };
}

function preflight() {
  const branch = currentBranch(ROOT);
  if (branch !== 'main') throw new Error(`sync-and-merge-single must run on main, current branch is ${branch || 'detached'}`);
  requireCleanWorktree(ROOT);
}

export function rollbackPickedCommit(preHead, pickedHead, gitMaybeFn = gitMaybe) {
  if (!/^[0-9a-f]{40}$/.test(preHead || '')) {
    throw new Error('rollback requires the captured full pre-pick HEAD');
  }
  if (!/^[0-9a-f]{40}$/.test(pickedHead || '')) {
    throw new Error('rollback requires the captured full picked HEAD');
  }
  const status = gitMaybeFn(['status', '--porcelain'], { cwd: ROOT });
  if (!status.ok || status.out.trim()) {
    return { ok: false, out: '', error: 'rollback refused because the worktree is not clean' };
  }
  const moved = gitMaybeFn(['update-ref', 'refs/heads/main', preHead, pickedHead], { cwd: ROOT });
  if (!moved.ok) return moved;
  return gitMaybeFn(['reset', '--hard', preHead], { cwd: ROOT });
}

export function buildCherryPickArgs(commit) {
  validateCommitHash(commit);
  return ['cherry-pick', commit];
}

async function restorePreHeadOrExit(preHead, pickedHead, args, commit) {
  const renewed = await renewLease(args.ownerToken);
  if (!renewed.renewed) {
    emit({
      event: 'merge-single-fail',
      slug: args.slug,
      area: args.area,
      assignment: `${args.area}::${args.slug}`,
      commit,
      reason: 'ROLLBACK_LOCK_LOST',
    });
    console.error(`rollback refused because round lock ownership was lost: ${renewed.reason}`);
    process.exit(1);
  }
  const rollback = rollbackPickedCommit(preHead, pickedHead);
  if (rollback.ok) return;
  emit({
    event: 'merge-single-fail',
    slug: args.slug,
    area: args.area,
    assignment: `${args.area}::${args.slug}`,
    commit,
    reason: 'ROLLBACK_FAILED',
  });
  console.error(`rollback failed; stop and restore the captured HEAD manually: ${preHead}`);
  process.exit(1);
}

async function main() {
  const args = parseArgs();
  if (!args.slug || !args.commit || !args.area) {
    console.error('usage: node sync-and-merge-single.mjs --slug X --commit <hash> --area papers|projects --worktree NAME --branch BRANCH --round N --generation ID --claim-token TOKEN --owner-token TOKEN [--lines N]');
    process.exit(2);
  }

  let checked;
  let reviewedScope;
  let reviewCompanion;
  let preHead;
  try {
    checked = validateMergeArgs(args);
    preflight();
    reviewedScope = validateCommitScope({
      commit: checked.commit,
      expectedPath: checked.relativePath,
    });
    checked.commit = reviewedScope.commit;
    const sourceState = await loadMergeSourceState();
    validateMergeLock(checked, sourceState.lock);
    const mergeSource = validateMergeSource(checked, sourceState);
    const renewed = await renewLease(checked.ownerToken);
    if (!renewed.renewed) {
      rejectSource('ROUND_LOCK_RENEWAL_FAILED', `round lock renewal failed: ${renewed.reason}`);
    }
    reviewCompanion = await prepareReviewCompanion({
      sourceRoot: mergeSource.worktree.path,
      canonicalRoot: ROOT,
      area: checked.area,
      slug: checked.slug,
      noteRelativePath: checked.relativePath,
    });
    preHead = gitOutput(['rev-parse', 'HEAD'], { cwd: ROOT });
  } catch (err) {
    if ((err instanceof CommitScopeError || err instanceof MergeSourceError || err instanceof ReviewCompanionError) && checked) {
      emit({
        event: 'merge-single-reject',
        slug: checked.slug,
        area: checked.area,
        assignment: `${checked.area}::${checked.slug}`,
        commit: checked.commit,
        reason: err.code,
      });
    }
    console.error(`preflight failed: ${err.message}`);
    process.exit(2);
  }

  const filePath = checked.filePath;
  emit({
    event: 'merge-single-start',
    slug: args.slug,
    area: args.area,
    assignment: `${args.area}::${args.slug}`,
    commit: args.commit,
  });

  // 1. cherry-pick without an automatic conflict preference.
  const cp = gitMaybe(buildCherryPickArgs(reviewedScope.commit), { cwd: ROOT });
  if (!cp.ok) {
    gitMaybe(['cherry-pick', '--abort'], { cwd: ROOT });
    await restorePreHeadOrExit(preHead, preHead, checked, reviewedScope.commit);
    emit({
      event: 'merge-single-fail',
      slug: args.slug,
      area: args.area,
      assignment: `${args.area}::${args.slug}`,
      commit: reviewedScope.commit,
      reason: 'CHERRY_PICK_CONFLICT_OR_FAILURE',
    });
    console.log(JSON.stringify({
      slug: args.slug,
      status: 'failed',
      reason: 'cherry-pick-conflict-or-failure',
      detail: cp.error.slice(0, 200),
    }));
    process.exit(1);
  }

  // 2. Re-prove the produced commit before evaluating note quality.
  let pickedHead;
  try {
    requireCleanWorktree(ROOT);
    pickedHead = gitOutput(['rev-parse', 'HEAD'], { cwd: ROOT });
    const pickedScope = validateCommitScope({
      commit: pickedHead,
      expectedPath: checked.relativePath,
      expectedParent: preHead,
    });
    assertEquivalentCommitScope(reviewedScope, pickedScope);

    // 3. Layer 2 gate（兜底）
    const gate = await validate(filePath);
    if (!gate.pass) {
      await restorePreHeadOrExit(preHead, pickedHead, checked, reviewedScope.commit);
      emit({
        event: 'merge-single-fail',
        slug: args.slug,
        area: args.area,
        assignment: `${args.area}::${args.slug}`,
        commit: reviewedScope.commit,
        reason: 'LAYER_2_GATE',
        gate_reasons: gate.reasons,
      });
      console.log(JSON.stringify({ slug: args.slug, status: 'failed', reason: 'layer-2-gate', reasons: gate.reasons }));
      process.exit(1);
    }
    const installed = await installReviewCompanion(reviewCompanion, { rootDir: ROOT });
    pickedHead = installed.commit;
    await verifyInstalledReviewCompanion(reviewCompanion, {
      rootDir: ROOT,
      commit: pickedHead,
      expectedParent: preHead,
      reviewedScope,
    });
    requireCleanWorktree(ROOT);
  } catch (err) {
    const rollbackHead = pickedHead || gitOutput(['rev-parse', 'HEAD'], { cwd: ROOT });
    await restorePreHeadOrExit(preHead, rollbackHead, checked, reviewedScope.commit);
    const reason = err instanceof CommitScopeError || err instanceof ReviewCompanionError
      ? err.code
      : 'POST_PICK_VALIDATION_ERROR';
    emit({
      event: 'merge-single-fail',
      slug: args.slug,
      area: args.area,
      assignment: `${args.area}::${args.slug}`,
      commit: reviewedScope.commit,
      reason,
    });
    console.log(JSON.stringify({ slug: args.slug, status: 'failed', reason }));
    process.exit(1);
  }

  const newHead = gitOutput(['rev-parse', '--short', 'HEAD'], { cwd: ROOT });
  emit({
    event: 'merge-single-end',
    slug: args.slug,
    area: args.area,
    assignment: `${args.area}::${args.slug}`,
    main_commit: newHead,
    lines: args.lines,
    round: args.round,
    review_receipt_generation: reviewCompanion.receipt.generation,
  });
  console.log(JSON.stringify({
    slug: args.slug,
    status: 'success',
    main_commit: newHead,
    lines: args.lines,
    gate_pass: true,
    review_receipt_generation: reviewCompanion.receipt.generation,
    review_evidence_state: reviewCompanion.verification.evidence_state,
  }));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => {
    const driverArgs = parseArgs();
    const event = {
      event: 'merge-single-driver-error',
      slug: driverArgs.slug || 'unknown',
      error: String(err),
    };
    if ((driverArgs.area === 'papers' || driverArgs.area === 'projects') && driverArgs.slug) {
      event.area = driverArgs.area;
      event.assignment = `${driverArgs.area}::${driverArgs.slug}`;
    }
    emit(event);
    console.error('sync-and-merge-single failed:', err);
    process.exit(1);
  });
}

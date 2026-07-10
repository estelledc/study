#!/usr/bin/env node
// Pick 4 rewrite + 4 NEW，分配到 8 worktree，输出 8 个 prompt JSON 到 stdout
// 同时把 candidates / rewrite-pool 中选中的条目状态改为 claimed
// 主 CC 读 stdout 后并行调 Task tool（一个 prompt 一个 subagent）
//
// 用法：
//   node scripts/dispatch-batch.mjs                    # 4R + 4N
//   node scripts/dispatch-batch.mjs --rewrite 0 --new 8 # 全 NEW（rewrite 池空时）
//   node scripts/dispatch-batch.mjs --dry-run           # 只输出，不改状态
//
// Worktree 静态分配：
//   papers-rewrite x 2 → papers / papers-2
//   papers-new x 2     → papers-3 / papers-4
//   projects-rewrite x 2 → projects / projects-2
//   projects-new x 2     → projects-3 / projects-4

import { createHash, randomUUID } from 'node:crypto';

import { emit } from './pipeline-events.mjs';
import { claimToken, commitQueueState, loadDispatchQueues, markClaimed } from './lib/queue-store.mjs';
import { CANDIDATES_PATH, DATA_DIR, docsEntryRelativePath, REWRITE_POOL_PATH } from './lib/paths.mjs';
import { DISPATCH_PROMPT_KINDS, commonPromptVars, loadPromptTemplates, renderTemplate } from './lib/prompts.mjs';
import { worktreeForAreaSlot, worktreesForDispatch } from './lib/worktrees.mjs';
import { formatCandidateMetadataIssue, validateCandidateRows } from './lib/candidate-metadata.mjs';
import {
  assertNoPendingQueueTransaction,
  recoverQueueTransaction,
} from './lib/queue-transaction.mjs';
import { acquireRoundLock, releaseRoundLock, renewLease } from './round-lock.mjs';

function parseArgs() {
  const args = {
    rewrite: 4,
    new: 4,
    dryRun: false,
    round: null,
    ownerToken: null,
    workflowRunId: process.env.GITHUB_RUN_ID || `local-${process.pid}`,
  };
  for (let i = 2; i < process.argv.length; i++) {
    const a = process.argv[i];
    if (a === '--rewrite') args.rewrite = parseInt(process.argv[++i], 10);
    else if (a === '--new') args.new = parseInt(process.argv[++i], 10);
    else if (a === '--dry-run') args.dryRun = true;
    else if (a === '--round') args.round = parseInt(process.argv[++i], 10);
    else if (a === '--owner-token') args.ownerToken = process.argv[++i];
    else if (a === '--workflow-run-id') args.workflowRunId = process.argv[++i];
    else if (a === '--json') continue;
    else throw new Error(`Unknown argument: ${a}`);
  }
  return args;
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function queueInputHash(queues) {
  return sha256(JSON.stringify({
    candidates: queues.candidates || [],
    pool: queues.pool || [],
  }));
}

export function computeDispatchPlanHash(plan) {
  return sha256(JSON.stringify({
    expected: plan.expected,
    queue_input_hash: plan.queue_input_hash,
    assignments: plan.assignments.map((assignment) => ({
      kind: assignment.kind,
      area: assignment.area,
      slug: assignment.slug,
      worktree: assignment.worktree.name,
    })),
    picked: {
      rewrite: plan.picked.rewrite.map((item) => `${item.area}::${item.slug}`),
      new: plan.picked.new.map((item) => `${item.area}::${item.slug}`),
    },
  }));
}

function pickRewrite(pool, area, n) {
  // 按 score desc 选 N 个 status=available
  const eligible = pool
    .filter(x => x.area === area && x.status === 'available')
    .sort((a, b) => b.score - a.score || a.slug.localeCompare(b.slug));
  return eligible.slice(0, n);
}

function pickNew(candidates, area, n, excludeSlugs = new Set()) {
  // 按 source_file（topic）轮询，避免单一主题扎堆
  const eligible = candidates.filter(c =>
    c.area === area &&
    c.status === 'queued' &&
    !excludeSlugs.has(c.slug)
  );
  // 按 topic 分桶
  const byTopic = new Map();
  for (const c of eligible) {
    if (!byTopic.has(c.topic)) byTopic.set(c.topic, []);
    byTopic.get(c.topic).push(c);
  }
  // 轮询取
  const topics = [...byTopic.keys()];
  const picked = [];
  let i = 0;
  while (picked.length < n && topics.length) {
    const t = topics[i % topics.length];
    const bucket = byTopic.get(t);
    if (bucket.length === 0) {
      topics.splice(i % topics.length, 1);
      continue;
    }
    picked.push(bucket.shift());
    i++;
  }
  return picked;
}

function buildAssignment(kind, area, item, worktree) {
  const slug = item.slug;
  const isRewrite = kind.startsWith('rewrite-');
  const subdir = area; // papers / projects
  const relativePath = docsEntryRelativePath(subdir, slug);
  const outputPath = `${worktree.path}/${relativePath}`;
  const existingPath = isRewrite
    ? `${worktree.path}/${item.path || relativePath}`
    : null;

  const vars = {
    slug,
    area,
    title: item.title || slug,
    year: item.meta?.col3 || '',
    why: item.meta?.col4 || item.title || '',
    stars: item.meta?.col3 || '',
    value: item.meta?.col4 || '',
    url: item.url || '',
    github_url: item.url || '',
    topic: item.topic || 'wip',
    worktree_path: worktree.path,
    branch_name: worktree.branch,
    output_path: outputPath,
    existing_path: existingPath || '',
    ...commonPromptVars({ area, worktree }),
  };

  return { kind, area, slug, worktree, vars };
}

function worktreesForCount(area, mode, count, companionCount, home) {
  if (count <= 0) return [];

  const primary = worktreesForDispatch(area, mode, home);
  if (mode === 'new' && companionCount === 0 && count > primary.length) {
    const overflow = [0, 1].map((slot) => worktreeForAreaSlot(area, slot, home));
    return [...primary, ...overflow].slice(0, count);
  }

  return primary.slice(0, count);
}

function pushAssignment(assignments, kind, area, item, worktree) {
  if (!worktree) return false;
  assignments.push(buildAssignment(kind, area, item, worktree));
  return true;
}

export function dispatchBatch(args, queues, options = {}) {
  const { candidates = [], pool = [] } = queues;
  // 4 类各 N/2（除非奇数）
  const rewritePerArea = Math.floor(args.rewrite / 2);
  const newPerArea = Math.floor(args.new / 2);
  const rewriteRemainder = args.rewrite - rewritePerArea * 2; // 0 或 1
  const newRemainder = args.new - newPerArea * 2;

  // Pick rewrite
  const papersRewrite = pickRewrite(pool, 'papers', rewritePerArea);
  const projectsRewrite = pickRewrite(pool, 'projects', rewritePerArea + rewriteRemainder);

  // Pick new（避开本批已选的 rewrite slug）
  const exclude = new Set([...papersRewrite, ...projectsRewrite].map(x => `${x.area}::${x.slug}`));
  const papersNew = pickNew(candidates, 'papers', newPerArea, new Set(
    [...exclude].filter(k => k.startsWith('papers::')).map(k => k.split('::')[1])
  ));
  const projectsNew = pickNew(candidates, 'projects', newPerArea + newRemainder, new Set(
    [...exclude].filter(k => k.startsWith('projects::')).map(k => k.split('::')[1])
  ));

  // 数量校验
  const issues = [];
  if (papersRewrite.length < rewritePerArea) issues.push(`papers-rewrite short: got ${papersRewrite.length}, need ${rewritePerArea}`);
  if (projectsRewrite.length < (rewritePerArea + rewriteRemainder)) issues.push(`projects-rewrite short`);
  if (papersNew.length < newPerArea) issues.push(`papers-new short: got ${papersNew.length}, need ${newPerArea}`);
  if (projectsNew.length < (newPerArea + newRemainder)) issues.push(`projects-new short`);
  issues.push(...validateCandidateRows([...papersNew, ...projectsNew]).map(formatCandidateMetadataIssue));

  // 分配 worktree
  const assignments = [];
  const papersRewriteWorktrees = worktreesForCount('papers', 'rewrite', papersRewrite.length, papersNew.length, options.home);
  const projectsRewriteWorktrees = worktreesForCount('projects', 'rewrite', projectsRewrite.length, projectsNew.length, options.home);
  const papersNewWorktrees = worktreesForCount('papers', 'new', papersNew.length, papersRewrite.length, options.home);
  const projectsNewWorktrees = worktreesForCount('projects', 'new', projectsNew.length, projectsRewrite.length, options.home);

  if (papersRewrite.length > papersRewriteWorktrees.length) issues.push(`papers-rewrite worktree short: got ${papersRewriteWorktrees.length}, need ${papersRewrite.length}`);
  if (projectsRewrite.length > projectsRewriteWorktrees.length) issues.push(`projects-rewrite worktree short: got ${projectsRewriteWorktrees.length}, need ${projectsRewrite.length}`);
  if (papersNew.length > papersNewWorktrees.length) issues.push(`papers-new worktree short: got ${papersNewWorktrees.length}, need ${papersNew.length}`);
  if (projectsNew.length > projectsNewWorktrees.length) issues.push(`projects-new worktree short: got ${projectsNewWorktrees.length}, need ${projectsNew.length}`);

  papersRewrite.forEach((item, i) => pushAssignment(assignments, 'rewrite-paper', 'papers', item, papersRewriteWorktrees[i]));
  projectsRewrite.forEach((item, i) => pushAssignment(assignments, 'rewrite-project', 'projects', item, projectsRewriteWorktrees[i]));
  papersNew.forEach((item, i) => pushAssignment(assignments, 'new-paper', 'papers', item, papersNewWorktrees[i]));
  projectsNew.forEach((item, i) => pushAssignment(assignments, 'new-project', 'projects', item, projectsNewWorktrees[i]));

  const plan = {
    batch_size: assignments.length,
    expected: args.rewrite + args.new,
    issues,
    dry_run: args.dryRun,
    assignments,
    picked: {
      rewrite: [...papersRewrite, ...projectsRewrite],
      new: [...papersNew, ...projectsNew],
    },
  };
  plan.queue_input_hash = queueInputHash({ candidates, pool });
  plan.plan_hash = computeDispatchPlanHash(plan);
  return plan;
}

export function renderDispatchOutput(plan, templates, options = {}) {
  const claimGeneration = options.generation || plan.plan_hash;
  const output = plan.assignments.map((a) => {
    const token = claimToken(plan.plan_hash, a);
    const vars = {
      ...a.vars,
      claim_token: token,
      claim_generation: claimGeneration,
    };
    return {
      kind: a.kind,
      area: a.area,
      slug: a.slug,
      worktree: a.worktree.name,
      worktree_path: a.worktree.path,
      branch: a.worktree.branch,
      output_path: a.vars.output_path,
      claim_token: token,
      claim_generation: claimGeneration,
      prompt: renderTemplate(templates[a.kind], vars),
    };
  });

  return {
    batch_size: plan.batch_size,
    expected: plan.expected,
    issues: plan.issues,
    dry_run: plan.dry_run,
    plan_hash: plan.plan_hash,
    queue_input_hash: plan.queue_input_hash,
    assignments: output,
  };
}

export async function applyDispatchPlan(plan, queues, options = {}) {
  const issues = [...(plan.issues || [])];
  if (plan.batch_size !== plan.expected) {
    issues.push(`batch-size mismatch: got ${plan.batch_size}, expected ${plan.expected}`);
  }
  if (issues.length > 0) {
    throw new Error(`dispatch plan is not applicable: ${issues.join('; ')}`);
  }
  if (queueInputHash(queues) !== plan.queue_input_hash) {
    throw new Error('dispatch queue input changed after planning');
  }
  if (computeDispatchPlanHash(plan) !== plan.plan_hash) {
    throw new Error('dispatch plan hash mismatch');
  }

  const claimOptions = {
    planHash: plan.plan_hash,
    generation: plan.plan_hash,
    claimedAt: options.claimedAt,
    leaseMs: options.leaseMs,
  };
  const nextRewritePool = markClaimed(
    queues.pool || [],
    plan.picked.rewrite,
    plan.assignments,
    claimOptions,
  );
  const nextCandidates = markClaimed(
    queues.candidates || [],
    plan.picked.new,
    plan.assignments,
    claimOptions,
  );
  const transaction = await commitQueueState({
    candidates: nextCandidates,
    rewritePool: nextRewritePool,
  }, {
    generation: plan.plan_hash,
    directory: options.directory,
    paths: options.paths,
    expectedState: { candidates: queues.candidates || [], rewritePool: queues.pool || [] },
    hooks: options.hooks,
  });
  return { transaction, candidates: nextCandidates, pool: nextRewritePool };
}

async function executeDispatch(args) {
  if (args.dryRun) {
    await assertNoPendingQueueTransaction({ directory: DATA_DIR });
  } else {
    await recoverQueueTransaction({ directory: DATA_DIR });
  }

  const { candidates, pool } = await loadDispatchQueues();
  const plan = dispatchBatch(args, { candidates, pool });

  // Render prompts
  const templates = await loadPromptTemplates(DISPATCH_PROMPT_KINDS);
  const output = renderDispatchOutput(plan, templates);

  // 标 claimed（除非 dry-run）。任何 shortage/issue 都在事务前失败，不写一字节。
  if (!args.dryRun) {
    await applyDispatchPlan(plan, { candidates, pool }, {
      directory: DATA_DIR,
      paths: { candidates: CANDIDATES_PATH, rewritePool: REWRITE_POOL_PATH },
    });
    emit({
      event: 'round-lifecycle-start',
      lifecycle_id: plan.plan_hash,
      generation: plan.plan_hash,
      round_n: args.round,
      batch_size: plan.batch_size,
    });
  }

  // Output to stdout: JSON array
  console.log(JSON.stringify(output, null, 2));

}

async function main() {
  const args = parseArgs();
  if (args.dryRun) {
    await executeDispatch(args);
    return;
  }

  if (args.ownerToken) {
    const renewed = await renewLease(args.ownerToken);
    if (!renewed.renewed) throw new Error(`round lock validation failed: ${renewed.reason}`);
    await executeDispatch(args);
    return;
  }

  const ownerToken = randomUUID();
  const acquired = await acquireRoundLock({
    round: args.round,
    workflowRunId: args.workflowRunId,
    ownerToken,
  });
  if (!acquired.acquired) throw new Error(`round lock refused: ${acquired.reason}`);
  let operationError;
  try {
    await executeDispatch(args);
  } catch (err) {
    operationError = err;
  }
  let released;
  let releaseError;
  try {
    released = await releaseRoundLock(ownerToken);
    if (!released.released) releaseError = new Error(`round lock release refused: ${released.reason}`);
  } catch (err) {
    releaseError = err;
  }
  if (operationError) {
    if (releaseError) operationError.message += `; lock release failed: ${releaseError.message}`;
    throw operationError;
  }
  if (releaseError) throw releaseError;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => {
    console.error('dispatch-batch failed:', err);
    process.exit(1);
  });
}

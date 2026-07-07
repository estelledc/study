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

import { loadDispatchQueues, markClaimed, writeCandidates, writeRewritePool } from './lib/queue-store.mjs';
import { docsEntryRelativePath } from './lib/paths.mjs';
import { DISPATCH_PROMPT_KINDS, loadPromptTemplates, renderTemplate } from './lib/prompts.mjs';
import { worktreesForDispatch } from './lib/worktrees.mjs';

function parseArgs() {
  const args = { rewrite: 4, new: 4, dryRun: false };
  for (let i = 2; i < process.argv.length; i++) {
    const a = process.argv[i];
    if (a === '--rewrite') args.rewrite = parseInt(process.argv[++i], 10);
    else if (a === '--new') args.new = parseInt(process.argv[++i], 10);
    else if (a === '--dry-run') args.dryRun = true;
  }
  return args;
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
  };

  return { kind, area, slug, worktree, vars };
}

async function main() {
  const args = parseArgs();

  const { candidates, pool } = await loadDispatchQueues();

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

  // 分配 worktree
  const assignments = [];
  const papersRewriteWorktrees = worktreesForDispatch('papers', 'rewrite');
  const projectsRewriteWorktrees = worktreesForDispatch('projects', 'rewrite');
  const papersNewWorktrees = worktreesForDispatch('papers', 'new');
  const projectsNewWorktrees = worktreesForDispatch('projects', 'new');

  papersRewrite.forEach((item, i) => assignments.push(buildAssignment('rewrite-paper', 'papers', item, papersRewriteWorktrees[i])));
  projectsRewrite.forEach((item, i) => assignments.push(buildAssignment('rewrite-project', 'projects', item, projectsRewriteWorktrees[i])));
  papersNew.forEach((item, i) => assignments.push(buildAssignment('new-paper', 'papers', item, papersNewWorktrees[i])));
  projectsNew.forEach((item, i) => assignments.push(buildAssignment('new-project', 'projects', item, projectsNewWorktrees[i])));

  // Render prompts
  const templates = await loadPromptTemplates(DISPATCH_PROMPT_KINDS);

  const output = assignments.map(a => ({
    kind: a.kind,
    area: a.area,
    slug: a.slug,
    worktree: a.worktree.name,
    worktree_path: a.worktree.path,
    branch: a.worktree.branch,
    output_path: a.vars.output_path,
    prompt: renderTemplate(templates[a.kind], a.vars),
  }));

  // 标 claimed（除非 dry-run）
  if (!args.dryRun) {
    await writeRewritePool(markClaimed(pool, [...papersRewrite, ...projectsRewrite], assignments));
    await writeCandidates(markClaimed(candidates, [...papersNew, ...projectsNew], assignments));
  }

  // Output to stdout: JSON array
  console.log(JSON.stringify({
    batch_size: assignments.length,
    expected: args.rewrite + args.new,
    issues,
    dry_run: args.dryRun,
    assignments: output,
  }, null, 2));

  if (issues.length && !args.dryRun) {
    process.stderr.write(`WARNING: pool short on ${issues.length} slot(s)\n`);
  }
}

main().catch(err => {
  console.error('dispatch-batch failed:', err);
  process.exit(1);
});

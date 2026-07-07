#!/usr/bin/env node
// 单 slug 5-stage pipeline driver（M1 verbose 版）
// 由 workflow 内 agent 调用，或手动 CLI 跑单 slug 验证
//
// 用法：
//   node scripts/run-pipeline.mjs --slug codd-1979-extending           # 完整 pipeline
//   node scripts/run-pipeline.mjs --slug X --stage researcher --dump  # 仅跑 researcher 输出 prompt（不调 agent）
//
// 注：本 driver 不直接调 LLM agent。它准备 prompt + 数据 + 写事件流，
//     真正的 agent 调用由外层 workflow 编排。这样保持单文件可测、可 dry-run。

import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { readJsonl } from './lib/jsonl.mjs';
import { CANDIDATES_PATH, REWRITE_POOL_PATH, docsEntryRelativePath } from './lib/paths.mjs';
import {
  PIPELINE_STAGES,
  loadPromptTemplate,
  loadPromptTemplates,
  promptPath,
  renderTemplate,
} from './lib/prompts.mjs';
import { worktreeForPipelineKind } from './lib/worktrees.mjs';
import { emit } from './pipeline-events.mjs';
import { validate } from './quality-gate.mjs';

function parseArgs() {
  const args = { slug: null, stage: null, dump: false, kind: null, worktreeIdx: 0 };
  for (let i = 2; i < process.argv.length; i++) {
    const a = process.argv[i];
    if (a === '--slug') args.slug = process.argv[++i];
    else if (a === '--stage') args.stage = process.argv[++i];
    else if (a === '--dump') args.dump = true;
    else if (a === '--kind') args.kind = process.argv[++i];
    else if (a === '--worktree') args.worktreeIdx = parseInt(process.argv[++i], 10);
  }
  return args;
}

async function findCandidate(slug, candidatesOverride = null) {
  const candidates = candidatesOverride ?? await readJsonl(CANDIDATES_PATH);
  return candidates.find(c => c.slug === slug);
}

async function findRewriteEntry(slug, poolOverride = null) {
  if (poolOverride) return poolOverride.find(p => p.slug === slug) ?? null;
  try {
    const pool = await readJsonl(REWRITE_POOL_PATH);
    return pool.find(p => p.slug === slug);
  } catch {
    return null;
  }
}

function inferKind(slug, candidate, rewriteEntry, areaHint) {
  // rewrite 优先（如果在 rewrite pool）
  if (rewriteEntry && rewriteEntry.status === 'available') {
    return rewriteEntry.area === 'papers' ? 'rewrite-paper' : 'rewrite-project';
  }
  if (candidate) {
    return candidate.area === 'papers' ? 'new-paper' : 'new-project';
  }
  return areaHint === 'papers' ? 'new-paper' : 'new-project';
}

async function buildContext(slug, kindOverride, worktreeIdx, options = {}) {
  const candidate = await findCandidate(slug, options.candidates);
  const rewriteEntry = await findRewriteEntry(slug, options.rewritePool);

  const kind = kindOverride || inferKind(slug, candidate, rewriteEntry, candidate?.area);
  const area = kind.endsWith('paper') ? 'papers' : 'projects';

  const worktree = worktreeForPipelineKind(kind, worktreeIdx, options.home);

  const isRewrite = kind.startsWith('rewrite-');
  const outputPath = `${worktree.path}/${docsEntryRelativePath(area, slug)}`;
  const existingPath = isRewrite ? outputPath : '';

  const tmpDir = options.tmpDir || `/tmp/pipeline-${slug}`;
  if (options.createTmpDir !== false) fsSync.mkdirSync(tmpDir, { recursive: true });
  const researchJson = path.join(tmpDir, 'research.json');
  const writerOut = path.join(tmpDir, 'writer.json');
  const reviewsJson = path.join(tmpDir, 'reviews.json');

  return {
    slug,
    kind,
    area,
    topic: candidate?.topic || rewriteEntry?.area || '',
    title: candidate?.title || slug,
    year: candidate?.meta?.col3 || '',
    why: candidate?.meta?.col4 || '',
    url: candidate?.url || '',
    worktree_path: worktree.path,
    branch_name: worktree.branch,
    output_path: outputPath,
    existing_path: existingPath,
    output_json: researchJson,
    research_json: researchJson,
    writer_out: writerOut,
    reviews_json: reviewsJson,
    tmp_dir: tmpDir,
  };
}

async function dumpStagePrompt(stage, ctx) {
  const tmpl = await loadPromptTemplate(stage);
  const rendered = renderTemplate(tmpl, ctx);
  console.log(JSON.stringify({
    stage,
    slug: ctx.slug,
    prompt_path: promptPath(stage),
    prompt_chars: rendered.length,
    output_path: ctx.output_path,
    research_json: ctx.research_json,
    worktree: ctx.branch_name,
    rendered,
  }, null, 2));
}

// CLI
async function main() {
  const args = parseArgs();
  if (!args.slug) {
    console.error('usage: node run-pipeline.mjs --slug <slug> [--stage <name>] [--kind <kind>] [--worktree <0|1>] [--dump]');
    process.exit(2);
  }

  const ctx = await buildContext(args.slug, args.kind, args.worktreeIdx);

  emit({ event: 'pipeline-context-built', slug: ctx.slug, kind: ctx.kind, worktree: ctx.branch_name });

  // 仅 dump 单 stage prompt（用于 manual 验证 / debug）
  if (args.dump) {
    if (!args.stage) {
      console.error('--dump requires --stage');
      process.exit(2);
    }
    await dumpStagePrompt(args.stage, ctx);
    return;
  }

  // 默认行为：并行读 6 个 stage 模板 + 并行写 6 个 rendered prompt 到 tmp
  const stages = PIPELINE_STAGES;
  const templates = await loadPromptTemplates(stages);
  await Promise.all(stages.map((s) =>
    fs.writeFile(path.join(ctx.tmp_dir, `${s}.prompt.md`), renderTemplate(templates[s], ctx))
  ));

  // 输出 ctx + 各 stage prompt 路径，workflow 用
  console.log(JSON.stringify({
    ...ctx,
    stage_prompts: Object.fromEntries(
      PIPELINE_STAGES.map(s => [s, path.join(ctx.tmp_dir, `${s}.prompt.md`)])
    ),
  }, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => {
    console.error('run-pipeline failed:', err);
    emit({ event: 'pipeline-driver-error', error: String(err) });
    process.exit(1);
  });
}

// Helpers exported for workflow programmatic use
export { buildContext, renderTemplate as renderPrompt, dumpStagePrompt };
export const STAGES = PIPELINE_STAGES;
export const QUALITY_GATE = validate;

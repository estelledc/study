#!/usr/bin/env node
// 单 slug 5-stage pipeline driver（M1 verbose 版）
// 由 workflow 内 agent 调用，或手动 CLI 跑单 slug 验证
//
// 用法：
//   node scripts/run-pipeline.mjs --area papers --slug codd-1979-extending           # 完整 pipeline
//   node scripts/run-pipeline.mjs --area projects --slug X --stage researcher --dump # 仅跑 researcher 输出 prompt（不调 agent）
//
// 注：本 driver 不直接调 LLM agent。它准备 prompt + 数据 + 写事件流，
//     真正的 agent 调用由外层 workflow 编排。这样保持单文件可测、可 dry-run。

import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { parseFrontmatterLoose } from './lib/frontmatter.mjs';
import { readJsonl } from './lib/jsonl.mjs';
import { CANDIDATES_PATH, REWRITE_POOL_PATH, docsEntryRelativePath } from './lib/paths.mjs';
import { isNoteArea, isNoteSlug } from './lib/note-id.mjs';
import {
  DISPATCH_PROMPT_KINDS,
  PIPELINE_STAGES,
  commonPromptVars,
  loadPromptTemplate,
  loadPromptTemplates,
  promptPath,
  renderTemplate,
} from './lib/prompts.mjs';
import { worktreeForPipelineKind } from './lib/worktrees.mjs';
import {
  buildPipelineReceipt,
  persistPipelineReceipt,
} from './lib/pipeline-review.mjs';
import {
  digestReceipt,
  expectedSourceRevision,
  readReceipt,
  sha256,
} from './lib/review-receipt.mjs';
import { emit } from './pipeline-events.mjs';
import { validate } from './quality-gate.mjs';

function parseArgs() {
  const args = {
    slug: null,
    area: null,
    stage: null,
    dump: false,
    kind: null,
    worktreeIdx: 0,
    finalizeReceipt: false,
    createdAt: null,
    expectedPredecessorDigest: undefined,
  };
  for (let i = 2; i < process.argv.length; i++) {
    const a = process.argv[i];
    if (a === '--slug') args.slug = process.argv[++i];
    else if (a === '--area') args.area = process.argv[++i];
    else if (a === '--stage') args.stage = process.argv[++i];
    else if (a === '--dump') args.dump = true;
    else if (a === '--kind') args.kind = process.argv[++i];
    else if (a === '--worktree') args.worktreeIdx = parseInt(process.argv[++i], 10);
    else if (a === '--finalize-receipt') args.finalizeReceipt = true;
    else if (a === '--created-at') args.createdAt = process.argv[++i];
    else if (a === '--expected-predecessor') {
      const value = process.argv[++i];
      args.expectedPredecessorDigest = value === 'none' ? null : value;
    }
    else throw new Error(`Unknown argument: ${a}`);
  }
  return args;
}

async function findCandidate(area, slug, candidatesOverride = null) {
  const candidates = candidatesOverride ?? await readJsonl(CANDIDATES_PATH);
  return candidates.find(c => c.area === area && c.slug === slug) ?? null;
}

async function findRewriteEntry(area, slug, poolOverride = null) {
  if (poolOverride) return poolOverride.find(p => p.area === area && p.slug === slug) ?? null;
  try {
    const pool = await readJsonl(REWRITE_POOL_PATH);
    return pool.find(p => p.area === area && p.slug === slug) ?? null;
  } catch {
    return null;
  }
}

function kindArea(kind) {
  if (!DISPATCH_PROMPT_KINDS.includes(kind)) throw new Error(`Invalid pipeline kind: ${kind}`);
  return kind.endsWith('paper') ? 'papers' : 'projects';
}

function inferKind(candidate, rewriteEntry, area) {
  // rewrite 优先（如果在 rewrite pool）
  if (rewriteEntry && rewriteEntry.status === 'available') {
    return rewriteEntry.area === 'papers' ? 'rewrite-paper' : 'rewrite-project';
  }
  if (candidate) {
    return candidate.area === 'papers' ? 'new-paper' : 'new-project';
  }
  return area === 'papers' ? 'new-paper' : 'new-project';
}

async function buildContext(slug, kindOverride, worktreeIdx, options = {}) {
  const area = options.area;
  if (!isNoteArea(area)) throw new Error(`Invalid or missing pipeline area: ${area || '<empty>'}`);
  if (!isNoteSlug(slug)) throw new Error(`Invalid pipeline slug: ${slug || '<empty>'}`);
  const candidate = await findCandidate(area, slug, options.candidates);
  const rewriteEntry = await findRewriteEntry(area, slug, options.rewritePool);

  const kind = kindOverride || inferKind(candidate, rewriteEntry, area);
  if (kindArea(kind) !== area) {
    throw new Error(`pipeline kind ${kind} does not match requested area ${area}`);
  }

  const worktree = worktreeForPipelineKind(kind, worktreeIdx, options.home);

  const isRewrite = kind.startsWith('rewrite-');
  const outputPath = `${worktree.path}/${docsEntryRelativePath(area, slug)}`;
  const existingPath = isRewrite ? outputPath : '';

  const tmpDir = options.tmpDir || `/tmp/pipeline-${area}-${slug}`;
  if (options.createTmpDir !== false) fsSync.mkdirSync(tmpDir, { recursive: true });
  const researchJson = path.join(tmpDir, 'research.json');
  const writerOut = path.join(tmpDir, 'writer.json');
  const reviewsJson = path.join(tmpDir, 'reviews.json');
  const reviewReceiptPath = path.join(worktree.path, 'data', 'review-receipts', area, `${slug}.json`);
  const evidenceDir = path.join(worktree.path, 'data', 'review-evidence', area, slug);

  return {
    slug,
    assignment: `${area}::${slug}`,
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
    receipt_path: reviewReceiptPath,
    review_receipt_path: reviewReceiptPath,
    evidence_dir: evidenceDir,
    tmp_dir: tmpDir,
    ...commonPromptVars({ area, worktree }),
  };
}

export async function finalizeReceiptFromContext(ctx, options = {}) {
  if (options.expectedPredecessorDigest === undefined) {
    throw new Error('receipt finalization requires an explicit expected predecessor digest or null');
  }
  if (!options.createdAt) throw new Error('receipt finalization requires an explicit createdAt instant');
  const [noteText, researchBytes, reviewsText] = await Promise.all([
    fs.readFile(ctx.output_path, 'utf8'),
    fs.readFile(ctx.research_json),
    fs.readFile(ctx.reviews_json, 'utf8'),
  ]);
  const parsedReviews = JSON.parse(reviewsText);
  const reviewerResults = Array.isArray(parsedReviews) ? parsedReviews : parsedReviews.reviewers;
  if (!Array.isArray(reviewerResults)) throw new Error('reviews.json must contain a reviewer result array');
  const trust = parseFrontmatterLoose(noteText)?.trust;
  const sourceRevision = expectedSourceRevision(trust);
  if (!sourceRevision) throw new Error('note trust provenance has no source revision');

  let previous = null;
  try {
    previous = await readReceipt(ctx.review_receipt_path);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const predecessorDigest = options.expectedPredecessorDigest;
  const receipt = buildPipelineReceipt({
    area: ctx.area,
    slug: ctx.slug,
    noteText,
    sourceRevision,
    researchInputSha256: sha256(researchBytes),
    reviewerResults,
    generation: previous ? previous.generation + 1 : 1,
    predecessorDigest,
    createdAt: options.createdAt,
  });
  const persisted = await persistPipelineReceipt({
    rootDir: ctx.worktree_path,
    receiptPath: ctx.review_receipt_path,
    receipt,
    noteText,
    expectedPredecessorDigest: predecessorDigest,
    evidenceType: trust.evidence_type,
  });
  return {
    assignment: ctx.assignment,
    receipt_path: ctx.review_receipt_path,
    receipt_digest_sha256: digestReceipt(receipt),
    generation: receipt.generation,
    evidence_state: persisted.verification.evidence_state,
  };
}

async function dumpStagePrompt(stage, ctx) {
  const tmpl = await loadPromptTemplate(stage);
  const rendered = renderTemplate(tmpl, ctx);
  console.log(JSON.stringify({
    stage,
    slug: ctx.slug,
    area: ctx.area,
    assignment: ctx.assignment,
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
  if (!isNoteArea(args.area) || !isNoteSlug(args.slug)) {
    console.error('usage: node run-pipeline.mjs --area <papers|projects> --slug <slug> [--stage <name>] [--kind <kind>] [--worktree <0|1>] [--dump]');
    process.exit(2);
  }

  const ctx = await buildContext(args.slug, args.kind, args.worktreeIdx, { area: args.area });

  if (args.finalizeReceipt) {
    const finalized = await finalizeReceiptFromContext(ctx, {
      createdAt: args.createdAt,
      expectedPredecessorDigest: args.expectedPredecessorDigest,
    });
    console.log(JSON.stringify(finalized, null, 2));
    return;
  }

  // 仅 dump 单 stage prompt（用于 manual 验证 / debug）
  if (args.dump) {
    if (!args.stage) {
      console.error('--dump requires --stage');
      process.exit(2);
    }
    await dumpStagePrompt(args.stage, ctx);
    return;
  }

  emit({
    event: 'pipeline-context-built',
    area: ctx.area,
    slug: ctx.slug,
    assignment: ctx.assignment,
    kind: ctx.kind,
    worktree: ctx.branch_name,
  });

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
    const areaIndex = process.argv.indexOf('--area');
    const slugIndex = process.argv.indexOf('--slug');
    const area = areaIndex >= 0 ? process.argv[areaIndex + 1] : null;
    const slug = slugIndex >= 0 ? process.argv[slugIndex + 1] : null;
    emit({
      event: 'pipeline-driver-error',
      ...(isNoteArea(area) ? { area } : {}),
      ...(isNoteSlug(slug) ? { slug } : {}),
      ...(isNoteArea(area) && isNoteSlug(slug) ? { assignment: `${area}::${slug}` } : {}),
      error: String(err),
    });
    process.exit(1);
  });
}

// Helpers exported for workflow programmatic use
export { buildContext, renderTemplate as renderPrompt, dumpStagePrompt };
export const STAGES = PIPELINE_STAGES;
export const QUALITY_GATE = validate;

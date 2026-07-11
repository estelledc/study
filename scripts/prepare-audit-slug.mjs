#!/usr/bin/env node
// 为 audit slug 生成轻量 research stub + 渲染 reviewer/refiner 上下文路径
//
// 用法：
//   node scripts/prepare-audit-slug.mjs --slug paxos --area papers --out /tmp/audit-paxos

import fs from 'node:fs/promises';
import path from 'node:path';
import { extractFrontmatterBlock, parseFrontmatterKeyValues } from './lib/frontmatter.mjs';
import { assertBulkOperationAuthorized } from './lib/operations-policy.mjs';
import {
  AUDIT_REVIEWS_DIR,
  DOCS_DIR,
  PROMPTS_DIR,
  ROOT,
  docsEntryPath,
} from './lib/paths.mjs';

function parseArgs() {
  const args = { slug: null, area: null, out: null };
  for (let i = 2; i < process.argv.length; i++) {
    const a = process.argv[i];
    if (a === '--slug') args.slug = process.argv[++i];
    else if (a === '--area') args.area = process.argv[++i];
    else if (a === '--out') args.out = process.argv[++i];
  }
  if (!args.slug || !args.area) throw new Error('--slug and --area required');
  if (!args.out) args.out = path.join('/tmp', `audit-${args.slug}`);
  return args;
}

function excerptBody(text, maxChars = 1200) {
  const fm = extractFrontmatterBlock(text);
  const body = fm ? text.slice(fm.end) : text;
  const cleaned = body.replace(/\n{3,}/g, '\n\n').trim();
  return cleaned.length > maxChars ? cleaned.slice(0, maxChars) + '\n…' : cleaned;
}

async function main() {
  const args = parseArgs();
  assertBulkOperationAuthorized({ operation: 'prepare-audit-slug', requestedItems: 1 });
  const notePath = docsEntryPath(args.area, args.slug);
  const text = await fs.readFile(notePath, 'utf8');
  const fmBlock = extractFrontmatterBlock(text);
  const fields = fmBlock ? parseFrontmatterKeyValues(fmBlock.block) : {};

  await fs.mkdir(args.out, { recursive: true });
  await fs.mkdir(path.join(AUDIT_REVIEWS_DIR, args.area), { recursive: true });

  const stub = {
    mode: 'audit',
    slug: args.slug,
    area: args.area,
    title: fields.title || args.slug,
    source: fields['来源'] || fields.source || null,
    date: fields['日期'] || fields.date || null,
    category: fields['分类'] || fields.category || null,
    difficulty: fields['难度'] || fields.difficulty || null,
    excerpt: excerptBody(text),
    note: 'Lightweight stub for content audit; not a full paper extract.',
  };

  const stubPath = path.join(args.out, 'research-stub.json');
  await fs.writeFile(stubPath, JSON.stringify(stub, null, 2) + '\n');

  const ctx = {
    slug: args.slug,
    area: args.area,
    title: stub.title,
    output_path: notePath,
    research_stub_path: stubPath,
    reviews_json: path.join(args.out, 'reviews.json'),
    review_artifact: path.join(AUDIT_REVIEWS_DIR, args.area, `${args.slug}.json`),
    base_rules_path: path.join(PROMPTS_DIR, 'base-rules.md'),
    template_note_path: path.join(DOCS_DIR, 'papers', 'hindley-milner.md'),
    quality_gate_path: path.join(ROOT, 'scripts', 'quality-gate.mjs'),
    prompts: {
      'zero-base': path.join(PROMPTS_DIR, 'audit-reviewer-zero-base.md'),
      academic: path.join(PROMPTS_DIR, 'audit-reviewer-academic.md'),
      engineer: path.join(PROMPTS_DIR, 'audit-reviewer-engineer.md'),
      refiner: path.join(PROMPTS_DIR, 'audit-refiner.md'),
      'rewrite-paper': path.join(PROMPTS_DIR, 'rewrite-paper.md'),
      'rewrite-project': path.join(PROMPTS_DIR, 'rewrite-project.md'),
    },
  };

  const ctxPath = path.join(args.out, 'ctx.json');
  await fs.writeFile(ctxPath, JSON.stringify(ctx, null, 2) + '\n');
  console.log(JSON.stringify({ ok: true, ctx: ctxPath, stub: stubPath }, null, 2));
}

main().catch((err) => {
  console.error('prepare-audit-slug failed:', err);
  process.exit(1);
});

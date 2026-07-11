import assert from 'node:assert/strict';
import { execFile as execFileCallback } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';

import { buildContext, finalizeReceiptFromContext, renderPrompt } from './run-pipeline.mjs';

const HOME = '/tmp/study-home';
const execFile = promisify(execFileCallback);

test('buildContext resolves duplicate slugs only inside the requested area', async () => {
  const ctx = await buildContext('shared-slug', null, 1, {
    area: 'papers',
    home: HOME,
    tmpDir: '/tmp/pipeline-fixture',
    createTmpDir: false,
    candidates: [
      { area: 'papers', slug: 'shared-slug', topic: 'candidate-topic', title: 'Candidate', meta: { col3: '2024', col4: 'why' }, url: 'https://example.com/c' },
    ],
    rewritePool: [
      { area: 'projects', slug: 'shared-slug', status: 'available' },
    ],
  });

  assert.equal(ctx.kind, 'new-paper');
  assert.equal(ctx.area, 'papers');
  assert.equal(ctx.assignment, 'papers::shared-slug');
  assert.equal(ctx.worktree_path, '/tmp/study-home/study-refactor-papers-2');
  assert.equal(ctx.output_path, '/tmp/study-home/study-refactor-papers-2/src/content/docs/papers/shared-slug.md');
  assert.equal(ctx.existing_path, '');
  assert.equal(ctx.receipt_path, '/tmp/study-home/study-refactor-papers-2/data/review-receipts/papers/shared-slug.json');
  assert.equal(ctx.evidence_dir, '/tmp/study-home/study-refactor-papers-2/data/review-evidence/papers/shared-slug');
});

test('buildContext honors kind override and computes output paths from the chosen kind', async () => {
  const ctx = await buildContext('manual-slug', 'new-paper', 2, {
    area: 'papers',
    home: HOME,
    tmpDir: '/tmp/manual-pipeline',
    createTmpDir: false,
    candidates: [],
    rewritePool: [],
  });

  assert.equal(ctx.kind, 'new-paper');
  assert.equal(ctx.area, 'papers');
  assert.equal(ctx.branch_name, 'refactor/papers-3');
  assert.equal(ctx.output_path, '/tmp/study-home/study-refactor-papers-3/src/content/docs/papers/manual-slug.md');
  assert.equal(ctx.existing_path, '');
});

test('buildContext rejects a kind whose area disagrees with the requested identity', async () => {
  await assert.rejects(
    () => buildContext('manual-slug', 'new-project', 0, {
      area: 'papers',
      home: HOME,
      tmpDir: '/tmp/manual-pipeline-mismatch',
      createTmpDir: false,
      candidates: [],
      rewritePool: [],
    }),
    /kind.*area|area.*kind/,
  );
});

test('renderPrompt remains a literal replacement alias for renderTemplate', () => {
  assert.equal(renderPrompt('{{slug}} {{value}}', { slug: 'x', value: '$1 and $&' }), 'x $1 and $&');
});

test('run-pipeline finalization consumes reviews.json and persists an evidence-honest receipt', async () => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'study-run-pipeline-receipt-'));
  const outputPath = path.join(rootDir, 'src/content/docs/projects/example.md');
  const tmpDir = path.join(rootDir, 'tmp');
  const receiptFile = path.join(rootDir, 'data/review-receipts/projects/example.json');
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.mkdir(tmpDir, { recursive: true });
  const noteText = `---
title: Example
trust:
  version: study-v2
  source_kind: project
  note_type: concept
  canonical_source: https://github.com/example/project
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-07-09'
  immutable_revision: 0123456789abcdef
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-07-10'
  review_after: '2027-07-10'
---

## 学到什么

好比测试。

## 核心机制

例如输入输出。
`;
  await fs.writeFile(outputPath, noteText, 'utf8');
  await fs.writeFile(path.join(tmpDir, 'research.json'), '{"source":"fixture"}\n', 'utf8');
  const reviewer = (name, codeMode) => ({
    reviewer: name,
    reviewer_version: 'prompt-v2',
    average: 4.5,
    verdict: 'pass',
    fix_hints: [],
    execution: { review_mode: 'STATIC_REVIEW', code_mode: codeMode },
  });
  await fs.writeFile(path.join(tmpDir, 'reviews.json'), `${JSON.stringify([
    reviewer('zero-base', 'NOT_APPLICABLE'),
    reviewer('engineer', 'MANUAL_SIMULATION'),
    reviewer('academic', 'NOT_APPLICABLE'),
  ])}\n`, 'utf8');
  await execFile('git', ['init', '-q'], { cwd: rootDir });
  await execFile('git', ['add', 'src/content/docs/projects/example.md'], { cwd: rootDir });
  const result = await finalizeReceiptFromContext({
    area: 'projects', slug: 'example', assignment: 'projects::example',
    output_path: outputPath,
    research_json: path.join(tmpDir, 'research.json'),
    reviews_json: path.join(tmpDir, 'reviews.json'),
    review_receipt_path: receiptFile,
    worktree_path: rootDir,
  }, { createdAt: '2026-07-10T00:00:00Z', expectedPredecessorDigest: null });
  assert.equal(result.evidence_state, 'UNVERIFIED');
  assert.equal(result.generation, 1);
  assert.equal(JSON.parse(await fs.readFile(receiptFile, 'utf8')).reviewers.length, 3);
});

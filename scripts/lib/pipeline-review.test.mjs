import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFile as execFileCallback } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';

import {
  buildPipelineReceipt,
  normalizeReviewerResult,
  persistPipelineReceipt,
} from './pipeline-review.mjs';

const execFile = promisify(execFileCallback);

function note() {
  return `---
title: Example
trust:
  version: study-v2
  source_kind: project
  note_type: library
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

好比一个最小例子。

## 核心机制

\`\`\`js
console.log('example')
\`\`\`
`;
}

function result(reviewer, execution) {
  return {
    reviewer,
    reviewer_version: 'prompt-v2',
    scores: { one: 4, two: 5 },
    average: 4.5,
    verdict: 'pass',
    weakest_section: null,
    fix_hints: [],
    execution,
  };
}

test('reviewer results persist explicit execution modes without promoting simulation to actual', () => {
  const normalized = normalizeReviewerResult(result('engineer', {
    review_mode: 'STATIC_REVIEW',
    code_mode: 'MANUAL_SIMULATION',
  }));
  assert.equal(normalized.role, 'ENGINEER');
  assert.equal(normalized.execution.code_mode, 'MANUAL_SIMULATION');
  assert.equal('evidence_artifact' in normalized.execution, false);
});

test('pipeline builds and CAS-persists a receipt from all three reviewer outputs', async () => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'study-pipeline-receipt-'));
  const notePath = path.join(rootDir, 'src/content/docs/projects/example.md');
  const receiptFile = path.join(rootDir, 'data/review-receipts/projects/example.json');
  await fs.mkdir(path.dirname(notePath), { recursive: true });
  await fs.writeFile(notePath, note(), 'utf8');
  await execFile('git', ['init', '-q'], { cwd: rootDir });
  await execFile('git', ['add', 'src/content/docs/projects/example.md'], { cwd: rootDir });
  const researchBytes = '{"source":"fixture"}\n';
  const reviews = [
    result('zero-base', { review_mode: 'STATIC_REVIEW', code_mode: 'NOT_APPLICABLE' }),
    result('engineer', { review_mode: 'STATIC_REVIEW', code_mode: 'MANUAL_SIMULATION' }),
    result('academic', { review_mode: 'STATIC_REVIEW', code_mode: 'NOT_APPLICABLE' }),
  ];
  const receipt = buildPipelineReceipt({
    area: 'projects',
    slug: 'example',
    noteText: note(),
    sourceRevision: '0123456789abcdef',
    researchInputSha256: createHash('sha256').update(researchBytes).digest('hex'),
    reviewerResults: reviews,
    generation: 1,
    predecessorDigest: null,
    createdAt: '2026-07-10T00:00:00Z',
  });
  assert.equal(receipt.reviewers.length, 3);
  assert.equal(receipt.reviewers[1].execution.code_mode, 'MANUAL_SIMULATION');

  const written = await persistPipelineReceipt({
    rootDir,
    receiptPath: receiptFile,
    receipt,
    noteText: note(),
    expectedPredecessorDigest: null,
    evidenceType: 'STATIC_ANALYSIS',
  });
  assert.equal(written.verification.evidence_state, 'UNVERIFIED');
  assert.deepEqual(JSON.parse(await fs.readFile(receiptFile, 'utf8')), receipt);
});

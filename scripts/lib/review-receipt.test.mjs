import assert from 'node:assert/strict';
import { execFile as execFileCallback } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';

import {
  canonicalizeNote,
  digestReceipt,
  digestNote,
  receiptPath,
  validateReceipt,
  verifyReceiptAgainstNote,
  writeReceiptAtomic,
} from './review-receipt.mjs';

const HASH = 'a'.repeat(64);
const execFile = promisify(execFileCallback);
const BACKLINK_MARKER = '<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->';

function note(backlinks = '- [[one]]') {
  return `---\ntitle: Example\n---\n\n## 是什么\n\n正文\n\n## 反向链接\n\n${BACKLINK_MARKER}\n\n${backlinks}\n`;
}

function validReceipt(noteText = note()) {
  const modes = {
    ZERO_BASE: ['STATIC_REVIEW', 'NOT_APPLICABLE'],
    ENGINEER: ['STATIC_REVIEW', 'MANUAL_SIMULATION'],
    ACADEMIC: ['STATIC_REVIEW', 'NOT_APPLICABLE'],
  };
  return {
    schema_version: 'study-review-receipt-v1',
    generation: 1,
    predecessor_digest_sha256: null,
    note: { area: 'projects', slug: 'example', digest_sha256: digestNote(noteText) },
    source_revision: '0123456789abcdef0123456789abcdef01234567',
    research_input_sha256: HASH,
    reviewers: Object.entries(modes).map(([role, [review_mode, code_mode]]) => ({
      role,
      reviewer_version: 'prompt-v1',
      decision: 'PASS',
      score: 90,
      warnings: [],
      execution: code_mode === 'ACTUAL_RUN'
        ? {
            review_mode,
            code_mode,
            evidence_artifact: {
              path: 'data/review-evidence/projects/example/engineer.json',
              sha256: HASH,
            },
          }
        : { review_mode, code_mode },
    })),
    waivers: [],
    created_at: '2026-07-10T00:00:00Z',
  };
}

test('canonical digest ignores only the generated backlinks section', () => {
  assert.equal(digestNote(note('- [[one]]')), digestNote(note('- [[two]]')));
  assert.equal(canonicalizeNote(note()).includes('反向链接'), false);
  assert.notEqual(digestNote(note()), digestNote(note().replace('正文', '正文有变化')));
  const handwritten = note().replace(BACKLINK_MARKER, '手写说明');
  assert.notEqual(digestNote(handwritten), digestNote(handwritten.replace('手写说明', '手写说明已修改')));
});

test('receipt paths use area directories and reject traversal', () => {
  assert.equal(receiptPath('receipts', 'papers', 'raft'), path.join('receipts', 'papers', 'raft.json'));
  assert.throws(() => receiptPath('receipts', 'papers', '../raft'), /invalid receipt slug/);
  assert.throws(() => receiptPath('receipts', 'papers::raft', 'raft'), /invalid receipt area/);
});

test('schema requires three roles or explicit waivers and separate modes', async () => {
  const receipt = validReceipt();
  assert.deepEqual(validateReceipt(receipt), { ok: true, errors: [] });

  receipt.reviewers[1].execution.review_mode = 'MANUAL_SIMULATION';
  const checked = await verifyReceiptAgainstNote(receipt, note(), {
    area: 'projects',
    slug: 'example',
    sourceRevision: receipt.source_revision,
  });
  assert.equal(checked.ok, true);
  assert.equal(checked.has_manual_simulation, true);
  assert.equal(checked.evidence_state, 'UNVERIFIED');
});

test('executed experiment requires actual engineer code evidence', async () => {
  const receipt = validReceipt();
  receipt.reviewers.find(({ role }) => role === 'ENGINEER').execution.code_mode = 'STATIC_REVIEW';
  delete receipt.reviewers.find(({ role }) => role === 'ENGINEER').execution.evidence_artifact;
  const checked = await verifyReceiptAgainstNote(receipt, note(), {
    area: 'projects',
    slug: 'example',
    sourceRevision: receipt.source_revision,
    evidenceType: 'EXECUTED_EXPERIMENT',
  });
  assert.equal(checked.ok, false);
  assert.match(checked.errors.join('\n'), /ACTUAL_RUN code mode/);
});

test('an explicit waiver can satisfy completeness but never claims verified evidence', async () => {
  const receipt = validReceipt();
  receipt.reviewers = receipt.reviewers.filter(({ role }) => role !== 'ACADEMIC');
  receipt.waivers = [{
    role: 'ACADEMIC',
    reason_code: 'NOT_APPLICABLE',
    approved_by_role: 'MAINTAINER',
    created_at: '2026-07-10T00:00:00Z',
  }];
  const checked = await verifyReceiptAgainstNote(receipt, note(), {
    area: 'projects',
    slug: 'example',
    sourceRevision: receipt.source_revision,
  });
  assert.equal(checked.ok, true);
  assert.equal(checked.has_waivers, true);
  assert.equal(checked.evidence_state, 'UNVERIFIED');
});

test('a structurally valid FAIL decision still blocks note acceptance', async () => {
  const receipt = validReceipt();
  receipt.reviewers[0].decision = 'FAIL';
  assert.equal(validateReceipt(receipt).ok, true);
  const checked = await verifyReceiptAgainstNote(receipt, note(), {
    area: 'projects',
    slug: 'example',
    sourceRevision: receipt.source_revision,
  });
  assert.equal(checked.ok, false);
  assert.match(checked.errors.join('\n'), /failed decision/);
  assert.equal(checked.evidence_state, 'UNVERIFIED');
});

test('note changes make an otherwise valid receipt stale', async () => {
  const receipt = validReceipt();
  const checked = await verifyReceiptAgainstNote(receipt, note().replace('正文', '已修改'), {
    area: 'projects',
    slug: 'example',
    sourceRevision: receipt.source_revision,
  });
  assert.equal(checked.ok, false);
  assert.match(checked.errors.join('\n'), /stale/);
});

test('receipt timestamps reject calendar rollover and summaries reject newlines', () => {
  const receipt = validReceipt();
  receipt.created_at = '2026-02-30T00:00:00Z';
  receipt.reviewers[0].warnings = ['line one\nline two'];
  const checked = validateReceipt(receipt);
  assert.equal(checked.ok, false);
  assert.match(checked.errors.join('\n'), /UTC ISO-8601 instant/);
  assert.match(checked.errors.join('\n'), /short strings/);
});

test('atomic writer validates before replacement and leaves valid JSON', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'study-receipt-'));
  const filePath = path.join(directory, 'projects', 'example.json');
  const receipt = validReceipt();
  await writeReceiptAtomic(filePath, receipt);
  assert.deepEqual(JSON.parse(await fs.readFile(filePath, 'utf8')), receipt);

  const invalid = { ...receipt, schema_version: 'unknown' };
  await assert.rejects(() => writeReceiptAtomic(filePath, invalid), /invalid review receipt/);
  assert.deepEqual(JSON.parse(await fs.readFile(filePath, 'utf8')), receipt);
});

test('ACTUAL_RUN verifies a tracked structured evidence artifact by path and raw SHA-256', async () => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'study-receipt-evidence-'));
  const artifactPath = 'data/review-evidence/projects/example/engineer.json';
  const absoluteArtifact = path.join(rootDir, artifactPath);
  await fs.mkdir(path.dirname(absoluteArtifact), { recursive: true });
  const artifact = {
    schema_version: 'study-execution-evidence-v1',
    command: { argv: ['node', '--test', 'fixture.test.mjs'], cwd: '.' },
    exit_code: 0,
    result: { status: 'PASS', summary: 'Fixture command completed successfully.' },
    created_at: '2026-07-10T00:00:00Z',
  };
  const artifactBytes = `${JSON.stringify(artifact, null, 2)}\n`;
  await fs.writeFile(absoluteArtifact, artifactBytes, 'utf8');
  await execFile('git', ['init', '-q'], { cwd: rootDir });
  await execFile('git', ['add', artifactPath], { cwd: rootDir });

  const receipt = validReceipt();
  const engineer = receipt.reviewers.find(({ role }) => role === 'ENGINEER');
  engineer.execution.code_mode = 'ACTUAL_RUN';
  engineer.execution.evidence_artifact = {
    path: artifactPath,
    sha256: HASH,
  };
  engineer.execution.evidence_artifact.sha256 = HASH;
  let checked = await verifyReceiptAgainstNote(receipt, note(), {
    area: 'projects', slug: 'example', sourceRevision: receipt.source_revision, rootDir,
  });
  assert.equal(checked.ok, false);
  assert.match(checked.errors.join('\n'), /artifact digest/);

  engineer.execution.evidence_artifact.sha256 = (await import('node:crypto'))
    .createHash('sha256').update(artifactBytes).digest('hex');
  checked = await verifyReceiptAgainstNote(receipt, note(), {
    area: 'projects', slug: 'example', sourceRevision: receipt.source_revision, rootDir,
  });
  assert.equal(checked.ok, true, checked.errors.join('; '));
  assert.equal(checked.evidence_state, 'VERIFIED');

  await fs.writeFile(absoluteArtifact, artifactBytes.replace('successfully', 'with tampering'), 'utf8');
  checked = await verifyReceiptAgainstNote(receipt, note(), {
    area: 'projects', slug: 'example', sourceRevision: receipt.source_revision, rootDir,
  });
  assert.equal(checked.evidence_state, 'UNVERIFIED');
  assert.match(checked.errors.join('\n'), /artifact digest/);
});

test('untracked, missing, malformed, or manual-simulation evidence cannot become VERIFIED', async () => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'study-receipt-untracked-'));
  await execFile('git', ['init', '-q'], { cwd: rootDir });
  const receipt = validReceipt();
  const engineer = receipt.reviewers.find(({ role }) => role === 'ENGINEER');
  engineer.execution.code_mode = 'ACTUAL_RUN';
  engineer.execution.evidence_artifact = {
    path: 'data/review-evidence/projects/example/engineer.json',
    sha256: HASH,
  };
  const checked = await verifyReceiptAgainstNote(receipt, note(), {
    area: 'projects', slug: 'example', sourceRevision: receipt.source_revision, rootDir,
  });
  assert.equal(checked.evidence_state, 'UNVERIFIED');
  assert.match(checked.errors.join('\n'), /evidence artifact/);

  engineer.execution.code_mode = 'MANUAL_SIMULATION';
  delete engineer.execution.evidence_artifact;
  const manual = await verifyReceiptAgainstNote(receipt, note(), {
    area: 'projects', slug: 'example', sourceRevision: receipt.source_revision, rootDir,
  });
  assert.equal(manual.ok, true);
  assert.equal(manual.has_manual_simulation, true);
  assert.equal(manual.evidence_state, 'UNVERIFIED');
});

test('receipt writes use generation, predecessor digest and CAS fencing', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'study-receipt-cas-'));
  const filePath = path.join(directory, 'projects', 'example.json');
  const first = validReceipt();
  await writeReceiptAtomic(filePath, first, { expectedPredecessorDigest: null });
  const firstDigest = digestReceipt(first);

  const second = {
    ...first,
    generation: 2,
    predecessor_digest_sha256: firstDigest,
    created_at: '2026-07-10T00:01:00Z',
  };
  await writeReceiptAtomic(filePath, second, { expectedPredecessorDigest: firstDigest });

  const replay = {
    ...first,
    generation: 2,
    predecessor_digest_sha256: firstDigest,
    created_at: '2026-07-10T00:02:00Z',
  };
  await assert.rejects(
    () => writeReceiptAtomic(filePath, replay, { expectedPredecessorDigest: firstDigest }),
    /CAS|generation|predecessor/,
  );
  assert.deepEqual(JSON.parse(await fs.readFile(filePath, 'utf8')), second);
});

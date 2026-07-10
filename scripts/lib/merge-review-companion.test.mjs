import assert from 'node:assert/strict';
import { execFile as execFileCallback } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';

import { validateCommitScope } from './git-commit-scope.mjs';
import { gitMaybe } from './git.mjs';
import {
  installReviewCompanion,
  parsePorcelainStatus,
  prepareReviewCompanion,
  ReviewCompanionError,
  verifyInstalledReviewCompanion,
} from './merge-review-companion.mjs';
import { digestNote, sha256 } from './review-receipt.mjs';

const execFile = promisify(execFileCallback);
const REVISION = '0123456789abcdef0123456789abcdef01234567';

async function git(cwd, ...args) {
  const { stdout } = await execFile('git', args, { cwd, encoding: 'utf8' });
  return stdout.trim();
}

function noteText(verificationStatus = 'UNVERIFIED') {
  return `---
title: Review companion fixture
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/example/project
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-07-09'
  immutable_revision: ${REVISION}
  evidence_type: STATIC_ANALYSIS
  verification_status: ${verificationStatus}
  reviewed_at: '2026-07-10'
  review_after: '2027-07-10'
---

## 学到什么

用一个类比解释受控伴随文件如何进入 canonical commit。
`;
}

function receipt(text, options = {}) {
  const actualRun = options.actualRun === true;
  const evidencePath = 'data/review-evidence/projects/fixture/engineer.json';
  return {
    schema_version: 'study-review-receipt-v1',
    generation: options.generation ?? 1,
    predecessor_digest_sha256: options.predecessor ?? null,
    note: { area: 'projects', slug: 'fixture', digest_sha256: digestNote(text) },
    source_revision: REVISION,
    research_input_sha256: 'a'.repeat(64),
    reviewers: ['ZERO_BASE', 'ENGINEER', 'ACADEMIC'].map((role) => ({
      role,
      reviewer_version: 'fixture-v1',
      decision: 'PASS',
      score: 90,
      warnings: [],
      execution: role === 'ENGINEER' && actualRun
        ? {
            review_mode: 'STATIC_REVIEW',
            code_mode: 'ACTUAL_RUN',
            evidence_artifact: { path: evidencePath, sha256: options.evidenceSha256 },
          }
        : { review_mode: 'STATIC_REVIEW', code_mode: 'NOT_APPLICABLE' },
    })),
    waivers: [],
    created_at: '2026-07-10T00:00:00Z',
  };
}

async function fixture(options = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'study-review-companion-'));
  const canonicalRoot = path.join(root, 'canonical');
  const sourceRoot = path.join(root, 'worker');
  await fs.mkdir(canonicalRoot);
  await git(canonicalRoot, 'init', '-q', '-b', 'main');
  await git(canonicalRoot, 'config', 'user.name', 'Study Test');
  await git(canonicalRoot, 'config', 'user.email', 'study-test@example.invalid');
  await fs.writeFile(path.join(canonicalRoot, 'README.md'), 'fixture\n');
  await fs.mkdir(path.join(canonicalRoot, 'data/review-receipts'), { recursive: true });
  await fs.mkdir(path.join(canonicalRoot, 'data/review-evidence'), { recursive: true });
  await fs.writeFile(path.join(canonicalRoot, 'data/review-receipts/.gitkeep'), '');
  await fs.writeFile(path.join(canonicalRoot, 'data/review-evidence/.gitkeep'), '');
  await git(canonicalRoot, 'add', 'README.md', 'data');
  await git(canonicalRoot, 'commit', '-qm', 'base');
  const base = await git(canonicalRoot, 'rev-parse', 'HEAD');
  await git(canonicalRoot, 'worktree', 'add', '-q', '-b', 'worker', sourceRoot);

  const relativeNote = 'src/content/docs/projects/fixture.md';
  const text = noteText(options.verificationStatus);
  await fs.mkdir(path.dirname(path.join(sourceRoot, relativeNote)), { recursive: true });
  await fs.writeFile(path.join(sourceRoot, relativeNote), text);
  await git(sourceRoot, 'add', relativeNote);
  await git(sourceRoot, 'commit', '-qm', 'worker note');
  const workerCommit = await git(sourceRoot, 'rev-parse', 'HEAD');

  let evidence = null;
  if (options.actualRun) {
    evidence = Buffer.from(`${JSON.stringify({
      schema_version: 'study-execution-evidence-v1',
      command: { argv: ['node', '--test'], cwd: '.' },
      exit_code: 0,
      result: { status: 'PASS', summary: 'Focused fixture passed' },
      created_at: '2026-07-10T00:00:00Z',
    }, null, 2)}\n`);
    const evidencePath = 'data/review-evidence/projects/fixture/engineer.json';
    await fs.mkdir(path.dirname(path.join(sourceRoot, evidencePath)), { recursive: true });
    await fs.writeFile(path.join(sourceRoot, evidencePath), evidence);
    await git(sourceRoot, 'add', evidencePath);
  }
  const receiptValue = receipt(text, {
    ...options,
    evidenceSha256: evidence ? sha256(evidence) : undefined,
  });
  const receiptPath = 'data/review-receipts/projects/fixture.json';
  await fs.mkdir(path.dirname(path.join(sourceRoot, receiptPath)), { recursive: true });
  await fs.writeFile(path.join(sourceRoot, receiptPath), `${JSON.stringify(receiptValue, null, 2)}\n`);

  return {
    root,
    canonicalRoot,
    sourceRoot,
    base,
    workerCommit,
    relativeNote,
    receiptPath,
    text,
  };
}

async function cleanup(value) {
  await fs.rm(value.root, { recursive: true, force: true });
}

test('porcelain parser preserves index/worktree status and rejects renames', () => {
  assert.deepEqual(parsePorcelainStatus(Buffer.from('A  data/a.json\0?? data/b.json\0')), [
    { status: 'A ', path: 'data/a.json' },
    { status: '??', path: 'data/b.json' },
  ]);
  assert.throws(
    () => parsePorcelainStatus(Buffer.from('R  data/a.json\0data/b.json\0')),
    (error) => error instanceof ReviewCompanionError && error.code === 'REVIEW_COMPANION_STATUS_INVALID',
  );
});

test('static receipt is ingested into the same canonical commit as the reviewed note', async () => {
  const value = await fixture();
  try {
    const prepared = await prepareReviewCompanion({
      sourceRoot: value.sourceRoot,
      canonicalRoot: value.canonicalRoot,
      area: 'projects',
      slug: 'fixture',
      noteRelativePath: value.relativeNote,
    });
    assert.deepEqual(prepared.files.map((file) => file.path), [value.receiptPath]);
    assert.equal(prepared.verification.evidence_state, 'UNVERIFIED');

    const reviewedScope = validateCommitScope({
      commit: value.workerCommit,
      expectedPath: value.relativeNote,
    }, { cwd: value.canonicalRoot });
    await git(value.canonicalRoot, 'cherry-pick', value.workerCommit);
    const installed = await installReviewCompanion(prepared, { rootDir: value.canonicalRoot });
    const verified = await verifyInstalledReviewCompanion(prepared, {
      rootDir: value.canonicalRoot,
      commit: installed.commit,
      expectedParent: value.base,
      reviewedScope,
    });

    assert.equal(verified.ok, true);
    assert.deepEqual(verified.paths.sort(), [value.receiptPath, value.relativeNote].sort());
    assert.equal(await git(value.canonicalRoot, 'status', '--short'), '');
    assert.equal(await git(value.canonicalRoot, 'show', `${installed.commit}:${value.receiptPath}`)
      .then((raw) => JSON.parse(raw).note.slug), 'fixture');
  } finally {
    await cleanup(value);
  }
});

test('a staging failure restores companion files and leaves the picked commit unchanged', async () => {
  const value = await fixture();
  try {
    const prepared = await prepareReviewCompanion({
      sourceRoot: value.sourceRoot,
      canonicalRoot: value.canonicalRoot,
      area: 'projects',
      slug: 'fixture',
      noteRelativePath: value.relativeNote,
    });
    await git(value.canonicalRoot, 'cherry-pick', value.workerCommit);
    const pickedHead = await git(value.canonicalRoot, 'rev-parse', 'HEAD');

    await assert.rejects(
      installReviewCompanion(prepared, {
        rootDir: value.canonicalRoot,
        gitMaybeFn(args, options) {
          if (args[0] === 'add') return { ok: false, out: '', error: 'injected staging failure' };
          return gitMaybe(args, options);
        },
      }),
      (error) => error instanceof ReviewCompanionError
        && error.code === 'REVIEW_COMPANION_STAGE_FAILED',
    );

    assert.equal(await git(value.canonicalRoot, 'rev-parse', 'HEAD'), pickedHead);
    assert.equal(await git(value.canonicalRoot, 'status', '--short'), '');
    await assert.rejects(fs.access(path.join(value.canonicalRoot, value.receiptPath)), { code: 'ENOENT' });
  } finally {
    await cleanup(value);
  }
});

test('ACTUAL_RUN evidence must be staged and no unrelated worktree changes are allowed', async () => {
  const value = await fixture({ actualRun: true });
  try {
    const prepared = await prepareReviewCompanion({
      sourceRoot: value.sourceRoot,
      canonicalRoot: value.canonicalRoot,
      area: 'projects',
      slug: 'fixture',
      noteRelativePath: value.relativeNote,
    });
    assert.deepEqual(prepared.evidencePaths, ['data/review-evidence/projects/fixture/engineer.json']);
    assert.equal(prepared.verification.evidence_state, 'VERIFIED');

    await fs.writeFile(path.join(value.sourceRoot, 'unexpected.txt'), 'not allowed\n');
    await assert.rejects(
      prepareReviewCompanion({
        sourceRoot: value.sourceRoot,
        canonicalRoot: value.canonicalRoot,
        area: 'projects',
        slug: 'fixture',
        noteRelativePath: value.relativeNote,
      }),
      (error) => error instanceof ReviewCompanionError
        && error.code === 'REVIEW_COMPANION_SOURCE_STATUS_MISMATCH',
    );
  } finally {
    await cleanup(value);
  }
});

test('receipt generation cannot skip or replay the canonical predecessor', async () => {
  const value = await fixture({ generation: 2, predecessor: 'b'.repeat(64) });
  try {
    await assert.rejects(
      prepareReviewCompanion({
        sourceRoot: value.sourceRoot,
        canonicalRoot: value.canonicalRoot,
        area: 'projects',
        slug: 'fixture',
        noteRelativePath: value.relativeNote,
      }),
      (error) => error instanceof ReviewCompanionError
        && error.code === 'REVIEW_RECEIPT_PREDECESSOR_MISMATCH',
    );
  } finally {
    await cleanup(value);
  }
});

test('a worker note without a current receipt is rejected before canonical merge', async () => {
  const value = await fixture();
  try {
    await fs.unlink(path.join(value.sourceRoot, value.receiptPath));
    await assert.rejects(
      prepareReviewCompanion({
        sourceRoot: value.sourceRoot,
        canonicalRoot: value.canonicalRoot,
        area: 'projects',
        slug: 'fixture',
        noteRelativePath: value.relativeNote,
      }),
      (error) => error instanceof ReviewCompanionError && error.code === 'REVIEW_RECEIPT_MISSING',
    );
    assert.equal(await git(value.canonicalRoot, 'rev-parse', 'HEAD'), value.base);
  } finally {
    await cleanup(value);
  }
});

test('a static-only receipt cannot accompany a note that claims VERIFIED', async () => {
  const value = await fixture({ verificationStatus: 'VERIFIED' });
  try {
    await assert.rejects(
      prepareReviewCompanion({
        sourceRoot: value.sourceRoot,
        canonicalRoot: value.canonicalRoot,
        area: 'projects',
        slug: 'fixture',
        noteRelativePath: value.relativeNote,
      }),
      (error) => error instanceof ReviewCompanionError
        && error.code === 'REVIEW_RECEIPT_FALSE_VERIFIED',
    );
  } finally {
    await cleanup(value);
  }
});

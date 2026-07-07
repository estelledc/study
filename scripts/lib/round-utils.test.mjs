import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ATLAS_ALLOWED,
  RUNTIME_ALLOWED,
  assertAllowedFiles,
  atlasCommitMessage,
  claimCommitMessage,
  dispatchIssues,
  finalGateIssues,
  runtimeCommitMessage,
  scanBuildWarnings,
} from './round-utils.mjs';

test('scanBuildWarnings detects Astro and generic warning lines', () => {
  const hits = scanBuildWarnings('ok\n[WARN] duplicate id\nWarning: slow path\nwarning: lower-case\n');
  assert.deepEqual(hits.map((hit) => hit.line), [2, 3, 4]);
});

test('assertAllowedFiles accepts only atlas or runtime allowlists', () => {
  assert.deepEqual(
    assertAllowedFiles(['src/content/docs/projects-atlas.md'], ATLAS_ALLOWED, 'atlas'),
    ['src/content/docs/projects-atlas.md'],
  );
  assert.deepEqual(
    assertAllowedFiles(['data/candidates.jsonl', 'data/written.txt'], RUNTIME_ALLOWED, 'runtime'),
    ['data/candidates.jsonl', 'data/written.txt'],
  );
  assert.throws(
    () => assertAllowedFiles(['src/content/docs/projects/foo.md'], ATLAS_ALLOWED, 'atlas'),
    /non-allowlisted/,
  );
});

test('finalGateIssues fails on claimed, failures, or dirty status', () => {
  const clean = { queues: { claimed: 0 }, events: { failures: { total: 0 } } };
  assert.deepEqual(finalGateIssues(clean, ''), []);

  const claimed = { queues: { claimed: 1 }, events: { failures: { total: 0 } } };
  assert.deepEqual(finalGateIssues(claimed, ''), ['claimed=1']);

  const failed = { queues: { claimed: 0 }, events: { failures: { total: 2 } } };
  assert.deepEqual(finalGateIssues(failed, ' M package.json'), ['worktree is not clean', 'failures=2']);
});

test('small round commit messages stay stable', () => {
  assert.equal(claimCommitMessage(4), 'chore: 认领 4 条 small round 队列状态');
  assert.equal(atlasCommitMessage('freemodbus'), 'chore: 更新 freemodbus 索引');
  assert.equal(runtimeCommitMessage('freemodbus'), 'chore: 同步 freemodbus 写入状态');
});

test('dispatchIssues treats shortage and size mismatch as blocking', () => {
  assert.deepEqual(dispatchIssues({ batch_size: 4, expected: 4, issues: [] }), []);
  assert.deepEqual(
    dispatchIssues({ batch_size: 3, expected: 4, issues: ['projects-new short'] }),
    ['projects-new short', 'batch-size mismatch: got 3, expected 4'],
  );
});

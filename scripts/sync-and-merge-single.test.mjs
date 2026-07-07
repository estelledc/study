import assert from 'node:assert/strict';
import test from 'node:test';

import { rollbackPickedCommit, validateMergeArgs } from './sync-and-merge-single.mjs';

test('validateMergeArgs accepts a safe target note', () => {
  const checked = validateMergeArgs({
    slug: 'raft',
    commit: 'abc1234',
    area: 'papers',
  });
  assert.equal(checked.relativePath, 'src/content/docs/papers/raft.md');
});

test('validateMergeArgs rejects invalid area, slug, and commit hash', () => {
  assert.throws(() => validateMergeArgs({ slug: '../raft', commit: 'abc1234', area: 'papers' }), /Invalid slug/);
  assert.throws(() => validateMergeArgs({ slug: 'raft', commit: 'abc1234', area: 'notes' }), /Invalid area/);
  assert.throws(() => validateMergeArgs({ slug: 'raft', commit: 'HEAD~1', area: 'papers' }), /Invalid commit hash/);
});

test('rollbackPickedCommit resets only the last picked commit', () => {
  const calls = [];
  const result = rollbackPickedCommit((args, options) => {
    calls.push({ args, cwd: options.cwd });
    return { ok: true, out: '' };
  });
  assert.equal(result.ok, true);
  assert.deepEqual(calls.map((call) => call.args), [['reset', '--hard', 'HEAD~1']]);
});

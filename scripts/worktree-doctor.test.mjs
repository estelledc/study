import assert from 'node:assert/strict';
import test from 'node:test';

import { fixMissing, inspectWorktrees } from './worktree-doctor.mjs';

const WORKTREES = [
  { area: 'papers', slot: 0, name: 'papers', path: '/tmp/w/papers', branch: 'refactor/papers' },
  { area: 'projects', slot: 0, name: 'projects', path: '/tmp/w/projects', branch: 'refactor/projects' },
];

function fakeRunGit({ branches = {}, statuses = {}, heads = {} } = {}) {
  return (args, cwd) => {
    const key = args.join(' ');
    if (key === 'rev-parse --is-inside-work-tree') return 'true';
    if (key === 'branch --show-current') return branches[cwd] ?? WORKTREES.find((w) => w.path === cwd)?.branch ?? '';
    if (key === 'status --porcelain') return statuses[cwd] ?? '';
    if (key === 'rev-parse HEAD') return heads[cwd] ?? 'abc123';
    throw new Error(`unexpected git call: ${key}`);
  };
}

test('inspectWorktrees reports missing worktrees', () => {
  const report = inspectWorktrees({
    worktrees: WORKTREES,
    exists: (path) => path.endsWith('/papers'),
    runGit: fakeRunGit(),
  });
  assert.equal(report.ok, false);
  assert.equal(report.missing, 1);
  assert.deepEqual(report.results[1].issues, ['missing']);
});

test('inspectWorktrees reports dirty worktrees', () => {
  const report = inspectWorktrees({
    worktrees: WORKTREES.slice(0, 1),
    exists: () => true,
    runGit: fakeRunGit({ statuses: { '/tmp/w/papers': ' M file.md' } }),
  });
  assert.equal(report.ok, false);
  assert.deepEqual(report.results[0].issues, ['dirty']);
});

test('inspectWorktrees reports branch mismatch', () => {
  const report = inspectWorktrees({
    worktrees: WORKTREES.slice(0, 1),
    exists: () => true,
    runGit: fakeRunGit({ branches: { '/tmp/w/papers': 'main' } }),
  });
  assert.equal(report.ok, false);
  assert.deepEqual(report.results[0].issues, ['branch-mismatch:main']);
});

test('inspectWorktrees reports healthy worktrees', () => {
  const report = inspectWorktrees({
    worktrees: WORKTREES,
    exists: () => true,
    runGit: fakeRunGit(),
  });
  assert.equal(report.ok, true);
  assert.equal(report.healthy, 2);
});

test('fixMissing dry-run does not call git', () => {
  const report = inspectWorktrees({
    worktrees: WORKTREES,
    exists: () => false,
    runGit: fakeRunGit(),
  });
  const originalLog = console.log;
  console.log = () => {};
  try {
    assert.doesNotThrow(() => fixMissing(report, { dryRun: true }, () => {
      throw new Error('git should not run in dry-run');
    }));
  } finally {
    console.log = originalLog;
  }
});

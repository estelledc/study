import assert from 'node:assert/strict';
import test from 'node:test';

import {
  allWorktrees,
  worktreeForAreaSlot,
  worktreeForPipelineKind,
  worktreesForDispatch,
} from './worktrees.mjs';

const HOME = '/tmp/study-home';

test('worktreeForAreaSlot preserves the existing study worktree naming scheme', () => {
  assert.deepEqual(worktreeForAreaSlot('papers', 0, HOME), {
    area: 'papers',
    slot: 0,
    name: 'papers',
    path: '/tmp/study-home/study-refactor-papers',
    branch: 'refactor/papers',
  });
  assert.deepEqual(worktreeForAreaSlot('projects', 3, HOME), {
    area: 'projects',
    slot: 3,
    name: 'projects-4',
    path: '/tmp/study-home/study-refactor-projects-4',
    branch: 'refactor/projects-4',
  });
});

test('worktreesForDispatch keeps rewrite on slots 0-1 and new on slots 2-3', () => {
  assert.deepEqual(worktreesForDispatch('papers', 'rewrite', HOME).map((w) => w.name), ['papers', 'papers-2']);
  assert.deepEqual(worktreesForDispatch('papers', 'new', HOME).map((w) => w.name), ['papers-3', 'papers-4']);
});

test('worktreeForPipelineKind maps paper/project kinds to the matching area slots', () => {
  assert.equal(worktreeForPipelineKind('rewrite-paper', 1, HOME).name, 'papers-2');
  assert.equal(worktreeForPipelineKind('new-project', 2, HOME).name, 'projects-3');
});

test('allWorktrees returns the eight configured worktrees and HOME is required', () => {
  assert.equal(allWorktrees(HOME).length, 8);
  assert.throws(() => worktreeForAreaSlot('papers', 0, ''), /HOME is required/);
});

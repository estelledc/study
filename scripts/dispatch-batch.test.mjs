import assert from 'node:assert/strict';
import test from 'node:test';

import { dispatchBatch, renderDispatchOutput } from './dispatch-batch.mjs';
import { markClaimed } from './lib/queue-store.mjs';

const HOME = '/tmp/study-home';
const TEMPLATES = {
  'rewrite-paper': 'rewrite {{slug}} {{output_path}}',
  'rewrite-project': 'rewrite {{slug}} {{output_path}}',
  'new-paper': 'new {{slug}} {{title}}',
  'new-project': 'new {{slug}} {{title}}',
};

function args(overrides = {}) {
  return { rewrite: 0, new: 0, dryRun: true, ...overrides };
}

test('dispatchBatch assigns rewrite and new items to the expected worktrees', () => {
  const plan = dispatchBatch(args({ rewrite: 2, new: 2 }), {
    pool: [
      { area: 'papers', slug: 'paper-r', status: 'available', score: 10, path: 'src/content/docs/papers/paper-r.md' },
      { area: 'projects', slug: 'project-r', status: 'available', score: 9, path: 'src/content/docs/projects/project-r.md' },
    ],
    candidates: [
      { area: 'papers', slug: 'paper-n', status: 'queued', topic: 'db', title: 'Paper N', meta: { col3: '2020', col4: 'paper value description' } },
      { area: 'projects', slug: 'project-n', status: 'queued', topic: 'ui', title: 'Project N', meta: { col3: '1.2k', col4: 'project value description' } },
    ],
  }, { home: HOME });
  const output = renderDispatchOutput(plan, TEMPLATES);

  assert.deepEqual(output.assignments.map((a) => a.slug), ['paper-r', 'project-r', 'paper-n', 'project-n']);
  assert.deepEqual(output.assignments.map((a) => a.worktree), ['papers', 'projects', 'papers-3', 'projects-3']);
  assert.equal(output.batch_size, 4);
  assert.deepEqual(output.issues, []);
});

test('dispatchBatch reports shortage issues without crashing on empty queues', () => {
  const plan = dispatchBatch(args({ rewrite: 2, new: 2 }), { pool: [], candidates: [] }, { home: HOME });

  assert.equal(plan.batch_size, 0);
  assert.ok(plan.issues.includes('papers-rewrite short: got 0, need 1'));
  assert.ok(plan.issues.includes('projects-rewrite short'));
  assert.ok(plan.issues.includes('papers-new short: got 0, need 1'));
  assert.ok(plan.issues.includes('projects-new short'));
});

test('dispatchBatch is pure and markClaimed updates only selected rows', () => {
  const pool = [
    { area: 'papers', slug: 'paper-r', status: 'available', score: 10, claimed_by: null },
    { area: 'papers', slug: 'paper-other', status: 'available', score: 1, claimed_by: null },
  ];
  const originalPool = structuredClone(pool);
  const plan = dispatchBatch(args({ rewrite: 2, new: 0 }), { pool, candidates: [] }, { home: HOME });

  assert.deepEqual(pool, originalPool);
  const updated = markClaimed(pool, plan.picked.rewrite, plan.assignments);
  assert.deepEqual(updated.map((row) => [row.slug, row.status, row.claimed_by]), [
    ['paper-r', 'claimed', 'papers'],
    ['paper-other', 'available', null],
  ]);
});

test('renderDispatchOutput keeps prompt rendering separate from queue selection', () => {
  const plan = dispatchBatch(args({ rewrite: 0, new: 1 }), {
    candidates: [{ area: 'projects', slug: 'project-n', status: 'queued', topic: 'ui', title: 'Value $1', meta: { col3: '1.2k', col4: 'project value description' } }],
  }, { home: HOME });
  const output = renderDispatchOutput(plan, TEMPLATES);

  assert.equal(output.assignments[0].prompt, 'new project-n Value $1');
});

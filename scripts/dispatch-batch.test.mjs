import assert from 'node:assert/strict';
import test from 'node:test';

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { applyDispatchPlan, dispatchBatch, renderDispatchOutput } from './dispatch-batch.mjs';
import { readJsonl } from './lib/jsonl.mjs';
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

function newCandidate(area, slug, topic = 'topic') {
  return {
    area,
    slug,
    status: 'queued',
    topic,
    title: slug,
    meta: { col3: area === 'papers' ? '2020' : '1.2k', col4: `${slug} value description` },
  };
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

test('dispatchBatch can fill all area worktrees for all-NEW eight-wide rounds', () => {
  const plan = dispatchBatch(args({ rewrite: 0, new: 8 }), {
    candidates: [
      newCandidate('papers', 'paper-a', 'a'),
      newCandidate('papers', 'paper-b', 'b'),
      newCandidate('papers', 'paper-c', 'c'),
      newCandidate('papers', 'paper-d', 'd'),
      newCandidate('projects', 'project-a', 'a'),
      newCandidate('projects', 'project-b', 'b'),
      newCandidate('projects', 'project-c', 'c'),
      newCandidate('projects', 'project-d', 'd'),
    ],
  }, { home: HOME });
  const output = renderDispatchOutput(plan, TEMPLATES);

  assert.equal(output.batch_size, 8);
  assert.deepEqual(output.issues, []);
  assert.deepEqual(output.assignments.map((a) => a.worktree), [
    'papers-3',
    'papers-4',
    'papers',
    'papers-2',
    'projects-3',
    'projects-4',
    'projects',
    'projects-2',
  ]);
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

test('dispatch plan hash is deterministic for the same queue snapshot', () => {
  const queues = {
    candidates: [newCandidate('papers', 'paper-a'), newCandidate('projects', 'project-a')],
    pool: [],
  };
  const first = dispatchBatch(args({ rewrite: 0, new: 2 }), structuredClone(queues), { home: HOME });
  const second = dispatchBatch(args({ rewrite: 0, new: 2 }), structuredClone(queues), { home: HOME });

  assert.equal(first.plan_hash, second.plan_hash);
  assert.equal(first.queue_input_hash, second.queue_input_hash);
});

test('applyDispatchPlan writes leased claims as one queue generation', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'study-dispatch-'));
  const paths = {
    candidates: path.join(directory, 'candidates.jsonl'),
    rewritePool: path.join(directory, 'rewrite-pool.jsonl'),
  };
  const queues = {
    candidates: [newCandidate('papers', 'paper-a'), newCandidate('projects', 'project-a')],
    pool: [],
  };
  await fs.writeFile(paths.candidates, `${queues.candidates.map(JSON.stringify).join('\n')}\n`, 'utf8');
  await fs.writeFile(paths.rewritePool, '\n', 'utf8');
  const plan = dispatchBatch(args({ rewrite: 0, new: 2 }), queues, { home: HOME });

  await applyDispatchPlan(plan, queues, {
    directory,
    paths,
    claimedAt: '2026-07-10T00:00:00.000Z',
    leaseMs: 60_000,
  });

  const rows = await readJsonl(paths.candidates);
  assert.deepEqual(rows.map((row) => row.status), ['claimed', 'claimed']);
  assert.ok(rows.every((row) => row.claim_generation === plan.plan_hash));
  assert.ok(rows.every((row) => row.lease_expires_at === '2026-07-10T00:01:00.000Z'));
});

test('applyDispatchPlan never writes a shortage plan', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'study-dispatch-short-'));
  const paths = {
    candidates: path.join(directory, 'candidates.jsonl'),
    rewritePool: path.join(directory, 'rewrite-pool.jsonl'),
  };
  await fs.writeFile(paths.candidates, 'sentinel-candidates\n', 'utf8');
  await fs.writeFile(paths.rewritePool, 'sentinel-rewrite\n', 'utf8');
  const plan = dispatchBatch(args({ rewrite: 0, new: 2 }), { candidates: [], pool: [] }, { home: HOME });

  await assert.rejects(
    () => applyDispatchPlan(plan, { candidates: [], pool: [] }, { directory, paths }),
    /not applicable/,
  );
  assert.equal(await fs.readFile(paths.candidates, 'utf8'), 'sentinel-candidates\n');
  assert.equal(await fs.readFile(paths.rewritePool, 'utf8'), 'sentinel-rewrite\n');
});

test('applyDispatchPlan rejects a stale plan instead of overwriting newer queue state', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'study-dispatch-stale-'));
  const paths = {
    candidates: path.join(directory, 'candidates.jsonl'),
    rewritePool: path.join(directory, 'rewrite-pool.jsonl'),
  };
  const queues = {
    candidates: [newCandidate('papers', 'paper-a'), newCandidate('projects', 'project-a')],
    pool: [],
  };
  await fs.writeFile(paths.candidates, `${queues.candidates.map(JSON.stringify).join('\n')}\n`, 'utf8');
  await fs.writeFile(paths.rewritePool, '\n', 'utf8');
  const plan = dispatchBatch(args({ rewrite: 0, new: 2 }), queues, { home: HOME });
  await fs.writeFile(paths.candidates, '{"newer":true}\n', 'utf8');

  await assert.rejects(
    () => applyDispatchPlan(plan, queues, { directory, paths }),
    /expected input mismatch/,
  );
  assert.equal(await fs.readFile(paths.candidates, 'utf8'), '{"newer":true}\n');
});

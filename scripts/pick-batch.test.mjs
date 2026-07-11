import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { applyPickPlan, pickBatch } from './pick-batch.mjs';
import { readJsonl } from './lib/jsonl.mjs';

function args(overrides = {}) {
  return {
    count: 0,
    rewrite: 0,
    new: 0,
    priorityRatio: 0.7,
    noPriority: false,
    ...overrides,
  };
}

test('pickBatch consumes priority queue before candidate fallback', () => {
  const priority = [
    { area: 'papers', slug: 'tier-2-paper', status: 'new', priority_tier: 'tier-2', topic: 'db' },
    { area: 'projects', slug: 'tier-1-project', status: 'new', priority_tier: 'tier-1', topic: 'runtime' },
    { area: 'papers', slug: 'already-picked', status: 'picked', priority_tier: 'tier-1' },
  ];
  const candidates = [
    { area: 'papers', slug: 'tier-2-paper', status: 'queued', topic: 'db' },
    { area: 'projects', slug: 'tier-1-project', status: 'queued', topic: 'runtime' },
    { area: 'papers', slug: 'fallback-paper', status: 'queued', topic: 'ui' },
    { area: 'projects', slug: 'fallback-project', status: 'queued', topic: 'ui' },
  ];

  const result = pickBatch(args({ count: 2, new: 2, priorityRatio: 1 }), { priority, candidates });

  assert.equal(result.output.actual.priority, 2);
  assert.equal(result.output.actual.fallback, 0);
  assert.deepEqual(result.output.items.map((item) => item.slug), ['tier-1-project', 'tier-2-paper']);
  assert.deepEqual(result.output.items.map((item) => item.source), ['priority-queue', 'priority-queue']);
  assert.deepEqual(result.nextPriority.map((item) => item.status), ['picked', 'picked', 'picked']);
});

test('pickBatch excludes graveyard slugs across queues', () => {
  const result = pickBatch(args({ count: 4, rewrite: 2, new: 2, noPriority: true }), {
    graveyard: [{ slug: 'blocked' }],
    pool: [
      { area: 'papers', slug: 'blocked', status: 'available', score: 100 },
      { area: 'papers', slug: 'rewrite-paper', status: 'available', score: 10 },
      { area: 'projects', slug: 'rewrite-project', status: 'available', score: 10 },
    ],
    candidates: [
      { area: 'papers', slug: 'new-paper', status: 'queued', topic: 'db' },
      { area: 'projects', slug: 'blocked', status: 'queued', topic: 'runtime' },
      { area: 'projects', slug: 'new-project', status: 'queued', topic: 'runtime' },
    ],
  });

  assert.equal(result.output.actual.count, 4);
  assert.ok(!result.output.items.some((item) => item.slug === 'blocked'));
  assert.ok(result.output.warnings.includes('graveyard excluded: 1'));
});

test('pickBatch returns an empty result for an empty zero-sized batch', () => {
  const result = pickBatch(args({ count: 0, rewrite: 0, new: 0, noPriority: true }));

  assert.deepEqual(result.output.actual, { count: 0, rewrite: 0, new: 0, priority: 0, fallback: 0 });
  assert.deepEqual(result.output.issues, []);
  assert.deepEqual(result.output.items, []);
});

test('pickBatch reports shortage issues when queues cannot satisfy requested counts', () => {
  const result = pickBatch(args({ count: 2, rewrite: 1, new: 1, noPriority: true }), {
    pool: [],
    candidates: [],
  });

  assert.equal(result.output.actual.count, 0);
  assert.ok(result.output.issues.includes('rewrite short: 0/1'));
  assert.ok(result.output.issues.includes('new short: 0/1'));
});

test('pickBatch never advances priority state when any shortage issue remains', () => {
  const priority = [
    { area: 'papers', slug: 'only-one', status: 'new', priority_tier: 'tier-1' },
  ];
  const result = pickBatch(args({ count: 2, rewrite: 0, new: 2, priorityRatio: 1 }), {
    priority,
    candidates: [{ area: 'papers', slug: 'only-one', status: 'queued', topic: 'db' }],
  });

  assert.ok(result.output.issues.length > 0);
  assert.deepEqual(result.nextPriority, priority);
});

test('applyPickPlan claims candidates and advances priority in one generation', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'study-pick-plan-'));
  const paths = {
    candidates: path.join(directory, 'candidates.jsonl'),
    rewritePool: path.join(directory, 'rewrite-pool.jsonl'),
    priority: path.join(directory, 'priority-queue.jsonl'),
  };
  const queues = {
    candidates: [
      { area: 'papers', slug: 'paper-a', status: 'queued', topic: 'db' },
      { area: 'projects', slug: 'project-a', status: 'queued', topic: 'runtime' },
    ],
    pool: [],
    graveyard: [],
    priority: [
      { area: 'papers', slug: 'paper-a', status: 'new', priority_tier: 'tier-1' },
      { area: 'projects', slug: 'project-a', status: 'new', priority_tier: 'tier-1' },
    ],
  };
  for (const [key, filePath] of Object.entries(paths)) {
    const rows = key === 'rewritePool' ? queues.pool : queues[key];
    await fs.writeFile(filePath, rows.length > 0 ? `${rows.map(JSON.stringify).join('\n')}\n` : '\n', 'utf8');
  }
  const plan = pickBatch(args({ count: 2, rewrite: 0, new: 2, priorityRatio: 1 }), queues);

  const applied = await applyPickPlan(plan, queues, {
    directory,
    paths,
    claimedAt: '2026-07-10T00:00:00.000Z',
  });

  assert.equal(applied.generation, plan.output.plan_hash);
  const candidatesAfter = await readJsonl(paths.candidates);
  const priorityAfter = await readJsonl(paths.priority);
  assert.ok(candidatesAfter.every((row) => row.status === 'claimed'));
  assert.ok(candidatesAfter.every((row) => row.claim_generation === plan.output.plan_hash));
  assert.deepEqual(
    candidatesAfter.map((row) => row.claim_token).sort(),
    plan.output.items.map((row) => row.claim_token).sort(),
  );
  assert.ok(priorityAfter.every((row) => row.status === 'picked'));
  assert.equal(await fs.readFile(paths.rewritePool, 'utf8'), '\n');
});

test('applyPickPlan leaves every queue byte unchanged on shortage', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'study-pick-short-'));
  const paths = {
    candidates: path.join(directory, 'candidates.jsonl'),
    rewritePool: path.join(directory, 'rewrite-pool.jsonl'),
    priority: path.join(directory, 'priority-queue.jsonl'),
  };
  const queues = {
    candidates: [{ area: 'papers', slug: 'only-one', status: 'queued', topic: 'db' }],
    pool: [],
    graveyard: [],
    priority: [{ area: 'papers', slug: 'only-one', status: 'new', priority_tier: 'tier-1' }],
  };
  const before = {
    candidates: `${JSON.stringify(queues.candidates[0])}\n`,
    rewritePool: '',
    priority: `${JSON.stringify(queues.priority[0])}\n`,
  };
  await Promise.all(Object.entries(paths).map(([key, filePath]) => fs.writeFile(filePath, before[key], 'utf8')));
  const plan = pickBatch(args({ count: 2, rewrite: 0, new: 2, priorityRatio: 1 }), queues);

  await assert.rejects(
    () => applyPickPlan(plan, queues, { directory, paths }),
    /not applicable/,
  );
  for (const [key, filePath] of Object.entries(paths)) {
    assert.equal(await fs.readFile(filePath, 'utf8'), before[key]);
  }
});

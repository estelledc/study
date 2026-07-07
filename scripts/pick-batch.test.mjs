import assert from 'node:assert/strict';
import test from 'node:test';

import { pickBatch } from './pick-batch.mjs';

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
  assert.ok(result.output.issues.includes('graveyard excluded: 1'));
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

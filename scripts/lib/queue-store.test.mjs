import assert from 'node:assert/strict';
import test from 'node:test';

import {
  excludeGraveyard,
  markCandidatesWritten,
  markClaimed,
  markPriorityPicked,
  markRewritePoolWritten,
  queueKey,
} from './queue-store.mjs';

test('queueKey and excludeGraveyard use slug identity for graveyard filtering', () => {
  assert.equal(queueKey({ area: 'papers', slug: 'react' }), 'papers::react');
  const items = [
    { area: 'papers', slug: 'keep' },
    { area: 'projects', slug: 'blocked' },
  ];
  assert.deepEqual(excludeGraveyard(items, [{ slug: 'blocked' }]), [{ area: 'papers', slug: 'keep' }]);
});

test('markPriorityPicked updates only selected priority rows', () => {
  const rows = [
    { area: 'papers', slug: 'a', status: 'new' },
    { area: 'papers', slug: 'b', status: 'new' },
  ];
  assert.deepEqual(markPriorityPicked(rows, [{ area: 'papers', slug: 'a' }]), [
    { area: 'papers', slug: 'a', status: 'picked' },
    { area: 'papers', slug: 'b', status: 'new' },
  ]);
});

test('markClaimed records assignment worktree names', () => {
  const rows = [{ area: 'projects', slug: 'vite', status: 'queued', claimed_by: null }];
  const assignments = [{ area: 'projects', slug: 'vite', worktree: { name: 'projects-3' } }];
  assert.deepEqual(markClaimed(rows, rows, assignments), [
    { area: 'projects', slug: 'vite', status: 'claimed', claimed_by: 'projects-3' },
  ]);
});

test('markCandidatesWritten only changes queued and claimed entries', () => {
  const result = markCandidatesWritten([
    { area: 'papers', slug: 'queued', status: 'queued', claimed_by: 'w1' },
    { area: 'papers', slug: 'claimed', status: 'claimed', claimed_by: 'w2' },
    { area: 'papers', slug: 'written', status: 'written', claimed_by: null },
    { area: 'papers', slug: 'failed', status: 'failed', claimed_by: 'w3' },
  ], [
    { area: 'papers', slug: 'queued' },
    { area: 'papers', slug: 'claimed' },
    { area: 'papers', slug: 'written' },
    { area: 'papers', slug: 'failed' },
  ]);
  assert.equal(result.updated, 2);
  assert.equal(result.already_written, 1);
  assert.deepEqual(result.rows.map((row) => row.status), ['written', 'written', 'written', 'failed']);
  assert.equal(result.rows[3].claimed_by, 'w3');
});

test('markRewritePoolWritten only changes claimed entries', () => {
  const result = markRewritePoolWritten([
    { area: 'projects', slug: 'claimed', status: 'claimed', claimed_by: 'w1' },
    { area: 'projects', slug: 'available', status: 'available', claimed_by: null },
  ], [
    { area: 'projects', slug: 'claimed' },
    { area: 'projects', slug: 'available' },
  ]);
  assert.equal(result.claimed_to_written, 1);
  assert.deepEqual(result.rows, [
    { area: 'projects', slug: 'claimed', status: 'written', claimed_by: null },
    { area: 'projects', slug: 'available', status: 'available', claimed_by: null },
  ]);
});

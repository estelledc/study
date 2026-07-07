import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildRecoveryPlan,
  recoverCandidates,
  recoverRewritePool,
} from './recover-queue-state.mjs';

const context = {
  noteSet: new Set(['papers::note-exists', 'projects::rewrite-done']),
  writtenSet: new Set(['papers::written-index']),
};

test('recoverCandidates marks queued and claimed written when docs or written index exists', () => {
  const result = recoverCandidates([
    { area: 'papers', slug: 'note-exists', status: 'claimed', claimed_by: null },
    { area: 'papers', slug: 'written-index', status: 'queued', claimed_by: null },
    { area: 'papers', slug: 'fresh', status: 'queued', claimed_by: null },
  ], context);

  assert.deepEqual(result.rows.map((row) => [row.slug, row.status, row.claimed_by]), [
    ['note-exists', 'written', null],
    ['written-index', 'written', null],
    ['fresh', 'queued', null],
  ]);
  assert.equal(result.changes.length, 2);
});

test('recoverCandidates returns orphan claimed rows to queued and preserves blocked states', () => {
  const result = recoverCandidates([
    { area: 'projects', slug: 'orphan', status: 'claimed', claimed_by: null },
    { area: 'projects', slug: 'failed', status: 'failed', claimed_by: null },
    { area: 'projects', slug: 'blacklisted', status: 'blacklisted', claimed_by: null },
    { area: 'projects', slug: 'active', status: 'claimed', claimed_by: 'projects' },
  ], context);

  assert.deepEqual(result.rows.map((row) => [row.slug, row.status, row.claimed_by]), [
    ['orphan', 'queued', null],
    ['failed', 'failed', null],
    ['blacklisted', 'blacklisted', null],
    ['active', 'claimed', 'projects'],
  ]);
  assert.deepEqual(result.changes.map((item) => item.slug), ['orphan']);
});

test('recoverRewritePool only marks claimed written when the note exists', () => {
  const result = recoverRewritePool([
    { area: 'projects', slug: 'rewrite-done', status: 'claimed', claimed_by: 'projects' },
    { area: 'projects', slug: 'rewrite-active', status: 'claimed', claimed_by: 'projects-2' },
    { area: 'projects', slug: 'available', status: 'available', claimed_by: null },
  ], context);

  assert.deepEqual(result.rows.map((row) => [row.slug, row.status, row.claimed_by]), [
    ['rewrite-done', 'written', null],
    ['rewrite-active', 'claimed', 'projects-2'],
    ['available', 'available', null],
  ]);
  assert.equal(result.changes.length, 1);
});

test('buildRecoveryPlan reports stable before and after counts', () => {
  const plan = buildRecoveryPlan({
    candidates: [
      { area: 'papers', slug: 'note-exists', status: 'claimed', claimed_by: null },
      { area: 'projects', slug: 'orphan', status: 'claimed', claimed_by: null },
      { area: 'projects', slug: 'blocked', status: 'blacklisted', claimed_by: null },
    ],
    rewritePool: [
      { area: 'projects', slug: 'rewrite-done', status: 'claimed', claimed_by: 'projects' },
    ],
    notes: [
      { area: 'papers', slug: 'note-exists' },
      { area: 'projects', slug: 'rewrite-done' },
    ],
    written: [],
  });

  assert.deepEqual(plan.before.candidates, { claimed: 2, blacklisted: 1 });
  assert.deepEqual(plan.after.candidates, { written: 1, queued: 1, blacklisted: 1 });
  assert.deepEqual(plan.after.rewrite_pool, { written: 1 });
  assert.equal(plan.changes.length, 3);
});

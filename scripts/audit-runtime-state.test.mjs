import assert from 'node:assert/strict';
import test from 'node:test';

import { buildRuntimeAudit, parseWrittenText } from './audit-runtime-state.mjs';

function baseInputs(overrides = {}) {
  return {
    candidates: [],
    rewritePool: [],
    written: [],
    notes: [],
    pipelineInputs: {
      checkpoint: null,
      status: null,
      candidates: [],
      rewritePool: [],
      events: [],
      missing: { checkpoint: true, status: true },
    },
    worktrees: {
      ok: false,
      checked: 8,
      healthy: 0,
      missing: 8,
      results: [{ name: 'papers', path: '/tmp/papers', ok: false, issues: ['missing'] }],
    },
    ...overrides,
  };
}

test('parseWrittenText preserves paper/project area sections', () => {
  assert.deepEqual(parseWrittenText('# papers\nraft\n\n# projects\nreact\n'), [
    { area: 'papers', slug: 'raft' },
    { area: 'projects', slug: 'react' },
  ]);
});

test('buildRuntimeAudit classifies claimed queue debt without mutations', () => {
  const audit = buildRuntimeAudit(baseInputs({
    candidates: [
      { area: 'papers', slug: 'done', status: 'claimed', claimed_by: null, topic: 'db' },
      { area: 'papers', slug: 'note-only', status: 'claimed', claimed_by: null },
      { area: 'projects', slug: 'missing', status: 'claimed', claimed_by: null },
      { area: 'projects', slug: 'active', status: 'claimed', claimed_by: 'projects-3' },
      { area: 'projects', slug: 'missing', status: 'claimed', claimed_by: null },
      { area: 'projects', slug: 'queued', status: 'queued' },
      { area: 'projects', slug: 'failed', status: 'failed' },
    ],
    rewritePool: [{ area: 'projects', slug: 'rewrite', status: 'available' }],
    written: [{ area: 'papers', slug: 'done' }],
    notes: [
      { area: 'papers', slug: 'done' },
      { area: 'papers', slug: 'note-only' },
    ],
  }));

  assert.equal(audit.readonly, true);
  assert.equal(audit.proposed_repo_tracked_modifications, 0);
  assert.equal(audit.claimed_debt.total, 5);
  assert.deepEqual(audit.claimed_debt.written_and_indexed.map((row) => row.slug), ['done']);
  assert.deepEqual(audit.claimed_debt.note_exists_not_indexed.map((row) => row.slug), ['note-only']);
  assert.equal(audit.claimed_debt.recover_to_queued.length, 0);
  assert.deepEqual(audit.claimed_debt.needs_review.map((row) => row.slug), ['missing', 'active', 'missing']);
  assert.deepEqual(audit.queues.duplicate_keys, ['projects::missing']);
  assert.equal(audit.self_review.modifies_repo_tracked_files, false);
});

test('buildRuntimeAudit exposes missing runtime files and worktree issues', () => {
  const audit = buildRuntimeAudit(baseInputs({
    candidates: [{ area: 'papers', slug: 'legacy', status: 'claimed', claimed_by: null }],
  }));

  assert.equal(audit.runtime_files.checkpoint_missing, true);
  assert.equal(audit.runtime_files.status_missing, true);
  assert.equal(audit.worktrees.missing, 8);
  assert.deepEqual(audit.claimed_debt.recover_to_queued.map((row) => row.slug), ['legacy']);
});

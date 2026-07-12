import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { buildSupervisorStatus } from './supervisor-status.mjs';

const policy = JSON.parse(fs.readFileSync(new URL('../data/operations-policy.json', import.meta.url), 'utf8'));

function healthyFacts(overrides = {}) {
  return {
    branch: 'test',
    head: 'abc123',
    worktree_dirty: false,
    changed_paths: 0,
    canonical_node: '22.23.1',
    running_node: '22.23.1',
    toolchain_ok: true,
    operation_failures: 0,
    doc_failures: 0,
    round_lock_active: false,
    no_delta_batches: 0,
    supervisor_state_valid: true,
    ...overrides,
  };
}

test('a healthy observation stays readonly and waits without a writer', () => {
  const status = buildSupervisorStatus(healthyFacts(), policy);
  assert.equal(status.readonly, true);
  assert.equal(status.supervisor_state, 'WAIT_HEALTHY');
  assert.equal(status.writer_eligible, false);
});

test('dirty worktree, missing toolchain, policy drift or round lock parks the writer', () => {
  const status = buildSupervisorStatus(healthyFacts({
    worktree_dirty: true,
    changed_paths: 3,
    toolchain_ok: false,
    operation_failures: 1,
    round_lock_active: true,
  }), policy);
  assert.equal(status.supervisor_state, 'PARKED_HUMAN');
  assert.equal(status.writer_eligible, false);
  assert.deepEqual(status.blockers, [
    'policy-conflict',
    'unexpected-worktree-overlap',
    'required-toolchain-unavailable',
    'round-lock-active',
  ]);
});

test('persisted no-delta runtime parks without spawning a writer', () => {
  const status = buildSupervisorStatus(healthyFacts({ no_delta_batches: 3 }), policy);
  assert.equal(status.supervisor_state, 'PARKED_NO_DELTA');
  assert.equal(status.writer_eligible, false);
  assert.equal(status.facts.no_delta_batches, 3);
});

test('malformed supervisor runtime fails closed as a policy conflict', () => {
  const status = buildSupervisorStatus(healthyFacts({ supervisor_state_valid: false }), policy);
  assert.equal(status.supervisor_state, 'PARKED_HUMAN');
  assert.deepEqual(status.blockers, ['policy-conflict']);
});

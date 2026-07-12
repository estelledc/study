import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { buildSupervisorStatus, readSupervisorRuntime } from './supervisor-status.mjs';

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
  assert.match(status.next_action, /real external delta/);
});

test('malformed supervisor runtime fails closed as a policy conflict', () => {
  const status = buildSupervisorStatus(healthyFacts({ supervisor_state_valid: false }), policy);
  assert.equal(status.supervisor_state, 'PARKED_HUMAN');
  assert.deepEqual(status.blockers, ['policy-conflict']);
});

test('supervisor runtime schema corruption fails closed instead of resetting no-delta state', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'study-supervisor-runtime-'));
  fs.mkdirSync(path.join(root, 'data'), { recursive: true });

  assert.deepEqual(readSupervisorRuntime(policy, root), { no_delta_batches: 0, valid: true });

  for (const state of [
    { no_delta_batches: '3' },
    { no_delta_batches: -1 },
    {},
    [],
  ]) {
    fs.writeFileSync(path.join(root, 'data/supervisor-state.json'), JSON.stringify(state));
    assert.deepEqual(readSupervisorRuntime(policy, root), { no_delta_batches: 0, valid: false });
  }

  fs.writeFileSync(path.join(root, 'data/supervisor-state.json'), JSON.stringify({ no_delta_batches: 2 }));
  assert.deepEqual(readSupervisorRuntime(policy, root), { no_delta_batches: 2, valid: true });
});

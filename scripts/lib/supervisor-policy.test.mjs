import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { classifyRepairCandidate, decideSupervisorAction } from './supervisor-policy.mjs';

const policy = JSON.parse(fs.readFileSync(new URL('../../data/operations-policy.json', import.meta.url), 'utf8'));

function safeRepair(overrides = {}) {
  return {
    category: 'operator-doc-link-target',
    detector_fingerprint: 'sha256:fixture',
    within_epoch_scope: true,
    reversible_local_change: true,
    before_after_snapshot: true,
    targeted_acceptance_check: true,
    external_state_change: false,
    attempts: 0,
    ...overrides,
  };
}

test('green observation waits without spawning a writer', () => {
  assert.deepEqual(decideSupervisorAction({}, policy), {
    state: 'WAIT_HEALTHY',
    action: 'yield-until-scheduled-or-event-wake',
    reason: 'no-actionable-evidence',
    no_delta_batches: 0,
  });
});

test('an evidence-backed slice starts one bounded epoch', () => {
  assert.equal(decideSupervisorAction({ actionable_slice: true }, policy).state, 'PREPARE_EPOCH');
});

test('new epochs and restarts cannot reset the no-delta counter', () => {
  const decision = decideSupervisorAction({
    no_delta_batches: 2,
    completed_agent_batch: true,
    new_epoch: true,
  }, policy);
  assert.equal(decision.state, 'PARKED_NO_DELTA');
  assert.equal(decision.no_delta_batches, 3);
  assert.equal(decideSupervisorAction({ no_delta_batches: 3, external_delta: true }, policy).no_delta_batches, 0);
});

test('built-in hard blockers cannot be disabled by a damaged policy', () => {
  const damagedPolicy = structuredClone(policy);
  damagedPolicy.project_progression.hard_pause_conditions = [];
  const decision = decideSupervisorAction({
    hard_blockers: ['policy-conflict'],
  }, damagedPolicy);
  assert.equal(decision.state, 'PARKED_HUMAN');
  assert.equal(decision.reason, 'policy-conflict');
});

test('only a fully evidenced allowlisted repair can run automatically', () => {
  assert.equal(classifyRepairCandidate(safeRepair(), policy).state, 'REPAIR');
  assert.match(
    classifyRepairCandidate(safeRepair({ before_after_snapshot: false }), policy).reason,
    /before-after-snapshot/,
  );
  const missingExternalStateEvidence = safeRepair();
  delete missingExternalStateEvidence.external_state_change;
  assert.match(
    classifyRepairCandidate(missingExternalStateEvidence, policy).reason,
    /no-external-state-change/,
  );
  assert.equal(classifyRepairCandidate(safeRepair({ attempts: 2 }), policy).reason, 'repair-attempts-exhausted');
});

test('content, policy and external-state repairs always require human handling', () => {
  for (const category of ['note-content', 'policy-or-threshold', 'remote-state']) {
    assert.equal(classifyRepairCandidate(safeRepair({ category }), policy).reason, 'repair-denied');
  }
  assert.equal(
    decideSupervisorAction({ hard_blockers: ['required-toolchain-unavailable'] }, policy).state,
    'PARKED_HUMAN',
  );
});

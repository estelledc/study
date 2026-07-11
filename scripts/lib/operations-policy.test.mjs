import assert from 'node:assert/strict';
import test from 'node:test';

import { bulkOperationDecision } from './operations-policy.mjs';

test('fails closed when bulk production is disabled or approval is incomplete', () => {
  assert.equal(bulkOperationDecision({ bulk_production: { enabled: false } }, 1).allowed, false);
  assert.equal(bulkOperationDecision({ bulk_production: { enabled: true } }, 1).allowed, false);
});

test('allows a no-op without granting future mutation authority', () => {
  assert.deepEqual(bulkOperationDecision({}, 0), { allowed: true, reason: 'no-op' });
});

test('a tracked APPROVED flag is not a replayable mutation capability', () => {
  const policy = { bulk_production: {
    enabled: true,
    requires_explicit_operator_approval: true,
    approval_status: 'APPROVED',
    approved_target: 3,
    maximum_new_items_per_authorized_round: 4,
  } };
  assert.deepEqual(
    bulkOperationDecision(policy, 1),
    { allowed: false, reason: 'single-use-approval-required' },
  );
});

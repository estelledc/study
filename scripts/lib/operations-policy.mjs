import fs from 'node:fs';
import path from 'node:path';

import { ROOT } from './paths.mjs';

export function bulkOperationDecision(policy, requestedItems = 1) {
  if (!Number.isSafeInteger(requestedItems) || requestedItems < 0) {
    return { allowed: false, reason: 'invalid-requested-items' };
  }
  if (requestedItems === 0) return { allowed: true, reason: 'no-op' };

  const bulk = policy?.bulk_production;
  if (bulk?.enabled !== true) return { allowed: false, reason: 'bulk-production-disabled' };
  if (bulk.requires_explicit_operator_approval !== true) {
    return { allowed: false, reason: 'explicit-approval-contract-missing' };
  }
  if (bulk.approval_status !== 'APPROVED') {
    return { allowed: false, reason: 'bulk-production-unapproved' };
  }
  if (!Number.isSafeInteger(bulk.approved_target) || bulk.approved_target <= 0) {
    return { allowed: false, reason: 'approved-target-invalid' };
  }
  const roundMaximum = bulk.maximum_new_items_per_authorized_round;
  if (!Number.isSafeInteger(roundMaximum) || roundMaximum <= 0) {
    return { allowed: false, reason: 'round-maximum-invalid' };
  }
  if (requestedItems > Math.min(bulk.approved_target, roundMaximum)) {
    return { allowed: false, reason: 'authorized-bound-exceeded' };
  }
  return { allowed: true, reason: 'explicitly-authorized' };
}

export function loadOperationsPolicy(root = ROOT) {
  const file = path.join(root, 'data', 'operations-policy.json');
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    throw new Error(`operations policy unavailable: ${error.message}`);
  }
}

export function assertBulkOperationAuthorized({ operation, requestedItems = 1, root = ROOT } = {}) {
  const decision = bulkOperationDecision(loadOperationsPolicy(root), requestedItems);
  if (!decision.allowed) {
    throw new Error(`${operation || 'operation'} refused by operations policy: ${decision.reason}`);
  }
  return decision;
}

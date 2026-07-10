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
  // A tracked JSON flag is replayable and can be changed in the same PR as the
  // mutation it is meant to authorize. Until an expiring, operation-bound,
  // single-use approval receipt exists, repository state can never grant write
  // authority by itself.
  return { allowed: false, reason: 'single-use-approval-required' };
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

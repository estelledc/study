import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { evaluateBulkPolicy, loadBulkPolicy } from './exit-conditions.mjs';

test('missing or invalid policy fails closed without inventing a target', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'study-exit-policy-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));

  const missing = await loadBulkPolicy(path.join(dir, 'missing.json'));
  assert.deepEqual(missing, {
    enabled: false,
    reason: 'bulk-production-disabled',
    policy_state: 'missing',
  });

  const invalidPath = path.join(dir, 'invalid.json');
  await fs.writeFile(invalidPath, '{not-json', 'utf8');
  const invalid = await loadBulkPolicy(invalidPath);
  assert.deepEqual(invalid, {
    enabled: false,
    reason: 'bulk-production-disabled',
    policy_state: 'invalid',
  });
});

test('disabled and unapproved policies do not expose approved_target', () => {
  assert.deepEqual(evaluateBulkPolicy(undefined), {
    enabled: false,
    reason: 'bulk-production-disabled',
  });
  assert.deepEqual(evaluateBulkPolicy({
    bulk_production: { enabled: false, approved_target: 20_000 },
  }), {
    enabled: false,
    reason: 'bulk-production-disabled',
  });
  assert.deepEqual(evaluateBulkPolicy({
    bulk_production: {
      enabled: true,
      requires_explicit_operator_approval: true,
      approved_target: 12,
    },
  }), {
    enabled: false,
    reason: 'bulk-production-unapproved',
  });
});

test('only an explicit approved policy exposes its bounded target', () => {
  assert.deepEqual(evaluateBulkPolicy({
    bulk_production: {
      enabled: true,
      requires_explicit_operator_approval: true,
      approval_status: 'APPROVED',
      approved_target: 12,
    },
  }), {
    enabled: true,
    approved_target: 12,
  });
});

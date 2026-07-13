import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { evaluateBulkPolicy, loadBulkPolicy } from './exit-conditions.mjs';

test('missing or invalid policy keeps the legacy loop retired', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'study-exit-policy-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));

  assert.deepEqual(await loadBulkPolicy(path.join(dir, 'missing.json')), {
    enabled: false,
    reason: 'legacy-bulk-loop-retired',
    policy_state: 'missing',
  });
  const invalidPath = path.join(dir, 'invalid.json');
  await fs.writeFile(invalidPath, '{not-json', 'utf8');
  assert.deepEqual(await loadBulkPolicy(invalidPath), {
    enabled: false,
    reason: 'legacy-bulk-loop-retired',
    policy_state: 'invalid',
  });
});

test('no tracked policy value can revive the retired loop', async (t) => {
  assert.deepEqual(evaluateBulkPolicy(), {
    enabled: false,
    reason: 'legacy-bulk-loop-retired',
  });

  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'study-exit-policy-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const policyPath = path.join(dir, 'policy.json');
  await fs.writeFile(policyPath, JSON.stringify({
    bulk_production: {
      enabled: true,
      approval_status: 'APPROVED',
      approved_target: 999999,
    },
  }));
  assert.deepEqual(await loadBulkPolicy(policyPath), {
    enabled: false,
    reason: 'legacy-bulk-loop-retired',
    policy_state: 'loaded',
  });
});

#!/usr/bin/env node

// Retired compatibility entrypoint for the legacy quantity-driven bulk loop.
// It is intentionally read-only and can never authorize or continue work.

import fs from 'node:fs/promises';
import path from 'node:path';

import { DATA_DIR } from './lib/paths.mjs';

const OPERATIONS_POLICY_PATH = path.join(DATA_DIR, 'operations-policy.json');
const RETIRED_REASON = 'legacy-bulk-loop-retired';

export function evaluateBulkPolicy() {
  return { enabled: false, reason: RETIRED_REASON };
}

export async function loadBulkPolicy(policyPath = OPERATIONS_POLICY_PATH) {
  try {
    JSON.parse(await fs.readFile(policyPath, 'utf8'));
    return { ...evaluateBulkPolicy(), policy_state: 'loaded' };
  } catch (error) {
    return {
      ...evaluateBulkPolicy(),
      policy_state: error?.code === 'ENOENT' ? 'missing' : 'invalid',
    };
  }
}

async function main() {
  const policy = await loadBulkPolicy();
  console.log(JSON.stringify({
    readonly: true,
    should_exit: true,
    reason: policy.reason,
    policy_state: policy.policy_state,
  }));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(`exit-conditions failed: ${error.message}`);
    process.exit(1);
  });
}

// tests/build-budget.test.mjs
// Assert that npm run build completes within the time budget

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// Build budget: 180s on CI (ubuntu-latest), 60s local
// Skip if we're not in CI to avoid slow local test runs
const IS_CI = !!process.env.CI;
const BUDGET_MS = IS_CI ? 180_000 : 60_000;

await test(`build completes within ${BUDGET_MS / 1000}s budget`, { skip: !IS_CI ? 'skipped locally (only runs in CI)' : false }, () => {
  const start = Date.now();
  const result = spawnSync('npm', ['run', 'build'], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: BUDGET_MS + 10_000, // extra 10s for process overhead
    stdio: 'pipe',
  });
  const elapsed = Date.now() - start;

  assert.equal(result.status, 0, `Build failed:\n${result.stderr}`);
  assert.ok(elapsed < BUDGET_MS,
    `Build took ${Math.round(elapsed / 1000)}s, exceeds ${BUDGET_MS / 1000}s budget`
  );
});

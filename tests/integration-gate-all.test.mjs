// tests/integration-gate-all.test.mjs
// Integration test: run quality-gate-all against the fixture corpus

import test from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

await test('quality-gate-all self-test passes', () => {
  const result = execSync('node scripts/quality-gate-all.mjs --self-test', {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 30000,
  });
  assert.ok(result.includes('passed'), 'self-test output should mention passed');
});

await test('quality-gate-all --json returns valid JSON', () => {
  // Scan just a small subset by running against the fixture dir
  let output;
  try {
    output = execSync('node scripts/quality-gate-all.mjs --json', {
      cwd: ROOT,
      encoding: 'utf8',
      timeout: 180000,
      env: { ...process.env },
    });
  } catch (err) {
    // Exit code 1 is expected if there are failures; output is still in err.stdout
    output = err.stdout || '';
  }
  assert.doesNotThrow(() => JSON.parse(output), 'quality-gate-all --json output should be valid JSON');
  const parsed = JSON.parse(output);
  assert.ok(typeof parsed.total === 'number', 'parsed.total should be a number');
  assert.ok(typeof parsed.passed === 'number', 'parsed.passed should be a number');
  assert.ok(typeof parsed.failed === 'number', 'parsed.failed should be a number');
  assert.equal(parsed.passed + parsed.failed, parsed.total, 'passed + failed should equal total');
});

await test('full library: 0 gate failures (1522/1522)', () => {
  // This is the main quality gate assertion
  let output;
  let exitCode = 0;
  try {
    output = execSync('node scripts/quality-gate-all.mjs --json', {
      cwd: ROOT,
      encoding: 'utf8',
      timeout: 180000,
    });
  } catch (err) {
    output = err.stdout || '';
    exitCode = err.status || 1;
  }

  const parsed = JSON.parse(output);
  assert.equal(parsed.failed, 0,
    `Expected 0 gate failures, got ${parsed.failed}:\n${JSON.stringify(parsed.failures?.slice(0, 5), null, 2)}`
  );
  assert.equal(exitCode, 0, 'quality-gate-all should exit 0 when all pass');
});

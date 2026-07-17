import assert from 'node:assert/strict';
import test from 'node:test';

import {
  discoverResearchLabTests,
  runResearchLabTests,
} from './run-research-labs.mjs';

test('discovers exactly the eleven imported lab test modules', async () => {
  const tests = await discoverResearchLabTests();
  assert.equal(tests.length, 11);
  assert.ok(tests.every((testPath) => testPath.includes('/labs/test_')));
});

test('fails before execution when the module contract drifts', () => {
  assert.throws(
    () => runResearchLabTests([], { expectedModules: 11 }),
    /expected 11 research lab test modules, got 0/,
  );
});

test('portable mode names the one external module instead of silently passing it', async () => {
  const tests = await discoverResearchLabTests();
  const result = runResearchLabTests(tests, {
    expectedModules: 11,
    includeExternal: false,
  });
  assert.equal(result.ok, true);
  assert.equal(result.portable_modules, 10);
  assert.equal(result.external_modules, 0);
  assert.equal(result.external_not_run.length, 1);
  assert.match(result.external_not_run[0], /langgraph.*test_stategraph_lab\.py/);
});

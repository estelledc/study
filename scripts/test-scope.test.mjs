import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

test('npm test is scoped to Study-owned test modules', () => {
  const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  assert.equal(
    packageJson.scripts.test,
    'node --test scripts/*.test.mjs scripts/lib/*.test.mjs',
  );
  assert.doesNotMatch(packageJson.scripts.test, /research-worktrees/);
});

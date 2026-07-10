import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import {
  buildCiSteps,
  changedFromArgs,
  CI_STEPS,
  freshnessAsOf,
  runCiSteps,
  whitespaceDiffArgs,
} from './verify-ci.mjs';

test('adds a valid PR base commit to the incremental content contract', () => {
  const sha = 'a'.repeat(40);
  assert.deepEqual(changedFromArgs({ STUDY_CHANGED_FROM: sha }), ['--changed-from', sha]);
  const step = buildCiSteps({ STUDY_CHANGED_FROM: sha })
    .find(({ name }) => name === 'content contract');
  assert.deepEqual(step.args.slice(-2), ['--changed-from', sha]);
  const quality = buildCiSteps({ STUDY_CHANGED_FROM: sha })
    .find(({ name }) => name === 'changed-note quality gate');
  assert.deepEqual(quality.args.slice(1, 3), ['--changed-from', sha]);
});

test('ignores missing, malformed, and all-zero event SHAs', () => {
  assert.deepEqual(changedFromArgs({}), []);
  assert.deepEqual(changedFromArgs({ STUDY_CHANGED_FROM: 'origin/main' }), []);
  assert.deepEqual(changedFromArgs({ STUDY_CHANGED_FROM: '0'.repeat(40) }), []);
  assert.equal(buildCiSteps({}).some(({ name }) => name === 'changed-note quality gate'), false);
});

test('checks committed PR whitespace from the trusted base SHA', () => {
  const sha = 'b'.repeat(40);
  assert.deepEqual(whitespaceDiffArgs({ STUDY_CHANGED_FROM: sha }), ['diff', '--check', `${sha}...HEAD`]);
  assert.deepEqual(whitespaceDiffArgs({ STUDY_CHANGED_FROM: 'origin/main' }), ['diff', '--check']);
});

test('uses an explicit freshness date or a UTC date fallback', () => {
  assert.equal(freshnessAsOf({ STUDY_FRESHNESS_AS_OF: '2026-07-10' }), '2026-07-10');
  assert.equal(freshnessAsOf({}, new Date('2027-02-03T23:59:00Z')), '2027-02-03');
});

test('initializes runner-temp paths at step runtime in both workflows', () => {
  for (const workflow of ['.github/workflows/ci.yml', '.github/workflows/deploy.yml']) {
    const source = fs.readFileSync(workflow, 'utf8');
    assert.doesNotMatch(source, /^\s+STUDY_BUILD_LOG:\s*\$\{\{\s*runner\.temp\s*\}\}/mu);
    assert.match(
      source,
      /echo "STUDY_BUILD_LOG=\$RUNNER_TEMP\/study-build\.log" >> "\$GITHUB_ENV"/u,
    );
  }
});

test('runs the portable CI contract in a stable order', () => {
  const seen = [];
  const result = runCiSteps(CI_STEPS, (step) => {
    seen.push(step.name);
    return 0;
  });
  assert.equal(result.ok, true);
  assert.deepEqual(seen, CI_STEPS.map((step) => step.name));
  assert.equal(seen.includes('strict build'), true);
  assert.equal(seen.includes('homepage and base links'), true);
  assert.equal(seen.includes('generated tracked output drift'), true);
  assert.equal(seen.includes('staged output drift'), true);
  assert.equal(seen.some((name) => name.includes('worktree')), false);
});

test('fails closed and stops after the first failed gate', () => {
  const seen = [];
  const result = runCiSteps(CI_STEPS, (step) => {
    seen.push(step.name);
    return step.name === 'action pins' ? 17 : 0;
  });
  assert.deepEqual(result, { ok: false, failed: 'action pins', status: 17 });
  assert.equal(seen.at(-1), 'action pins');
  assert.equal(seen.includes('strict build'), false);
});

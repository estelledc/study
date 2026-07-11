import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  assertEquivalentCommitScope,
  validateCommitScope,
} from './git-commit-scope.mjs';

// Temporary repositories must not inherit machine-level Trace2 collectors that
// keep writing under .git after a Git command has returned.
process.env.GIT_TRACE2_EVENT = '0';

const TARGET = 'src/content/docs/papers/fixture.md';

function git(repo, args) {
  return execFileSync('git', args, {
    cwd: repo,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function write(repo, relativePath, contents) {
  const absolutePath = path.join(repo, relativePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, contents);
}

function commitAll(repo, message) {
  git(repo, ['add', '-A']);
  git(repo, ['commit', '-m', message]);
  return git(repo, ['rev-parse', 'HEAD']);
}

function makeRepo(t) {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'study-commit-scope-'));
  t.after(() => fs.rmSync(repo, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 50,
  }));
  git(repo, ['init', '-b', 'main']);
  git(repo, ['config', 'user.name', 'Study Test']);
  git(repo, ['config', 'user.email', 'study-test@example.invalid']);
  write(repo, 'README.md', 'fixture\n');
  commitAll(repo, 'initial');
  return repo;
}

function expectScopeCode(fn, code) {
  assert.throws(fn, (error) => error?.code === code);
}

test('validateCommitScope accepts one ordinary target note add and modify', (t) => {
  const repo = makeRepo(t);
  write(repo, TARGET, '# fixture\n');
  const added = commitAll(repo, 'add fixture');
  const addScope = validateCommitScope({ commit: added, expectedPath: TARGET }, { cwd: repo });
  assert.equal(addScope.status, 'A');
  assert.equal(addScope.mode, '100644');

  write(repo, TARGET, '# fixture\n\nupdated\n');
  const modified = commitAll(repo, 'modify fixture');
  const modifyScope = validateCommitScope({ commit: modified, expectedPath: TARGET }, { cwd: repo });
  assert.equal(modifyScope.status, 'M');
  assert.notEqual(modifyScope.blob, addScope.blob);
});

test('pre-pick and post-pick signatures match in a clean cherry-pick', (t) => {
  const repo = makeRepo(t);
  git(repo, ['switch', '-c', 'worker']);
  write(repo, TARGET, '# fixture\n');
  const workerCommit = commitAll(repo, 'worker note');
  const reviewed = validateCommitScope({ commit: workerCommit, expectedPath: TARGET }, { cwd: repo });

  git(repo, ['switch', 'main']);
  write(repo, 'README.md', 'fixture\nmain moved\n');
  const preHead = commitAll(repo, 'move main');
  git(repo, ['cherry-pick', workerCommit]);
  const pickedHead = git(repo, ['rev-parse', 'HEAD']);
  const actual = validateCommitScope({
    commit: pickedHead,
    expectedPath: TARGET,
    expectedParent: preHead,
  }, { cwd: repo });

  assert.equal(assertEquivalentCommitScope(reviewed, actual), actual);
});

test('validateCommitScope rejects an extra workflow, data file, or second note', async (t) => {
  for (const extraPath of [
    '.github/workflows/untrusted.yml',
    'data/candidates.jsonl',
    'src/content/docs/papers/second.md',
  ]) {
    await t.test(extraPath, (subtest) => {
      const repo = makeRepo(subtest);
      write(repo, TARGET, '# fixture\n');
      write(repo, extraPath, 'untrusted\n');
      const commit = commitAll(repo, `add ${extraPath}`);
      expectScopeCode(
        () => validateCommitScope({ commit, expectedPath: TARGET }, { cwd: repo }),
        'CHANGESET_NOT_SINGLE_TARGET',
      );
    });
  }
});

test('validateCommitScope rejects delete and rename operations', async (t) => {
  await t.test('delete', (subtest) => {
    const repo = makeRepo(subtest);
    write(repo, TARGET, '# fixture\n');
    commitAll(repo, 'add fixture');
    fs.unlinkSync(path.join(repo, TARGET));
    const commit = commitAll(repo, 'delete fixture');
    expectScopeCode(
      () => validateCommitScope({ commit, expectedPath: TARGET }, { cwd: repo }),
      'CHANGE_TYPE_NOT_ALLOWED',
    );
  });

  await t.test('rename', (subtest) => {
    const repo = makeRepo(subtest);
    write(repo, 'src/content/docs/papers/old-name.md', '# fixture\n');
    commitAll(repo, 'add old fixture');
    fs.renameSync(
      path.join(repo, 'src/content/docs/papers/old-name.md'),
      path.join(repo, TARGET),
    );
    const commit = commitAll(repo, 'rename fixture');
    expectScopeCode(
      () => validateCommitScope({ commit, expectedPath: TARGET }, { cwd: repo }),
      'CHANGESET_NOT_SINGLE_TARGET',
    );
  });
});

test('validateCommitScope rejects symlink, submodule, and mode-only targets', async (t) => {
  await t.test('symlink', (subtest) => {
    const repo = makeRepo(subtest);
    fs.mkdirSync(path.dirname(path.join(repo, TARGET)), { recursive: true });
    fs.symlinkSync('../../../../../README.md', path.join(repo, TARGET));
    const commit = commitAll(repo, 'add symlink fixture');
    expectScopeCode(
      () => validateCommitScope({ commit, expectedPath: TARGET }, { cwd: repo }),
      'TARGET_NOT_ORDINARY_FILE',
    );
  });

  await t.test('submodule mode', (subtest) => {
    const repo = makeRepo(subtest);
    const object = git(repo, ['rev-parse', 'HEAD']);
    git(repo, ['update-index', '--add', '--cacheinfo', `160000,${object},${TARGET}`]);
    git(repo, ['commit', '-m', 'add gitlink fixture']);
    const commit = git(repo, ['rev-parse', 'HEAD']);
    expectScopeCode(
      () => validateCommitScope({ commit, expectedPath: TARGET }, { cwd: repo }),
      'TARGET_NOT_ORDINARY_FILE',
    );
  });

  await t.test('mode-only change', (subtest) => {
    const repo = makeRepo(subtest);
    write(repo, TARGET, '# fixture\n');
    commitAll(repo, 'add fixture');
    fs.chmodSync(path.join(repo, TARGET), 0o755);
    const commit = commitAll(repo, 'change fixture mode');
    expectScopeCode(
      () => validateCommitScope({ commit, expectedPath: TARGET }, { cwd: repo }),
      'FILE_MODE_CHANGED',
    );
  });
});

test('validateCommitScope rejects merge commits and unexpected parents', async (t) => {
  await t.test('merge commit', (subtest) => {
    const repo = makeRepo(subtest);
    git(repo, ['switch', '-c', 'worker']);
    write(repo, TARGET, '# fixture\n');
    commitAll(repo, 'worker note');
    git(repo, ['switch', 'main']);
    write(repo, 'README.md', 'fixture\nmain moved\n');
    commitAll(repo, 'move main');
    git(repo, ['merge', '--no-ff', 'worker', '-m', 'merge worker']);
    const commit = git(repo, ['rev-parse', 'HEAD']);
    expectScopeCode(
      () => validateCommitScope({ commit, expectedPath: TARGET }, { cwd: repo }),
      'COMMIT_NOT_SINGLE_PARENT',
    );
  });

  await t.test('unexpected parent', (subtest) => {
    const repo = makeRepo(subtest);
    const wrongParent = git(repo, ['rev-parse', 'HEAD']);
    write(repo, TARGET, '# fixture\n');
    const commit = commitAll(repo, 'worker note');
    expectScopeCode(
      () => validateCommitScope({ commit, expectedPath: TARGET, expectedParent: commit }, { cwd: repo }),
      'PARENT_MISMATCH',
    );
    assert.notEqual(wrongParent, commit);
  });
});

test('assertEquivalentCommitScope requires the same path, status, mode, and blob', () => {
  const expected = {
    expectedPath: TARGET,
    status: 'M',
    mode: '100644',
    blob: 'a'.repeat(40),
  };
  const actual = { ...expected };
  assert.equal(assertEquivalentCommitScope(expected, actual), actual);
  expectScopeCode(
    () => assertEquivalentCommitScope(expected, { ...expected, blob: 'b'.repeat(40) }),
    'POST_PICK_SCOPE_MISMATCH',
  );
});

test('Git inspection failures are classified as scope failures', () => {
  let calls = 0;
  expectScopeCode(
    () => validateCommitScope({ commit: 'a'.repeat(40), expectedPath: TARGET }, {
      gitOutputFn() {
        calls += 1;
        if (calls === 1) return 'a'.repeat(40);
        throw new Error('fixture Git failure');
      },
    }),
    'PARENT_INSPECTION_FAILED',
  );
});

test('validateCommitScope rejects option-like commits and unsafe target paths before Git', () => {
  expectScopeCode(
    () => validateCommitScope({ commit: '--help', expectedPath: TARGET }),
    'COMMIT_FORMAT_INVALID',
  );
  expectScopeCode(
    () => validateCommitScope({ commit: 'a'.repeat(40), expectedPath: '/absolute.md' }),
    'TARGET_PATH_INVALID',
  );
  expectScopeCode(
    () => validateCommitScope({ commit: 'a'.repeat(40), expectedPath: '../outside.md' }),
    'TARGET_PATH_INVALID',
  );
  expectScopeCode(
    () => validateCommitScope({
      commit: 'a'.repeat(40),
      expectedPath: TARGET,
      expectedParent: 'abc1234',
    }),
    'EXPECTED_PARENT_INVALID',
  );
});

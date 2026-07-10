import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  buildCherryPickArgs,
  rollbackPickedCommit,
  validateMergeArgs,
  validateMergeLock,
  validateMergeSource,
} from './sync-and-merge-single.mjs';

const SOURCE = {
  worktree: 'papers-3',
  branch: 'refactor/papers-3',
  round: 7,
  generation: 'generation-7',
  claimToken: 'claim-token-7',
  ownerToken: 'round-owner-7',
};

function mergeArgs(overrides = {}) {
  return {
    slug: 'raft',
    commit: 'a'.repeat(40),
    area: 'papers',
    ...SOURCE,
    ...overrides,
  };
}

function git(repo, args) {
  return execFileSync('git', args, {
    cwd: repo,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function commitNote(repo, contents, message) {
  const note = path.join(repo, 'src/content/docs/papers/fixture.md');
  fs.mkdirSync(path.dirname(note), { recursive: true });
  fs.writeFileSync(note, contents);
  git(repo, ['add', note]);
  git(repo, ['commit', '-m', message]);
  return git(repo, ['rev-parse', 'HEAD']);
}

function makeRepo(t) {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'study-merge-source-'));
  t.after(() => fs.rmSync(repo, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 50,
  }));
  git(repo, ['init', '-b', 'main']);
  git(repo, ['config', 'user.name', 'Study Test']);
  git(repo, ['config', 'user.email', 'study-test@example.invalid']);
  fs.writeFileSync(path.join(repo, 'README.md'), 'fixture\n');
  git(repo, ['add', 'README.md']);
  git(repo, ['commit', '-m', 'initial']);
  return repo;
}

test('validateMergeArgs accepts a safe target note', () => {
  const checked = validateMergeArgs(mergeArgs({ commit: 'abc1234' }));
  assert.equal(checked.relativePath, 'src/content/docs/papers/raft.md');
});

test('validateMergeArgs accepts the shared dotted slug grammar', () => {
  const checked = validateMergeArgs(mergeArgs({ slug: 'tls-1.3', commit: 'abc1234' }));
  assert.equal(checked.relativePath, 'src/content/docs/papers/tls-1.3.md');
});

test('validateMergeArgs rejects invalid area, slug, and commit hash', () => {
  assert.throws(() => validateMergeArgs(mergeArgs({ slug: '../raft', commit: 'abc1234' })), /Invalid slug/);
  assert.throws(() => validateMergeArgs(mergeArgs({ commit: 'abc1234', area: 'notes' })), /Invalid area/);
  assert.throws(() => validateMergeArgs(mergeArgs({ commit: 'HEAD~1' })), /Invalid commit hash/);
});

test('validateMergeArgs fails closed when source declaration is incomplete', () => {
  for (const field of ['worktree', 'branch', 'round', 'generation', 'claimToken', 'ownerToken']) {
    const input = mergeArgs();
    delete input[field];
    assert.throws(() => validateMergeArgs(input), /source|round lock owner/i, field);
  }
});

test('validateMergeSource binds assignment, worktree branch HEAD, generation, and round', () => {
  const args = mergeArgs();
  const calls = [];
  const result = validateMergeSource(args, {
    candidates: [{
      area: 'papers', slug: 'raft', status: 'claimed', claimed_by: 'papers-3',
      claim_generation: 'generation-7', claim_token: 'claim-token-7',
    }],
    rewritePool: [],
    events: [{ event: 'round-lifecycle-start', lifecycle_id: 'generation-7', round_n: 7 }],
    worktrees: [{ area: 'papers', name: 'papers-3', branch: 'refactor/papers-3', path: '/fixture/papers-3' }],
  }, {
    gitOutputFn(gitArgs, options) {
      calls.push({ gitArgs, options });
      if (gitArgs[0] === 'branch') return 'refactor/papers-3';
      if (gitArgs[0] === 'worktree') {
        return `worktree /fixture/papers-3\nHEAD ${'a'.repeat(40)}\nbranch refs/heads/refactor/papers-3`;
      }
      if (gitArgs.includes('--show-toplevel')) return '/fixture/papers-3';
      if (gitArgs.includes('--git-common-dir')) return '/fixture/canonical/.git';
      if (gitArgs[0] === 'rev-parse') return 'a'.repeat(40);
      throw new Error(`unexpected git call: ${gitArgs.join(' ')}`);
    },
    repositoryRoot: '/fixture/canonical',
    realpathFn: (value) => path.resolve(value),
  });
  assert.equal(result.assignment, 'papers::raft');
  assert.equal(result.claim.claim_token, 'claim-token-7');
  assert.deepEqual(calls.map((call) => call.options.cwd), [
    '/fixture/papers-3',
    '/fixture/papers-3',
    '/fixture/papers-3',
    '/fixture/papers-3',
    '/fixture/canonical',
  ]);
});

test('validateMergeSource rejects unknown or stale source declarations', () => {
  const baseState = {
    candidates: [{
      area: 'papers', slug: 'raft', status: 'claimed', claimed_by: 'papers-3',
      claim_generation: 'generation-7', claim_token: 'claim-token-7',
    }],
    rewritePool: [],
    events: [{ event: 'round-lifecycle-start', lifecycle_id: 'generation-7', round_n: 7 }],
    worktrees: [{ area: 'papers', name: 'papers-3', branch: 'refactor/papers-3', path: '/fixture/papers-3' }],
  };
  const sourceOptions = {
    repositoryRoot: '/fixture/canonical',
    realpathFn: (value) => path.resolve(value),
    gitOutputFn(gitArgs) {
      if (gitArgs[0] === 'branch') return 'refactor/papers-3';
      if (gitArgs[0] === 'worktree') {
        return `worktree /fixture/papers-3\nHEAD ${'a'.repeat(40)}\nbranch refs/heads/refactor/papers-3`;
      }
      if (gitArgs.includes('--show-toplevel')) return '/fixture/papers-3';
      if (gitArgs.includes('--git-common-dir')) return '/fixture/canonical/.git';
      return 'a'.repeat(40);
    },
  };
  for (const [label, overrides] of [
    ['worktree', { worktree: 'papers-4' }],
    ['branch', { branch: 'refactor/papers-4' }],
    ['round', { round: 8 }],
    ['generation', { generation: 'generation-8' }],
    ['token', { claimToken: 'stale-token' }],
    ['commit', { commit: 'b'.repeat(40) }],
  ]) {
    assert.throws(
      () => validateMergeSource(mergeArgs(overrides), baseState, sourceOptions),
      /source|claim|round|branch|HEAD/i,
      label,
    );
  }
  assert.throws(
    () => validateMergeSource(mergeArgs(), { ...baseState, candidates: [] }, sourceOptions),
    /claimed assignment/i,
  );
});

test('validateMergeSource accepts a registered linked worktree from the canonical repository', (t) => {
  const repo = makeRepo(t);
  const linked = fs.mkdtempSync(path.join(os.tmpdir(), 'study-linked-worktree-'));
  fs.rmSync(linked, { recursive: true, force: true });
  t.after(() => fs.rmSync(linked, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }));
  git(repo, ['worktree', 'add', '-b', 'refactor/papers-3', linked]);
  const commit = commitNote(linked, '# linked fixture\n', 'linked fixture');

  const result = validateMergeSource(mergeArgs({ commit }), {
    candidates: [{
      area: 'papers', slug: 'raft', status: 'claimed', claimed_by: 'papers-3',
      claim_generation: 'generation-7', claim_token: 'claim-token-7',
    }],
    rewritePool: [],
    events: [{ event: 'round-lifecycle-start', lifecycle_id: 'generation-7', round_n: 7 }],
    worktrees: [{ area: 'papers', name: 'papers-3', branch: 'refactor/papers-3', path: linked }],
  }, { repositoryRoot: repo });

  assert.equal(result.worktree.path, linked);
});

test('validateMergeSource rejects a standalone repository at a canonical worktree path', (t) => {
  const canonicalRepo = makeRepo(t);
  const standalone = makeRepo(t);
  git(standalone, ['switch', '-c', 'refactor/papers-3']);
  const commit = commitNote(standalone, '# standalone fixture\n', 'standalone fixture');

  assert.throws(
    () => validateMergeSource(mergeArgs({ commit }), {
      candidates: [{
        area: 'papers', slug: 'raft', status: 'claimed', claimed_by: 'papers-3',
        claim_generation: 'generation-7', claim_token: 'claim-token-7',
      }],
      rewritePool: [],
      events: [{ event: 'round-lifecycle-start', lifecycle_id: 'generation-7', round_n: 7 }],
      worktrees: [{ area: 'papers', name: 'papers-3', branch: 'refactor/papers-3', path: standalone }],
    }, { repositoryRoot: canonicalRepo }),
    (error) => error?.code === 'WORKTREE_REPOSITORY_MISMATCH',
  );
});

test('validateMergeLock requires the live owner and matching round', () => {
  const now = '2026-07-10T00:00:00.000Z';
  const lock = {
    owner_token: 'round-owner-7', active_round: 7,
    expires_at: '2026-07-10T01:00:00.000Z',
  };
  assert.equal(validateMergeLock(mergeArgs(), lock, { now }).owner_token, 'round-owner-7');
  assert.throws(() => validateMergeLock(mergeArgs({ ownerToken: 'other' }), lock, { now }), /owner/i);
  assert.throws(() => validateMergeLock(mergeArgs({ round: 8 }), lock, { now }), /round/i);
  assert.throws(
    () => validateMergeLock(mergeArgs(), { ...lock, expires_at: '2026-07-09T23:00:00.000Z' }, { now }),
    /expired/i,
  );
});

test('buildCherryPickArgs never installs an automatic conflict preference', () => {
  assert.deepEqual(buildCherryPickArgs('a'.repeat(40)), ['cherry-pick', 'a'.repeat(40)]);
});

test('rollbackPickedCommit uses a ref CAS before restoring the captured pre-pick HEAD', () => {
  const calls = [];
  const preHead = 'b'.repeat(40);
  const pickedHead = 'c'.repeat(40);
  const result = rollbackPickedCommit(preHead, pickedHead, (args, options) => {
    calls.push({ args, cwd: options.cwd });
    return { ok: true, out: '' };
  });
  assert.equal(result.ok, true);
  assert.deepEqual(calls.map((call) => call.args), [
    ['status', '--porcelain'],
    ['update-ref', 'refs/heads/main', preHead, pickedHead],
    ['reset', '--hard', preHead],
  ]);
});

test('rollbackPickedCommit preserves concurrent dirty work before moving the branch', () => {
  const calls = [];
  const result = rollbackPickedCommit('b'.repeat(40), 'c'.repeat(40), (args) => {
    calls.push(args);
    return args[0] === 'status'
      ? { ok: true, out: ' M unrelated.md' }
      : { ok: true, out: '' };
  });
  assert.equal(result.ok, false);
  assert.match(result.error, /not clean/);
  assert.deepEqual(calls, [['status', '--porcelain']]);
});

test('rollbackPickedCommit rejects an uncaptured or abbreviated target', () => {
  assert.throws(() => rollbackPickedCommit('HEAD~1', 'c'.repeat(40)), /captured full pre-pick HEAD/);
  assert.throws(() => rollbackPickedCommit('b'.repeat(40), 'abc1234'), /captured full picked HEAD/);
});

test('a conflicting pick does not select theirs and restores captured HEAD', (t) => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'study-merge-conflict-'));
  t.after(() => fs.rmSync(repo, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 50,
  }));
  git(repo, ['init', '-b', 'main']);
  git(repo, ['config', 'user.name', 'Study Test']);
  git(repo, ['config', 'user.email', 'study-test@example.invalid']);
  commitNote(repo, 'base\n', 'base');

  git(repo, ['switch', '-c', 'worker']);
  const workerCommit = commitNote(repo, 'worker version\n', 'worker version');
  git(repo, ['switch', 'main']);
  const preHead = commitNote(repo, 'main version\n', 'main version');

  assert.throws(
    () => git(repo, buildCherryPickArgs(workerCommit)),
    /CONFLICT|could not apply/i,
  );
  git(repo, ['cherry-pick', '--abort']);
  const result = rollbackPickedCommit(preHead, preHead, (args) => {
    git(repo, args);
    return { ok: true, out: '' };
  });

  assert.equal(result.ok, true);
  assert.equal(git(repo, ['rev-parse', 'HEAD']), preHead);
  assert.equal(fs.readFileSync(path.join(repo, 'src/content/docs/papers/fixture.md'), 'utf8'), 'main version\n');
  assert.equal(git(repo, ['status', '--porcelain']), '');
});

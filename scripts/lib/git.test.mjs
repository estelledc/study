import assert from 'node:assert/strict';
import test from 'node:test';

import { gitOutput, validateCommitHash } from './git.mjs';

test('gitOutput invokes git with an args array', () => {
  const calls = [];
  const out = gitOutput(['status', '--short'], {
    cwd: '/tmp/repo',
    execFileSync(command, args, options) {
      calls.push({ command, args, cwd: options.cwd });
      return 'ok\n';
    },
  });
  assert.equal(out, 'ok');
  assert.deepEqual(calls, [{ command: 'git', args: ['status', '--short'], cwd: '/tmp/repo' }]);
});

test('gitOutput rejects string commands', () => {
  assert.throws(() => gitOutput('status --short'), /args must be an array/);
});

test('validateCommitHash accepts short or full hex hashes only', () => {
  assert.equal(validateCommitHash('abc1234'), 'abc1234');
  assert.equal(validateCommitHash('0123456789abcdef0123456789abcdef01234567'), '0123456789abcdef0123456789abcdef01234567');
  assert.throws(() => validateCommitHash('HEAD~1'), /Invalid commit hash/);
  assert.throws(() => validateCommitHash('abc123;rm -rf /'), /Invalid commit hash/);
});

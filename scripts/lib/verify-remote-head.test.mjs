import assert from 'node:assert/strict';
import test from 'node:test';

import {
  normalizeRemoteIdentity,
  queryAndVerifyRemoteIdentity,
  queryAndVerifyRemoteHead,
  verifyRemoteIdentity,
  verifyRemoteHead,
} from './verify-remote-head.mjs';

const EXPECTED = 'a'.repeat(40);
const REF = 'refs/heads/main';

function expectCode(fn, code) {
  assert.throws(fn, (error) => error?.code === code);
}

test('verifyRemoteHead accepts one exact full SHA and ref match', () => {
  const result = verifyRemoteHead({
    expectedSha: EXPECTED,
    ref: REF,
    lsRemoteOutput: `${EXPECTED}\t${REF}\n`,
  });
  assert.deepEqual(result, {
    expectedSha: EXPECTED,
    remoteSha: EXPECTED,
    ref: REF,
    verified: true,
  });
});

test('verifyRemoteHead rejects invalid expected SHAs', () => {
  for (const expectedSha of ['', 'abc1234', 'A'.repeat(40), `${EXPECTED}0`]) {
    expectCode(
      () => verifyRemoteHead({ expectedSha, ref: REF, lsRemoteOutput: `${EXPECTED}\t${REF}\n` }),
      'EXPECTED_SHA_INVALID',
    );
  }
});

test('verifyRemoteHead classifies missing, ambiguous, malformed, and mismatched remote output', () => {
  expectCode(
    () => verifyRemoteHead({ expectedSha: EXPECTED, ref: REF, lsRemoteOutput: '' }),
    'REMOTE_HEAD_MISSING',
  );
  expectCode(
    () => verifyRemoteHead({
      expectedSha: EXPECTED,
      ref: REF,
      lsRemoteOutput: `${EXPECTED}\t${REF}\n${EXPECTED}\t${REF}\n`,
    }),
    'REMOTE_HEAD_AMBIGUOUS',
  );
  expectCode(
    () => verifyRemoteHead({ expectedSha: EXPECTED, ref: REF, lsRemoteOutput: `${EXPECTED}\trefs/heads/other\n` }),
    'REMOTE_HEAD_MALFORMED',
  );
  expectCode(
    () => verifyRemoteHead({ expectedSha: EXPECTED, ref: REF, lsRemoteOutput: `${'b'.repeat(40)}\t${REF}\n` }),
    'REMOTE_HEAD_MISMATCH',
  );
});

test('queryAndVerifyRemoteHead invokes ls-remote without TLS overrides', () => {
  const calls = [];
  const result = queryAndVerifyRemoteHead({
    expectedSha: EXPECTED,
    remote: 'origin',
    branch: 'main',
    cwd: '/fixture',
    execFileSyncFn(command, args, options) {
      calls.push({ command, args, options });
      return `${EXPECTED}\t${REF}\n`;
    },
  });
  assert.equal(result.verified, true);
  assert.deepEqual(calls[0].args, [
    '-c', 'http.followRedirects=false',
    'ls-remote', '--exit-code', '--refs', 'origin', REF,
  ]);
  assert.equal(calls[0].args.some((arg) => arg.includes('sslVerify')), false);
});

test('queryAndVerifyRemoteHead classifies query failures', () => {
  expectCode(
    () => queryAndVerifyRemoteHead({
      expectedSha: EXPECTED,
      execFileSyncFn() {
        throw new Error('network unavailable');
      },
    }),
    'REMOTE_QUERY_FAILED',
  );
});

test('queryAndVerifyRemoteHead rejects option-like remote and branch values', () => {
  expectCode(
    () => queryAndVerifyRemoteHead({ expectedSha: EXPECTED, remote: '--upload-pack=bad' }),
    'REMOTE_NAME_INVALID',
  );
  expectCode(
    () => queryAndVerifyRemoteHead({ expectedSha: EXPECTED, branch: '../main' }),
    'REMOTE_BRANCH_INVALID',
  );
});

test('normalizeRemoteIdentity maps approved GitHub transports to one repository identity', () => {
  for (const url of [
    'https://github.com/estelledc/study.git',
    'ssh://git@github.com/estelledc/study.git',
    'git@github.com:estelledc/study.git',
  ]) {
    assert.equal(normalizeRemoteIdentity(url), 'github.com/estelledc/study');
  }
  expectCode(() => normalizeRemoteIdentity('ext::sh -c bad'), 'REMOTE_URL_UNSAFE');
});

test('verifyRemoteIdentity rejects unapproved fetch or redirected push identities', () => {
  const allowed = ['github.com/estelledc/study'];
  assert.equal(verifyRemoteIdentity({
    fetchUrls: ['https://github.com/estelledc/study.git'],
    pushUrls: ['git@github.com:estelledc/study.git'],
    allowedIdentities: allowed,
  }).identity, allowed[0]);

  expectCode(() => verifyRemoteIdentity({
    fetchUrls: ['https://github.com/estelledc/study.git'],
    pushUrls: ['https://github.com/attacker/study.git'],
    allowedIdentities: allowed,
  }), 'REMOTE_IDENTITY_MISMATCH');
  expectCode(() => verifyRemoteIdentity({
    fetchUrls: ['https://github.com/estelledc/study.git', 'https://github.com/mirror/study.git'],
    pushUrls: ['https://github.com/estelledc/study.git'],
    allowedIdentities: allowed,
  }), 'REMOTE_URL_AMBIGUOUS');
});

test('queryAndVerifyRemoteIdentity resolves fetch and push URLs without trusting one side', () => {
  const calls = [];
  const result = queryAndVerifyRemoteIdentity({
    remote: 'origin',
    cwd: '/fixture',
    allowedIdentities: ['github.com/estelledc/study'],
    execFileSyncFn(command, args, options) {
      calls.push({ command, args, options });
      if (args.includes('--push')) return 'git@github.com:estelledc/study.git\n';
      return 'https://github.com/estelledc/study.git\n';
    },
  });
  assert.equal(result.identity, 'github.com/estelledc/study');
  assert.deepEqual(calls.map((call) => call.args), [
    ['remote', 'get-url', '--all', 'origin'],
    ['remote', 'get-url', '--push', '--all', 'origin'],
  ]);
});

test('remote HEAD query disables HTTP redirects and rechecks canonical identity', () => {
  const calls = [];
  const result = queryAndVerifyRemoteHead({
    expectedSha: EXPECTED,
    remote: 'origin',
    branch: 'main',
    cwd: '/fixture',
    allowedIdentities: ['github.com/estelledc/study'],
    execFileSyncFn(command, args, options) {
      calls.push({ command, args, options });
      if (args[0] === 'remote' && args.includes('--push')) return 'git@github.com:estelledc/study.git\n';
      if (args[0] === 'remote') return 'https://github.com/estelledc/study.git\n';
      return `${EXPECTED}\t${REF}\n`;
    },
  });
  assert.equal(result.verified, true);
  const remoteCall = calls.find((call) => call.args.includes('ls-remote'));
  assert.deepEqual(remoteCall.args.slice(0, 3), ['-c', 'http.followRedirects=false', 'ls-remote']);
});

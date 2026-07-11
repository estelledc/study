import assert from 'node:assert/strict';
import test from 'node:test';

import { auditToolchainContract } from './audit-toolchain.mjs';

const packageJson = {
  packageManager: 'npm@11.17.0',
  engines: {
    node: '>=22.23.1 <23',
    npm: '>=11.17.0 <12',
  },
};

const workflow = `
steps:
  - uses: actions/setup-node@0123456789012345678901234567890123456789
    with:
      node-version-file: .nvmrc
      cache: npm
  - run: npm install --global "$(node -p "require('./package.json').packageManager")"
  - run: node scripts/audit-toolchain.mjs
  - run: npm ci
`;

function audit(overrides = {}) {
  return auditToolchainContract({
    packageJson,
    nvmrc: '22.23.1\n',
    workflows: { 'ci.yml': workflow },
    nodeVersion: '22.23.1',
    npmVersion: '11.17.0',
    ...overrides,
  });
}

test('accepts one root contract shared by the runtime and workflow', () => {
  assert.deepEqual(audit(), []);
});

test('fails closed when the running Node or npm version drifts', () => {
  assert.deepEqual(audit({ nodeVersion: '23.0.0' }), [
    'running Node 23.0.0 does not equal canonical 22.23.1',
  ]);
  assert.deepEqual(audit({ npmVersion: '11.16.0' }), [
    'running npm 11.16.0 does not equal 11.17.0',
  ]);
});

test('rejects inconsistent package and version-file declarations', () => {
  const failures = audit({
    packageJson: {
      packageManager: 'npm@11',
      engines: { node: '>=22', npm: '11' },
    },
    nvmrc: '22\n',
  });
  assert.equal(failures.some((failure) => failure.includes('exact npm@x.y.z')), true);
  assert.equal(failures.some((failure) => failure.includes('exact x.y.z Node')), true);
});

test('rejects workflow-local Node versions and late npm selection', () => {
  const failures = audit({
    workflows: {
      'ci.yml': workflow
        .replace('node-version-file: .nvmrc', 'node-version: 22')
        .replace('  - run: npm install --global', '  - run: npm ci\n  - run: npm install --global'),
    },
  });
  assert.equal(failures.some((failure) => failure.includes('node-version-file')), true);
  assert.equal(failures.some((failure) => failure.includes('must not duplicate')), true);
  assert.equal(failures.some((failure) => failure.includes('before npm ci')), true);
});

test('requires the fail-closed audit before every workflow npm ci', () => {
  for (const source of [
    workflow.replace('  - run: node scripts/audit-toolchain.mjs\n', ''),
    workflow.replace(
      '  - run: node scripts/audit-toolchain.mjs\n  - run: npm ci',
      '  - run: npm ci\n  - run: node scripts/audit-toolchain.mjs',
    ),
  ]) {
    const failures = audit({ workflows: { 'ci.yml': source } });
    assert.equal(
      failures.some((failure) => failure.includes('after npm selection and before npm ci')),
      true,
    );
  }
});

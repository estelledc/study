import assert from 'node:assert/strict';
import test from 'node:test';

import { ACTIVE_OPERATION_FILES, auditOperationEntrypoints, auditOperationText } from './audit-operation-entrypoints.mjs';

test('accepts the bounded policy language', () => {
  assert.deepEqual(auditOperationText('Bulk production is disabled. Use a dry-run and open a draft PR.'), []);
  assert.deepEqual(auditOperationText('DRY_RUN=1 PUSH_REMOTE=1 bash scripts/finalize-round.sh'), []);
});

test('rejects unsafe legacy entrypoint patterns', () => {
  const samples = [
    [`git config http.sslVerify${'=false'}`, 'tls-bypass'],
    [`workspace: /${'Users'}/example/repo`, 'absolute-user-path'],
    ['target is 20,000 notes', 'obsolete-volume-target'],
    ['git push origin main', 'direct-main-push'],
    ['git push git@example.invalid:owner/repo.git main', 'direct-main-push'],
    ['git reset --hard origin/main', 'broad-hard-reset'],
    ['git -C /tmp/repo clean -fdx', 'broad-clean'],
    ['PUSH_REMOTE=1 bash scripts/finalize-round.sh', 'legacy-publish-switch'],
  ];
  for (const [sample, category] of samples) {
    assert.equal(auditOperationText(sample)[0].includes(category), true);
  }
});

test('audits executable operation entrypoints as well as policy documents', () => {
  for (const required of ['package.json', 'scripts/pick-batch.mjs', 'scripts/dispatch-batch.mjs', 'scripts/round.mjs', 'scripts/finalize-round.sh']) {
    assert.equal(ACTIVE_OPERATION_FILES.includes(required), true);
  }
  assert.deepEqual(auditOperationEntrypoints(), []);
});

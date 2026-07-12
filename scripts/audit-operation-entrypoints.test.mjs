import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import {
  ACTIVE_OPERATION_FILES,
  auditOperationEntrypoints,
  auditOperationsPolicy,
  auditOperationText,
} from './audit-operation-entrypoints.mjs';

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
  for (const required of [
    '.gitignore',
    'AGENTS.md',
    'package.json',
    'scripts/pick-batch.mjs',
    'scripts/dispatch-batch.mjs',
    'scripts/promote-candidates.mjs',
    'scripts/round.mjs',
    'scripts/loop-status.mjs',
    'scripts/exit-conditions.mjs',
    'scripts/lib/supervisor-policy.mjs',
    'scripts/supervisor-status.mjs',
    'scripts/finalize-round.sh',
    'scripts/aggregate-audit-reviews.mjs',
    'scripts/build-audit-pool.mjs',
    'scripts/finalize-audit-round-from-agents.mjs',
    'scripts/finalize-audit-round.mjs',
    'scripts/pick-audit-batch.mjs',
    'scripts/prepare-audit-slug.mjs',
  ]) {
    assert.equal(ACTIVE_OPERATION_FILES.includes(required), true);
  }
  assert.deepEqual(auditOperationEntrypoints(), []);
});

test('requires a supervised epoch contract without unlocking bulk or remote writes', () => {
  const policy = JSON.parse(fs.readFileSync(new URL('../data/operations-policy.json', import.meta.url), 'utf8'));
  assert.deepEqual(auditOperationsPolicy(policy), []);

  const unsafe = structuredClone(policy);
  unsafe.project_progression.default_budget.max_parallel_write_slices = 2;
  unsafe.project_progression.busy_polling_allowed = true;
  unsafe.project_progression.automatic_inspection.green_check_updates_tracked_handoff = true;
  unsafe.project_progression.supervisor.max_active_epochs = 2;
  unsafe.project_progression.required_contract_fields = ['objective'];
  unsafe.project_progression.automatic_repair.max_attempts_per_fingerprint = 99;
  unsafe.project_progression.automatic_repair.denylist = [];
  unsafe.bulk_production.enabled = true;
  const failures = auditOperationsPolicy(unsafe);
  assert.equal(failures.includes('write-wip-must-equal-one'), true);
  assert.equal(failures.includes('busy-polling-must-be-disabled'), true);
  assert.equal(failures.includes('healthy-inspection-must-remain-readonly'), true);
  assert.equal(failures.includes('active-epoch-wip-must-equal-one'), true);
  assert.equal(failures.includes('run-contract-missing-external_outcome'), true);
  assert.equal(failures.includes('repair-attempt-budget-invalid'), true);
  assert.equal(failures.includes('repair-denylist-missing-note-content'), true);
  assert.equal(failures.includes('bulk-production-must-default-disabled'), true);
});

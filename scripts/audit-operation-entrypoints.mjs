#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ROOT } from './lib/paths.mjs';

export const ACTIVE_OPERATION_FILES = [
  '.gitignore',
  'AGENTS.md',
  '.claude/skills/auto-push/SKILL.md',
  'SESSION-HANDOFF.md',
  'docs/follow-up-plan.md',
  'docs/operations-index.md',
  'docs/operations-policy.md',
  'docs/release-and-rollback.md',
  'scripts/README.md',
  'README.md',
  'data/operations-policy.json',
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
  'scripts/sync-and-merge.sh',
  'scripts/aggregate-audit-reviews.mjs',
  'scripts/build-audit-pool.mjs',
  'scripts/finalize-audit-round-from-agents.mjs',
  'scripts/finalize-audit-round.mjs',
  'scripts/pick-audit-batch.mjs',
  'scripts/prepare-audit-slug.mjs',
];

const FORBIDDEN = [
  { category: 'tls-bypass', pattern: /sslVerify\s*=\s*false/i },
  { category: 'absolute-user-path', pattern: /(?:\/Users\/|\/home\/[^$<{\s]+)/ },
  { category: 'obsolete-volume-target', pattern: /\b20[,.]?000\b/ },
  { category: 'direct-main-push', pattern: /git\s+push\s+\S+\s+main/i },
  { category: 'broad-hard-reset', pattern: /git(?:\s+-C\s+\S+)?\s+reset\s+--hard/i },
  { category: 'broad-clean', pattern: /git(?:\s+-C\s+\S+)?\s+clean\s+-[a-z]*[fdx][a-z]*/i },
  {
    category: 'legacy-publish-switch',
    pattern: /(?:^|\n)(?![^\n]*DRY_RUN=1)[^\n]*PUSH_REMOTE=1\s+(?:bash\s+)?scripts\/finalize-round\.sh/i,
  },
];

export function auditOperationText(text, file = '<operation-entrypoint>') {
  const failures = [];
  for (const rule of FORBIDDEN) {
    if (rule.pattern.test(text)) failures.push(`${file}: ${rule.category}`);
  }
  return failures;
}

export function auditOperationsPolicy(policy) {
  const failures = [];
  const progression = policy?.project_progression;
  const supervisor = progression?.supervisor || {};
  const requiredFields = new Set(progression?.required_contract_fields || []);
  const separateApproval = new Set(progression?.requires_separate_approval || []);
  const budget = progression?.default_budget || {};
  const windowBudget = progression?.default_window_budget || {};
  const externalDelta = progression?.external_delta || {};
  const inspection = progression?.automatic_inspection || {};
  const repair = progression?.automatic_repair || {};
  const scaleBudget = policy?.scale_budget || {};
  const repairAllowlist = new Set(repair.allowlist || []);
  const repairRequirements = new Set(repair.requirements || []);
  const repairDenylist = new Set(repair.denylist || []);
  const hardPause = new Set(progression?.hard_pause_conditions || []);

  if (policy?.schema_version !== '1.2') failures.push('policy-schema-must-be-1.2');
  if (progression?.enabled !== true) failures.push('supervised-progression-must-be-enabled');
  if (progression?.mode !== 'supervised-bounded-epochs') failures.push('supervised-progression-mode-invalid');
  if (progression?.requires_run_contract !== true) failures.push('run-contract-must-be-required');
  if (progression?.advance_without_reconfirmation_within_contract !== true) {
    failures.push('in-contract-advance-must-be-enabled');
  }
  if (progression?.auto_start_next_epoch_within_window !== true) failures.push('next-epoch-auto-start-required');
  if (progression?.scheduler_required_for_continuous_operation !== true) failures.push('external-scheduler-must-be-required');
  if (progression?.busy_polling_allowed !== false) failures.push('busy-polling-must-be-disabled');
  if (supervisor.execution_model !== 'readonly-observer-with-bounded-writer-epochs') {
    failures.push('supervisor-execution-model-invalid');
  }
  if (supervisor.state_path !== 'data/supervisor-state.json') failures.push('supervisor-state-path-invalid');
  if (supervisor.lease_path !== 'data/supervisor-lease.json') failures.push('supervisor-lease-path-invalid');
  if (supervisor.idle_state !== 'WAIT_HEALTHY') failures.push('supervisor-idle-state-invalid');
  if (supervisor.parked_state !== 'PARKED_HUMAN') failures.push('supervisor-parked-state-invalid');
  if (supervisor.max_active_epochs !== 1) failures.push('active-epoch-wip-must-equal-one');
  if (!Array.isArray(supervisor.poll_backoff_seconds) || supervisor.poll_backoff_seconds.length < 2) {
    failures.push('supervisor-backoff-missing');
  } else if (supervisor.poll_backoff_seconds.some((seconds, index, values) => (
    !Number.isInteger(seconds) || seconds < 60 || (index > 0 && seconds <= values[index - 1])
  ))) {
    failures.push('supervisor-backoff-invalid');
  }
  if (!Number.isInteger(supervisor.max_consecutive_crashes)
      || supervisor.max_consecutive_crashes < 1
      || supervisor.max_consecutive_crashes > 3) {
    failures.push('supervisor-crash-limit-invalid');
  }
  if (!Number.isInteger(budget.max_slices) || budget.max_slices < 1 || budget.max_slices > 6) {
    failures.push('default-slice-budget-invalid');
  }
  if (!Number.isInteger(budget.max_wall_time_minutes)
      || budget.max_wall_time_minutes < 1
      || budget.max_wall_time_minutes > 240) {
    failures.push('default-time-budget-invalid');
  }
  if (budget.max_parallel_write_slices !== 1) failures.push('write-wip-must-equal-one');
  if (!Number.isInteger(windowBudget.max_epochs) || windowBudget.max_epochs < 1 || windowBudget.max_epochs > 12) {
    failures.push('window-epoch-budget-invalid');
  }
  if (!Number.isInteger(windowBudget.max_wall_time_minutes)
      || windowBudget.max_wall_time_minutes < 1
      || windowBudget.max_wall_time_minutes > 1440) {
    failures.push('window-time-budget-invalid');
  }

  for (const field of [
    'status', 'objective', 'scope', 'activated_by', 'review_after', 'acceptance_checks',
    'budget', 'external_outcome', 'stop_conditions', 'superseded_by',
  ]) {
    if (!requiredFields.has(field)) failures.push(`run-contract-missing-${field}`);
  }
  if (typeof progression?.default_external_outcome !== 'string'
      || progression.default_external_outcome.trim() === '') {
    failures.push('default-external-outcome-missing');
  }
  if (progression?.stop_after_consecutive_batches_without_external_delta !== 3) {
    failures.push('no-delta-stop-must-equal-three');
  }
  if (externalDelta.counter_persists_across_restarts !== true) failures.push('no-delta-counter-must-persist');
  if (externalDelta.new_epoch_does_not_reset_counter !== true) failures.push('new-epoch-must-not-reset-no-delta');
  if (inspection.enabled !== true
      || inspection.green_check_spawns_writer !== false
      || inspection.green_check_updates_tracked_handoff !== false) {
    failures.push('healthy-inspection-must-remain-readonly');
  }
  if (inspection.healthy_action !== 'WAIT_HEALTHY') failures.push('healthy-action-must-wait');
  const inspectionCommands = new Set(inspection.commands || []);
  for (const command of [
    'npm run status:supervisor', 'git status --short --branch', 'npm run status:pipeline',
    'node scripts/audit-runtime-state.mjs --json', 'node scripts/loop-status.mjs --json',
    'node scripts/benchmark-site.mjs --compare data/performance-baseline.json',
    'npm run audit:operations', 'npm run audit:doc-lifecycle', 'git diff --check',
  ]) {
    if (!inspectionCommands.has(command)) failures.push(`inspection-command-missing-${command}`);
  }
  if (scaleBudget.compare_command !== 'node scripts/benchmark-site.mjs --compare data/performance-baseline.json') {
    failures.push('scale-budget-compare-command-invalid');
  }
  if (scaleBudget.on_exceeded !== 'freeze-new-content-and-investigate') {
    failures.push('scale-budget-exceeded-action-invalid');
  }
  if (scaleBudget.allow_threshold_bypass !== false) failures.push('scale-budget-threshold-bypass-must-be-disabled');
  if (repair.enabled !== true) failures.push('automatic-repair-must-be-enabled');
  if (repair.on_failure !== 'PARKED_HUMAN') failures.push('repair-failure-must-park');
  if (!Number.isInteger(repair.max_attempts_per_fingerprint)
      || repair.max_attempts_per_fingerprint < 1
      || repair.max_attempts_per_fingerprint > 2) {
    failures.push('repair-attempt-budget-invalid');
  }
  for (const category of [
    'transient-readonly-check-retry', 'scoped-formatting-whitespace',
    'operator-doc-link-target', 'deterministic-derived-output-drift',
    'handoff-refresh-from-verified-results',
  ]) {
    if (!repairAllowlist.has(category)) failures.push(`repair-allowlist-missing-${category}`);
  }
  for (const requirement of [
    'detector-fingerprint', 'within-epoch-scope', 'reversible-local-change',
    'before-after-snapshot', 'targeted-acceptance-check', 'no-external-state-change',
  ]) {
    if (!repairRequirements.has(requirement)) failures.push(`repair-requirement-missing-${requirement}`);
  }
  for (const category of [
    'note-content', 'candidate-queue', 'rewrite-pool', 'audit-queue',
    'historical-failure-events', 'review-receipts', 'policy-or-threshold',
    'test-deletion-or-skip', 'dependency-or-lockfile', 'toolchain-install',
    'worktree-topology', 'git-history', 'remote-state', 'credential-or-secret',
  ]) {
    if (!repairDenylist.has(category)) failures.push(`repair-denylist-missing-${category}`);
  }
  for (const condition of [
    'unexpected-worktree-overlap', 'round-lock-active', 'policy-conflict',
    'required-toolchain-unavailable', 'sensitive-data-risk', 'scale-budget-exceeded',
    'repair-attempts-exhausted', 'new-permission-required', 'unreproducible-baseline',
  ]) {
    if (!hardPause.has(condition)) failures.push(`hard-pause-missing-${condition}`);
  }
  for (const action of [
    'new-content-production', 'existing-note-body-rewrite', 'candidate-queue-mutation',
    'non-dry-run-content-round', 'policy-or-threshold-change', 'toolchain-install',
    'worktree-topology', 'commit', 'remote-push', 'pull-request', 'merge', 'deployment',
  ]) {
    if (!separateApproval.has(action)) failures.push(`separate-approval-missing-${action}`);
  }

  if (policy?.bulk_production?.enabled !== false) failures.push('bulk-production-must-default-disabled');
  if (policy?.remote_publish?.enabled_by_default !== false) failures.push('remote-publish-must-default-disabled');
  if (policy?.remote_publish?.direct_main_push !== false) failures.push('direct-main-push-must-be-disabled');
  return failures;
}

export function auditOperationEntrypoints(root = ROOT) {
  const failures = [];
  for (const relative of ACTIVE_OPERATION_FILES) {
    const file = path.join(root, relative);
    if (!fs.existsSync(file)) {
      failures.push(`${relative}: missing active operation file`);
      continue;
    }
    failures.push(...auditOperationText(fs.readFileSync(file, 'utf8'), relative));
  }

  const authorizationContracts = [
    ['scripts/pick-batch.mjs', 'assertBulkOperationAuthorized'],
    ['scripts/dispatch-batch.mjs', 'assertBulkOperationAuthorized'],
    ['scripts/promote-candidates.mjs', 'assertBulkOperationAuthorized'],
    ['scripts/round.mjs', 'assertBulkOperationAuthorized'],
    ['scripts/aggregate-audit-reviews.mjs', 'assertBulkOperationAuthorized'],
    ['scripts/build-audit-pool.mjs', 'assertBulkOperationAuthorized'],
    ['scripts/finalize-audit-round-from-agents.mjs', 'assertBulkOperationAuthorized'],
    ['scripts/finalize-audit-round.mjs', 'assertBulkOperationAuthorized'],
    ['scripts/pick-audit-batch.mjs', 'assertBulkOperationAuthorized'],
    ['scripts/prepare-audit-slug.mjs', 'assertBulkOperationAuthorized'],
  ];
  for (const [relative, contract] of authorizationContracts) {
    const content = fs.readFileSync(path.join(root, relative), 'utf8');
    if (!content.includes(contract)) failures.push(`${relative}: missing-${contract}`);
  }

  const round = fs.readFileSync(path.join(root, 'scripts/round.mjs'), 'utf8');
  if (!/round:sync-worktrees is disabled/u.test(round)) {
    failures.push('scripts/round.mjs: destructive-worktree-sync-must-be-disabled');
  }
  const loopStatus = fs.readFileSync(path.join(root, 'scripts/loop-status.mjs'), 'utf8');
  if (!/readonly:\s*true/u.test(loopStatus)) {
    failures.push('scripts/loop-status.mjs: readonly-status-marker-missing');
  }
  if (/writeFile|STATUS_MD_PATH|TARGET_(?:PAPERS|PROJECTS|TOTAL)|--md|\bETA\b/u.test(loopStatus)) {
    failures.push('scripts/loop-status.mjs: legacy-write-or-volume-loop-still-present');
  }
  const exitConditions = fs.readFileSync(path.join(root, 'scripts/exit-conditions.mjs'), 'utf8');
  if (!/legacy-bulk-loop-retired/u.test(exitConditions) || !/should_exit:\s*true/u.test(exitConditions)) {
    failures.push('scripts/exit-conditions.mjs: legacy-loop-must-remain-retired');
  }
  if (/should_exit:\s*false|approved_target/u.test(exitConditions)) {
    failures.push('scripts/exit-conditions.mjs: legacy-loop-revival-path-present');
  }
  const policyPath = path.join(root, 'data/operations-policy.json');
  try {
    const policy = JSON.parse(fs.readFileSync(policyPath, 'utf8'));
    failures.push(...auditOperationsPolicy(policy)
      .map((failure) => `data/operations-policy.json: ${failure}`));
    const supervisor = policy?.project_progression?.supervisor || {};
    const ignoredLines = new Set(fs.readFileSync(path.join(root, '.gitignore'), 'utf8').split(/\r?\n/u));
    for (const ignored of [
      supervisor.state_path,
      supervisor.lease_path,
      supervisor.lease_path ? `${supervisor.lease_path}.guard` : null,
      'data/supervisor-events.jsonl',
    ].filter(Boolean)) {
      if (!ignoredLines.has(ignored)) failures.push(`.gitignore: missing-supervisor-runtime-${ignored}`);
    }
  } catch {
    failures.push('data/operations-policy.json: invalid-policy-json');
  }
  return failures;
}

function parseArgs(argv = process.argv.slice(2)) {
  const args = { json: false, tracked: false };
  for (const arg of argv) {
    if (arg === '--json') args.json = true;
    else if (arg === '--tracked') args.tracked = true;
    else throw new Error(`unknown argument: ${arg}`);
  }
  return args;
}

function main() {
  const args = parseArgs();
  const failures = auditOperationEntrypoints();
  if (args.json) {
    console.log(JSON.stringify({
      schema_version: 'study-operation-entrypoint-audit-v1',
      scope: args.tracked ? 'tracked-active-entrypoints' : 'active-entrypoints',
      ok: failures.length === 0,
      files_scanned: ACTIVE_OPERATION_FILES.length,
      failures,
    }, null, 2));
    process.exit(failures.length ? 1 : 0);
  }
  if (failures.length) {
    console.error(`[audit:operations] Found ${failures.length} issue(s):`);
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
  }
  console.log('[audit:operations] OK: active entrypoints follow the bounded, no-direct-push policy.');
}

if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1] || '')) main();

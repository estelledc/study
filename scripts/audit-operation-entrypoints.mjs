#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ROOT } from './lib/paths.mjs';

export const ACTIVE_OPERATION_FILES = [
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
  'scripts/round.mjs',
  'scripts/finalize-round.sh',
  'scripts/sync-and-merge.sh',
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
    ['scripts/round.mjs', 'assertBulkOperationAuthorized'],
  ];
  for (const [relative, contract] of authorizationContracts) {
    const content = fs.readFileSync(path.join(root, relative), 'utf8');
    if (!content.includes(contract)) failures.push(`${relative}: missing-${contract}`);
  }

  const round = fs.readFileSync(path.join(root, 'scripts/round.mjs'), 'utf8');
  if (!/round:sync-worktrees is disabled/u.test(round)) {
    failures.push('scripts/round.mjs: destructive-worktree-sync-must-be-disabled');
  }
  const policyPath = path.join(root, 'data/operations-policy.json');
  try {
    const policy = JSON.parse(fs.readFileSync(policyPath, 'utf8'));
    if (policy.bulk_production?.enabled !== false) {
      failures.push('data/operations-policy.json: bulk-production-must-default-disabled');
    }
    if (policy.remote_publish?.enabled_by_default !== false) {
      failures.push('data/operations-policy.json: remote-publish-must-default-disabled');
    }
    if (policy.remote_publish?.direct_main_push !== false) {
      failures.push('data/operations-policy.json: direct-main-push-must-be-disabled');
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

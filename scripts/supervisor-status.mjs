#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { auditDocLifecycle } from './audit-doc-lifecycle.mjs';
import { auditOperationEntrypoints } from './audit-operation-entrypoints.mjs';
import { gitOutput } from './lib/git.mjs';
import { loadOperationsPolicy } from './lib/operations-policy.mjs';
import { ROOT } from './lib/paths.mjs';
import { decideSupervisorAction } from './lib/supervisor-policy.mjs';
import { checkRoundLock } from './round-lock.mjs';

export function buildSupervisorStatus(facts, policy) {
  const blockers = [];
  if (facts.operation_failures > 0 || facts.doc_failures > 0) blockers.push('policy-conflict');
  if (facts.worktree_dirty) blockers.push('unexpected-worktree-overlap');
  if (!facts.toolchain_ok) blockers.push('required-toolchain-unavailable');
  if (facts.round_lock_active) blockers.push('round-lock-active');

  const decision = decideSupervisorAction({ hard_blockers: blockers }, policy);
  return {
    schema_version: 'study-supervisor-status-v1',
    readonly: true,
    supervisor_state: decision.state,
    writer_eligible: decision.state === 'PREPARE_EPOCH' || decision.state === 'REPAIR',
    reason: decision.reason,
    blockers,
    facts: {
      branch: facts.branch,
      head: facts.head,
      worktree_dirty: facts.worktree_dirty,
      changed_paths: facts.changed_paths,
      canonical_node: facts.canonical_node,
      running_node: facts.running_node,
      toolchain_ok: facts.toolchain_ok,
      operation_failures: facts.operation_failures,
      doc_failures: facts.doc_failures,
      round_lock_active: facts.round_lock_active,
    },
    next_action: blockers.length > 0
      ? 'Keep the readonly supervisor armed; resolve blockers under explicit scope before starting a writer epoch.'
      : 'Yield in WAIT_HEALTHY until a scheduled check, external delta, or explicit backlog ticket.',
  };
}

async function collectFacts() {
  const canonicalNode = fs.readFileSync(path.join(ROOT, '.nvmrc'), 'utf8').trim().replace(/^v/u, '');
  const runningNode = process.version.replace(/^v/u, '');
  const status = gitOutput(['status', '--porcelain=v1', '-uall'], { cwd: ROOT });
  const changedPaths = status ? status.split('\n').filter(Boolean).length : 0;
  const roundLock = await checkRoundLock();
  return {
    branch: gitOutput(['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: ROOT }),
    head: gitOutput(['rev-parse', 'HEAD'], { cwd: ROOT }),
    worktree_dirty: changedPaths > 0,
    changed_paths: changedPaths,
    canonical_node: canonicalNode,
    running_node: runningNode,
    toolchain_ok: canonicalNode === runningNode,
    operation_failures: auditOperationEntrypoints().length,
    doc_failures: auditDocLifecycle().length,
    round_lock_active: roundLock.locked === true && roundLock.expired !== true,
  };
}

function parseArgs(argv = process.argv.slice(2)) {
  for (const arg of argv) {
    if (arg !== '--json') throw new Error(`unknown argument: ${arg}`);
  }
  return { json: argv.includes('--json') };
}

async function main() {
  const args = parseArgs();
  const status = buildSupervisorStatus(await collectFacts(), loadOperationsPolicy());
  if (args.json) console.log(JSON.stringify(status, null, 2));
  else console.log(`${status.supervisor_state}: ${status.reason}`);
}

if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1] || '')) {
  main().catch((error) => {
    console.error(`supervisor-status failed: ${error.message}`);
    process.exit(1);
  });
}

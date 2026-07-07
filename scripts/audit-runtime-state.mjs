#!/usr/bin/env node
// Read-only runtime audit: classify queue debt before production rehearsal.

import fs from 'node:fs/promises';
import {
  CANDIDATES_PATH,
  REWRITE_POOL_PATH,
  WRITTEN_PATH,
} from './lib/paths.mjs';
import { listAreaNotes } from './lib/content-store.mjs';
import { readJsonl } from './lib/jsonl.mjs';
import { queueKey } from './lib/queue-store.mjs';
import { loadPipelineInputs, summarizePipeline } from './pipeline-summary.mjs';
import { inspectWorktrees } from './worktree-doctor.mjs';

function parseArgs(argv = process.argv.slice(2)) {
  return {
    json: argv.includes('--json'),
  };
}

function countBy(rows, getKey) {
  const counts = {};
  for (const row of rows) {
    const key = getKey(row) || 'unknown';
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

export function parseWrittenText(text) {
  const rows = [];
  let area = null;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line === '# papers') {
      area = 'papers';
      continue;
    }
    if (line === '# projects') {
      area = 'projects';
      continue;
    }
    if (line.startsWith('#')) continue;
    if (area) rows.push({ area, slug: line });
  }
  return rows;
}

function duplicateKeys(rows) {
  const seen = new Map();
  const duplicates = [];
  for (const row of rows) {
    const key = queueKey(row);
    const prev = seen.get(key) || 0;
    seen.set(key, prev + 1);
    if (prev === 1) duplicates.push(key);
  }
  return duplicates;
}

function classifyClaimedRows(candidates, context) {
  const writtenSet = new Set(context.written.map(queueKey));
  const noteSet = new Set(context.notes.map(queueKey));
  const duplicates = new Set(context.duplicates);
  const groups = {
    written_and_indexed: [],
    note_exists_not_indexed: [],
    recover_to_queued: [],
    needs_review: [],
  };

  for (const row of candidates.filter((candidate) => candidate.status === 'claimed')) {
    const key = queueKey(row);
    const item = {
      area: row.area,
      slug: row.slug,
      claimed_by: row.claimed_by ?? null,
      topic: row.topic ?? null,
    };
    const hasNote = noteSet.has(key);
    const inWritten = writtenSet.has(key);
    if (duplicates.has(key) || row.claimed_by) {
      groups.needs_review.push({ ...item, reason: duplicates.has(key) ? 'duplicate' : 'claimed_by-present' });
    } else if (hasNote && inWritten) {
      groups.written_and_indexed.push(item);
    } else if (hasNote && !inWritten) {
      groups.note_exists_not_indexed.push(item);
    } else if (!hasNote && !inWritten && row.claimed_by == null) {
      groups.recover_to_queued.push(item);
    } else {
      groups.needs_review.push({ ...item, reason: 'ambiguous-written-without-note' });
    }
  }

  return groups;
}

export function buildRuntimeAudit(inputs) {
  const pipeline = summarizePipeline(inputs.pipelineInputs);
  const duplicates = duplicateKeys(inputs.candidates);
  const claimed = classifyClaimedRows(inputs.candidates, {
    written: inputs.written,
    notes: inputs.notes,
    duplicates,
  });

  return {
    readonly: true,
    proposed_repo_tracked_modifications: 0,
    queues: {
      candidates: {
        total: inputs.candidates.length,
        by_status: countBy(inputs.candidates, (row) => row.status),
        claimed_by_area: countBy(
          inputs.candidates.filter((row) => row.status === 'claimed'),
          (row) => row.area,
        ),
      },
      rewrite_pool: {
        total: inputs.rewritePool.length,
        by_status: countBy(inputs.rewritePool, (row) => row.status),
      },
      duplicate_keys: duplicates,
    },
    claimed_debt: {
      total: Object.values(claimed).reduce((sum, rows) => sum + rows.length, 0),
      written_and_indexed: claimed.written_and_indexed,
      note_exists_not_indexed: claimed.note_exists_not_indexed,
      recover_to_queued: claimed.recover_to_queued,
      needs_review: claimed.needs_review,
    },
    runtime_files: {
      checkpoint_missing: pipeline.checkpoint_missing,
      status_missing: pipeline.status_missing,
      events_total: pipeline.events.total,
      failure_events: pipeline.events.failures.total,
    },
    worktrees: {
      ok: inputs.worktrees.ok,
      healthy: inputs.worktrees.healthy,
      checked: inputs.worktrees.checked,
      missing: inputs.worktrees.missing,
      issues: inputs.worktrees.results
        .filter((result) => !result.ok)
        .map((result) => ({ name: result.name, path: result.path, issues: result.issues })),
    },
    self_review: {
      modifies_repo_tracked_files: false,
      before_after_snapshot_required: false,
      dry_run_matches_write_required: false,
      can_modify_note_bodies: false,
      can_hide_failures: false,
      untracked_runtime_files_created: false,
      reproducible_command: 'node scripts/audit-runtime-state.mjs --json',
    },
    next_actions: [
      'Review claimed_debt.recover_to_queued before running recover-queue-state.',
      'Initialize checkpoint/status only after queue recovery.',
      'Create worktrees only after runtime files are trustworthy.',
    ],
  };
}

async function readWrittenOptional(filePath = WRITTEN_PATH) {
  try {
    return parseWrittenText(await fs.readFile(filePath, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
}

async function loadAuditInputs() {
  const [candidates, rewritePool, written, papers, projects, pipelineInputs] = await Promise.all([
    readJsonl(CANDIDATES_PATH, { missing: 'empty' }),
    readJsonl(REWRITE_POOL_PATH, { missing: 'empty' }),
    readWrittenOptional(),
    listAreaNotes('papers'),
    listAreaNotes('projects'),
    loadPipelineInputs(),
  ]);
  return {
    candidates,
    rewritePool,
    written,
    notes: [...papers, ...projects],
    pipelineInputs,
    worktrees: inspectWorktrees(),
  };
}

function renderHuman(audit) {
  return `Runtime Audit

Readonly: ${audit.readonly}
Proposed repo-tracked modifications: ${audit.proposed_repo_tracked_modifications}

Candidates:
- total: ${audit.queues.candidates.total}
- by_status: ${JSON.stringify(audit.queues.candidates.by_status)}
- claimed_by_area: ${JSON.stringify(audit.queues.candidates.claimed_by_area)}

Claimed debt:
- total: ${audit.claimed_debt.total}
- written_and_indexed: ${audit.claimed_debt.written_and_indexed.length}
- note_exists_not_indexed: ${audit.claimed_debt.note_exists_not_indexed.length}
- recover_to_queued: ${audit.claimed_debt.recover_to_queued.length}
- needs_review: ${audit.claimed_debt.needs_review.length}

Runtime files:
- checkpoint_missing: ${audit.runtime_files.checkpoint_missing}
- status_missing: ${audit.runtime_files.status_missing}
- events_total: ${audit.runtime_files.events_total}
- failure_events: ${audit.runtime_files.failure_events}

Worktrees:
- healthy: ${audit.worktrees.healthy}/${audit.worktrees.checked}
- missing: ${audit.worktrees.missing}

Next:
${audit.next_actions.map((line) => `- ${line}`).join('\n')}
`;
}

async function main() {
  const args = parseArgs();
  const audit = buildRuntimeAudit(await loadAuditInputs());
  if (args.json) console.log(JSON.stringify(audit, null, 2));
  else console.log(renderHuman(audit));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error('audit-runtime-state failed:', err);
    process.exit(1);
  });
}

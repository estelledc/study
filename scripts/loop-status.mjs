#!/usr/bin/env node

// Legacy command name retained as a read-only compatibility status view.
// It reports current facts only: it does not write files, rank work, estimate
// completion, or authorize any queue/content operation.

import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { countNotesByArea } from './lib/content-store.mjs';
import { gitOutput } from './lib/git.mjs';
import { readJson } from './lib/json-store.mjs';
import { readJsonl } from './lib/jsonl.mjs';
import {
  CANDIDATES_PATH,
  REWRITE_POOL_PATH,
  STATUS_JSON_PATH,
} from './lib/paths.mjs';

export function parseArgs(argv = process.argv.slice(2)) {
  const args = { json: false };
  for (const arg of argv) {
    if (arg === '--json') args.json = true;
    else if (arg === '--summary') args.json = false;
    else throw new Error(`unknown argument: ${arg}`);
  }
  return args;
}

export function statusBreakdown(items) {
  const out = {};
  for (const item of items) out[item.status] = (out[item.status] || 0) + 1;
  return out;
}

function gitFact(args, fallback = 'unavailable') {
  try {
    return gitOutput(args);
  } catch {
    return fallback;
  }
}

export function buildReport({ totals, candidates, rewritePool, status, git }) {
  const candidateStatus = statusBreakdown(candidates);
  const rewriteStatus = statusBreakdown(rewritePool);
  return {
    schema_version: 'study-loop-status-readonly-v1',
    readonly: true,
    objective: null,
    git,
    notes: {
      papers: totals.papers,
      projects: totals.projects,
      total: totals.papers + totals.projects,
    },
    queues: {
      candidates: candidateStatus,
      rewrite_pool: rewriteStatus,
    },
    runtime: {
      batch: status?.batch?.n ?? null,
      last_build: status?.last_build ?? null,
    },
    guidance: 'Choose work from AGENTS.md using current evidence; this report is not a goal or authorization.',
  };
}

export function buildSummary(report) {
  const candidates = report.queues.candidates;
  const rewrite = report.queues.rewrite_pool;
  const build = report.runtime.last_build;
  const buildState = build?.ok === true ? 'pass' : (build?.ok === false ? 'fail' : 'unknown');
  return [
    'mode=read-only-maintenance',
    `head=${report.git.head}`,
    `notes=${report.notes.total}`,
    `candidates.queued=${candidates.queued || 0}`,
    `candidates.claimed=${candidates.claimed || 0}`,
    `rewrite.available=${rewrite.available || 0}`,
    `build=${buildState}`,
  ].join(' | ');
}

async function collectReport() {
  const [candidates, rewritePool, status, totals] = await Promise.all([
    readJsonl(CANDIDATES_PATH, { missing: 'empty' }),
    readJsonl(REWRITE_POOL_PATH, { missing: 'empty' }),
    readJson(STATUS_JSON_PATH, { missing: {} }),
    countNotesByArea(),
  ]);
  const git = {
    branch: gitFact(['rev-parse', '--abbrev-ref', 'HEAD']),
    head: gitFact(['rev-parse', 'HEAD']),
  };
  return buildReport({ totals, candidates, rewritePool, status, git });
}

async function main() {
  const args = parseArgs();
  const report = await collectReport();
  console.log(args.json ? JSON.stringify(report, null, 2) : buildSummary(report));
}

if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1] || '')) {
  main().catch((error) => {
    console.error(`loop-status failed: ${error.message}`);
    process.exit(1);
  });
}

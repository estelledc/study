#!/usr/bin/env node
// Read-only pipeline status summary for dry-run and pilot checks.

import {
  CANDIDATES_PATH,
  CHECKPOINT_PATH,
  PIPELINE_EVENTS_PATH,
  REWRITE_POOL_PATH,
  STATUS_JSON_PATH,
} from './lib/paths.mjs';
import { readJsonOptional } from './lib/json-store.mjs';
import { readJsonl } from './lib/jsonl.mjs';

const DEFAULT_PATHS = {
  checkpoint: CHECKPOINT_PATH,
  status: STATUS_JSON_PATH,
  candidates: CANDIDATES_PATH,
  rewritePool: REWRITE_POOL_PATH,
  events: PIPELINE_EVENTS_PATH,
};

function parseArgs(argv = process.argv.slice(2)) {
  return {
    json: argv.includes('--json'),
  };
}

function countByStatus(rows) {
  const counts = {};
  for (const row of rows) {
    const key = row.status || 'unknown';
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

function isFailureEvent(event) {
  const name = String(event.event || '');
  const status = String(event.status || '');
  return name.includes('fail') ||
    name.includes('error') ||
    status === 'failed' ||
    status === 'fail' ||
    Boolean(event.reason || event.error);
}

function eventReason(event) {
  return event.reason || event.error || event.status || event.event || 'unknown';
}

function lastN(rows, n) {
  return rows.slice(Math.max(0, rows.length - n));
}

export async function loadPipelineInputs(paths = DEFAULT_PATHS) {
  const [checkpointResult, statusResult, candidates, rewritePool, events] = await Promise.all([
    readJsonOptional(paths.checkpoint),
    readJsonOptional(paths.status),
    readJsonl(paths.candidates, { missing: 'empty' }),
    readJsonl(paths.rewritePool, { missing: 'empty' }),
    readJsonl(paths.events, { missing: 'empty' }),
  ]);

  return {
    checkpoint: checkpointResult.data,
    status: statusResult.data,
    candidates,
    rewritePool,
    events,
    missing: {
      checkpoint: checkpointResult.missing,
      status: statusResult.missing,
    },
  };
}

export function summarizePipeline(inputs) {
  const candidateCounts = countByStatus(inputs.candidates);
  const rewriteCounts = countByStatus(inputs.rewritePool);
  const failures = inputs.events.filter(isFailureEvent).map((event) => ({
    ts: event.ts || null,
    event: event.event || null,
    slug: event.slug || null,
    stage: event.stage || null,
    reason: String(eventReason(event)),
  }));

  const round = inputs.checkpoint?.round_n ?? inputs.status?.batch?.n ?? null;
  const claimed = (candidateCounts.claimed || 0) + (rewriteCounts.claimed || 0);
  const available = (candidateCounts.queued || 0) + (rewriteCounts.available || 0);

  const suggestions = [];
  if (inputs.missing.checkpoint || inputs.missing.status) {
    suggestions.push('运行态文件尚未完整形成；先做 dry-run 预演，不要直接真实派发。');
  }
  if (claimed > 0) {
    suggestions.push('存在 claimed 项；优先完成、回收或同步这些项后再开新批次。');
  }
  if (failures.length > 0) {
    suggestions.push('存在失败事件；先查看 pipeline-events.jsonl 的最近失败原因。');
  }
  if (available === 0) {
    suggestions.push('候选池和 rewrite pool 当前没有可派发项；需要补池或调整筛选条件。');
  }
  if (suggestions.length === 0) {
    suggestions.push('可以继续运行 worktree doctor，然后做 dispatch/run-pipeline dry-run。');
  }

  return {
    round,
    checkpoint_missing: inputs.missing.checkpoint,
    status_missing: inputs.missing.status,
    queues: {
      candidates: {
        total: inputs.candidates.length,
        by_status: candidateCounts,
      },
      rewrite_pool: {
        total: inputs.rewritePool.length,
        by_status: rewriteCounts,
      },
      claimed,
      available,
    },
    events: {
      total: inputs.events.length,
      recent: lastN(inputs.events, 5),
      failures: {
        total: failures.length,
        recent: lastN(failures, 5),
      },
    },
    checkpoint: inputs.checkpoint,
    status: inputs.status,
    suggestions,
  };
}

export function renderPipelineSummary(summary) {
  const cand = summary.queues.candidates.by_status;
  const pool = summary.queues.rewrite_pool.by_status;
  const failureLines = summary.events.failures.recent.length
    ? summary.events.failures.recent.map((failure) => {
        const parts = [
          failure.ts,
          failure.slug,
          failure.stage,
          failure.reason,
        ].filter(Boolean);
        return `- ${parts.join(' | ')}`;
      }).join('\n')
    : '- none';

  return `Pipeline Summary

Round: ${summary.round ?? 'not-started'}
Runtime files: checkpoint=${summary.checkpoint_missing ? 'missing' : 'present'}, status=${summary.status_missing ? 'missing' : 'present'}

Candidates:
- total: ${summary.queues.candidates.total}
- queued: ${cand.queued || 0}
- claimed: ${cand.claimed || 0}
- written: ${cand.written || 0}
- failed: ${cand.failed || 0}
- blacklisted: ${cand.blacklisted || 0}

Rewrite pool:
- total: ${summary.queues.rewrite_pool.total}
- available: ${pool.available || 0}
- claimed: ${pool.claimed || 0}
- written: ${pool.written || 0}
- failed: ${pool.failed || 0}

Events:
- total: ${summary.events.total}
- failures: ${summary.events.failures.total}

Recent failures:
${failureLines}

Next:
${summary.suggestions.map((line) => `- ${line}`).join('\n')}
`;
}

async function main() {
  const args = parseArgs();
  const inputs = await loadPipelineInputs();
  const summary = summarizePipeline(inputs);
  if (args.json) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    console.log(renderPipelineSummary(summary));
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error('pipeline-summary failed:', err);
    process.exit(1);
  });
}

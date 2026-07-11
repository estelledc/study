import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  loadPipelineInputs,
  renderPipelineSummary,
  summarizePipeline,
} from './pipeline-summary.mjs';

async function tempDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'study-pipeline-summary-'));
}

function fixturePaths(dir) {
  return {
    checkpoint: path.join(dir, 'checkpoint.json'),
    status: path.join(dir, 'status.json'),
    candidates: path.join(dir, 'candidates.jsonl'),
    rewritePool: path.join(dir, 'rewrite-pool.jsonl'),
    events: path.join(dir, 'pipeline-events.jsonl'),
  };
}

test('loadPipelineInputs treats missing runtime files as optional', async () => {
  const dir = await tempDir();
  const inputs = await loadPipelineInputs(fixturePaths(dir));
  const summary = summarizePipeline(inputs);

  assert.equal(summary.checkpoint_missing, true);
  assert.equal(summary.status_missing, true);
  assert.equal(summary.queues.candidates.total, 0);
  assert.equal(summary.queues.rewrite_pool.total, 0);
  assert.equal(summary.events.total, 0);
  assert.ok(summary.suggestions.some((line) => line.includes('dry-run')));
});

test('summarizePipeline counts queues and extracts recent failure reasons', () => {
  const summary = summarizePipeline({
    checkpoint: { round_n: 3 },
    status: { batch: { n: 2 } },
    candidates: [
      { slug: 'queued-paper', status: 'queued' },
      { slug: 'claimed-paper', status: 'claimed' },
      { slug: 'failed-paper', status: 'failed' },
    ],
    rewritePool: [
      { slug: 'rewrite-a', status: 'available' },
      { slug: 'rewrite-b', status: 'claimed' },
    ],
    events: [
      { event: 'stage-end', slug: 'ok', status: 'ok' },
      { event: 'pipeline-driver-error', slug: 'bad', error: 'boom' },
    ],
    missing: { checkpoint: false, status: false },
  });

  assert.equal(summary.round, 3);
  assert.equal(summary.queues.claimed, 2);
  assert.equal(summary.queues.available, 2);
  assert.equal(summary.events.failures.total, 1);
  assert.equal(summary.events.failures.current_total, 0);
  assert.equal(summary.events.failures.historical_total, 1);
  assert.equal(summary.events.failures.recent[0].reason, 'boom');
  assert.match(renderPipelineSummary(summary), /Recent failures:\n- bad \| boom/);
});

test('summarizePipeline preserves historical failures and scopes the gate to the latest lifecycle', () => {
  const summary = summarizePipeline({
    checkpoint: null,
    status: null,
    candidates: [],
    rewritePool: [],
    events: [
      { ts: '2026-07-09T00:00:00.000Z', event: 'merge-single-fail', error: 'historic' },
      {
        ts: '2026-07-10T00:00:00.000Z',
        event: 'round-lifecycle-start',
        lifecycle_id: 'generation-2',
      },
      { ts: '2026-07-10T00:01:00.000Z', event: 'stage-end', status: 'ok' },
      { ts: '2026-07-10T00:02:00.000Z', event: 'pipeline-driver-error', error: 'current' },
    ],
    missing: { checkpoint: true, status: true },
  });

  assert.equal(summary.events.failures.total, 2);
  assert.equal(summary.events.failures.historical_total, 1);
  assert.equal(summary.events.failures.current_total, 1);
  assert.equal(summary.events.failures.current_recent[0].reason, 'current');
  assert.equal(summary.events.lifecycle.id, 'generation-2');
});

test('lease recovery evidence does not erase or inflate retained failure history', () => {
  const historical = Array.from({ length: 27 }, (_, index) => ({
    ts: `2026-07-09T00:00:${String(index).padStart(2, '0')}.000Z`,
    event: 'merge-single-fail',
    reason: `failure-${index}`,
  }));
  const summary = summarizePipeline({
    checkpoint: null,
    status: null,
    candidates: [],
    rewritePool: [],
    events: [
      ...historical,
      {
        ts: '2026-07-10T00:00:00.000Z',
        event: 'claim-lease-recovered',
        recovery_reason: 'expired-claim-lease',
      },
    ],
    missing: { checkpoint: true, status: true },
  });

  assert.equal(summary.events.total, 28);
  assert.equal(summary.events.failures.total, 27);
  assert.equal(summary.events.failures.current_total, 0);
  assert.equal(summary.events.failures.historical_total, 27);
});

test('loadPipelineInputs reports bad JSON with source context', async () => {
  const dir = await tempDir();
  const paths = fixturePaths(dir);
  await fs.writeFile(paths.checkpoint, '{bad', 'utf8');

  await assert.rejects(
    () => loadPipelineInputs(paths),
    new RegExp(`${path.basename(paths.checkpoint)}.*Expected property name`),
  );
});

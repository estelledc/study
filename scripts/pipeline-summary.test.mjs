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
  assert.equal(summary.events.failures.recent[0].reason, 'boom');
  assert.match(renderPipelineSummary(summary), /Recent failures:\n- bad \| boom/);
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

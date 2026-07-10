import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  buildRecoveryEventUpdate,
  buildRecoveryPlan,
  recoverCandidates,
  recoverRewritePool,
} from './recover-queue-state.mjs';
import { commitQueueState } from './lib/queue-store.mjs';
import { recoverQueueTransaction } from './lib/queue-transaction.mjs';

const context = {
  noteSet: new Set(['papers::note-exists', 'projects::rewrite-done']),
  writtenSet: new Set(['papers::written-index']),
};

test('recoverCandidates marks queued and claimed written when docs or written index exists', () => {
  const result = recoverCandidates([
    { area: 'papers', slug: 'note-exists', status: 'claimed', claimed_by: null },
    { area: 'papers', slug: 'written-index', status: 'queued', claimed_by: null },
    { area: 'papers', slug: 'fresh', status: 'queued', claimed_by: null },
  ], context);

  assert.deepEqual(result.rows.map((row) => [row.slug, row.status, row.claimed_by]), [
    ['note-exists', 'written', null],
    ['written-index', 'written', null],
    ['fresh', 'queued', null],
  ]);
  assert.equal(result.changes.length, 2);
});

test('recoverCandidates returns orphan claimed rows to queued and preserves blocked states', () => {
  const result = recoverCandidates([
    { area: 'projects', slug: 'orphan', status: 'claimed', claimed_by: null },
    { area: 'projects', slug: 'failed', status: 'failed', claimed_by: null },
    { area: 'projects', slug: 'blacklisted', status: 'blacklisted', claimed_by: null },
    { area: 'projects', slug: 'active', status: 'claimed', claimed_by: 'projects' },
  ], context);

  assert.deepEqual(result.rows.map((row) => [row.slug, row.status, row.claimed_by]), [
    ['orphan', 'queued', null],
    ['failed', 'failed', null],
    ['blacklisted', 'blacklisted', null],
    ['active', 'claimed', 'projects'],
  ]);
  assert.deepEqual(result.changes.map((item) => item.slug), ['orphan']);
});

test('recoverRewritePool does not treat the pre-existing rewrite note as completion proof', () => {
  const result = recoverRewritePool([
    {
      area: 'projects', slug: 'rewrite-done', status: 'claimed', claimed_by: 'projects',
      lease_expires_at: '2026-07-10T02:00:00.000Z', claim_token: 'active-token', claim_generation: 'active-generation',
    },
    { area: 'projects', slug: 'rewrite-active', status: 'claimed', claimed_by: 'projects-2' },
    { area: 'projects', slug: 'available', status: 'available', claimed_by: null },
  ], context, { now: '2026-07-10T00:00:00.000Z' });

  assert.deepEqual(result.rows.map((row) => [row.slug, row.status, row.claimed_by]), [
    ['rewrite-done', 'claimed', 'projects'],
    ['rewrite-active', 'claimed', 'projects-2'],
    ['available', 'available', null],
  ]);
  assert.equal(result.rows[0].claim_token, 'active-token');
  assert.equal(result.rows[0].claim_generation, 'active-generation');
  assert.equal(result.changes.length, 0);
});

test('expired claims recover by queue type while active claims and completed work stay safe', () => {
  const context = {
    noteSet: new Set(['papers::done']),
    writtenSet: new Set(),
  };
  const rows = [
    {
      area: 'papers', slug: 'expired', status: 'claimed', claimed_by: 'papers-3',
      claimed_at: '2026-07-09T00:00:00.000Z', lease_expires_at: '2026-07-09T01:30:00.000Z',
      claim_token: 'expired-token', claim_generation: 'g1',
    },
    {
      area: 'papers', slug: 'active', status: 'claimed', claimed_by: 'papers-4',
      claimed_at: '2026-07-10T00:00:00.000Z', lease_expires_at: '2026-07-10T01:30:00.000Z',
      claim_token: 'active-token', claim_generation: 'g2',
    },
    {
      area: 'papers', slug: 'done', status: 'claimed', claimed_by: 'papers',
      claimed_at: '2026-07-09T00:00:00.000Z', lease_expires_at: '2026-07-09T01:30:00.000Z',
      claim_token: 'done-token', claim_generation: 'g1',
    },
  ];

  const candidates = recoverCandidates(rows, context, { now: '2026-07-10T00:30:00.000Z' });
  assert.deepEqual(candidates.rows.map((row) => row.status), ['queued', 'claimed', 'written']);
  assert.equal(candidates.rows[0].last_claim_token, 'expired-token');
  assert.equal(candidates.rows[0].claim_token, null);
  assert.equal(candidates.rows[1].claim_token, 'active-token');
  assert.equal(candidates.rows[2].last_claim_token, 'done-token');

  const rewrite = recoverRewritePool(rows.slice(0, 2), context, { now: '2026-07-10T00:30:00.000Z' });
  assert.deepEqual(rewrite.rows.map((row) => row.status), ['available', 'claimed']);
});

test('buildRecoveryPlan reports stable before and after counts', () => {
  const plan = buildRecoveryPlan({
    candidates: [
      { area: 'papers', slug: 'note-exists', status: 'claimed', claimed_by: null },
      { area: 'projects', slug: 'orphan', status: 'claimed', claimed_by: null },
      { area: 'projects', slug: 'blocked', status: 'blacklisted', claimed_by: null },
    ],
    rewritePool: [
      { area: 'projects', slug: 'rewrite-done', status: 'claimed', claimed_by: 'projects' },
    ],
    notes: [
      { area: 'papers', slug: 'note-exists' },
      { area: 'projects', slug: 'rewrite-done' },
    ],
    written: [],
  });

  assert.deepEqual(plan.before.candidates, { claimed: 2, blacklisted: 1 });
  assert.deepEqual(plan.after.candidates, { written: 1, queued: 1, blacklisted: 1 });
  assert.deepEqual(plan.after.rewrite_pool, { claimed: 1 });
  assert.equal(plan.changes.length, 2);
});

test('expired-lease recovery preserves historical events and binds area::slug evidence', () => {
  const plan = buildRecoveryPlan({
    candidates: [{
      area: 'papers', slug: 'expired', status: 'claimed', claimed_by: 'papers-3',
      claim_generation: 'generation-a', claim_token: 'token-a',
      lease_expires_at: '2026-07-09T00:00:00.000Z',
    }],
    rewritePool: [],
    notes: [],
    written: [],
  }, { now: '2026-07-10T00:00:00.000Z' });
  const historical = '{"event":"pipeline-graveyard","area":"projects","slug":"old-failure"}\n';
  const update = buildRecoveryEventUpdate(historical, plan, { now: '2026-07-10T00:00:00.000Z' });

  assert.equal(update.events.length, 1);
  assert.equal(update.events[0].assignment, 'papers::expired');
  assert.equal(update.events[0].claim_generation, 'generation-a');
  assert.ok(update.text.startsWith(historical));
  assert.equal(update.text.match(/pipeline-graveyard/g)?.length, 1);
});

test('recovery state and its audit event finish the same crash-recoverable transaction', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'study-recovery-event-'));
  const paths = {
    candidates: path.join(directory, 'candidates.jsonl'),
    rewritePool: path.join(directory, 'rewrite-pool.jsonl'),
    events: path.join(directory, 'pipeline-events.jsonl'),
  };
  const candidates = [{
    area: 'papers', slug: 'expired', status: 'claimed', claimed_by: 'papers-3',
    claim_generation: 'generation-a', claim_token: 'token-a',
    lease_expires_at: '2026-07-09T00:00:00.000Z',
  }];
  const rewritePool = [];
  const eventsText = '{"event":"pipeline-graveyard","area":"projects","slug":"old-failure"}\n';
  await fs.writeFile(paths.candidates, `${JSON.stringify(candidates[0])}\n`, 'utf8');
  await fs.writeFile(paths.rewritePool, '\n', 'utf8');
  await fs.writeFile(paths.events, eventsText, 'utf8');
  const plan = buildRecoveryPlan({ candidates, rewritePool, notes: [], written: [] }, {
    now: '2026-07-10T00:00:00.000Z',
  });
  const eventUpdate = buildRecoveryEventUpdate(eventsText, plan, {
    now: '2026-07-10T00:00:00.000Z',
  });

  await assert.rejects(
    () => commitQueueState({
      candidates: plan.candidates,
      rewritePool: plan.rewritePool,
      eventsText: eventUpdate.text,
    }, {
      directory,
      generation: 'recovery-generation',
      paths,
      expectedState: { candidates, rewritePool, eventsText },
      hooks: {
        afterApply({ index }) {
          if (index === 0) throw new Error('injected-recovery-crash');
        },
      },
    }),
    /injected-recovery-crash/,
  );

  await recoverQueueTransaction({ directory });
  assert.match(await fs.readFile(paths.candidates, 'utf8'), /"status":"queued"/);
  assert.equal(await fs.readFile(paths.rewritePool, 'utf8'), '\n');
  const eventsAfter = await fs.readFile(paths.events, 'utf8');
  assert.equal(eventsAfter.match(/pipeline-graveyard/g)?.length, 1);
  assert.equal(eventsAfter.match(/claim-lease-recovered/g)?.length, 1);
});

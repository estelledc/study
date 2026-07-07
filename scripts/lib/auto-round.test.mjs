import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyWorkerResultsToRuntime,
  autoPrepareState,
  validateWorkerResults,
} from './auto-round.mjs';

const HOME = '/tmp/study-home';

function candidates() {
  return [
    { area: 'papers', slug: 'p1', status: 'queued', topic: 'security', title: 'P1', meta: { col3: '2016', col4: 'paper value description one' } },
    { area: 'papers', slug: 'p2', status: 'queued', topic: 'security', title: 'P2', meta: { col3: '2005', col4: 'paper value description two' } },
    { area: 'projects', slug: 'pr1', status: 'queued', topic: 'editors', title: 'Pr1', meta: { col3: '~7k', col4: 'project value description one' } },
    { area: 'projects', slug: 'pr2', status: 'queued', topic: 'embedded', title: 'Pr2', meta: { col3: '1.9k', col4: 'project value description two' } },
  ];
}

function workerResults() {
  return [
    { area: 'papers', slug: 'p1', commit: 'aaaaaaa', lines: 160, self_check: 'pass' },
    { area: 'papers', slug: 'p2', commit: 'bbbbbbb', lines: 170, self_check: 'pass' },
    { area: 'projects', slug: 'pr1', commit: 'ccccccc', lines: 180, self_check: 'pass' },
    { area: 'projects', slug: 'pr2', commit: 'ddddddd', lines: 190, self_check: 'pass' },
  ];
}

test('autoPrepareState claims the planned 4 NEW assignments', () => {
  const prepared = autoPrepareState(
    { rewrite: 0, new: 4, dryRun: false },
    { candidates: candidates(), pool: [] },
    { home: HOME },
  );

  assert.equal(prepared.ok, true);
  assert.deepEqual(prepared.plan.assignments.map((item) => item.slug), ['p1', 'p2', 'pr1', 'pr2']);
  assert.deepEqual(prepared.nextCandidates.map((row) => [row.slug, row.status, row.claimed_by]), [
    ['p1', 'claimed', 'papers-3'],
    ['p2', 'claimed', 'papers-4'],
    ['pr1', 'claimed', 'projects-3'],
    ['pr2', 'claimed', 'projects-4'],
  ]);
});

test('applyWorkerResultsToRuntime advances claimed rows to written', () => {
  const prepared = autoPrepareState(
    { rewrite: 0, new: 4, dryRun: false },
    { candidates: candidates(), pool: [] },
    { home: HOME },
  );
  const advanced = applyWorkerResultsToRuntime(
    { candidates: prepared.nextCandidates, pool: [], written: [] },
    workerResults(),
  );

  assert.deepEqual(advanced.mergeArgs.map((item) => [item.area, item.slug]), [
    ['papers', 'p1'],
    ['papers', 'p2'],
    ['projects', 'pr1'],
    ['projects', 'pr2'],
  ]);
  assert.equal(advanced.nextCandidates.filter((row) => row.status === 'claimed').length, 0);
  assert.equal(advanced.nextCandidates.filter((row) => row.status === 'written').length, 4);
  assert.equal(advanced.nextWritten.length, 4);
});

test('validateWorkerResults blocks missing, duplicate, mismatched, bad hash, and bad lines', () => {
  const prepared = autoPrepareState(
    { rewrite: 0, new: 4, dryRun: false },
    { candidates: candidates(), pool: [] },
    { home: HOME },
  );
  const queues = { candidates: prepared.nextCandidates, pool: [] };

  assert.throws(() => validateWorkerResults(queues, workerResults().slice(0, 3)), /missing worker result/);
  assert.throws(() => validateWorkerResults(queues, [...workerResults(), workerResults()[0]]), /duplicate worker result/);
  assert.throws(() => validateWorkerResults(queues, [{ ...workerResults()[0], area: 'projects' }, ...workerResults().slice(1)]), /does not match claimed row/);
  assert.throws(() => validateWorkerResults(queues, [{ ...workerResults()[0], commit: 'not-a-hash' }, ...workerResults().slice(1)]), /Invalid commit hash/);
  assert.throws(() => validateWorkerResults(queues, [{ ...workerResults()[0], lines: 999 }, ...workerResults().slice(1)]), /invalid lines/);
});

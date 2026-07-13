import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { buildReport, buildSummary, parseArgs } from './loop-status.mjs';

test('accepts only read-only output switches', () => {
  assert.deepEqual(parseArgs([]), { json: false });
  assert.deepEqual(parseArgs(['--summary']), { json: false });
  assert.deepEqual(parseArgs(['--json']), { json: true });
  assert.throws(() => parseArgs(['--md']), /unknown argument/);
});

test('reports current facts without inventing a target or completion estimate', () => {
  const report = buildReport({
    totals: { papers: 2, projects: 3 },
    candidates: [{ status: 'queued' }, { status: 'claimed' }],
    rewritePool: [{ status: 'available' }],
    status: { batch: { n: 7 }, last_build: { ok: true } },
    git: { branch: 'test', head: 'abc123' },
  });
  assert.equal(report.readonly, true);
  assert.equal(report.objective, null);
  assert.equal(report.notes.total, 5);
  assert.equal(report.queues.candidates.queued, 1);
  assert.match(buildSummary(report), /mode=read-only-maintenance/);
  assert.doesNotMatch(JSON.stringify(report), /target|progress|estimate/i);
});

test('cli status view is read-only and leaves the retired Markdown output untouched', () => {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const retiredStatus = fileURLToPath(new URL('../data/STATUS.md', import.meta.url));
  const before = fs.existsSync(retiredStatus) ? fs.readFileSync(retiredStatus) : null;
  const result = spawnSync(process.execPath, ['scripts/loop-status.mjs', '--json'], {
    cwd: root,
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).readonly, true);
  const after = fs.existsSync(retiredStatus) ? fs.readFileSync(retiredStatus) : null;
  assert.deepEqual(after, before);
});

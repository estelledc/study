import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  commitQueueTransaction,
  inspectQueueTransaction,
  recoverQueueTransaction,
} from './queue-transaction.mjs';

async function fixture() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'study-queue-transaction-'));
  const candidates = path.join(directory, 'candidates.jsonl');
  const rewritePool = path.join(directory, 'rewrite-pool.jsonl');
  await fs.writeFile(candidates, 'old-candidates\n', 'utf8');
  await fs.writeFile(rewritePool, 'old-rewrite\n', 'utf8');
  return { directory, candidates, rewritePool };
}

test('commitQueueTransaction atomically advances a complete generation', async () => {
  const files = await fixture();
  const previousMode = (await fs.stat(files.candidates)).mode & 0o777;
  const result = await commitQueueTransaction([
    { path: files.candidates, content: 'new-candidates\n' },
    { path: files.rewritePool, content: 'new-rewrite\n' },
  ], { generation: 'generation-1' });

  assert.deepEqual(result, {
    generation: 'generation-1',
    applied: ['candidates.jsonl', 'rewrite-pool.jsonl'],
  });
  assert.equal(await fs.readFile(files.candidates, 'utf8'), 'new-candidates\n');
  assert.equal(await fs.readFile(files.rewritePool, 'utf8'), 'new-rewrite\n');
  assert.equal((await fs.stat(files.candidates)).mode & 0o777, previousMode);
  assert.equal((await inspectQueueTransaction({ directory: files.directory })).pending, false);
});

for (const crashAfterIndex of [0, 1]) {
  test(`recoverQueueTransaction finishes a crash after file ${crashAfterIndex + 1}`, async () => {
    const files = await fixture();
    await assert.rejects(
      () => commitQueueTransaction([
        { path: files.candidates, content: 'new-candidates\n' },
        { path: files.rewritePool, content: 'new-rewrite\n' },
      ], {
        generation: `crash-${crashAfterIndex}`,
        hooks: {
          afterApply({ index }) {
            if (index === crashAfterIndex) throw new Error('injected-crash');
          },
        },
      }),
      /injected-crash/,
    );

    assert.equal((await inspectQueueTransaction({ directory: files.directory })).pending, true);
    await recoverQueueTransaction({ directory: files.directory });
    assert.equal(await fs.readFile(files.candidates, 'utf8'), 'new-candidates\n');
    assert.equal(await fs.readFile(files.rewritePool, 'utf8'), 'new-rewrite\n');
    assert.equal((await inspectQueueTransaction({ directory: files.directory })).pending, false);
  });
}

test('failure before the durable manifest keeps the previous generation', async () => {
  const files = await fixture();
  await assert.rejects(
    () => commitQueueTransaction([
      { path: files.candidates, content: 'new-candidates\n' },
      { path: files.rewritePool, content: 'new-rewrite\n' },
    ], {
      generation: 'before-manifest',
      hooks: {
        beforeManifest() {
          throw new Error('injected-before-manifest');
        },
      },
    }),
    /injected-before-manifest/,
  );

  assert.equal(await fs.readFile(files.candidates, 'utf8'), 'old-candidates\n');
  assert.equal(await fs.readFile(files.rewritePool, 'utf8'), 'old-rewrite\n');
  assert.equal((await inspectQueueTransaction({ directory: files.directory })).pending, false);
  assert.deepEqual((await fs.readdir(files.directory)).sort(), ['candidates.jsonl', 'rewrite-pool.jsonl']);
});

test('a crash before atomic manifest publication never exposes truncated JSON', async () => {
  const files = await fixture();
  await assert.rejects(
    () => commitQueueTransaction([
      { path: files.candidates, content: 'new-candidates\n' },
      { path: files.rewritePool, content: 'new-rewrite\n' },
    ], {
      generation: 'manifest-publication-crash',
      hooks: {
        afterManifestStaged() {
          throw new Error('injected-before-manifest-publish');
        },
      },
    }),
    /injected-before-manifest-publish/,
  );

  assert.equal(await fs.readFile(files.candidates, 'utf8'), 'old-candidates\n');
  assert.equal(await fs.readFile(files.rewritePool, 'utf8'), 'old-rewrite\n');
  assert.equal((await inspectQueueTransaction({ directory: files.directory })).pending, false);
  assert.deepEqual((await fs.readdir(files.directory)).sort(), ['candidates.jsonl', 'rewrite-pool.jsonl']);
});

test('a crash after atomic manifest publication retains a complete recoverable journal', async () => {
  const files = await fixture();
  await assert.rejects(
    () => commitQueueTransaction([
      { path: files.candidates, content: 'new-candidates\n' },
      { path: files.rewritePool, content: 'new-rewrite\n' },
    ], {
      generation: 'after-manifest-publication',
      hooks: {
        afterManifestPublished() {
          throw new Error('injected-after-manifest-publish');
        },
      },
    }),
    /injected-after-manifest-publish/,
  );

  const pending = await inspectQueueTransaction({ directory: files.directory });
  assert.equal(pending.pending, true);
  assert.equal(pending.manifest.generation, 'after-manifest-publication');
  await recoverQueueTransaction({ directory: files.directory });
  assert.equal(await fs.readFile(files.candidates, 'utf8'), 'new-candidates\n');
  assert.equal(await fs.readFile(files.rewritePool, 'utf8'), 'new-rewrite\n');
});

test('a stale concurrent transaction loses CAS without leaving an unrecoverable manifest', async () => {
  const files = await fixture();
  let releaseStale;
  let staleStaged;
  const staleMayPublish = new Promise((resolve) => { releaseStale = resolve; });
  const staleReachedStage = new Promise((resolve) => { staleStaged = resolve; });
  const stale = commitQueueTransaction([
    { path: files.candidates, content: 'stale-candidates\n', expectedContent: 'old-candidates\n' },
    { path: files.rewritePool, content: 'stale-rewrite\n', expectedContent: 'old-rewrite\n' },
  ], {
    generation: 'stale-concurrent',
    hooks: {
      async afterManifestStaged() {
        staleStaged();
        await staleMayPublish;
      },
    },
  });
  await staleReachedStage;

  await commitQueueTransaction([
    { path: files.candidates, content: 'winner-candidates\n', expectedContent: 'old-candidates\n' },
    { path: files.rewritePool, content: 'winner-rewrite\n', expectedContent: 'old-rewrite\n' },
  ], { generation: 'winner' });
  releaseStale();

  await assert.rejects(() => stale, /input changed before apply/);
  assert.equal(await fs.readFile(files.candidates, 'utf8'), 'winner-candidates\n');
  assert.equal(await fs.readFile(files.rewritePool, 'utf8'), 'winner-rewrite\n');
  assert.equal((await inspectQueueTransaction({ directory: files.directory })).pending, false);
});

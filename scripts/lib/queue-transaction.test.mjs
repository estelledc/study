import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
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
  assert.deepEqual(
    (await fs.readdir(files.directory)).sort(),
    ['.queue-transaction.guard', 'candidates.jsonl', 'rewrite-pool.jsonl'],
  );
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
  assert.deepEqual(
    (await fs.readdir(files.directory)).sort(),
    ['.queue-transaction.guard', 'candidates.jsonl', 'rewrite-pool.jsonl'],
  );
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

test('concurrent recoverers serialize behind the transaction guard', async () => {
  const files = await fixture();
  await assert.rejects(
    () => commitQueueTransaction([
      { path: files.candidates, content: 'new-candidates\n' },
      { path: files.rewritePool, content: 'new-rewrite\n' },
    ], {
      generation: 'guarded-recovery',
      hooks: {
        afterManifestPublished() {
          throw new Error('injected-pending-transaction');
        },
      },
    }),
    /injected-pending-transaction/,
  );

  let releaseFirst;
  let firstEntered;
  const mayFinish = new Promise((resolve) => { releaseFirst = resolve; });
  const entered = new Promise((resolve) => { firstEntered = resolve; });
  const first = recoverQueueTransaction({
    directory: files.directory,
    hooks: {
      async beforeApply({ index }) {
        if (index !== 0) return;
        firstEntered();
        await mayFinish;
      },
    },
  });
  await entered;

  await assert.rejects(
    () => recoverQueueTransaction({ directory: files.directory }),
    { code: 'QUEUE_TRANSACTION_ACTIVE' },
  );
  releaseFirst();
  await first;

  assert.equal(await fs.readFile(files.candidates, 'utf8'), 'new-candidates\n');
  assert.equal(await fs.readFile(files.rewritePool, 'utf8'), 'new-rewrite\n');
  assert.equal((await inspectQueueTransaction({ directory: files.directory })).pending, false);
});

test('many simultaneous contenders never overlap the guarded critical section', async () => {
  const files = await fixture();
  let active = 0;
  let maximumActive = 0;
  const attempts = Array.from({ length: 24 }, (_, index) => commitQueueTransaction([
    { path: files.candidates, content: `candidate-${index}\n` },
  ], {
    generation: `contender-${index}`,
    hooks: {
      async beforeManifest() {
        active += 1;
        maximumActive = Math.max(maximumActive, active);
        await new Promise((resolve) => setTimeout(resolve, 40));
        active -= 1;
      },
    },
  }));

  const results = await Promise.allSettled(attempts);
  assert.equal(maximumActive, 1);
  assert.equal(results.some(({ status }) => status === 'fulfilled'), true);
  for (const result of results) {
    if (result.status === 'rejected') assert.equal(result.reason.code, 'QUEUE_TRANSACTION_ACTIVE');
  }
});

test('killing the lock helper does not release the parent-held critical section', async () => {
  const files = await fixture();
  let releaseFirst;
  let firstEntered;
  const mayFinish = new Promise((resolve) => { releaseFirst = resolve; });
  const entered = new Promise((resolve) => { firstEntered = resolve; });
  const first = commitQueueTransaction([
    { path: files.candidates, content: 'first-after-helper-crash\n' },
  ], {
    generation: 'helper-crash-owner',
    hooks: {
      async afterGuardAcquired({ helperPid, helperExited }) {
        process.kill(helperPid, 'SIGKILL');
        await helperExited;
      },
      async beforeManifest() {
        firstEntered();
        await mayFinish;
      },
    },
  });
  await entered;

  await assert.rejects(
    () => commitQueueTransaction([
      { path: files.rewritePool, content: 'second-must-not-enter\n' },
    ], { generation: 'helper-crash-contender' }),
    { code: 'QUEUE_TRANSACTION_ACTIVE' },
  );
  releaseFirst();
  await assert.rejects(() => first, /lock helper release failed/);
  assert.equal(await fs.readFile(files.candidates, 'utf8'), 'first-after-helper-crash\n');
  assert.equal(await fs.readFile(files.rewritePool, 'utf8'), 'old-rewrite\n');
});

test('killing the parent process releases the inherited advisory lock', async () => {
  const files = await fixture();
  const moduleUrl = new URL('./queue-transaction.mjs', import.meta.url).href;
  const childCode = `
    import { commitQueueTransaction } from ${JSON.stringify(moduleUrl)};
    await commitQueueTransaction([{
      path: process.env.STUDY_QUEUE_TARGET,
      content: 'orphaned-before-manifest\\n',
    }], {
      generation: 'killed-parent',
      hooks: {
        beforeManifest() {
          process.stdout.write('ENTERED\\n');
          return new Promise(() => {});
        },
      },
    });
  `;
  const child = spawn(process.execPath, ['--input-type=module', '--eval', childCode], {
    env: { ...process.env, STUDY_QUEUE_TARGET: files.candidates },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  await new Promise((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => reject(new Error('child transaction did not enter')), 5_000);
    child.stdout.on('data', (chunk) => {
      output += chunk.toString('utf8');
      if (!output.includes('ENTERED\n')) return;
      clearTimeout(timer);
      resolve();
    });
    child.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once('exit', (code, signal) => {
      if (output.includes('ENTERED\n')) return;
      clearTimeout(timer);
      reject(new Error(`child transaction exited early: ${code}/${signal}`));
    });
  });
  child.kill('SIGKILL');
  await new Promise((resolve) => child.once('exit', resolve));

  let acquired = false;
  for (let attempt = 0; attempt < 20 && !acquired; attempt += 1) {
    try {
      await commitQueueTransaction([
        { path: files.candidates, content: 'after-parent-crash\n' },
      ], { generation: 'after-killed-parent' });
      acquired = true;
    } catch (error) {
      if (error.code !== 'QUEUE_TRANSACTION_ACTIVE') throw error;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }
  assert.equal(acquired, true);
  assert.equal(await fs.readFile(files.candidates, 'utf8'), 'after-parent-crash\n');
});

test('pre-existing empty or partial guard files cannot strand the advisory lock', async () => {
  const files = await fixture();
  const guardPath = path.join(files.directory, '.queue-transaction.guard');
  for (const [index, content] of ['', '{"partial"'].entries()) {
    await fs.writeFile(guardPath, content, 'utf8');
    await commitQueueTransaction([
      { path: files.candidates, content: `new-candidates-${index}\n` },
    ], { generation: `after-partial-guard-${index}` });
    assert.equal(await fs.readFile(files.candidates, 'utf8'), `new-candidates-${index}\n`);
  }
  assert.equal((await fs.stat(guardPath)).isFile(), true);
});

test('a stale guard file and many recoverers append a pending event exactly once', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'study-queue-many-recoverers-'));
  const events = path.join(directory, 'pipeline-events.jsonl');
  const candidates = path.join(directory, 'candidates.jsonl');
  const previousEvents = '{"event":"old"}\n';
  const transactionEvent = '{"event":"recover-once"}\n';
  await fs.writeFile(events, previousEvents, 'utf8');
  await fs.writeFile(candidates, '{"status":"old"}\n', 'utf8');

  await assert.rejects(
    () => commitQueueTransaction([
      {
        path: events,
        content: `${previousEvents}${transactionEvent}`,
        expectedContent: previousEvents,
        appendOnly: true,
      },
      {
        path: candidates,
        content: '{"status":"new"}\n',
        expectedContent: '{"status":"old"}\n',
      },
    ], {
      generation: 'many-recoverers',
      hooks: {
        afterManifestPublished() {
          throw new Error('injected-pending-many-recoverers');
        },
      },
    }),
    /injected-pending-many-recoverers/,
  );

  const attempts = Array.from({ length: 16 }, () => recoverQueueTransaction({
    directory,
    hooks: {
      async beforeApply({ index }) {
        if (index === 0) await new Promise((resolve) => setTimeout(resolve, 40));
      },
    },
  }));
  const results = await Promise.allSettled(attempts);
  const recovered = results.filter(
    (result) => result.status === 'fulfilled' && result.value.recovered === true,
  );
  assert.equal(recovered.length, 1);
  for (const result of results) {
    if (result.status === 'rejected') assert.equal(result.reason.code, 'QUEUE_TRANSACTION_ACTIVE');
  }
  const finalEvents = await fs.readFile(events, 'utf8');
  assert.equal(finalEvents.match(/recover-once/g)?.length, 1);
  for (const line of finalEvents.trimEnd().split('\n')) assert.doesNotThrow(() => JSON.parse(line));
  assert.equal(await fs.readFile(candidates, 'utf8'), '{"status":"new"}\n');
});

test('a concurrent commit is rejected while the transaction guard is held', async () => {
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

  await assert.rejects(
    () => commitQueueTransaction([
      { path: files.candidates, content: 'winner-candidates\n', expectedContent: 'old-candidates\n' },
      { path: files.rewritePool, content: 'winner-rewrite\n', expectedContent: 'old-rewrite\n' },
    ], { generation: 'winner' }),
    { code: 'QUEUE_TRANSACTION_ACTIVE' },
  );
  releaseStale();

  await stale;
  assert.equal(await fs.readFile(files.candidates, 'utf8'), 'stale-candidates\n');
  assert.equal(await fs.readFile(files.rewritePool, 'utf8'), 'stale-rewrite\n');
  assert.equal((await inspectQueueTransaction({ directory: files.directory })).pending, false);
});

test('an external input change still loses CAS without leaving a manifest', async () => {
  const files = await fixture();
  await assert.rejects(
    () => commitQueueTransaction([
      { path: files.candidates, content: 'stale-candidates\n', expectedContent: 'old-candidates\n' },
      { path: files.rewritePool, content: 'stale-rewrite\n', expectedContent: 'old-rewrite\n' },
    ], {
      generation: 'external-cas-winner',
      hooks: {
        async afterManifestStaged() {
          await fs.writeFile(files.candidates, 'winner-candidates\n', 'utf8');
          await fs.writeFile(files.rewritePool, 'winner-rewrite\n', 'utf8');
        },
      },
    }),
    /input changed before apply/,
  );

  assert.equal(await fs.readFile(files.candidates, 'utf8'), 'winner-candidates\n');
  assert.equal(await fs.readFile(files.rewritePool, 'utf8'), 'winner-rewrite\n');
  assert.equal((await inspectQueueTransaction({ directory: files.directory })).pending, false);
});

test('append-only apply preserves a concurrent event written inside the pre-apply window', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'study-queue-append-race-'));
  const events = path.join(directory, 'pipeline-events.jsonl');
  const candidates = path.join(directory, 'candidates.jsonl');
  const previousEvents = '{"event":"old"}\n';
  const transactionEvent = '{"event":"transaction"}\n';
  const concurrentEvent = '{"event":"concurrent"}\n';
  await fs.writeFile(events, previousEvents, 'utf8');
  await fs.writeFile(candidates, '{"status":"old"}\n', 'utf8');

  await commitQueueTransaction([
    {
      path: events,
      content: `${previousEvents}${transactionEvent}`,
      expectedContent: previousEvents,
      appendOnly: true,
    },
    {
      path: candidates,
      content: '{"status":"new"}\n',
      expectedContent: '{"status":"old"}\n',
    },
  ], {
    generation: 'append-race',
    hooks: {
      async beforeApply({ index }) {
        if (index === 0) await fs.appendFile(events, concurrentEvent, 'utf8');
      },
    },
  });

  assert.equal(
    await fs.readFile(events, 'utf8'),
    `${previousEvents}${concurrentEvent}${transactionEvent}`,
  );
  assert.equal(await fs.readFile(candidates, 'utf8'), '{"status":"new"}\n');
  assert.equal((await inspectQueueTransaction({ directory })).pending, false);
});

test('a near-limit append remains one complete JSONL record beside concurrent writers', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'study-queue-near-limit-'));
  const events = path.join(directory, 'pipeline-events.jsonl');
  const previousEvents = '{"event":"old"}\n';
  const transactionEvent = `${JSON.stringify({ event: 'near-limit', payload: 'a'.repeat(250 * 1024) })}\n`;
  await fs.writeFile(events, previousEvents, 'utf8');

  await commitQueueTransaction([{
    path: events,
    content: `${previousEvents}${transactionEvent}`,
    expectedContent: previousEvents,
    appendOnly: true,
  }], {
    generation: 'near-limit-append',
    hooks: {
      async beforeApply({ index }) {
        if (index !== 0) return;
        await Promise.all(Array.from({ length: 200 }, (_, writer) => fs.appendFile(
          events,
          `${JSON.stringify({ event: 'concurrent', writer })}\n`,
          'utf8',
        )));
      },
    },
  });

  const rows = (await fs.readFile(events, 'utf8')).trimEnd().split('\n').map((line) => JSON.parse(line));
  assert.equal(rows.filter(({ event }) => event === 'old').length, 1);
  assert.equal(rows.filter(({ event }) => event === 'concurrent').length, 200);
  const nearLimit = rows.filter(({ event }) => event === 'near-limit');
  assert.equal(nearLimit.length, 1);
  assert.equal(nearLimit[0].payload.length, 250 * 1024);
});

test('append-only segments above the single-write bound fail before publishing a manifest', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'study-queue-append-bound-'));
  const events = path.join(directory, 'pipeline-events.jsonl');
  const previousEvents = '{"event":"old"}\n';
  const oversizedEvent = `${JSON.stringify({ event: 'oversized', payload: 'a'.repeat(512 * 1024) })}\n`;
  await fs.writeFile(events, previousEvents, 'utf8');

  await assert.rejects(
    () => commitQueueTransaction([{
      path: events,
      content: `${previousEvents}${oversizedEvent}`,
      expectedContent: previousEvents,
      appendOnly: true,
    }], { generation: 'oversized-append' }),
    /single-write limit/,
  );

  assert.equal(await fs.readFile(events, 'utf8'), previousEvents);
  assert.equal((await inspectQueueTransaction({ directory })).pending, false);
});

test('manifest validation rejects staged and target aliases without deleting the target', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'study-queue-manifest-alias-'));
  const target = path.join(directory, 'candidates.jsonl');
  const content = Buffer.from('new-candidates\n');
  await fs.writeFile(target, content);
  const manifest = {
    schema_version: 1,
    generation: 'malicious-alias',
    transaction_id: '00000000-0000-4000-8000-000000000000',
    state: 'prepared',
    created_at: new Date().toISOString(),
    files: [{
      target: 'candidates.jsonl',
      staged: 'candidates.jsonl',
      previous_sha256: null,
      next_sha256: createHash('sha256').update(content).digest('hex'),
      bytes: content.length,
      next_bytes: content.length,
      append_only: false,
    }],
  };
  await fs.writeFile(
    path.join(directory, '.queue-transaction.json'),
    `${JSON.stringify(manifest)}\n`,
    'utf8',
  );

  await assert.rejects(
    () => recoverQueueTransaction({ directory }),
    /invalid queue transaction staged file/,
  );
  assert.equal(await fs.readFile(target, 'utf8'), 'new-candidates\n');
});

for (const fixture of [
  {
    name: 'an incomplete concurrent JSONL suffix',
    mutate: (events) => fs.appendFile(events, '{"event":"partial"', 'utf8'),
  },
  {
    name: 'a changed append-only prefix followed by valid JSONL',
    mutate: (events) => fs.writeFile(
      events,
      '{"event":"tampered-prefix"}\n{"event":"concurrent"}\n',
      'utf8',
    ),
  },
]) {
  test(`append-only recovery fails closed for ${fixture.name}`, async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'study-queue-append-only-'));
    const events = path.join(directory, 'pipeline-events.jsonl');
    const candidates = path.join(directory, 'candidates.jsonl');
    const previousEvents = '{"event":"old"}\n';
    const nextEvents = `${previousEvents}{"event":"recovery"}\n`;
    await fs.writeFile(events, previousEvents, 'utf8');
    await fs.writeFile(candidates, '{"status":"old"}\n', 'utf8');

    await assert.rejects(
      () => commitQueueTransaction([
        {
          path: events,
          content: nextEvents,
          expectedContent: previousEvents,
          appendOnly: true,
        },
        {
          path: candidates,
          content: '{"status":"new"}\n',
          expectedContent: '{"status":"old"}\n',
        },
      ], {
        generation: 'append-only-invalid',
        hooks: {
          async afterApply({ index }) {
            if (index === 0) {
              await fixture.mutate(events);
              throw new Error('injected-append-only-crash');
            }
          },
        },
      }),
      /injected-append-only-crash/,
    );

    await assert.rejects(
      () => recoverQueueTransaction({ directory }),
      /pipeline-events\.jsonl diverged/,
    );
    assert.equal((await inspectQueueTransaction({ directory })).pending, true);
    assert.equal(await fs.readFile(candidates, 'utf8'), '{"status":"old"}\n');
  });
}

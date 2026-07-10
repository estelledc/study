#!/usr/bin/env node
// 扫 src/content/docs/{papers,projects}/*.md → data/written.txt
// 同时更新 data/candidates.jsonl 中已写 slug 的 status="written"

import { listAreaNotes } from './lib/content-store.mjs';
import {
  commitQueueState,
  markCandidatesWritten,
  markRewritePoolWritten,
  readCandidatesOptional,
  readRewritePoolOptional,
} from './lib/queue-store.mjs';
import {
  CANDIDATES_PATH,
  DATA_DIR,
  REWRITE_POOL_PATH,
  WRITTEN_PATH,
} from './lib/paths.mjs';
import { recoverQueueTransaction } from './lib/queue-transaction.mjs';

async function buildWrittenState() {
  const papers = await listAreaNotes('papers');
  const projects = await listAreaNotes('projects');
  const all = [...papers, ...projects];
  // 排序：按 area 分段
  papers.sort((a, b) => a.slug.localeCompare(b.slug));
  projects.sort((a, b) => a.slug.localeCompare(b.slug));
  const lines = [
    '# papers',
    ...papers.map(x => x.slug),
    '',
    '# projects',
    ...projects.map(x => x.slug),
    '',
  ];
  return { papers: papers.length, projects: projects.length, all, text: lines.join('\n') };
}

async function main() {
  await recoverQueueTransaction({ directory: DATA_DIR });
  const [w, candidatesInput, rewriteInput] = await Promise.all([
    buildWrittenState(),
    readCandidatesOptional(),
    readRewritePoolOptional(),
  ]);
  const candidates = candidatesInput.missing
    ? null
    : markCandidatesWritten(candidatesInput.rows, w.all);
  const rewritePool = rewriteInput.missing
    ? null
    : markRewritePoolWritten(rewriteInput.rows, w.all);

  await commitQueueState({
    ...(candidates ? { candidates: candidates.rows } : {}),
    ...(rewritePool ? { rewritePool: rewritePool.rows } : {}),
    writtenText: w.text,
  }, {
    directory: DATA_DIR,
    generation: `sync-written-${Date.now()}`,
    paths: {
      candidates: CANDIDATES_PATH,
      rewritePool: REWRITE_POOL_PATH,
      written: WRITTEN_PATH,
    },
    expectedState: {
      ...(candidates ? { candidates: candidatesInput.rows } : {}),
      ...(rewritePool ? { rewritePool: rewriteInput.rows } : {}),
    },
  });

  const c = candidates
    ? { updated: candidates.updated, already_written: candidates.already_written }
    : { skipped: true, reason: 'candidates.jsonl not found, run extract-candidates first' };
  const r = rewritePool
    ? { claimed_to_written: rewritePool.claimed_to_written }
    : { skipped: true };
  console.log(JSON.stringify({
    written: { papers: w.papers, projects: w.projects, total: w.papers + w.projects },
    candidates_updated: c,
    rewrite_pool_updated: r,
    output: WRITTEN_PATH,
  }, null, 2));
}

main().catch(err => {
  console.error('sync-written failed:', err);
  process.exit(1);
});

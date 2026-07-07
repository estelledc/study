#!/usr/bin/env node
// 扫 src/content/docs/{papers,projects}/*.md → data/written.txt
// 同时更新 data/candidates.jsonl 中已写 slug 的 status="written"

import fs from 'node:fs/promises';
import path from 'node:path';
import { listAreaNotes } from './lib/content-store.mjs';
import {
  markCandidatesWritten,
  markRewritePoolWritten,
  readCandidatesOptional,
  readRewritePoolOptional,
  writeCandidates,
  writeRewritePool,
} from './lib/queue-store.mjs';
import {
  WRITTEN_PATH,
} from './lib/paths.mjs';

async function rebuildWritten() {
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
  await fs.mkdir(path.dirname(WRITTEN_PATH), { recursive: true });
  await fs.writeFile(WRITTEN_PATH, lines.join('\n'));
  return { papers: papers.length, projects: projects.length, all };
}

async function updateCandidatesStatus(written) {
  const { rows, missing } = await readCandidatesOptional();
  if (missing) return { skipped: true, reason: 'candidates.jsonl not found, run extract-candidates first' };
  const result = markCandidatesWritten(rows, written);
  await writeCandidates(result.rows);
  return { updated: result.updated, already_written: result.already_written };
}

async function updateRewritePoolStatus(written) {
  const { rows, missing } = await readRewritePoolOptional();
  if (missing) return { skipped: true };
  const result = markRewritePoolWritten(rows, written);
  await writeRewritePool(result.rows);
  return { claimed_to_written: result.claimed_to_written };
}

async function main() {
  const w = await rebuildWritten();
  const c = await updateCandidatesStatus(w.all);
  const r = await updateRewritePoolStatus(w.all);
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

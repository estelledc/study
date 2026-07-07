#!/usr/bin/env node
// 扫 src/content/docs/{papers,projects}/*.md → data/written.txt
// 同时更新 data/candidates.jsonl 中已写 slug 的 status="written"

import fs from 'node:fs/promises';
import path from 'node:path';
import {
  CANDIDATES_PATH,
  PAPERS_DIR,
  PROJECTS_DIR,
  REWRITE_POOL_PATH,
  WRITTEN_PATH,
} from './lib/paths.mjs';

async function listSlugs(dir, area) {
  try {
    const entries = await fs.readdir(dir);
    return entries
      .filter(f => f.endsWith('.md') && !f.startsWith('_'))
      .map(f => ({ slug: f.replace(/\.md$/, ''), area }));
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
}

async function rebuildWritten() {
  const papers = await listSlugs(PAPERS_DIR, 'papers');
  const projects = await listSlugs(PROJECTS_DIR, 'projects');
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
  const writtenSet = new Set(written.map(w => `${w.area}::${w.slug}`));
  let raw;
  try {
    raw = await fs.readFile(CANDIDATES_PATH, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') {
      return { skipped: true, reason: 'candidates.jsonl not found, run extract-candidates first' };
    }
    throw err;
  }
  const lines = raw.split('\n').filter(Boolean);
  let updated = 0;
  let alreadyWritten = 0;
  const out = lines.map(line => {
    const c = JSON.parse(line);
    const key = `${c.area}::${c.slug}`;
    if (writtenSet.has(key)) {
      if (c.status === 'written') {
        alreadyWritten++;
      } else if (c.status === 'queued' || c.status === 'claimed') {
        c.status = 'written';
        c.claimed_by = null;
        updated++;
      }
      // blacklisted / failed 不动（虽然 written 但保留原状态供审）
    }
    return JSON.stringify(c);
  });
  await fs.writeFile(CANDIDATES_PATH, out.join('\n') + '\n');
  return { updated, already_written: alreadyWritten };
}

async function updateRewritePoolStatus(written) {
  const writtenSet = new Set(written.map(w => `${w.area}::${w.slug}`));
  let raw;
  try {
    raw = await fs.readFile(REWRITE_POOL_PATH, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return { skipped: true };
    throw err;
  }
  const lines = raw.split('\n').filter(Boolean);
  let claimedToWritten = 0;
  const out = lines.map(line => {
    const c = JSON.parse(line);
    const key = `${c.area}::${c.slug}`;
    // 已写笔记（claimed → written），不动 available（让 build-rewrite-pool 决定 legacy 是否仍需要 rewrite）
    if (c.status === 'claimed' && writtenSet.has(key)) {
      c.status = 'written';
      c.claimed_by = null;
      claimedToWritten++;
    }
    return JSON.stringify(c);
  });
  await fs.writeFile(REWRITE_POOL_PATH, out.join('\n') + '\n');
  return { claimed_to_written: claimedToWritten };
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

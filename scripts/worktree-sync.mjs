#!/usr/bin/env node
// worktree-sync.mjs — 统一 fetch + reset 8 个 study 并行 worktree
// 已移除 http.sslVerify=false（安全治理，见 OPERATIONS.md）
//
// 用法：
//   node scripts/worktree-sync.mjs             # 同步所有 worktree
//   node scripts/worktree-sync.mjs --dry-run   # 只列出操作，不执行
//   PARALLEL_WORKTREES=4 node scripts/worktree-sync.mjs  # 控制并行数量

import { execSync, spawnSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';

const DRY_RUN = process.argv.includes('--dry-run');
const PARALLEL = parseInt(process.env.PARALLEL_WORKTREES || '4', 10);

const HOME = os.homedir();
const WORKTREES = [
  'study-refactor-papers',
  'study-refactor-papers-2',
  'study-refactor-papers-3',
  'study-refactor-papers-4',
  'study-refactor-projects',
  'study-refactor-projects-2',
  'study-refactor-projects-3',
  'study-refactor-projects-4',
].map(name => path.join(HOME, name)).filter(p => {
  try {
    execSync(`test -d "${p}"`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
});

async function syncWorktree(wtPath) {
  const name = path.basename(wtPath);
  if (DRY_RUN) {
    console.log(`  [dry-run] sync ${name}`);
    return { name, ok: true };
  }

  // fetch without sslVerify=false
  const fetch = spawnSync('git', ['-C', wtPath, 'fetch', 'origin', 'main'], {
    encoding: 'utf8',
    timeout: 30000,
  });
  if (fetch.status !== 0) {
    console.error(`  fetch FAILED ${name}: ${fetch.stderr.trim()}`);
    return { name, ok: false, error: 'fetch failed' };
  }

  const reset = spawnSync('git', ['-C', wtPath, 'reset', '--hard', 'origin/main'], {
    encoding: 'utf8',
    timeout: 10000,
  });
  if (reset.status !== 0) {
    console.error(`  reset FAILED ${name}: ${reset.stderr.trim()}`);
    return { name, ok: false, error: 'reset failed' };
  }

  const clean = spawnSync('git', ['-C', wtPath, 'clean', '-fd'], {
    encoding: 'utf8',
    timeout: 10000,
  });
  if (clean.status !== 0) {
    console.error(`  clean FAILED ${name}: ${clean.stderr.trim()}`);
    return { name, ok: false, error: 'clean failed' };
  }

  console.log(`  synced  ${name}`);
  return { name, ok: true };
}

async function main() {
  if (WORKTREES.length === 0) {
    console.log('worktree-sync: no worktrees found');
    return;
  }

  console.log(`worktree-sync: ${WORKTREES.length} worktrees, parallelism=${PARALLEL}`);

  // Process in batches of PARALLEL
  let failed = 0;
  for (let i = 0; i < WORKTREES.length; i += PARALLEL) {
    const batch = WORKTREES.slice(i, i + PARALLEL);
    const results = await Promise.all(batch.map(syncWorktree));
    failed += results.filter(r => !r.ok).length;
  }

  if (failed > 0) {
    console.error(`worktree-sync: ${failed} worktrees failed`);
    process.exit(1);
  }
  console.log('worktree-sync: done');
}

main().catch(err => {
  console.error('worktree-sync error:', err);
  process.exit(1);
});

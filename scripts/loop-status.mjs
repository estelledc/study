#!/usr/bin/env node
// 综合 candidates / rewrite-pool / status.json / git log → STATUS.md 仪表盘 + 一行简报
//
// 用法：
//   node scripts/loop-status.mjs                # 重写 STATUS.md，print 简报
//   node scripts/loop-status.mjs --summary      # 只 print 简报
//   node scripts/loop-status.mjs --md           # 只重写 STATUS.md

import fs from 'node:fs/promises';
import { execSync } from 'node:child_process';
import { countNotesByArea } from './lib/content-store.mjs';
import { readJson } from './lib/json-store.mjs';
import { readJsonl } from './lib/jsonl.mjs';
import {
  CANDIDATES_PATH,
  REWRITE_POOL_PATH,
  ROOT,
  STATUS_JSON_PATH,
  STATUS_MD_PATH,
} from './lib/paths.mjs';

const CANDIDATES = CANDIDATES_PATH;
const REWRITE_POOL = REWRITE_POOL_PATH;
const STATUS_JSON = STATUS_JSON_PATH;
const STATUS_MD = STATUS_MD_PATH;

const TARGET_PAPERS = 10000;
const TARGET_PROJECTS = 10000;
const TARGET_TOTAL = TARGET_PAPERS + TARGET_PROJECTS;

function parseArgs() {
  const args = { summary: false, md: false };
  for (let i = 2; i < process.argv.length; i++) {
    const a = process.argv[i];
    if (a === '--summary') args.summary = true;
    else if (a === '--md') args.md = true;
  }
  if (!args.summary && !args.md) { args.summary = true; args.md = true; }
  return args;
}

async function readJsonlSafe(filePath) {
  return readJsonl(filePath, { missing: 'empty' });
}

async function readJsonSafe(filePath, fallback) {
  return readJson(filePath, { missing: fallback });
}

function statusBreakdown(items) {
  const out = {};
  for (const x of items) {
    out[x.status] = (out[x.status] || 0) + 1;
  }
  return out;
}

function pct(n, total) {
  return ((n / total) * 100).toFixed(2);
}

function progressBar(n, total, width = 30) {
  const filled = Math.round((n / total) * width);
  return '[' + '█'.repeat(filled) + '░'.repeat(width - filled) + ']';
}

function gitLogShort(n = 5) {
  try {
    return execSync(`git -C ${ROOT} log --oneline -${n}`, { encoding: 'utf8' }).trim();
  } catch {
    return '(git log unavailable)';
  }
}

function gitLogBatchEvents(n = 10) {
  try {
    return execSync(`git -C ${ROOT} log --oneline -${n} --grep='atlas+backlinks'`, { encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

function buildSummary(state) {
  const { totals, status, candByStatus, poolByStatus } = state;
  const written = totals.papers + totals.projects;
  const queue = (candByStatus.queued || 0);
  const lastBuild = status?.last_build;
  const buildStr = lastBuild?.ok
    ? `build ${(lastBuild.duration_ms / 1000).toFixed(1)}s`
    : (lastBuild?.ok === false ? 'build FAIL' : 'build —');
  const batchN = status?.batch?.n ?? '—';
  const batchOk = status?.batch?.commits?.length ?? '—';
  const batchFail = status?.batch?.failed?.length ?? 0;
  const time = new Date().toTimeString().slice(0, 5);
  return `batch ${batchN} ${batchFail === 0 ? '✅' : '⚠️'} ${batchOk}/8 | total=${written} | queue ${queue} | rewrite-pool ${poolByStatus.available || 0} | ${buildStr} | ${time}`;
}

function buildMarkdown(state) {
  const { totals, candByStatus, poolByStatus, status, recentCommits, batchEvents } = state;
  const written = totals.papers + totals.projects;
  const queue = candByStatus.queued || 0;
  const blacklisted = candByStatus.blacklisted || 0;
  const claimed = candByStatus.claimed || 0;
  const writtenCand = candByStatus.written || 0;
  const failed = candByStatus.failed || 0;

  // 速率估算
  const ratePerHour = 16; // 8 net new / 30 min
  const remaining = TARGET_TOTAL - written;
  const etaHours = Math.round(remaining / ratePerHour);
  const etaSessions = Math.ceil(etaHours / 4); // 假设每 session 4h 有效

  return `# Auto-push 进度仪表盘

> 最后更新：${new Date().toISOString()}
> 自动生成 by \`scripts/loop-status.mjs\` — 不要手改

## 总进度

${progressBar(written, TARGET_TOTAL)} ${pct(written, TARGET_TOTAL)}% (${written} / ${TARGET_TOTAL})

| Area | 已写 | 目标 | 比例 |
|---|---:|---:|---:|
| papers   | ${totals.papers}   | ${TARGET_PAPERS}   | ${pct(totals.papers, TARGET_PAPERS)}% |
| projects | ${totals.projects} | ${TARGET_PROJECTS} | ${pct(totals.projects, TARGET_PROJECTS)}% |

## 候选池（candidates.jsonl）

- queued:      **${queue}**
- claimed:     ${claimed}
- written:     ${writtenCand}
- blacklisted: ${blacklisted}
- failed:      ${failed}

## Rewrite 池（rewrite-pool.jsonl）

- available:   **${poolByStatus.available || 0}**
- claimed:     ${poolByStatus.claimed || 0}
- written:     ${poolByStatus.written || 0}
- failed:      ${poolByStatus.failed || 0}

## 当前批次（status.json）

- batch n:     ${status?.batch?.n ?? '—'}
- 已派发:      ${status?.batch?.commits?.length ?? '—'}
- 失败:        ${status?.batch?.failed?.length ?? 0}
- 上次 build:  ${status?.last_build?.ok ? `✅ ${(status.last_build.duration_ms / 1000).toFixed(1)}s` : (status?.last_build?.ok === false ? '❌ FAIL' : '—')}

## 速率 + ETA

- 当前速率：~${ratePerHour} net new / hour（保质 4R+4N，30 min/批）
- 剩余：${remaining}
- 预计：${etaHours} hours ≈ ${etaSessions} session（按每 session 4h 有效推算）

## 最近 batch 提交

\`\`\`
${batchEvents || '(no batch commits yet)'}
\`\`\`

## 最近 5 个 commit

\`\`\`
${recentCommits}
\`\`\`
`;
}

async function main() {
  const args = parseArgs();

  const candidates = await readJsonlSafe(CANDIDATES);
  const pool = await readJsonlSafe(REWRITE_POOL);
  const status = await readJsonSafe(STATUS_JSON, {});

  const totals = await countNotesByArea();

  const candByStatus = statusBreakdown(candidates);
  const poolByStatus = statusBreakdown(pool);

  const recentCommits = gitLogShort(5);
  const batchEvents = gitLogBatchEvents(5);

  const state = { totals, candByStatus, poolByStatus, status, recentCommits, batchEvents };

  if (args.md) {
    const md = buildMarkdown(state);
    await fs.writeFile(STATUS_MD, md);
  }
  if (args.summary) {
    console.log(buildSummary(state));
  }
}

main().catch(err => {
  console.error('loop-status failed:', err);
  process.exit(1);
});

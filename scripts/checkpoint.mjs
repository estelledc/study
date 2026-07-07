#!/usr/bin/env node
// Read / write data/checkpoint.json — round 末聚合状态
// 用法：
//   node scripts/checkpoint.mjs --read                 # print json
//   node scripts/checkpoint.mjs --write --round 8 --total-papers 163 ...
//   node scripts/checkpoint.mjs --update <key> <value> # 单字段更新

import { countNotesByArea } from './lib/content-store.mjs';
import { readJsonOptional, writeJson } from './lib/json-store.mjs';
import { readJsonl } from './lib/jsonl.mjs';
import {
  CANDIDATES_PATH,
  CHECKPOINT_PATH,
  GRAVEYARD_PATH,
  REWRITE_POOL_PATH,
} from './lib/paths.mjs';

const CHECKPOINT = CHECKPOINT_PATH;

const DEFAULT = {
  version: 'v3',
  session_started: null,
  round_n: 0,
  total: { papers: 0, projects: 0 },
  queue: { papers: 0, projects: 0 },
  rewrite_pool_available: 0,
  graveyard_size: 0,
  build_streak: 'ok',
  last_round_stats: null,
  next_action: 'start-round-1',
};

async function read() {
  const { data, missing } = await readJsonOptional(CHECKPOINT);
  return missing ? { ...DEFAULT } : data;
}

async function write(data) {
  await writeJson(CHECKPOINT, data);
}

async function autoStats() {
  // 单次读 candidates，本地双 filter；并行读 papers/projects/pool/graveyard
  const [totals, candidates, pool, graveyard] = await Promise.all([
    countNotesByArea(),
    readJsonl(CANDIDATES_PATH, { missing: 'empty' }),
    readJsonl(REWRITE_POOL_PATH, { missing: 'empty' }),
    readJsonl(GRAVEYARD_PATH, { missing: 'empty' }),
  ]);
  return {
    total: totals,
    queue: {
      papers: candidates.filter(c => c.status === 'queued' && c.area === 'papers').length,
      projects: candidates.filter(c => c.status === 'queued' && c.area === 'projects').length,
    },
    rewrite_pool_available: pool.filter(p => p.status === 'available').length,
    graveyard_size: graveyard.length,
  };
}

function parseArgs() {
  const args = { mode: null, fields: {} };
  for (let i = 2; i < process.argv.length; i++) {
    const a = process.argv[i];
    if (a === '--read') args.mode = 'read';
    else if (a === '--write') args.mode = 'write';
    else if (a === '--auto-update') args.mode = 'auto-update';
    else if (a === '--update') { args.mode = 'update'; args.fields[process.argv[++i]] = process.argv[++i]; }
    else if (a.startsWith('--')) {
      const key = a.slice(2);
      const v = process.argv[++i];
      args.fields[key] = v;
    }
  }
  return args;
}

async function main() {
  const args = parseArgs();
  const cur = await read();

  if (args.mode === 'read') {
    console.log(JSON.stringify(cur, null, 2));
    return;
  }

  if (args.mode === 'auto-update' || args.mode === 'write') {
    // 自动从仓库 / candidates / rewrite-pool / graveyard 计算
    const stats = await autoStats();
    Object.assign(cur, stats);
    cur.version = 'v3';
    if (!cur.session_started) cur.session_started = new Date().toISOString();
  }

  if (args.mode === 'write' || args.mode === 'auto-update' || args.mode === 'update') {
    // 字段覆盖（除了 stats 已自动算的）
    for (const [k, v] of Object.entries(args.fields)) {
      if (k.includes('.')) {
        // 嵌套：last_round_stats.slugs_committed=8
        const parts = k.split('.');
        let target = cur;
        for (let i = 0; i < parts.length - 1; i++) {
          if (!target[parts[i]]) target[parts[i]] = {};
          target = target[parts[i]];
        }
        target[parts[parts.length - 1]] = isNaN(v) ? v : Number(v);
      } else {
        cur[k] = isNaN(v) ? v : Number(v);
      }
    }
    await write(cur);
    console.log(JSON.stringify(cur, null, 2));
    return;
  }

  console.error('usage: checkpoint.mjs --read | --auto-update | --write [--key value ...] | --update key value');
  process.exit(2);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => { console.error('checkpoint failed:', err); process.exit(1); });
}

export { read, write, autoStats };

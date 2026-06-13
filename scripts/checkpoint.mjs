#!/usr/bin/env node
// Read / write data/checkpoint.json — round 末聚合状态
// 用法：
//   node scripts/checkpoint.mjs --read                 # print json
//   node scripts/checkpoint.mjs --write --round 8 --total-papers 163 ...
//   node scripts/checkpoint.mjs --update <key> <value> # 单字段更新

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const CHECKPOINT = path.join(ROOT, 'data/checkpoint.json');

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
  try {
    return JSON.parse(await fs.readFile(CHECKPOINT, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return { ...DEFAULT };
    throw err;
  }
}

async function write(data) {
  await fs.mkdir(path.dirname(CHECKPOINT), { recursive: true });
  await fs.writeFile(CHECKPOINT, JSON.stringify(data, null, 2));
}

async function countMd(dir) {
  try {
    return (await fs.readdir(dir)).filter(f => f.endsWith('.md') && !f.startsWith('_')).length;
  } catch (err) {
    if (err.code === 'ENOENT') return 0;
    throw err;
  }
}

async function readJsonlLines(filePath) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const lines = raw.split('\n').filter(Boolean);
    const parsed = [];
    let repaired = 0;
    for (const line of lines) {
      try {
        parsed.push(JSON.parse(line));
      } catch {
        // Auto-repair: common corruption patterns from expanders
        // Pattern 1: "col4">value" -> "col4":"value"
        // Pattern 2: stray unquoted field like "os-pipeline"
        let fixed = line.replace(/"col4">/g, '"col4":"');
        // Remove stray bare strings between commas (like ,"os-pipeline",)
        fixed = fixed.replace(/,"[a-z][a-z0-9-]*",/g, ',');
        try {
          parsed.push(JSON.parse(fixed));
          repaired++;
        } catch {
          // Can't fix — skip this line
        }
      }
    }
    if (repaired > 0) {
      // Write back repaired version
      const body = parsed.map(r => JSON.stringify(r)).join('\n') + '\n';
      await fs.writeFile(filePath, body, 'utf8');
      console.error(`[checkpoint] repaired ${repaired}/${lines.length} lines in ${path.basename(filePath)}`);
    }
    return parsed;
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
}

async function autoStats() {
  // 单次读 candidates，本地双 filter；并行读 papers/projects/pool/graveyard
  const [papers, projects, candidates, pool, graveyard] = await Promise.all([
    countMd(path.join(ROOT, 'src/content/docs/papers')),
    countMd(path.join(ROOT, 'src/content/docs/projects')),
    readJsonlLines(path.join(ROOT, 'data/candidates.jsonl')),
    readJsonlLines(path.join(ROOT, 'data/rewrite-pool.jsonl')),
    readJsonlLines(path.join(ROOT, 'data/graveyard.jsonl')),
  ]);
  return {
    total: { papers, projects },
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

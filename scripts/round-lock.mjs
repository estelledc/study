#!/usr/bin/env node
// round-lock：防 wakeup 排队踩踏
// 用法：
//   node scripts/round-lock.mjs --acquire <round_n> <workflow_run_id>  # 取锁
//   node scripts/round-lock.mjs --release                              # 释放
//   node scripts/round-lock.mjs --check                                # 查锁状态
//
// 取锁逻辑：
//   - 若锁不存在或锁 > 90 min（视为前序卡死）→ 取锁成功
//   - 若锁存在且 < 90 min → 拒绝（exit 1）

import fs from 'node:fs/promises';
import path from 'node:path';
import { ROUND_LOCK_PATH } from './lib/paths.mjs';

const LOCK = ROUND_LOCK_PATH;
const STALE_MS = 90 * 60 * 1000;

async function readLock() {
  try { return JSON.parse(await fs.readFile(LOCK, 'utf8')); }
  catch { return null; }
}

async function writeLock(d) {
  await fs.mkdir(path.dirname(LOCK), { recursive: true });
  await fs.writeFile(LOCK, JSON.stringify(d, null, 2));
}

async function deleteLock() {
  try { await fs.unlink(LOCK); } catch {}
}

async function main() {
  const args = process.argv.slice(2);
  const cmd = args[0];

  if (cmd === '--acquire') {
    const round_n = parseInt(args[1], 10);
    const workflow_run_id = args[2] || 'unknown';
    const cur = await readLock();
    if (cur) {
      const age = Date.now() - new Date(cur.started_at).getTime();
      if (age < STALE_MS) {
        console.log(JSON.stringify({ acquired: false, reason: 'lock-active', existing: cur, age_ms: age }));
        process.exit(1);
      }
      console.log(JSON.stringify({ acquired: true, stale_lock_replaced: cur, replaced_age_ms: age }));
    }
    const newLock = { active_round: round_n, started_at: new Date().toISOString(), workflow_run_id };
    await writeLock(newLock);
    console.log(JSON.stringify({ acquired: true, lock: newLock }));
    return;
  }

  if (cmd === '--release') {
    await deleteLock();
    console.log(JSON.stringify({ released: true }));
    return;
  }

  if (cmd === '--check') {
    const cur = await readLock();
    if (!cur) { console.log(JSON.stringify({ locked: false })); return; }
    const age = Date.now() - new Date(cur.started_at).getTime();
    console.log(JSON.stringify({ locked: true, lock: cur, age_ms: age, stale: age >= STALE_MS }));
    return;
  }

  console.error('usage: round-lock.mjs --acquire <round_n> <workflow_run_id> | --release | --check');
  process.exit(2);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => { console.error('round-lock failed:', err); process.exit(1); });
}

#!/usr/bin/env node
// 6 条退出判定，输出 {should_exit: bool, reason: string}
// 用法：node scripts/exit-conditions.mjs

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { read as readCheckpoint } from './checkpoint.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const LOCK = path.join(ROOT, 'data/round-lock.json');
const STALE_MS = 90 * 60 * 1000; // 90 min stale threshold

const TARGET = 20000;

async function fileExists(p) {
  try { await fs.access(p); return true; } catch { return false; }
}

async function checkAndReleaseStaleLock() {
  try {
    const raw = await fs.readFile(LOCK, 'utf8');
    const lock = JSON.parse(raw);
    const age = Date.now() - new Date(lock.started_at).getTime();
    if (age >= STALE_MS) {
      // Stale lock detected — auto-release
      await fs.unlink(LOCK);
      return { stale_lock_released: true, stale_round: lock.active_round, stale_age_min: Math.round(age / 60000) };
    }
    return { locked: true, active_round: lock.active_round, age_min: Math.round(age / 60000) };
  } catch (err) {
    if (err.code === 'ENOENT') return { locked: false };
    // corrupted lock file — remove it
    try { await fs.unlink(LOCK); } catch {}
    return { locked: false, corrupted_lock_cleaned: true };
  }
}

async function main() {
  // 0. Stale lock auto-cleanup (must run before all other checks)
  const lockState = await checkAndReleaseStaleLock();
  if (lockState.stale_lock_released) {
    // Log to stderr for observability
    console.error(`[exit-conditions] auto-released stale round ${lockState.stale_round} lock (${lockState.stale_age_min} min old)`);
  }
  if (lockState.locked && !lockState.stale_lock_released) {
    // Active lock — another round is running, should not start new one
    console.log(JSON.stringify({
      should_exit: true,
      reason: 'active-lock',
      active_round: lockState.active_round,
      lock_age_min: lockState.age_min,
    }));
    return;
  }

  const cp = await readCheckpoint();

  // 1. target reached
  const total = (cp.total?.papers || 0) + (cp.total?.projects || 0);
  if (total >= TARGET) {
    console.log(JSON.stringify({ should_exit: true, reason: 'target-reached', total }));
    return;
  }

  // 2. agent budget exceeded last round
  const lastAgents = cp.last_round_stats?.agent_count || 0;
  if (lastAgents > 850) {
    console.log(JSON.stringify({ should_exit: true, reason: 'agent-budget', last_agents: lastAgents }));
    return;
  }

  // 3. build streak fail-2
  if (cp.build_streak === 'fail-2') {
    console.log(JSON.stringify({ should_exit: true, reason: 'build-broken' }));
    return;
  }

  // 4. queue + rewrite_pool < 8（ALL pool empty）
  const totalQueue = (cp.queue?.papers || 0) + (cp.queue?.projects || 0) + (cp.rewrite_pool_available || 0);
  if (totalQueue < 8) {
    console.log(JSON.stringify({ should_exit: true, reason: 'queue-empty', total_queue: totalQueue }));
    return;
  }

  // 5. STOP_SIGNAL file
  if (await fileExists(path.join(ROOT, 'data/STOP_SIGNAL'))) {
    console.log(JSON.stringify({ should_exit: true, reason: 'user-stop' }));
    return;
  }

  // 6. context-pressure (estimate from events line count; 长 session 累计写大量事件)
  // 粗估：> 20000 events 视为 session 老了
  try {
    const eventsRaw = await fs.readFile(path.join(ROOT, 'data/pipeline-events.jsonl'), 'utf8');
    const eventCount = eventsRaw.split('\n').filter(Boolean).length;
    if (eventCount > 20000) {
      console.log(JSON.stringify({ should_exit: true, reason: 'context-pressure', events: eventCount }));
      return;
    }
  } catch {}

  // continue
  console.log(JSON.stringify({
    should_exit: false,
    reason: null,
    total,
    queue: totalQueue,
    rewrite_pool: cp.rewrite_pool_available || 0,
    build_streak: cp.build_streak,
    next_round: (cp.round_n || 0) + 1,
    stale_lock_released: lockState.stale_lock_released || false,
  }));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => { console.error('exit-conditions failed:', err); process.exit(1); });
}

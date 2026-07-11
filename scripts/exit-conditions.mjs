#!/usr/bin/env node
// 6 条退出判定，输出 {should_exit: bool, reason: string}
// 用法：node scripts/exit-conditions.mjs

import fs from 'node:fs/promises';
import path from 'node:path';
import { read as readCheckpoint } from './checkpoint.mjs';
import { DATA_DIR, PIPELINE_EVENTS_PATH } from './lib/paths.mjs';

const OPERATIONS_POLICY_PATH = path.join(DATA_DIR, 'operations-policy.json');

export function evaluateBulkPolicy(policy) {
  const bulk = policy?.bulk_production;
  if (bulk?.enabled !== true) {
    return { enabled: false, reason: 'bulk-production-disabled' };
  }
  if (
    bulk.requires_explicit_operator_approval !== true
    || bulk.approval_status !== 'APPROVED'
    || !Number.isSafeInteger(bulk.approved_target)
    || bulk.approved_target <= 0
  ) {
    return { enabled: false, reason: 'bulk-production-unapproved' };
  }
  return { enabled: true, approved_target: bulk.approved_target };
}

export async function loadBulkPolicy(policyPath = OPERATIONS_POLICY_PATH) {
  try {
    const policy = JSON.parse(await fs.readFile(policyPath, 'utf8'));
    return { ...evaluateBulkPolicy(policy), policy_state: 'loaded' };
  } catch (error) {
    return {
      enabled: false,
      reason: 'bulk-production-disabled',
      policy_state: error?.code === 'ENOENT' ? 'missing' : 'invalid',
    };
  }
}

async function fileExists(p) {
  try { await fs.access(p); return true; } catch { return false; }
}

async function main() {
  const bulkPolicy = await loadBulkPolicy();
  if (!bulkPolicy.enabled) {
    console.log(JSON.stringify({
      should_exit: true,
      reason: bulkPolicy.reason,
      policy_state: bulkPolicy.policy_state,
    }));
    return;
  }
  const cp = await readCheckpoint();
  const total = (cp.total?.papers || 0) + (cp.total?.projects || 0);

  if (total >= bulkPolicy.approved_target) {
    console.log(JSON.stringify({
      should_exit: true,
      reason: 'approved-target-reached',
      total,
      approved_target: bulkPolicy.approved_target,
    }));
    return;
  }

  // 1. agent budget exceeded last round
  const lastAgents = cp.last_round_stats?.agent_count || 0;
  if (lastAgents > 850) {
    console.log(JSON.stringify({ should_exit: true, reason: 'agent-budget', last_agents: lastAgents }));
    return;
  }

  // 2. build streak fail-2
  if (cp.build_streak === 'fail-2') {
    console.log(JSON.stringify({ should_exit: true, reason: 'build-broken' }));
    return;
  }

  // 3. queue + rewrite_pool < 8（ALL pool empty）
  const totalQueue = (cp.queue?.papers || 0) + (cp.queue?.projects || 0) + (cp.rewrite_pool_available || 0);
  if (totalQueue < 8) {
    console.log(JSON.stringify({ should_exit: true, reason: 'queue-empty', total_queue: totalQueue }));
    return;
  }

  // 4. STOP_SIGNAL file
  if (await fileExists(path.join(DATA_DIR, 'STOP_SIGNAL'))) {
    console.log(JSON.stringify({ should_exit: true, reason: 'user-stop' }));
    return;
  }

  // 5. context-pressure (estimate from events line count; 长 session 累计写大量事件)
  // 粗估：> 20000 events 视为 session 老了
  try {
    const eventsRaw = await fs.readFile(PIPELINE_EVENTS_PATH, 'utf8');
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
  }));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => { console.error('exit-conditions failed:', err); process.exit(1); });
}

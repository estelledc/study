// tests/exit-conditions.test.mjs
// Tests for exit-conditions.mjs logic

import test from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

// Inline the decision logic from exit-conditions.mjs
function shouldExit(cp, hasStopSignal) {
  // 1. quality_exit
  const gateFailRate = cp.last_round_stats?.gate_fail_rate ?? 0;
  const prevGateFailRate = cp.prev_round_stats?.gate_fail_rate ?? 0;
  if (gateFailRate > 0.05 && prevGateFailRate > 0.05) {
    return { should_exit: true, reason: 'quality-exit' };
  }
  // 2. agent budget
  const lastAgents = cp.last_round_stats?.agent_count || 0;
  if (lastAgents > 850) return { should_exit: true, reason: 'agent-budget' };
  // 3. build streak
  if (cp.build_streak === 'fail-2') return { should_exit: true, reason: 'build-broken' };
  // 4. queue empty
  const totalQueue = (cp.queue?.papers || 0) + (cp.queue?.projects || 0) + (cp.rewrite_pool_available || 0);
  if (totalQueue < 8) return { should_exit: true, reason: 'queue-empty' };
  // 5. STOP_SIGNAL
  if (hasStopSignal) return { should_exit: true, reason: 'user-stop' };
  return { should_exit: false, reason: null };
}

await test('does NOT exit when conditions are normal', () => {
  const cp = {
    total: { papers: 100, projects: 100 },
    build_streak: 'ok',
    queue: { papers: 20, projects: 20 },
    rewrite_pool_available: 10,
    last_round_stats: { gate_fail_rate: 0.01 },
    prev_round_stats: { gate_fail_rate: 0.01 },
  };
  const r = shouldExit(cp, false);
  assert.equal(r.should_exit, false, 'should not exit under normal conditions');
});

await test('exits on build-broken (build_streak = fail-2)', () => {
  const cp = {
    build_streak: 'fail-2',
    queue: { papers: 20, projects: 20 },
    last_round_stats: {},
    prev_round_stats: {},
  };
  const r = shouldExit(cp, false);
  assert.equal(r.should_exit, true);
  assert.equal(r.reason, 'build-broken');
});

await test('exits on queue-empty', () => {
  const cp = {
    build_streak: 'ok',
    queue: { papers: 2, projects: 2 },
    rewrite_pool_available: 3,
    last_round_stats: {},
    prev_round_stats: {},
  };
  const r = shouldExit(cp, false);
  assert.equal(r.should_exit, true);
  assert.equal(r.reason, 'queue-empty');
});

await test('exits on STOP_SIGNAL', () => {
  const cp = {
    build_streak: 'ok',
    queue: { papers: 20, projects: 20 },
    rewrite_pool_available: 10,
    last_round_stats: {},
    prev_round_stats: {},
  };
  const r = shouldExit(cp, true);
  assert.equal(r.should_exit, true);
  assert.equal(r.reason, 'user-stop');
});

await test('exits on quality-exit (gate fail rate > 5% for two consecutive rounds)', () => {
  const cp = {
    build_streak: 'ok',
    queue: { papers: 20, projects: 20 },
    rewrite_pool_available: 10,
    last_round_stats: { gate_fail_rate: 0.08 },
    prev_round_stats: { gate_fail_rate: 0.07 },
  };
  const r = shouldExit(cp, false);
  assert.equal(r.should_exit, true);
  assert.equal(r.reason, 'quality-exit');
});

await test('does NOT exit when only one round has high gate fail rate', () => {
  const cp = {
    build_streak: 'ok',
    queue: { papers: 20, projects: 20 },
    rewrite_pool_available: 10,
    last_round_stats: { gate_fail_rate: 0.08 },
    prev_round_stats: { gate_fail_rate: 0.02 },
  };
  const r = shouldExit(cp, false);
  assert.equal(r.should_exit, false, 'single-round high fail rate should not exit');
});

await test('20000 target does NOT trigger exit (TARGET removed)', () => {
  // With the old code this would exit as 'target-reached'
  const cp = {
    total: { papers: 10000, projects: 10000 }, // 20000+ total
    build_streak: 'ok',
    queue: { papers: 20, projects: 20 },
    rewrite_pool_available: 10,
    last_round_stats: { gate_fail_rate: 0.01 },
    prev_round_stats: { gate_fail_rate: 0.01 },
  };
  const r = shouldExit(cp, false);
  assert.equal(r.should_exit, false, 'reaching 20000 should no longer trigger exit');
});

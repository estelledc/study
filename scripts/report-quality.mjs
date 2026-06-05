#!/usr/bin/env node
// 生成质量基线报告 data/quality-baseline.json，并可与已存在基线对比（--check）
//
// 用法：
//   node scripts/report-quality.mjs           # 生成/更新基线
//   node scripts/report-quality.mjs --check   # 对比基线，不一致则退出码 1

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const BASELINE_PATH = path.join(ROOT, 'data/quality-baseline.json');
const CHECK_ONLY = process.argv.includes('--check');

async function countMdFiles(dir) {
  try {
    const entries = await fs.readdir(dir);
    return entries.filter(f => f.endsWith('.md') && !f.startsWith('_')).length;
  } catch {
    return 0;
  }
}

async function countL4Queue() {
  try {
    const raw = await fs.readFile(path.join(ROOT, 'data/l4-backfill-queue.jsonl'), 'utf8');
    return raw.split('\n').filter(Boolean).length;
  } catch {
    return null;
  }
}

function getBuildSeconds() {
  try {
    // Check build-seconds.txt if it exists (written by CI)
    const raw = require('fs').readFileSync(path.join(ROOT, 'data/build-seconds.txt'), 'utf8');
    return parseInt(raw.trim(), 10);
  } catch {
    return null; // Not available outside CI
  }
}

async function runGateCount() {
  try {
    const result = execSync(
      'node scripts/quality-gate-all.mjs --json 2>&1',
      { cwd: ROOT, encoding: 'utf8', timeout: 180000 }
    );
    const parsed = JSON.parse(result);
    return { total: parsed.total, passed: parsed.passed, failed: parsed.failed };
  } catch (err) {
    // Parse from stderr/stdout if JSON output is after error messages
    const output = err.stdout || err.output?.join('') || '';
    const jsonMatch = output.match(/\{[\s\S]*"total"[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        return { total: parsed.total, passed: parsed.passed, failed: parsed.failed };
      } catch {}
    }
    return null;
  }
}

async function main() {
  console.log('Collecting quality metrics...');

  const papersCount = await countMdFiles(path.join(ROOT, 'src/content/docs/papers'));
  const projectsCount = await countMdFiles(path.join(ROOT, 'src/content/docs/projects'));
  const l4Queue = await countL4Queue();
  const gateStats = await runGateCount();
  const gatePassRate = gateStats ? (gateStats.passed / gateStats.total) : null;

  const report = {
    generated: new Date().toISOString(),
    papers_count: papersCount,
    projects_count: projectsCount,
    total_notes: papersCount + projectsCount,
    gate_pass_total: gateStats?.passed ?? null,
    gate_fail_total: gateStats?.failed ?? null,
    gate_pass_rate: gatePassRate ? Math.round(gatePassRate * 10000) / 100 : null,
    l4_backfill_queue: l4Queue,
    broken_links: null, // populated after build by check-links
  };

  console.log('Quality report:');
  console.log(`  total notes:     ${report.total_notes}`);
  console.log(`  gate pass rate:  ${report.gate_pass_rate}%`);
  console.log(`  l4 queue:        ${report.l4_backfill_queue}`);

  if (CHECK_ONLY) {
    let baseline;
    try {
      baseline = JSON.parse(await fs.readFile(BASELINE_PATH, 'utf8'));
    } catch {
      console.error('No baseline found. Run without --check to generate one.');
      process.exit(1);
    }

    const issues = [];
    if (report.gate_pass_total !== null && report.gate_pass_total < baseline.gate_pass_total) {
      issues.push(`gate pass regressed: ${report.gate_pass_total} < baseline ${baseline.gate_pass_total}`);
    }
    if (report.gate_fail_total > 0) {
      issues.push(`gate failures: ${report.gate_fail_total}`);
    }

    if (issues.length) {
      console.error('quality baseline check FAILED:');
      for (const issue of issues) console.error(`  ${issue}`);
      process.exit(1);
    }
    console.log('quality baseline check: OK');
  } else {
    await fs.mkdir(path.dirname(BASELINE_PATH), { recursive: true });
    await fs.writeFile(BASELINE_PATH, JSON.stringify(report, null, 2));
    console.log(`Wrote ${BASELINE_PATH}`);
  }
}

main().catch(err => {
  console.error('report-quality error:', err);
  process.exit(1);
});

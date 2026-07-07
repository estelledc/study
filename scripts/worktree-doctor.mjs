#!/usr/bin/env node
// Check the eight study production worktrees without mutating them by default.

import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { ROOT } from './lib/paths.mjs';
import { allWorktrees } from './lib/worktrees.mjs';

function defaultRunGit(args, cwd = ROOT) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    json: false,
    strict: false,
    fix: false,
    dryRun: false,
    checkHead: false,
    home: process.env.HOME,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--json') args.json = true;
    else if (arg === '--strict') args.strict = true;
    else if (arg === '--fix') args.fix = true;
    else if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--check-head') args.checkHead = true;
    else if (arg === '--home') args.home = argv[++i];
    else throw new Error(`Unknown arg: ${arg}`);
  }
  return args;
}

export function inspectWorktree(worktree, options = {}) {
  const exists = options.exists || fs.existsSync;
  const runGit = options.runGit || defaultRunGit;
  const result = {
    ...worktree,
    exists: false,
    is_git_worktree: false,
    expected_branch: worktree.branch,
    branch: null,
    clean: null,
    head: null,
    expected_head: options.expectedHead || null,
    ok: false,
    issues: [],
  };

  if (!exists(worktree.path)) {
    result.issues.push('missing');
    return result;
  }
  result.exists = true;

  try {
    result.is_git_worktree = runGit(['rev-parse', '--is-inside-work-tree'], worktree.path) === 'true';
  } catch {
    result.issues.push('not-git-worktree');
    return result;
  }
  if (!result.is_git_worktree) {
    result.issues.push('not-git-worktree');
    return result;
  }

  try {
    result.branch = runGit(['branch', '--show-current'], worktree.path);
    if (result.branch !== result.expected_branch) result.issues.push(`branch-mismatch:${result.branch || 'detached'}`);
  } catch {
    result.issues.push('branch-read-failed');
  }

  try {
    result.clean = runGit(['status', '--porcelain'], worktree.path) === '';
    if (!result.clean) result.issues.push('dirty');
  } catch {
    result.issues.push('status-read-failed');
  }

  try {
    result.head = runGit(['rev-parse', 'HEAD'], worktree.path);
    if (options.checkHead && options.expectedHead && result.head !== options.expectedHead) {
      result.issues.push('head-mismatch');
    }
  } catch {
    result.issues.push('head-read-failed');
  }

  result.ok = result.issues.length === 0;
  return result;
}

export function inspectWorktrees(options = {}) {
  const runGit = options.runGit || defaultRunGit;
  const worktrees = options.worktrees || allWorktrees(options.home);
  const expectedHead = options.checkHead
    ? (options.expectedHead || runGit(['rev-parse', 'HEAD'], ROOT))
    : null;
  const results = worktrees.map((worktree) => inspectWorktree(worktree, {
    ...options,
    runGit,
    expectedHead,
  }));
  return {
    ok: results.every((result) => result.ok),
    checked: results.length,
    healthy: results.filter((result) => result.ok).length,
    missing: results.filter((result) => result.issues.includes('missing')).length,
    results,
  };
}

function renderHuman(report) {
  const lines = [
    `[worktree-doctor] ${report.healthy}/${report.checked} healthy, ${report.missing} missing`,
  ];
  for (const result of report.results) {
    const status = result.ok ? 'ok' : result.issues.join(', ');
    lines.push(`  ${result.name.padEnd(10)} ${status} ${result.path}`);
  }
  return lines.join('\n');
}

export function fixMissing(report, args, runGit = defaultRunGit) {
  const unfixable = report.results.filter((result) =>
    !result.ok && !result.issues.every((issue) => issue === 'missing')
  );
  if (unfixable.length) {
    throw new Error(`Refusing --fix: non-missing worktree issues: ${unfixable.map((r) => `${r.name}:${r.issues.join(',')}`).join('; ')}`);
  }

  const missing = report.results.filter((result) => result.issues.includes('missing'));
  for (const worktree of missing) {
    const cmd = ['worktree', 'add', '-b', worktree.expected_branch, worktree.path, 'HEAD'];
    if (args.dryRun) {
      console.log(`[DRY] git ${cmd.join(' ')}`);
    } else {
      runGit(cmd, ROOT);
      console.log(`created ${worktree.name}: ${worktree.path}`);
    }
  }
}

async function main() {
  const args = parseArgs();
  const report = inspectWorktrees({ home: args.home, checkHead: args.checkHead });

  if (args.json) console.log(JSON.stringify(report, null, 2));
  else console.log(renderHuman(report));

  if (args.fix) fixMissing(report, args);
  if (args.strict && !report.ok) process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(`worktree-doctor failed: ${err.message}`);
    process.exit(2);
  });
}

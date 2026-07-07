#!/usr/bin/env node

import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

import { CANDIDATES_PATH, docsEntryPath, REWRITE_POOL_PATH, ROOT } from './lib/paths.mjs';
import { validateWorkerResults } from './lib/auto-round.mjs';
import {
  ATLAS_ALLOWED,
  RUNTIME_ALLOWED,
  assertAllowedFiles,
  atlasCommitMessage,
  claimCommitMessage,
  dispatchIssues,
  finalGateIssues,
  runtimeCommitMessage,
} from './lib/round-utils.mjs';
import {
  currentBranch,
  gitOutput,
  requireCleanWorktree,
  statusPorcelain,
  validateCommitHash,
} from './lib/git.mjs';

const MAX_BUFFER = 100 * 1024 * 1024;

function parseArgs(argv = process.argv.slice(2)) {
  const command = argv[0];
  const args = {
    command,
    rewrite: 0,
    new: 4,
    dryRun: false,
    slug: null,
    area: null,
    commit: null,
    lines: null,
    results: null,
  };
  for (let i = 1; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--rewrite') args.rewrite = parseInt(argv[++i], 10);
    else if (arg === '--new') args.new = parseInt(argv[++i], 10);
    else if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--slug') args.slug = argv[++i];
    else if (arg === '--area') args.area = argv[++i];
    else if (arg === '--commit') args.commit = argv[++i];
    else if (arg === '--lines') args.lines = parseInt(argv[++i], 10);
    else if (arg === '--results') args.results = argv[++i];
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

function run(cmd, args, options = {}) {
  const result = spawnSync(cmd, args, {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: options.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    maxBuffer: MAX_BUFFER,
  });
  if (options.capture) {
    if (options.echo) {
      process.stdout.write(result.stdout || '');
      process.stderr.write(result.stderr || '');
    }
  }
  const status = result.status ?? 1;
  if (status !== 0 && !options.allowFailure) {
    const detail = [result.stderr, result.stdout].filter(Boolean).join('\n').trim();
    throw new Error(`${cmd} ${args.join(' ')} failed with exit code ${status}${detail ? `\n${detail}` : ''}`);
  }
  return result;
}

function runNode(script, args = [], options = {}) {
  return run(process.execPath, [script, ...args], options);
}

function runNpm(script, args = [], options = {}) {
  return run('npm', ['run', script, ...args], options);
}

function requireMainClean() {
  const branch = currentBranch(ROOT);
  if (branch !== 'main') throw new Error(`must run on main, current branch is ${branch || 'detached'}`);
  requireCleanWorktree(ROOT);
}

function statusFiles() {
  const status = statusPorcelain(ROOT);
  if (!status) return [];
  return status.split('\n')
    .filter(Boolean)
    .map((line) => line.slice(3).replace(/^.* -> /, ''));
}

function commitAllowedChanges(allowed, message, label) {
  const files = statusFiles();
  if (files.length === 0) {
    console.log(`[round] no ${label} changes to commit`);
    return false;
  }
  assertAllowedFiles(files, allowed, label);
  run('git', ['add', '--', ...files]);
  run('git', ['diff', '--cached', '--name-only']);
  run('git', ['commit', '-m', message]);
  return true;
}

function parseJsonOutput(result, label) {
  try {
    return JSON.parse(result.stdout);
  } catch (err) {
    throw new Error(`${label} did not return JSON: ${err.message}`);
  }
}

function dispatchDryRun(args, options = {}) {
  const result = runNode('scripts/dispatch-batch.mjs', [
    '--rewrite', String(args.rewrite),
    '--new', String(args.new),
    '--dry-run',
  ], { capture: true, echo: options.echo ?? true });
  const output = parseJsonOutput(result, 'dispatch dry-run');
  const issues = dispatchIssues(output);
  if (issues.length > 0) {
    throw new Error(`dispatch dry-run blocked: ${issues.join('; ')}`);
  }
  return output;
}

function pipelineSummaryJson() {
  const result = runNode('scripts/pipeline-summary.mjs', ['--json'], { capture: true });
  return parseJsonOutput(result, 'pipeline summary');
}

function snapshot(label) {
  console.log(`[round] snapshot: ${label}`);
  run('git', ['status', '--short', '--branch']);
  runNpm('status:pipeline');
}

function validateSlug(slug) {
  if (!/^[a-z0-9][a-z0-9_.-]*$/.test(slug || '')) {
    throw new Error(`Invalid slug: ${slug || '<empty>'}`);
  }
  return slug;
}

function validateArea(area) {
  if (area !== 'papers' && area !== 'projects') {
    throw new Error(`Invalid area: ${area || '<empty>'}`);
  }
  return area;
}

function validateMergeArgs(args) {
  validateSlug(args.slug);
  validateArea(args.area);
  validateCommitHash(args.commit);
  if (!Number.isInteger(args.lines) || args.lines <= 0) {
    throw new Error(`Invalid lines: ${args.lines || '<empty>'}`);
  }
  return args;
}

function roundPreflight(args) {
  requireMainClean();
  runNpm('verify:pipeline');
  runNpm('build:strict');
  runNpm('status:pipeline');
  dispatchDryRun(args);
}

function runCapturedToStderr(cmd, args, label) {
  const result = run(cmd, args, { capture: true });
  if (result.stdout) process.stderr.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (label) process.stderr.write(`[round] ${label} passed\n`);
  return result;
}

function roundAutoPrepare(args) {
  requireMainClean();
  runCapturedToStderr('npm', ['run', 'verify:pipeline'], 'verify:pipeline');
  runCapturedToStderr('npm', ['run', 'build:strict'], 'build:strict');
  runCapturedToStderr('npm', ['run', 'status:pipeline'], 'status:pipeline');
  const output = dispatchDryRun(args, { echo: false });
  console.log(JSON.stringify(output, null, 2));
}

function roundDispatch(args) {
  requireMainClean();
  dispatchDryRun(args);
  if (args.dryRun) {
    console.log('[round] dry-run only; queue state was not changed');
    return;
  }

  snapshot('before dispatch');
  runNode('scripts/dispatch-batch.mjs', [
    '--rewrite', String(args.rewrite),
    '--new', String(args.new),
  ]);
  commitAllowedChanges(RUNTIME_ALLOWED, claimCommitMessage(args.rewrite + args.new), 'runtime');
  snapshot('after dispatch');
}

function roundMergeOne(args) {
  validateMergeArgs(args);
  if (args.dryRun) {
    requireMainClean();
    gitOutput(['cat-file', '-e', `${args.commit}^{commit}`], { cwd: ROOT });
    const target = docsEntryPath(args.area, args.slug);
    console.log(`[round] dry-run merge-one`);
    console.log(`  slug: ${args.slug}`);
    console.log(`  area: ${args.area}`);
    console.log(`  commit: ${args.commit}`);
    console.log(`  target: ${target}`);
    console.log('  steps: sync-and-merge-single -> quality-gate -> build:strict -> atlas commit -> runtime sync commit');
    return;
  }

  requireMainClean();
  snapshot(`before merge ${args.slug}`);
  runNode('scripts/sync-and-merge-single.mjs', [
    '--slug', args.slug,
    '--commit', args.commit,
    '--area', args.area,
    '--lines', String(args.lines),
  ]);

  const target = docsEntryPath(args.area, args.slug);
  runNode('scripts/quality-gate.mjs', [target]);
  runNpm('build:strict');
  commitAllowedChanges(ATLAS_ALLOWED, atlasCommitMessage(args.slug), 'atlas');

  runNode('scripts/sync-written.mjs');
  runNode('scripts/build-rewrite-pool.mjs', ['--incremental']);
  commitAllowedChanges(RUNTIME_ALLOWED, runtimeCommitMessage(args.slug), 'runtime');
  snapshot(`after merge ${args.slug}`);
  requireCleanWorktree(ROOT);
}

function roundFinalGate() {
  requireMainClean();
  run('git', ['log', '--oneline', 'origin/main..HEAD']);
  runNpm('verify:pipeline');
  runNpm('build:strict');
  run('git', ['status', '--short', '--branch']);
  runNpm('status:pipeline');

  const issues = finalGateIssues(pipelineSummaryJson(), statusPorcelain(ROOT));
  if (issues.length > 0) {
    throw new Error(`final gate failed: ${issues.join('; ')}`);
  }
  console.log('[round] final gate passed: clean, claimed=0, failures=0');
}

function roundSyncWorktrees() {
  requireMainClean();
  const summary = pipelineSummaryJson();
  const issues = finalGateIssues(summary, '');
  if (issues.length > 0) {
    throw new Error(`refusing worktree sync: ${issues.join('; ')}`);
  }

  const doctor = runNode('scripts/worktree-doctor.mjs', ['--json', '--strict'], { capture: true, echo: true });
  const report = parseJsonOutput(doctor, 'worktree doctor');
  if (!report.ok || report.healthy !== 8) {
    throw new Error(`refusing worktree sync: healthy=${report.healthy}/${report.checked}`);
  }

  const target = gitOutput(['rev-parse', 'HEAD'], { cwd: ROOT });
  console.log(`[round] sync 8 worktrees to ${target}`);
  for (const worktree of report.results) {
    run('git', ['-C', worktree.path, 'reset', '--hard', target]);
    run('git', ['-C', worktree.path, 'clean', '-fd']);
  }
}

function readJsonlSync(filePath) {
  if (!fs.existsSync(filePath)) return [];
  return fs.readFileSync(filePath, 'utf8')
    .split('\n')
    .filter((line) => line.trim())
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (err) {
        throw new Error(`${filePath}:${index + 1} invalid JSON: ${err.message}`);
      }
    });
}

function parseResultsArg(raw) {
  if (!raw) throw new Error('--results is required');
  const text = fs.existsSync(raw) ? fs.readFileSync(raw, 'utf8') : raw;
  return JSON.parse(text);
}

function roundAutoAdvance(args) {
  requireMainClean();
  const candidates = readJsonlSync(CANDIDATES_PATH);
  const pool = readJsonlSync(REWRITE_POOL_PATH);
  const mergeArgs = validateWorkerResults({ candidates, pool }, parseResultsArg(args.results));
  for (const mergeArg of mergeArgs) {
    roundMergeOne({ ...args, ...mergeArg, dryRun: false });
  }
  roundFinalGate();
  roundSyncWorktrees();
}

function main() {
  const args = parseArgs();
  if (!args.command) {
    throw new Error('usage: node scripts/round.mjs <preflight|dispatch|merge-one|final-gate|sync-worktrees> [args]');
  }
  if (args.command === 'preflight') roundPreflight(args);
  else if (args.command === 'dispatch') roundDispatch(args);
  else if (args.command === 'merge-one') roundMergeOne(args);
  else if (args.command === 'final-gate') roundFinalGate(args);
  else if (args.command === 'sync-worktrees') roundSyncWorktrees(args);
  else if (args.command === 'auto-prepare') roundAutoPrepare(args);
  else if (args.command === 'auto-advance') roundAutoAdvance(args);
  else throw new Error(`Unknown command: ${args.command}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    main();
  } catch (err) {
    console.error(`[round] ${err.message}`);
    process.exit(1);
  }
}

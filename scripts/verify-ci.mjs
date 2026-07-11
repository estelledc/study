#!/usr/bin/env node
// Portable PR/deploy gate. Actions job name must stay `verify:ci`.

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ROOT } from './lib/paths.mjs';

const COMMIT_SHA_RE = /^[0-9a-f]{40}$/i;
const NOTE_RE = /^src\/content\/docs\/(papers|projects)\/[^/]+\.md$/;

export function changedFromRef(env = process.env) {
  const ref = String(env.STUDY_CHANGED_FROM || '').trim();
  if (!COMMIT_SHA_RE.test(ref) || /^0{40}$/.test(ref)) return null;
  return ref;
}

export function listChangedNotes(fromRef, runner = null) {
  if (!fromRef) return [];
  const execute =
    runner ||
    ((args) =>
      spawnSync('git', args, {
        cwd: ROOT,
        encoding: 'utf8',
        env: process.env,
      }));
  const result = execute(['diff', '--name-only', '--diff-filter=ACMR', `${fromRef}...HEAD`]);
  if ((result.status ?? 1) !== 0) {
    throw new Error(`git diff failed against ${fromRef}: ${result.stderr || result.stdout || ''}`);
  }
  return String(result.stdout || '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => NOTE_RE.test(line));
}

export function buildCiSteps(env = process.env, notePaths = null) {
  const fromRef = changedFromRef(env);
  const notes = notePaths ?? (fromRef ? listChangedNotes(fromRef) : []);
  const steps = [
    { name: 'tests', command: 'npm', args: ['test'] },
    { name: 'repository audits', command: 'npm', args: ['run', 'audit'] },
  ];

  // Large content PRs (full-corpus audits) skip per-file gates; rely on audit + build.
  const QUALITY_GATE_LIMIT = 100;
  if (notes.length > 0 && notes.length <= QUALITY_GATE_LIMIT) {
    for (const note of notes) {
      steps.push({
        name: `quality-gate ${note}`,
        command: 'node',
        args: ['scripts/quality-gate.mjs', note],
      });
    }
  } else if (notes.length > QUALITY_GATE_LIMIT) {
    console.log(
      `[verify:ci] skipping per-file quality-gate for ${notes.length} changed notes (>${QUALITY_GATE_LIMIT}); audit+build still run`,
    );
  }

  steps.push(
    {
      name: 'strict build',
      command: 'npm',
      args: ['run', 'build:strict', ...(env.STUDY_BUILD_LOG ? ['--', '--log', env.STUDY_BUILD_LOG] : [])],
    },
    { name: 'homepage and base links', command: 'npm', args: ['run', 'audit:homepage-dist-links'] },
    { name: 'diff whitespace', command: 'git', args: ['diff', '--check'] },
  );

  return steps;
}

export function runCiSteps(steps, runner = null) {
  const execute =
    runner ||
    ((step) =>
      spawnSync(step.command, step.args, {
        cwd: ROOT,
        stdio: 'inherit',
        env: process.env,
      }).status ?? 1);

  for (const step of steps) {
    console.log(`[verify:ci] ${step.name}`);
    const status = execute(step);
    if (status !== 0) return { ok: false, failed: step.name, status };
  }
  return { ok: true, failed: null, status: 0 };
}

function main() {
  let steps;
  try {
    steps = buildCiSteps();
  } catch (error) {
    console.error(`[verify:ci] ${error.message}`);
    process.exit(1);
  }

  const noteCount = steps.filter((step) => step.name.startsWith('quality-gate ')).length;
  console.log(`[verify:ci] changed notes under quality-gate: ${noteCount}`);

  const result = runCiSteps(steps);
  if (!result.ok) {
    console.error(`[verify:ci] failed at "${result.failed}" (exit ${result.status})`);
    process.exit(result.status || 1);
  }
  console.log('[verify:ci] all portable PR and deploy gates passed.');
}

if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1] || '')) main();

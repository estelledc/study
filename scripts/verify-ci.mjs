#!/usr/bin/env node
// Portable PR/deploy gate. Actions job name must stay `verify:ci`.

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ROOT } from './lib/paths.mjs';

const COMMIT_SHA_RE = /^[0-9a-f]{40}$/i;

export function changedFromArgs(env = process.env) {
  const ref = String(env.STUDY_CHANGED_FROM || '').trim();
  if (!COMMIT_SHA_RE.test(ref) || /^0{40}$/.test(ref)) return [];
  return ['--changed-from', ref];
}

export function whitespaceDiffArgs(env = process.env) {
  const ref = String(env.STUDY_CHANGED_FROM || '').trim();
  if (!COMMIT_SHA_RE.test(ref) || /^0{40}$/.test(ref)) return ['diff', '--check'];
  return ['diff', '--check', `${ref}...HEAD`];
}

export function freshnessAsOf(env = process.env, now = new Date()) {
  const explicit = String(env.STUDY_FRESHNESS_AS_OF || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(explicit)) return explicit;
  return now.toISOString().slice(0, 10);
}

export function buildCiSteps(env = process.env) {
  const changedArgs = changedFromArgs(env);
  return [
  { name: 'toolchain contract', command: 'node', args: ['scripts/audit-toolchain.mjs'] },
  { name: 'tests', command: 'npm', args: ['test'] },
  { name: 'repository audits', command: 'npm', args: ['run', 'audit'] },
  { name: 'site state source of truth', command: 'npm', args: ['run', 'audit:site-state'] },
  { name: 'learning paths source of truth', command: 'npm', args: ['run', 'audit:learning-paths'] },
  { name: 'research benchmark', command: 'npm', args: ['run', 'audit:research'] },
  { name: 'research labs', command: 'npm', args: ['run', 'test:research-labs'] },
  { name: 'project standard snapshot', command: 'npm', args: ['run', 'audit:project-standard'] },
  {
    name: 'content contract',
    command: 'node',
    args: ['scripts/audit-content-contract.mjs', '--json', ...changedArgs],
  },
  ...(changedArgs.length > 0 ? [{
    name: 'changed-note quality gate',
    command: 'node',
    args: ['scripts/quality-gate.mjs', ...changedArgs, '--json'],
  }] : []),
  { name: 'template similarity report', command: 'node', args: ['scripts/analyze-template-similarity.mjs', '--json'] },
  {
    name: 'freshness lifecycle',
    command: 'node',
    args: ['scripts/audit-freshness.mjs', '--as-of', freshnessAsOf(env), '--json'],
  },
  { name: 'legacy audit review archive', command: 'npm', args: ['run', 'audit:legacy-reviews'] },
  { name: 'tracked-file redlines', command: 'node', args: ['scripts/audit-public-redlines.mjs', '--tracked', '--json'] },
  { name: 'action pins', command: 'node', args: ['scripts/audit-action-pins.mjs'] },
  { name: 'operation entrypoints', command: 'node', args: ['scripts/audit-operation-entrypoints.mjs'] },
  { name: 'operation document lifecycle', command: 'node', args: ['scripts/audit-doc-lifecycle.mjs'] },
  { name: 'asset contract', command: 'node', args: ['scripts/audit-assets.mjs', '--json'] },
  {
    name: 'strict build',
    command: 'npm',
    args: [
      'run',
      'build:strict',
      ...(env.STUDY_BUILD_LOG ? ['--', '--log', env.STUDY_BUILD_LOG] : []),
    ],
  },
  { name: 'homepage and base links', command: 'npm', args: ['run', 'audit:homepage-dist-links'] },
  { name: 'Pagefind query contract', command: 'node', args: ['scripts/audit-pagefind.mjs', '--json'] },
  { name: 'SEO output contract', command: 'node', args: ['scripts/audit-seo-output.mjs', '--json'] },
  { name: 'static accessibility contract', command: 'node', args: ['scripts/audit-a11y-static.mjs'] },
  { name: 'browser accessibility smoke', command: 'npm', args: ['run', 'test:a11y'] },
  { name: 'Pages artifact boundary', command: 'node', args: ['scripts/audit-pages-artifact.mjs'] },
  { name: 'Atlas performance budget', command: 'node', args: ['scripts/benchmark-atlas.mjs'] },
  { name: 'site performance budget', command: 'node', args: ['scripts/benchmark-site.mjs'] },
  { name: 'generated tracked output drift', command: 'git', args: ['diff', '--exit-code'] },
  { name: 'staged output drift', command: 'git', args: ['diff', '--cached', '--exit-code'] },
  { name: 'diff whitespace', command: 'git', args: whitespaceDiffArgs(env) },
  ];
}

export const CI_STEPS = buildCiSteps();

export function runCiSteps(steps = CI_STEPS, runner = null) {
  const initialDrift = runner ? null : {
    worktree: spawnSync('git', ['diff', '--binary'], {
      cwd: ROOT,
      encoding: 'buffer',
      maxBuffer: 100 * 1024 * 1024,
    }),
    staged: spawnSync('git', ['diff', '--cached', '--binary'], {
      cwd: ROOT,
      encoding: 'buffer',
      maxBuffer: 100 * 1024 * 1024,
    }),
  };
  if (initialDrift && (initialDrift.worktree.status !== 0 || initialDrift.staged.status !== 0)) {
    return { ok: false, failed: 'initial output drift snapshot', status: 1 };
  }

  const execute = runner || ((step) => spawnSync(step.command, step.args, {
    cwd: ROOT,
    stdio: 'inherit',
    env: process.env,
  }).status ?? 1);

  for (const step of steps) {
    console.log(`[verify:ci] ${step.name}`);
    let status;
    if (!runner && (step.name === 'generated tracked output drift' || step.name === 'staged output drift')) {
      const args = step.name === 'generated tracked output drift'
        ? ['diff', '--binary']
        : ['diff', '--cached', '--binary'];
      const before = step.name === 'generated tracked output drift'
        ? initialDrift.worktree.stdout
        : initialDrift.staged.stdout;
      const current = spawnSync('git', args, {
        cwd: ROOT,
        encoding: 'buffer',
        maxBuffer: 100 * 1024 * 1024,
      });
      status = current.status === 0 && Buffer.compare(before, current.stdout) === 0 ? 0 : 1;
      if (status !== 0) {
        console.error(`[verify:ci] ${step.name} changed after CI steps started.`);
      }
    } else {
      status = execute(step);
    }
    if (status !== 0) return { ok: false, failed: step.name, status };
  }
  return { ok: true, failed: null, status: 0 };
}

function main() {
  const result = runCiSteps();
  if (!result.ok) {
    console.error(`[verify:ci] failed at "${result.failed}" (exit ${result.status})`);
    process.exit(result.status || 1);
  }
  console.log('[verify:ci] all portable PR and deploy gates passed.');
}

if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1] || '')) main();

#!/usr/bin/env node

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

export function freshnessAsOf(env = process.env, now = new Date()) {
  const explicit = String(env.STUDY_FRESHNESS_AS_OF || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(explicit)) return explicit;
  return now.toISOString().slice(0, 10);
}

export function buildCiSteps(env = process.env) {
  const changedArgs = changedFromArgs(env);
  return [
  { name: 'tests', command: 'npm', args: ['test'] },
  { name: 'repository audits', command: 'npm', args: ['run', 'audit'] },
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
  { name: 'tracked-file redlines', command: 'node', args: ['scripts/audit-public-redlines.mjs', '--tracked', '--json'] },
  { name: 'action pins', command: 'node', args: ['scripts/audit-action-pins.mjs'] },
  { name: 'operation entrypoints', command: 'node', args: ['scripts/audit-operation-entrypoints.mjs'] },
  { name: 'operation document lifecycle', command: 'node', args: ['scripts/audit-doc-lifecycle.mjs'] },
  { name: 'asset contract', command: 'node', args: ['scripts/audit-assets.mjs', '--json'] },
  { name: 'strict build', command: 'npm', args: ['run', 'build:strict'] },
  { name: 'homepage and base links', command: 'npm', args: ['run', 'audit:homepage-dist-links'] },
  { name: 'Pagefind query contract', command: 'node', args: ['scripts/audit-pagefind.mjs', '--json'] },
  { name: 'SEO output contract', command: 'node', args: ['scripts/audit-seo-output.mjs', '--json'] },
  { name: 'static accessibility contract', command: 'node', args: ['scripts/audit-a11y-static.mjs'] },
  { name: 'browser accessibility smoke', command: 'npm', args: ['run', 'test:a11y'] },
  { name: 'Pages artifact boundary', command: 'node', args: ['scripts/audit-pages-artifact.mjs'] },
  { name: 'Atlas performance budget', command: 'node', args: ['scripts/benchmark-atlas.mjs'] },
  { name: 'site performance budget', command: 'node', args: ['scripts/benchmark-site.mjs'] },
  { name: 'diff whitespace', command: 'git', args: ['diff', '--check'] },
  ];
}

export const CI_STEPS = buildCiSteps();

export function runCiSteps(steps = CI_STEPS, runner = null) {
  const execute = runner || ((step) => spawnSync(step.command, step.args, {
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
  const result = runCiSteps();
  if (!result.ok) {
    console.error(`[verify:ci] failed at "${result.failed}" (exit ${result.status})`);
    process.exit(result.status || 1);
  }
  console.log('[verify:ci] all portable PR and deploy gates passed.');
}

if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1] || '')) main();

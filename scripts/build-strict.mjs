#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { scanBuildWarnings } from './lib/round-utils.mjs';
import { ROOT } from './lib/paths.mjs';

function parseArgs(argv = process.argv.slice(2)) {
  const args = { log: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--log') args.log = argv[++i];
  }
  return args;
}

function defaultLogPath() {
  if (process.env.STUDY_BUILD_LOG) return path.resolve(process.env.STUDY_BUILD_LOG);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return path.join(os.tmpdir(), `study-build-${stamp}-${process.pid}.log`);
}

export function clearAstroCache(rootDir = ROOT) {
  for (const relativePath of ['.astro', path.join('node_modules', '.astro')]) {
    fs.rmSync(path.join(rootDir, relativePath), { recursive: true, force: true });
  }
}

function main() {
  const args = parseArgs();
  const logPath = args.log || defaultLogPath();
  clearAstroCache();
  const result = spawnSync('npm', ['run', 'build'], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 100 * 1024 * 1024,
  });

  const output = `${result.stdout || ''}${result.stderr || ''}`;
  fs.writeFileSync(logPath, output, 'utf8');
  process.stdout.write(output);
  process.stdout.write(`\n[build-strict] log: ${logPath}\n`);

  const warnings = scanBuildWarnings(output);
  if (warnings.length > 0) {
    process.stderr.write('[build-strict] warning scan failed:\n');
    for (const hit of warnings.slice(0, 20)) {
      process.stderr.write(`  ${hit.line}: ${hit.text}\n`);
    }
    if (warnings.length > 20) {
      process.stderr.write(`  ... ${warnings.length - 20} more warning line(s)\n`);
    }
  }

  const buildStatus = result.status ?? 1;
  if (buildStatus !== 0) {
    process.stderr.write(`[build-strict] build failed with exit code ${buildStatus}\n`);
  }
  process.exit(buildStatus || (warnings.length > 0 ? 1 : 0));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

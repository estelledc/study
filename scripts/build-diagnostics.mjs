#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ROOT } from './lib/paths.mjs';

function parseArgs(argv = process.argv.slice(2)) {
  const args = { log: null, dist: path.join(ROOT, 'dist'), out: null };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--log') args.log = argv[++index];
    else if (argv[index] === '--dist') args.dist = argv[++index];
    else if (argv[index] === '--out') args.out = argv[++index];
    else throw new Error(`Unknown argument: ${argv[index]}`);
  }
  if (!args.out) throw new Error('--out is required');
  return args;
}

function stripAnsi(value) {
  return value.replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, '');
}

function countTree(directory) {
  const summary = { files: 0, bytes: 0, html_files: 0 };
  if (!directory || !fs.existsSync(directory)) return summary;
  const stack = [directory];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(absolute);
      else if (entry.isFile()) {
        summary.files += 1;
        summary.bytes += fs.statSync(absolute).size;
        if (entry.name.endsWith('.html')) summary.html_files += 1;
      }
    }
  }
  return summary;
}

export function summarizeBuild({ logText = '', distDir = null } = {}) {
  const sanitized = stripAnsi(logText);
  const lines = sanitized.split(/\r?\n/);
  return {
    schema_version: '1.0',
    build_log: {
      present: Boolean(logText),
      lines: logText ? lines.length : 0,
      warning_lines: lines.filter((line) => /\bwarn(?:ing)?\b/i.test(line)).length,
      error_lines: lines.filter((line) => /(?:\berror\b|\[ERROR\])/i.test(line)).length,
    },
    dist: countTree(distDir),
    runtime: { node: process.version },
  };
}

function main() {
  try {
    const args = parseArgs();
    const logText = args.log && fs.existsSync(args.log) ? fs.readFileSync(args.log, 'utf8') : '';
    const payload = {
      ...summarizeBuild({ logText, distDir: path.resolve(args.dist) }),
      generated_at: new Date().toISOString(),
    };
    const out = path.resolve(args.out);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
    console.log(`[build-diagnostics] wrote sanitized aggregate diagnostics to ${out}`);
  } catch (error) {
    console.error(`[build-diagnostics] ${error.message}`);
    process.exit(1);
  }
}

if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1] || '')) main();

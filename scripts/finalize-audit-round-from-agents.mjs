#!/usr/bin/env node
// Finalize one audit round from agent result JSON array on stdin or --results file
// Usage:
//   node scripts/finalize-audit-round-from-agents.mjs --round N --results /tmp/r.json
// results file: JSON array of {slug,area,status,action,lines,average,l1_pass}

import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { AUDIT_REVIEWS_DIR, docsEntryPath } from './lib/paths.mjs';

function parseArgs() {
  const args = { round: null, results: null, tmpPrefix: null };
  for (let i = 2; i < process.argv.length; i++) {
    const a = process.argv[i];
    if (a === '--round') args.round = parseInt(process.argv[++i], 10);
    else if (a === '--results') args.results = process.argv[++i];
    else if (a === '--tmp-prefix') args.tmpPrefix = process.argv[++i];
  }
  if (!Number.isFinite(args.round) || !args.results) throw new Error('--round and --results required');
  if (!args.tmpPrefix) args.tmpPrefix = `/tmp/audit-round-${args.round}`;
  return args;
}

async function main() {
  const args = parseArgs();
  const raw = JSON.parse(await fs.readFile(args.results, 'utf8'));
  const out = [];
  for (const r of raw) {
    const file = docsEntryPath(r.area, r.slug);
    const gate = spawnSync('node', ['scripts/quality-gate.mjs', file], { encoding: 'utf8' });
    let ok = false;
    let lines = r.lines;
    try {
      const d = JSON.parse(gate.stdout);
      ok = Boolean(d.pass);
      lines = d.details?.lines?.lines ?? r.lines;
    } catch {
      ok = false;
    }
    const row = {
      slug: r.slug,
      area: r.area,
      status: ok ? r.status : 'failed',
      action: r.action,
      lines,
      average: r.average,
      l1_pass: ok,
    };
    if (!ok) console.error('GATE FAIL', r.slug, gate.stdout.slice(0, 200));
    else console.log('ok', r.slug, row.status, lines);

    const dst = path.join(AUDIT_REVIEWS_DIR, r.area, `${r.slug}.json`);
    const src = path.join(args.tmpPrefix, `${r.area}-${r.slug}`, 'reviews.json');
    try {
      await fs.mkdir(path.dirname(dst), { recursive: true });
      await fs.copyFile(src, dst);
    } catch {
      try {
        await fs.access(dst);
      } catch {
        await fs.writeFile(dst, JSON.stringify({ action: row.action, average: row.average, reviews: [] }, null, 2) + '\n');
        console.warn('WARN placeholder', dst);
      }
    }
    try {
      row.review = JSON.parse(await fs.readFile(dst, 'utf8'));
    } catch {}
    out.push(row);
  }

  const resultsPath = path.join(args.tmpPrefix, 'results.jsonl');
  await fs.mkdir(args.tmpPrefix, { recursive: true });
  await fs.writeFile(resultsPath, out.map((x) => JSON.stringify(x)).join('\n') + '\n');
  const fin = spawnSync('node', ['scripts/finalize-audit-round.mjs', '--round', String(args.round), '--results', resultsPath], { encoding: 'utf8' });
  process.stdout.write(fin.stdout);
  if (fin.status) process.exit(fin.status);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

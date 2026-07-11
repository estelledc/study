#!/usr/bin/env node
// 聚合三审 JSON → 判定 action，写出 reviews.json
//
// 用法：
//   node scripts/aggregate-audit-reviews.mjs \
//     --zero-base /tmp/r-zb.json \
//     --academic /tmp/r-ac.json \
//     --engineer /tmp/r-en.json \
//     --out /tmp/audit-slug/reviews.json

import fs from 'node:fs/promises';
import { aggregateAuditReviews } from './lib/audit-aggregate.mjs';

function parseArgs() {
  const args = { 'zero-base': null, academic: null, engineer: null, out: null };
  for (let i = 2; i < process.argv.length; i++) {
    const a = process.argv[i];
    if (a === '--zero-base') args['zero-base'] = process.argv[++i];
    else if (a === '--academic') args.academic = process.argv[++i];
    else if (a === '--engineer') args.engineer = process.argv[++i];
    else if (a === '--out') args.out = process.argv[++i];
  }
  for (const k of ['zero-base', 'academic', 'engineer', 'out']) {
    if (!args[k]) throw new Error(`missing --${k}`);
  }
  return args;
}

async function main() {
  const args = parseArgs();
  const reviews = [];
  for (const key of ['zero-base', 'academic', 'engineer']) {
    const raw = JSON.parse(await fs.readFile(args[key], 'utf8'));
    reviews.push(raw);
  }
  const agg = aggregateAuditReviews(reviews);
  await fs.writeFile(args.out, JSON.stringify(agg, null, 2) + '\n');
  console.log(JSON.stringify({ action: agg.action, average: agg.average, out: args.out }, null, 2));
}

main().catch((err) => {
  console.error('aggregate-audit-reviews failed:', err);
  process.exit(1);
});

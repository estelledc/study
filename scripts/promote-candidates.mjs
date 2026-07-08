#!/usr/bin/env node
import { promotePaperCandidates } from './lib/candidate-maintenance.mjs';
import { readCandidates, writeCandidates } from './lib/queue-store.mjs';

function parseArgs(argv) {
  const args = {
    area: 'papers',
    from: 'new',
    limit: 40,
    dryRun: false,
    json: false,
  };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--area') args.area = argv[++i];
    else if (arg === '--from') args.from = argv[++i];
    else if (arg === '--limit') args.limit = Number.parseInt(argv[++i], 10);
    else if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--json') args.json = true;
    else throw new Error(`Unknown arg: ${arg}`);
  }
  if (args.area !== 'papers') throw new Error('promote:candidates currently supports --area papers only');
  if (args.from !== 'new') throw new Error('promote:candidates currently supports --from new only');
  if (!Number.isInteger(args.limit) || args.limit <= 0) throw new Error(`Invalid --limit: ${args.limit}`);
  return args;
}

function renderHuman(result, args) {
  const lines = [
    `${args.dryRun ? 'dry-run' : 'write'} promote papers new -> queued`,
    `requested: ${args.limit}`,
    `promoted: ${result.promoted.length}`,
    `shortage: ${result.shortage}`,
  ];
  if (result.promoted.length) {
    lines.push('');
    lines.push('promoted slugs:');
    for (const item of result.promoted) {
      lines.push(`- ${item.slug} (${item.source_file}) ${item.url}`);
    }
  }
  if (result.skipped.length) {
    lines.push('');
    lines.push('skipped before quota:');
    for (const item of result.skipped) {
      lines.push(`- ${item.slug}: ${item.reasons.join('; ')}`);
    }
  }
  return lines.join('\n');
}

async function main() {
  const args = parseArgs(process.argv);
  const candidates = await readCandidates();
  const result = promotePaperCandidates(candidates, { limit: args.limit });

  if (args.json) console.log(JSON.stringify({ ...result, rows: undefined }, null, 2));
  else console.log(renderHuman(result, args));

  if (result.shortage > 0) {
    process.exitCode = 1;
    return;
  }
  if (!args.dryRun) await writeCandidates(result.rows);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});

#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';

import {
  fixSwappedProjectMetadata,
  replaceResearchTableRows,
} from './lib/candidate-maintenance.mjs';
import { RESEARCH_DIR } from './lib/paths.mjs';
import { readCandidates, writeCandidates } from './lib/queue-store.mjs';

function parseArgs(argv) {
  const args = {
    projects: false,
    apply: false,
    includeWritten: false,
    json: false,
  };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--projects') args.projects = true;
    else if (arg === '--apply') args.apply = true;
    else if (arg === '--include-written') args.includeWritten = true;
    else if (arg === '--json') args.json = true;
    else if (arg === '--dry-run') args.apply = false;
    else throw new Error(`Unknown arg: ${arg}`);
  }
  if (!args.projects) throw new Error('usage: node scripts/fix-candidate-metadata.mjs --projects [--apply]');
  return args;
}

function groupBySourceFile(fixes) {
  const grouped = new Map();
  for (const fix of fixes) {
    if (!fix.source_file) throw new Error(`candidate ${fix.slug} is missing source_file`);
    const current = grouped.get(fix.source_file) || [];
    current.push(fix);
    grouped.set(fix.source_file, current);
  }
  return grouped;
}

async function buildResearchUpdates(fixes) {
  const updates = [];
  for (const [sourceFile, sourceFixes] of groupBySourceFile(fixes)) {
    const filePath = path.join(RESEARCH_DIR, sourceFile);
    const raw = await fs.readFile(filePath, 'utf8');
    const replacement = replaceResearchTableRows(raw, sourceFixes);
    if (replacement.missing.length) {
      throw new Error(`${sourceFile}: missing table rows for ${replacement.missing.join(', ')}`);
    }
    updates.push({
      source_file: sourceFile,
      path: filePath,
      count: replacement.replaced.length,
      text: replacement.text,
    });
  }
  return updates;
}

function renderHuman(fixes, updates, args) {
  const lines = [
    `${args.apply ? 'write' : 'dry-run'} fix swapped project metadata`,
    `candidate fixes: ${fixes.length}`,
    `research files: ${updates.length}`,
  ];
  if (fixes.length) {
    lines.push('');
    lines.push('fixes:');
    for (const fix of fixes) {
      lines.push(`- ${fix.slug} (${fix.status}, ${fix.source_file}): ${fix.old_col3} <-> ${fix.old_col4}`);
    }
  }
  return lines.join('\n');
}

async function main() {
  const args = parseArgs(process.argv);
  const candidates = await readCandidates();
  const result = fixSwappedProjectMetadata(candidates, { includeWritten: args.includeWritten });
  const updates = await buildResearchUpdates(result.fixes);

  if (args.json) {
    console.log(JSON.stringify({
      apply: args.apply,
      fixes: result.fixes.map(({ row, ...fix }) => fix),
      research_updates: updates.map(({ text, ...update }) => update),
    }, null, 2));
  } else {
    console.log(renderHuman(result.fixes, updates, args));
  }

  if (!args.apply) return;
  await writeCandidates(result.rows);
  for (const update of updates) {
    await fs.writeFile(update.path, update.text, 'utf8');
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});

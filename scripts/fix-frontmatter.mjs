#!/usr/bin/env node
// Fix YAML frontmatter values that contain unquoted commas + double quotes.
// Wraps offending values in single quotes (escaping internal ' as '').

import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import yaml from 'js-yaml';
import { extractFrontmatterBlock, replaceFrontmatterBlock } from './lib/frontmatter.mjs';
import { DOCS_DIR } from './lib/paths.mjs';

function isProblematic(value) {
  // YAML chokes on unquoted values with these patterns
  return (
    value.includes(',') ||
    value.includes('"') ||
    value.startsWith('-') ||
    value.startsWith('?') ||
    value.startsWith('|') ||
    value.startsWith('>') ||
    value.startsWith('@') ||
    value.startsWith('`')
  );
}

function quoteValue(value) {
  // Single-quote: escape ' as ''
  return `'${value.replace(/'/g, "''")}'`;
}

function fixBlock(block) {
  const lines = block.split('\n');
  const out = [];
  for (const line of lines) {
    // Skip already-quoted, list items, indented continuations, empty
    if (!line || /^\s/.test(line) || line.startsWith('-')) {
      out.push(line);
      continue;
    }
    const m = line.match(/^([A-Za-z_一-龥][A-Za-z0-9_一-龥]*)\s*:\s*(.*)$/);
    if (!m) {
      out.push(line);
      continue;
    }
    const [, key, rawValue] = m;
    const v = rawValue.trim();
    // Already quoted? skip
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      out.push(line);
      continue;
    }
    // Empty value (key with nested content)
    if (!v) {
      out.push(line);
      continue;
    }
    if (isProblematic(v)) {
      out.push(`${key}: ${quoteValue(v)}`);
    } else {
      out.push(line);
    }
  }
  return out.join('\n');
}

async function processFile(path) {
  const raw = await readFile(path, 'utf8');
  const frontmatter = extractFrontmatterBlock(raw);
  if (!frontmatter) return false;

  // Try strict parse — if works, leave alone
  try {
    yaml.load(frontmatter.block);
    return false;
  } catch (e) {
    const fixed = fixBlock(frontmatter.block);
    // Verify the fix actually parses
    try {
      yaml.load(fixed);
    } catch (e2) {
      console.warn('STILL BROKEN:', path, '→', e2.message.split('\n')[0]);
      return false;
    }
    const newRaw = replaceFrontmatterBlock(raw, fixed);
    await writeFile(path, newRaw, 'utf8');
    return true;
  }
}

async function main() {
  const dirs = ['papers', 'projects'];
  let fixed = 0;
  let total = 0;
  for (const dir of dirs) {
    const dirAbs = join(DOCS_DIR, dir);
    const files = (await readdir(dirAbs)).filter((f) => f.endsWith('.md'));
    for (const f of files) {
      total++;
      const ok = await processFile(join(dirAbs, f));
      if (ok) {
        console.log('fixed', join('src/content/docs', dir, f));
        fixed++;
      }
    }
  }
  console.log(`\n${fixed}/${total} fixed`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

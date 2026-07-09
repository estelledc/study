#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const docsDir = path.join(root, 'src/content/docs');
const areas = ['papers', 'projects'];
const WIKI_RE = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;

function walk(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, acc);
    else if (/\.mdx?$/.test(entry.name)) acc.push(full);
  }
  return acc;
}

function slugFromFile(file) {
  return path.basename(file).replace(/\.mdx?$/, '');
}

function fileArea(file) {
  const rel = path.relative(docsDir, file).replaceAll(path.sep, '/');
  if (rel.startsWith('papers/')) return 'papers';
  if (rel.startsWith('projects/')) return 'projects';
  return null;
}

const slugAreas = new Map();
for (const area of areas) {
  for (const file of walk(path.join(docsDir, area))) {
    const slug = slugFromFile(file);
    if (!slugAreas.has(slug)) slugAreas.set(slug, new Set());
    slugAreas.get(slug).add(area);
  }
}

const duplicates = new Map([...slugAreas.entries()].filter(([, set]) => set.size > 1));
const problems = [];
let historicalUnresolved = 0;

for (const file of walk(docsDir)) {
  const rel = path.relative(root, file);
  const area = fileArea(file);
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);

  lines.forEach((line, idx) => {
    for (const match of line.matchAll(WIKI_RE)) {
      const raw = match[1].trim();
      const lineNo = idx + 1;
      const namespaced = raw.match(/^(papers|projects):([a-z0-9_-]+)$/);

      if (namespaced) {
        const [, ns, slug] = namespaced;
        if (!slugAreas.get(slug)?.has(ns)) {
          problems.push({ file: rel, line: lineNo, raw, reason: `explicit namespace target not found: ${ns}:${slug}` });
        }
        continue;
      }

      const knownAreas = slugAreas.get(raw);
      if (!knownAreas) {
        if (area) historicalUnresolved += 1;
        else problems.push({ file: rel, line: lineNo, raw, reason: 'top-level docs wikilink target not found' });
        continue;
      }

      if (duplicates.has(raw) && (!area || !knownAreas.has(area))) {
        problems.push({
          file: rel,
          line: lineNo,
          raw,
          reason: `ambiguous wikilink without namespace; candidates=${[...knownAreas].join(', ')}`,
        });
      }
    }
  });
}

if (duplicates.size) {
  console.log('[audit:wikilinks] Duplicate slugs across papers/projects:');
  for (const [slug, set] of duplicates) {
    console.log(`- ${slug}: ${[...set].join(', ')}`);
  }
}

if (historicalUnresolved) {
  console.log(`[audit:wikilinks] Note: ${historicalUnresolved} unresolved wikilink(s) remain inside papers/projects and render as broken spans.`);
}

if (problems.length) {
  console.error(`\n[audit:wikilinks] Found ${problems.length} blocking wikilink issue(s):\n`);
  for (const p of problems) {
    console.error(`- ${p.file}:${p.line} [[${p.raw}]] :: ${p.reason}`);
  }
  console.error('\nUse an explicit markdown link or namespace syntax such as [[projects:react|React]].');
  process.exit(1);
}

console.log('[audit:wikilinks] OK: no blocking ambiguous or unresolved top-level wikilinks detected.');

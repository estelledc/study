#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ROOT } from './lib/paths.mjs';

function walkFiles(directory, prefix = '') {
  if (!fs.existsSync(directory)) return [];
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const relative = path.posix.join(prefix, entry.name);
    const absolute = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) {
      files.push({ relative, symbolicLink: true });
    } else if (entry.isDirectory()) {
      files.push(...walkFiles(absolute, relative));
    } else if (entry.isFile()) {
      files.push({ relative, symbolicLink: false });
    }
  }
  return files;
}

export function auditPagesArtifact(distDir) {
  if (!fs.existsSync(distDir)) return ['dist directory is missing; run the strict build first'];
  const failures = [];
  for (const file of walkFiles(distDir)) {
    const lower = file.relative.toLowerCase();
    const name = path.posix.basename(lower);
    if (file.symbolicLink) failures.push(`${file.relative}: symbolic links are not allowed in the Pages artifact`);
    if (name === 'build-info.txt' || name.endsWith('.log') || name.includes('diagnostic')) {
      failures.push(`${file.relative}: diagnostics and logs must not be published in dist`);
    }
  }
  return failures;
}

function main() {
  const distArg = process.argv[2];
  const distDir = path.resolve(distArg || path.join(ROOT, 'dist'));
  const failures = auditPagesArtifact(distDir);
  if (failures.length) {
    console.error(`[audit:pages-artifact] Found ${failures.length} issue(s):`);
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
  }
  console.log('[audit:pages-artifact] OK: dist contains no diagnostic, log, or symlink payloads.');
}

if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1] || '')) main();

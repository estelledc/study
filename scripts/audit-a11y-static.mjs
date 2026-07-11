#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ROOT } from './lib/paths.mjs';

export function auditA11yStatic(root = ROOT) {
  const failures = [];
  const cssFiles = [
    'src/styles/jx/base.css',
    'src/styles/jx/product-ui.css',
    'src/styles/jx/components.css',
  ];
  const css = cssFiles.map((relative) => fs.readFileSync(path.join(root, relative), 'utf8')).join('\n');
  if (!/:focus-visible\b/.test(css)) failures.push('styles have no :focus-visible contract');
  if (!/@media\s*\(prefers-reduced-motion:\s*reduce\)/.test(css)) failures.push('styles have no reduced-motion contract');
  const remark = fs.readFileSync(path.join(root, 'scripts/remark-wikilinks.mjs'), 'utf8');
  if (!/wikilink-broken[^`]*aria-label/.test(remark)) failures.push('broken wikilinks have no explicit accessible state');
  return failures;
}

function main() {
  const failures = auditA11yStatic();
  if (failures.length) {
    for (const failure of failures) console.error(`[audit:a11y-static] ${failure}`);
    process.exit(1);
  }
  console.log('[audit:a11y-static] OK: focus, reduced-motion, and broken-link semantics are explicit.');
}

if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1] || '')) main();

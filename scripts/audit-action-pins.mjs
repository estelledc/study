#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ROOT } from './lib/paths.mjs';

const FULL_SHA = /^[0-9a-f]{40}$/i;
const VERSION_COMMENT = /^v\d+(?:\.\d+){0,2}(?:[-+][0-9A-Za-z.-]+)?$/;

export function findUnpinnedActions(text, file = '<workflow>') {
  const failures = [];
  const lines = text.split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const match = line.match(/^\s*(?:-\s*)?uses:\s*([^\s#]+)(?:\s+#\s*(\S.*))?\s*$/);
    if (!match) continue;

    const action = match[1];
    const comment = match[2]?.trim() || '';
    if (action.startsWith('./')) continue;

    const separator = action.lastIndexOf('@');
    const reference = separator >= 0 ? action.slice(separator + 1) : '';
    if (separator <= 0 || !FULL_SHA.test(reference)) {
      failures.push(`${file}:${index + 1} action must use a full 40-character commit SHA: ${action}`);
      continue;
    }
    if (!VERSION_COMMENT.test(comment)) {
      failures.push(`${file}:${index + 1} pinned action must retain an audited version comment (for example # v4.3.1)`);
    }
  }

  return failures;
}

export function auditWorkflowDirectory(workflowsDir) {
  if (!fs.existsSync(workflowsDir)) return [`workflow directory does not exist: ${workflowsDir}`];
  const failures = [];
  const files = fs.readdirSync(workflowsDir)
    .filter((name) => /\.ya?ml$/i.test(name))
    .sort();
  for (const name of files) {
    const file = path.join(workflowsDir, name);
    failures.push(...findUnpinnedActions(fs.readFileSync(file, 'utf8'), path.relative(ROOT, file)));
  }
  return failures;
}

function main() {
  const failures = auditWorkflowDirectory(path.join(ROOT, '.github', 'workflows'));
  if (failures.length) {
    console.error(`[audit:action-pins] Found ${failures.length} issue(s):`);
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
  }
  console.log('[audit:action-pins] OK: every external action uses a full commit SHA and version comment.');
}

if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1] || '')) main();

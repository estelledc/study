#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ROOT } from './lib/paths.mjs';

export const LIFECYCLE_CONTRACT = [
  {
    path: 'docs/archive/auto-push-v3.md',
    required: [
      /ARCHIVED\s*\/\s*SUPERSEDED/,
      /基线 commit：`[0-9a-f]{40}`/,
      /原 Git blob：`[0-9a-f]{40}`/,
      /原文件 SHA-256：`[0-9a-f]{64}`/,
      /不可作为活动入口/,
    ],
  },
  {
    path: '.claude/skills/auto-push/SKILL.md',
    required: [/已停用/, /docs\/operations-index\.md/, /不提交、不推送远端/],
  },
  {
    path: 'docs/operations-index.md',
    required: [/唯一的活动操作入口/, /默认禁止 bulk production/, /npm run verify:ci/],
  },
];

export function auditDocLifecycle(root = ROOT) {
  const failures = [];
  for (const contract of LIFECYCLE_CONTRACT) {
    const file = path.join(root, contract.path);
    if (!fs.existsSync(file)) {
      failures.push(`${contract.path}: missing`);
      continue;
    }
    const text = fs.readFileSync(file, 'utf8');
    contract.required.forEach((pattern, index) => {
      if (!pattern.test(text)) failures.push(`${contract.path}: lifecycle-marker-${index + 1}`);
    });
  }
  return failures;
}

function main() {
  const failures = auditDocLifecycle();
  if (failures.length > 0) {
    console.error(`[audit:doc-lifecycle] Found ${failures.length} issue(s):`);
    failures.forEach((failure) => console.error(`- ${failure}`));
    process.exit(1);
  }
  console.log('[audit:doc-lifecycle] OK: active and archived operations documents are separated.');
}

if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1] || '')) main();

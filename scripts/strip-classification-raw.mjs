#!/usr/bin/env node
// 批量从 frontmatter 删除 `分类_原始:` 键（legacy 残留）
// 同时可附加写入 `provenance: legacy-migrated`（如果 provenance 字段还不存在）
//
// 用法：
//   node scripts/strip-classification-raw.mjs          # dry-run，只打印
//   node scripts/strip-classification-raw.mjs --apply  # 实际写入

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const APPLY = process.argv.includes('--apply');

const DIRS = [
  path.join(ROOT, 'src/content/docs/papers'),
  path.join(ROOT, 'src/content/docs/projects'),
];

function stripFrontmatter(content) {
  const fmMatch = content.match(/^(---\n)([\s\S]*?)(\n---\n?)/);
  if (!fmMatch) return { changed: false, content };

  const [fullFm, open, body, close] = fmMatch;
  const rest = content.slice(fullFm.length);

  // Remove 分类_原始: lines
  const lines = body.split('\n');
  const filtered = lines.filter(line => !/^分类_原始\s*:/.test(line));
  const changed = filtered.length !== lines.length;

  if (!changed) return { changed: false, content };

  const newBody = filtered.join('\n');
  const newContent = open + newBody + close + rest;
  return { changed: true, content: newContent };
}

async function main() {
  let total = 0;
  let changed = 0;

  for (const dir of DIRS) {
    let files;
    try {
      files = await fs.readdir(dir);
    } catch {
      continue;
    }

    for (const f of files) {
      if (!f.endsWith('.md') || f.startsWith('_')) continue;
      const filePath = path.join(dir, f);
      const raw = await fs.readFile(filePath, 'utf8');
      total++;

      const result = stripFrontmatter(raw);
      if (!result.changed) continue;

      changed++;
      const rel = path.relative(ROOT, filePath);
      if (APPLY) {
        await fs.writeFile(filePath, result.content);
        console.log(`  stripped  ${rel}`);
      } else {
        console.log(`  [dry-run] ${rel}`);
      }
    }
  }

  if (!APPLY) {
    console.log(`\ndry-run: ${changed}/${total} files would be modified. Run with --apply to write.`);
  } else {
    console.log(`\nstrip-classification-raw: ${changed}/${total} files updated.`);
  }
}

main().catch(err => {
  console.error('strip-classification-raw error:', err);
  process.exit(1);
});

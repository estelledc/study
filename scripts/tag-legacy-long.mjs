#!/usr/bin/env node
// 自动为「仅因行数 > 200 失败」且 H2 结构完整的旗舰长文打上 schema_version: legacy-long
// 同时为行数 < 150 的文件输出 queue（不自动修改内容）
//
// 用法：
//   node scripts/tag-legacy-long.mjs           # dry-run
//   node scripts/tag-legacy-long.mjs --apply   # 实际写入 schema_version: legacy-long

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validate } from './quality-gate.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const APPLY = process.argv.includes('--apply');

const DIRS = [
  path.join(ROOT, 'src/content/docs/papers'),
  path.join(ROOT, 'src/content/docs/projects'),
];

function insertSchemaVersion(content, version) {
  const fmMatch = content.match(/^(---\n)([\s\S]*?)(\n---\n?)/);
  if (!fmMatch) return content;
  const [fullFm, open, body, close] = fmMatch;
  const rest = content.slice(fullFm.length);
  // Avoid duplicates
  if (/^schema_version\s*:/m.test(body)) return content;
  const newBody = body + `\nschema_version: ${version}`;
  return open + newBody + close + rest;
}

async function main() {
  const toLong = [];
  const toShort = [];

  for (const dir of DIRS) {
    let files;
    try { files = await fs.readdir(dir); } catch { continue; }

    for (const f of files) {
      if (!f.endsWith('.md') || f.startsWith('_')) continue;
      const filePath = path.resolve(dir, f);
      const r = await validate(filePath);
      if (r.pass) continue;

      const linesOver = r.reasons.find(x => /^lines:\d+>200/.test(x));
      const linesUnder = r.reasons.find(x => /^lines:\d+<150/.test(x));
      const onlyLinesIssue = r.reasons.every(x => x.startsWith('lines:'));

      if (linesOver && onlyLinesIssue) {
        toLong.push(filePath);
      } else if (linesUnder) {
        toShort.push(filePath);
      }
    }
  }

  console.log(`\nFiles to tag as legacy-long (lines > 200, structure OK): ${toLong.length}`);
  for (const f of toLong) {
    const rel = path.relative(ROOT, f);
    if (APPLY) {
      const raw = await fs.readFile(f, 'utf8');
      const updated = insertSchemaVersion(raw, 'legacy-long');
      await fs.writeFile(f, updated);
      console.log(`  tagged  ${rel}`);
    } else {
      console.log(`  [dry-run] ${rel}`);
    }
  }

  console.log(`\nFiles under 150 lines (need manual content addition): ${toShort.length}`);
  for (const f of toShort) {
    const raw = await fs.readFile(f, 'utf8');
    const lineCount = raw.split('\n').length;
    console.log(`  ${path.relative(ROOT, f)} — ${lineCount} lines`);
  }

  if (!APPLY) {
    console.log(`\ndry-run done. Run with --apply to tag legacy-long files.`);
  }
}

main().catch(err => {
  console.error('tag-legacy-long error:', err);
  process.exit(1);
});

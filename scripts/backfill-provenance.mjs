#!/usr/bin/env node
// 批量为存量笔记写入 provenance 字段
// 规则：
//   schema_version=zhuangyuan-v1.1 或 template-reference → curated-season
//   schema_version=legacy-long / legacy-short            → legacy-migrated
//   其余（无 schema_version）                            → pipeline-v3
//
// 用法：
//   node scripts/backfill-provenance.mjs           # dry-run
//   node scripts/backfill-provenance.mjs --apply   # 写入

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

function provenanceFor(schemaVersion) {
  if (schemaVersion === 'zhuangyuan-v1.1' || schemaVersion === 'template-reference') {
    return 'curated-season';
  }
  if (schemaVersion === 'legacy-long' || schemaVersion === 'legacy-short') {
    return 'legacy-migrated';
  }
  return 'pipeline-v3';
}

function insertField(content, key, value) {
  const fmMatch = content.match(/^(---\n)([\s\S]*?)(\n---\n?)/);
  if (!fmMatch) return content;
  const [fullFm, open, body, close] = fmMatch;
  const rest = content.slice(fullFm.length);
  if (new RegExp(`^${key}\\s*:`, 'm').test(body)) return content; // already has field
  const newBody = body.rstrip ? body.rstrip() + `\n${key}: ${value}` : body.replace(/\s+$/, '') + `\n${key}: ${value}`;
  return open + newBody + close + rest;
}

// Simple body-append without rstrip
function addField(content, key, value) {
  const fmMatch = content.match(/^(---\n)([\s\S]*?)(\n---\n?)/);
  if (!fmMatch) return { changed: false, content };
  const [fullFm, open, body, close] = fmMatch;
  const rest = content.slice(fullFm.length);
  if (new RegExp(`^${key}\\s*:`, 'm').test(body)) return { changed: false, content };
  const newBody = body + `\n${key}: ${value}`;
  return { changed: true, content: open + newBody + close + rest };
}

function getSchemaVersion(content) {
  const m = content.match(/^---\n([\s\S]*?)\n---\n/);
  if (!m) return undefined;
  const sv = m[1].match(/^schema_version\s*:\s*(.+)$/m);
  return sv ? sv[1].trim() : undefined;
}

async function main() {
  let total = 0;
  let changed = 0;

  for (const dir of DIRS) {
    let files;
    try { files = await fs.readdir(dir); } catch { continue; }

    for (const f of files) {
      if (!f.endsWith('.md') || f.startsWith('_')) continue;
      const filePath = path.join(dir, f);
      const raw = await fs.readFile(filePath, 'utf8');
      total++;

      const schema = getSchemaVersion(raw);
      const provenance = provenanceFor(schema);
      const result = addField(raw, 'provenance', provenance);

      if (!result.changed) continue;
      changed++;
      const rel = path.relative(ROOT, filePath);
      if (APPLY) {
        await fs.writeFile(filePath, result.content);
        console.log(`  tagged ${provenance}  ${rel}`);
      } else {
        console.log(`  [dry-run] ${provenance}  ${rel}`);
      }
    }
  }

  console.log(`\nbackfill-provenance: ${changed}/${total} files ${APPLY ? 'updated' : 'would be updated'}.`);
}

main().catch(err => {
  console.error('backfill-provenance error:', err);
  process.exit(1);
});

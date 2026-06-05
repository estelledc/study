#!/usr/bin/env node
// L4 审计：扫描 papers/ 与 projects/ 里按 provenance 规则要求有 L4 段的笔记，
// 输出缺失队列到 data/l4-backfill-queue.jsonl
//
// L4 规则：
//   papers curated-season  → H2 含 "复现" + frontmatter repro_evidence 非空
//   papers pipeline-v3     → H2 含 "实践验证" 或 "实践案例" 段内有 fenced code block
//   papers legacy-*        → 同 pipeline-v3
//   projects curated-season → H2 含 "改一处" 或 frontmatter repro_evidence 非空
//   projects others        → H2 含 "实践案例" 段内有 fenced code block
//
// 用法：
//   node scripts/audit-l4.mjs          # 扫描并写 data/l4-backfill-queue.jsonl
//   node scripts/audit-l4.mjs --check  # 仅报告数量，不写文件

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const CHECK_ONLY = process.argv.includes('--check');

const DIRS = { papers: path.join(ROOT, 'src/content/docs/papers'), projects: path.join(ROOT, 'src/content/docs/projects') };

function getFrontmatterField(content, key) {
  const m = content.match(/^---\n([\s\S]*?)\n---\n/);
  if (!m) return undefined;
  const re = new RegExp(`^${key}\\s*:\\s*(.+)$`, 'm');
  const match = m[1].match(re);
  return match ? match[1].trim().replace(/^['"]|['"]$/g, '') : undefined;
}

function hasSectionWithCode(content, sectionKeyword) {
  // Find the H2 section and check if it has a fenced code block
  const sectionRe = new RegExp(`^##[^\\n]*${sectionKeyword}[\\s\\S]*?(?=^##|$)`, 'gm');
  const sectionMatch = content.match(sectionRe);
  if (!sectionMatch) return false;
  return sectionMatch.some(s => /```/.test(s));
}

function checkL4(content, kind, provenance) {
  if (kind === 'papers') {
    if (provenance === 'curated-season') {
      const hasReproH2 = /^##[^\n]*复现/m.test(content);
      const hasReproEvidence = !!getFrontmatterField(content, 'repro_evidence');
      if (!hasReproH2 || !hasReproEvidence) {
        return `papers curated: missing H2 复现(${hasReproH2}) or repro_evidence(${hasReproEvidence})`;
      }
    } else {
      // pipeline-v3, legacy-*: need 实践验证 or 实践案例 with code
      const hasSectionCode = hasSectionWithCode(content, '实践验证') || hasSectionWithCode(content, '实践案例');
      if (!hasSectionCode) {
        return 'papers pipeline: missing 实践验证/实践案例 section with code block';
      }
    }
  } else { // projects
    if (provenance === 'curated-season') {
      const hasReproH2 = /^##[^\n]*改一处/m.test(content);
      const hasReproEvidence = !!getFrontmatterField(content, 'repro_evidence');
      if (!hasReproH2 && !hasReproEvidence) {
        return 'projects curated: missing H2 改一处 and repro_evidence';
      }
    } else {
      const hasSectionCode = hasSectionWithCode(content, '实践案例');
      if (!hasSectionCode) {
        return 'projects pipeline: missing 实践案例 section with code block';
      }
    }
  }
  return null; // L4 OK
}

async function main() {
  const missing = [];

  for (const [kind, dir] of Object.entries(DIRS)) {
    let files;
    try { files = await fs.readdir(dir); } catch { continue; }

    for (const f of files) {
      if (!f.endsWith('.md') || f.startsWith('_')) continue;
      const filePath = path.join(dir, f);
      const content = await fs.readFile(filePath, 'utf8');
      const provenance = getFrontmatterField(content, 'provenance') || 'pipeline-v3';
      const schema = getFrontmatterField(content, 'schema_version');
      if (schema === 'template-reference') continue; // exempt

      const reason = checkL4(content, kind, provenance);
      if (reason) {
        missing.push({
          slug: path.basename(f, '.md'),
          kind,
          provenance,
          schema: schema || 'default-v3',
          reason,
          file: path.relative(ROOT, filePath),
        });
      }
    }
  }

  console.log(`L4 audit: ${missing.length} files missing L4 evidence`);
  console.log(`  curated missing: ${missing.filter(x => x.provenance === 'curated-season').length}`);
  console.log(`  pipeline missing: ${missing.filter(x => x.provenance !== 'curated-season').length}`);

  if (!CHECK_ONLY) {
    const outPath = path.join(ROOT, 'data/l4-backfill-queue.jsonl');
    await fs.mkdir(path.dirname(outPath), { recursive: true });
    await fs.writeFile(outPath, missing.map(r => JSON.stringify(r)).join('\n') + (missing.length ? '\n' : ''));
    console.log(`Wrote ${outPath}`);
  }
}

main().catch(err => {
  console.error('audit-l4 error:', err);
  process.exit(1);
});

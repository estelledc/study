#!/usr/bin/env node
// Classify all papers/projects notes → data/classification.jsonl
// Usage:
//   node scripts/classify-notes.mjs           # dry-run report
//   node scripts/classify-notes.mjs --apply   # write 分类 + 子分类 to frontmatter
//   node scripts/classify-notes.mjs --apply --area papers

import fs from 'node:fs/promises';
import path from 'node:path';
import {
  ROOT,
  loadTaxonomy,
  loadCandidates,
  parseFrontmatter,
  classifySlug,
  scoreItem,
  normalizeRawCategory,
} from './taxonomy-lib.mjs';

// Re-export for pipeline / test consumers: scoreItem({ slug, area, fm?, candidate? })
export { scoreItem, classifySlug, loadTaxonomy, parseFrontmatter };

const AREAS = ['papers', 'projects'];

function upsertFmLine(block, key, value) {
  const line = `${key}: ${value}`;
  const re = new RegExp(`^${key}:\\s*.+$`, 'm');
  if (re.test(block)) return block.replace(re, line);
  // Insert after 日期 or title if present
  const afterDate = block.match(/^日期:\s*.+$/m);
  if (afterDate) {
    const idx = block.indexOf(afterDate[0]) + afterDate[0].length;
    return block.slice(0, idx) + '\n' + line + block.slice(idx);
  }
  return block + '\n' + line;
}

function removeFmLine(block, key) {
  return block.replace(new RegExp(`^${key}:\\s*.+\\n?`, 'm'), '');
}

function updateFrontmatter(raw, { theme, subcategory }) {
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!m) return raw;
  let block = m[1];
  const body = raw.slice(m[0].length);
  const { fm } = parseFrontmatter(raw);
  const prev = normalizeRawCategory(fm['分类'] ?? '');

  block = upsertFmLine(block, '分类', theme);
  block = upsertFmLine(block, '子分类', subcategory);

  if (prev && prev !== theme && prev !== subcategory) {
    block = upsertFmLine(block, '分类_原始', prev);
  } else {
    block = removeFmLine(block, '分类_原始');
  }

  return `---\n${block}\n---\n${body}`;
}

async function listNotes(area) {
  const dir = path.join(ROOT, 'src/content/docs', area);
  const files = (await fs.readdir(dir)).filter((f) => f.endsWith('.md') && !f.startsWith('_'));
  return files.map((f) => ({ slug: f.replace(/\.md$/, ''), path: path.join(dir, f) }));
}

async function main() {
  const apply = process.argv.includes('--apply');
  const areaArg = process.argv.find((a) => a.startsWith('--area='))?.split('=')[1]
    || (process.argv.includes('--area') ? process.argv[process.argv.indexOf('--area') + 1] : null);
  const areas = areaArg ? [areaArg] : AREAS;

  const taxonomy = await loadTaxonomy();
  const candidates = await loadCandidates();

  const results = [];
  const unresolved = [];

  for (const area of areas) {
    const notes = await listNotes(area);
    for (const { slug, path: filePath } of notes) {
      const raw = await fs.readFile(filePath, 'utf8');
      const { fm } = parseFrontmatter(raw);
      const candidate = candidates.get(`${area}::${slug}`) ?? null;
      const c = classifySlug(taxonomy, { slug, area, fm, candidate });
      results.push(c);

      if (c.themeId === 'other' && c.confidence === 'low' && !c.rawCategory) {
        unresolved.push(c);
      } else if (c.themeId === 'other' && c.source === 'fallback') {
        unresolved.push(c);
      }

      if (apply) {
        const updated = updateFrontmatter(raw, c);
        if (updated !== raw) {
          await fs.writeFile(filePath, updated, 'utf8');
        }
      }
    }
  }

  const outPath = path.join(ROOT, 'data/classification.jsonl');
  await fs.writeFile(
    outPath,
    results.map((r) => JSON.stringify(r)).join('\n') + '\n',
    'utf8',
  );

  const unresolvedPath = path.join(ROOT, 'data/classification-unresolved.json');
  await fs.writeFile(
    unresolvedPath,
    JSON.stringify(
      {
        generated: new Date().toISOString(),
        count: unresolved.length,
        items: unresolved,
      },
      null,
      2,
    ),
    'utf8',
  );

  const byTheme = {};
  for (const r of results) {
    byTheme[r.theme] = (byTheme[r.theme] || 0) + 1;
  }

  console.log(`classified ${results.length} notes (${apply ? 'APPLIED' : 'dry-run'})`);
  console.log(`unresolved (other+low): ${unresolved.length}`);
  console.log('by theme:', Object.entries(byTheme).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${v}`).join(', '));
  console.log(`wrote ${outPath}`);

  if (unresolved.length > results.length * 0.01 && !apply) {
    console.warn(`[warn] unresolved ${unresolved.length} > 1% — review ${unresolvedPath}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

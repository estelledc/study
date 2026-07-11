#!/usr/bin/env node
// Organic 扩展候选池：从已写笔记的 ## 延伸阅读 + ## 关联 段抽 [[slug]]
// 去重已写 / 已在 candidates.jsonl，按出现频次排序，TOP-N 加入 queue
//
// 用法：
//   node scripts/expand-pool.mjs            # 默认 target=50
//   node scripts/expand-pool.mjs --target 100
//   node scripts/expand-pool.mjs --dry-run

import fs from 'node:fs/promises';
import path from 'node:path';
import { parseFrontmatterLoose } from './lib/frontmatter.mjs';
import { readJsonl } from './lib/jsonl.mjs';
import {
  extractWikilinks,
  serializeNoteId,
  slugFromNoteFilename,
} from './lib/note-id.mjs';
import { CANDIDATES_PATH, PAPERS_DIR, PROJECTS_DIR } from './lib/paths.mjs';
import { writeCandidates } from './lib/queue-store.mjs';

const RED_LINE = /blindbox|quanzhiping|video-eval-agent|sankuai|friday|cagent|aigc\.sankuai|美团|mis\.sankuai|cagent_fe_h5_blindbox|LongCat|6 件套/i;

// 抽取 ## 延伸阅读 / ## 关联 段（H2 边界）
export function extractTargetSections(text) {
  const sectionStarts = [];
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^##\s.*(延伸阅读|关联)/.test(line)) {
      sectionStarts.push(i);
    }
  }
  // 取每个起点到下一个 H2 或文件末尾
  const sections = [];
  for (const start of sectionStarts) {
    let end = lines.length;
    for (let j = start + 1; j < lines.length; j++) {
      if (/^##\s/.test(lines[j])) {
        end = j;
        break;
      }
    }
    sections.push(lines.slice(start, end).join('\n'));
  }
  return sections.join('\n');
}

// 从笔记 frontmatter 取 "分类:" 字段
export function extractCategory(text) {
  const frontmatter = parseFrontmatterLoose(text);
  return frontmatter?.分类 ? String(frontmatter.分类).trim() : null;
}

function parseArgs() {
  const args = { target: 50, dryRun: false };
  for (let i = 2; i < process.argv.length; i++) {
    const a = process.argv[i];
    if (a === '--target') args.target = parseInt(process.argv[++i], 10);
    else if (a === '--dry-run') args.dryRun = true;
  }
  return args;
}

export function extractOrganicLinksFromNote(text, area, sourceSlug) {
  const found = new Map(); // slug → { count, sources: Set, sourceTopics: [] }
  const sourceCategory = extractCategory(text);
  const target = extractTargetSections(text);
  if (!target) return found;
  const sourceId = serializeNoteId(area, sourceSlug);
  for (const link of extractWikilinks(target)) {
    // Organic expansion preserves the old same-area inference contract.
    // Explicit namespace links already identify an existing cross-area note.
    if (!link.parsed.valid || link.parsed.kind !== 'bare') continue;
    const slug = link.parsed.slug;
    if (!found.has(slug)) {
      found.set(slug, { count: 0, sources: [], category: sourceCategory });
    }
    const entry = found.get(slug);
    entry.count++;
    if (entry.sources.length < 5) {
      entry.sources.push(sourceId);
    }
  }
  return found;
}

function mergeLinkMaps(target, source) {
  for (const [slug, info] of source) {
    if (!target.has(slug)) {
      target.set(slug, { count: 0, sources: [], category: info.category });
    }
    const entry = target.get(slug);
    entry.count += info.count;
    for (const sourceRef of info.sources) {
      if (entry.sources.length >= 5) break;
      entry.sources.push(sourceRef);
    }
  }
}

async function scanNotesForLinks(dir, area) {
  const found = new Map(); // slug → { count, sources: Set, sourceTopics: [] }
  let entries;
  try {
    entries = await fs.readdir(dir);
  } catch (err) {
    if (err.code === 'ENOENT') return found;
    throw err;
  }
  for (const f of entries) {
    if (!f.endsWith('.md') || f.startsWith('_')) continue;
    const filePath = path.join(dir, f);
    const text = await fs.readFile(filePath, 'utf8');
    const sourceSlug = slugFromNoteFilename(f);
    mergeLinkMaps(found, extractOrganicLinksFromNote(text, area, sourceSlug));
  }
  return found;
}

export function buildOrganicCandidates({
  papersLinks,
  projectsLinks,
  existing,
  writtenPapers,
  writtenProjects,
  target = 50,
}) {
  const existingKeys = new Set(existing.map((candidate) => serializeNoteId(candidate.area, candidate.slug)));
  const newCandidates = [];

  // 4. 候选打分（papers area + projects area 各自处理）
  // 注意：[[slug]] 不带 area 前缀，需要推断。规则：先看 written 里有没有这个 slug（哪个 area）；
  // 没有就两边都加（保守，先加 papers area 因为 papers 段是论文链向更多论文）
  function isExcluded(area, slug) {
    // 跨 area 去重：任何 area 已有 candidate 就跳过
    if (existingKeys.has(serializeNoteId('papers', slug))) return true;
    if (existingKeys.has(serializeNoteId('projects', slug))) return true;
    // 跨 area 已写也跳过
    if (writtenPapers.has(slug) || writtenProjects.has(slug)) return true;
    return false;
  }

  function tryAdd(slug, info, area) {
    if (isExcluded(area, slug)) return false;
    if (RED_LINE.test(slug)) return false;
    newCandidates.push({
      slug,
      area,
      topic: info.category || 'organic',
      title: '',
      meta: { col3: '', col4: `frequency:${info.count} / sources:${info.sources.join(',')}` },
      url: '',
      status: 'queued',
      claimed_by: null,
      attempts: 0,
      source_file: 'organic-expansion',
      organic_freq: info.count,
      organic_sources: info.sources,
    });
    existingKeys.add(serializeNoteId(area, slug)); // 防止后续同 slug 跨 area 重复加
    return true;
  }

  // papers 链接的 slug → 加入 papers area
  for (const [slug, info] of papersLinks) {
    tryAdd(slug, info, 'papers');
  }
  // projects 链接的 slug → 加入 projects area
  for (const [slug, info] of projectsLinks) {
    tryAdd(slug, info, 'projects');
  }

  // 按 freq 降序
  newCandidates.sort((a, b) => b.organic_freq - a.organic_freq);

  // Top N
  const picked = newCandidates.slice(0, target);

  return { newCandidates, picked };
}

async function main() {
  const args = parseArgs();

  // 1. 扫已写笔记
  const papersLinks = await scanNotesForLinks(PAPERS_DIR, 'papers');
  const projectsLinks = await scanNotesForLinks(PROJECTS_DIR, 'projects');

  // 2. 已有 candidates（含 written / queued / blacklisted）
  const existing = await readJsonl(CANDIDATES_PATH);

  // 3. 已写 slug
  const writtenPapers = new Set();
  const writtenProjects = new Set();
  try {
    const ls = await fs.readdir(PAPERS_DIR);
    ls.forEach((f) => f.endsWith('.md') && !f.startsWith('_') && writtenPapers.add(slugFromNoteFilename(f)));
  } catch (e) {}
  try {
    const ls = await fs.readdir(PROJECTS_DIR);
    ls.forEach((f) => f.endsWith('.md') && !f.startsWith('_') && writtenProjects.add(slugFromNoteFilename(f)));
  } catch (e) {}

  const { newCandidates, picked } = buildOrganicCandidates({
    papersLinks,
    projectsLinks,
    existing,
    writtenPapers,
    writtenProjects,
    target: args.target,
  });

  // 5. 写回（除非 dry-run）
  if (!args.dryRun && picked.length) {
    await writeCandidates([...existing, ...picked]);
  }

  // 6. 报告
  console.log(JSON.stringify({
    notes_scanned: writtenPapers.size + writtenProjects.size,
    unique_links_in_papers: papersLinks.size,
    unique_links_in_projects: projectsLinks.size,
    new_candidates_total: newCandidates.length,
    target: args.target,
    picked: picked.length,
    dry_run: args.dryRun,
    top10_picked: picked.slice(0, 10).map(c => ({
      slug: c.slug,
      area: c.area,
      freq: c.organic_freq,
      topic: c.topic,
      sources: c.organic_sources,
    })),
  }, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => {
    console.error('expand-pool failed:', err);
    process.exit(1);
  });
}

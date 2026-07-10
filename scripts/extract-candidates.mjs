#!/usr/bin/env node
// 从 research/*.md 表格提取 candidate → data/candidates.jsonl
// schema：{slug, area, topic, title, meta:{col3,col4}, url, status, claimed_by, attempts}
// 入库前预扫红线词，命中标 status=blacklisted

import fs from 'node:fs/promises';
import path from 'node:path';
import { isNoteSlug, serializeNoteId } from './lib/note-id.mjs';
import { CANDIDATES_PATH, RESEARCH_DIR } from './lib/paths.mjs';
import { writeCandidates } from './lib/queue-store.mjs';

const OUT_PATH = CANDIDATES_PATH;

const RED_LINE = /blindbox|quanzhiping|video-eval-agent|sankuai|friday|cagent|aigc\.sankuai|美团|mis\.sankuai|cagent_fe_h5_blindbox|LongCat|6 件套/i;

// 表格行：| `slug` | col2 | col3 | col4 | url |
// slug 可选 backtick 包裹；url 必须 http(s)
const TABLE_ROW = /^\|\s*`?([a-z0-9][a-z0-9_.-]*)`?\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*(https?:\/\/\S+?)\s*\|?\s*$/;

export function topicFromFilename(filename) {
  const m = filename.match(/^(papers|projects)-(.+)\.md$/);
  if (!m) return null;
  return { area: m[1], topic: m[2] };
}

export function isHeaderOrSeparator(line) {
  if (/^\|\s*-+\s*\|/.test(line)) return true; // | --- | --- |
  if (/^\|\s*:?-+:?\s*\|/.test(line)) return true; // 含对齐冒号
  // 表头：第一列是 slug/Slug/项目/论文 等
  if (/^\|\s*(slug|项目|论文|paper|name)\s*\|/i.test(line)) return true;
  return false;
}

export function parseCandidateLine(line, meta, filename) {
  if (!meta || isHeaderOrSeparator(line)) return null;
  const match = line.match(TABLE_ROW);
  if (!match) return null;
  const [, slug, col2, col3, col4, url] = match;
  if (!isNoteSlug(slug)) return null;
  const candidate = {
    slug,
    area: meta.area,
    topic: meta.topic,
    title: col2.trim(),
    meta: { col3: col3.trim(), col4: col4.trim() },
    url: url.trim(),
    status: 'queued',
    claimed_by: null,
    attempts: 0,
    source_file: filename,
  };
  const text = `${slug} ${col2} ${col3} ${col4} ${url}`;
  if (RED_LINE.test(text)) {
    candidate.status = 'blacklisted';
    candidate.reason = 'red-line-word-detected';
  }
  return candidate;
}

export function extractCandidatesFromContent(filename, content) {
  const meta = topicFromFilename(filename);
  if (!meta) return [];
  return content
    .split('\n')
    .map((line) => parseCandidateLine(line, meta, filename))
    .filter(Boolean);
}

export function dedupeCandidates(candidates) {
  const seen = new Set();
  const deduped = [];
  let duplicatesRemoved = 0;
  for (const candidate of candidates) {
    const key = serializeNoteId(candidate.area, candidate.slug);
    if (seen.has(key)) {
      duplicatesRemoved++;
      continue;
    }
    seen.add(key);
    deduped.push(candidate);
  }
  return { candidates: deduped, duplicatesRemoved };
}

async function processFile(filename) {
  const content = await fs.readFile(path.join(RESEARCH_DIR, filename), 'utf8');
  return extractCandidatesFromContent(filename, content);
}

async function main() {
  await fs.mkdir(path.dirname(OUT_PATH), { recursive: true });
  const files = (await fs.readdir(RESEARCH_DIR))
    .filter(f => /^(papers|projects)-.+\.md$/.test(f))
    .sort();

  const allCandidates = [];
  const perFile = {};
  for (const f of files) {
    const c = await processFile(f);
    perFile[f] = c.length;
    allCandidates.push(...c);
  }

  const { candidates: dedup, duplicatesRemoved } = dedupeCandidates(allCandidates);
  await writeCandidates(dedup);

  const byStatus = {};
  const byArea = {};
  for (const c of dedup) {
    byStatus[c.status] = (byStatus[c.status] || 0) + 1;
    byArea[c.area] = (byArea[c.area] || 0) + 1;
  }

  console.log(JSON.stringify({
    files_scanned: files.length,
    rows_extracted: allCandidates.length,
    duplicates_removed: duplicatesRemoved,
    candidates_written: dedup.length,
    by_status: byStatus,
    by_area: byArea,
    output: OUT_PATH,
    per_file: perFile,
  }, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => {
    console.error('extract-candidates failed:', err);
    process.exit(1);
  });
}

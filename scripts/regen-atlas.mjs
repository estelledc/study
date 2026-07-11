#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';

import { atomicWriteFile } from './lib/json-store.mjs';
import { loadNoteRecords } from './lib/note-id.mjs';
import { DATA_DIR, DOCS_DIR, ROOT } from './lib/paths.mjs';
import {
  buildNoteIndex,
  loadTaxonomy,
  planAtlasChunks,
} from './lib/taxonomy.mjs';

const GENERATED_MARKER = '<!-- GENERATED_ATLAS_CHUNK -->';

function posixRelative(rootDir, filePath) {
  return path.relative(rootDir, filePath).split(path.sep).join('/');
}

function escapeMd(value) {
  return String(value ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ').trim();
}

function shortDescription(value, max = 120) {
  const first = String(value ?? '').split(/[。.；;]/)[0].trim();
  if (!first) return '暂无独立描述；可先从标题与正文定位开始。';
  return first.length > max ? `${first.slice(0, max - 1)}…` : first;
}

function areaMeta(area) {
  return area === 'papers'
    ? { zh: '论文', unit: '篇', landing: 'papers-atlas.md', route: '/study/papers-atlas/' }
    : { zh: '项目', unit: '个', landing: 'projects-atlas.md', route: '/study/projects-atlas/' };
}

function chunkLinks(chunks) {
  return chunks.map((chunk) => `[第 ${chunk.page}/${chunk.pages} 组](${chunk.route})`).join(' · ');
}

export function renderAtlasLanding(area, noteIndex, taxonomy, chunks) {
  const meta = areaMeta(area);
  const stats = noteIndex.stats.by_area[area];
  const coverage = stats.total === 0 ? '0.0' : ((stats.classified / stats.total) * 100).toFixed(1);
  const lines = [
    '---',
    `title: ${meta.zh}全景索引`,
    `description: ${stats.total} ${meta.unit}${meta.zh}的分块地图 · 稳定 taxonomy · 自动生成`,
    'sidebar:',
    '  order: 5',
    `  label: ${meta.zh}全景索引`,
    '---',
    '',
    '> 本页由 `scripts/regen-atlas.mjs` 从 `data/taxonomy.json` 与 `data/note-index.json` 自动生成。',
    '> Atlas 适合已经知道关键词的人；第一次来请先走 [从这里开始](/study/start/)。',
    '',
    '## 总览',
    '',
    '<div class="study-stats-strip">',
    `  <div><strong>${stats.total}</strong><span>${meta.zh}总数</span></div>`,
    `  <div><strong>${stats.classified}</strong><span>已有规范主题</span></div>`,
    `  <div><strong>${stats.unclassified}</strong><span>暂未收纳进主题路线</span></div>`,
    `  <div><strong>${coverage}%</strong><span>分类覆盖率（${stats.classified} / ${stats.total}，已分类 / 总数）</span></div>`,
    '</div>',
    '',
    '## 先选一条学习路径',
    '',
    'Atlas 不替代精选路线。零基础读者先从下面六条路径选一条：',
    '',
    '| 路径 | English |',
    '|---|---|',
    ...taxonomy.learning_paths.map((item) => `| [${escapeMd(item.labels.zh)}](${item.href}) | ${escapeMd(item.labels.en)} |`),
    '',
    '## 常用入口',
    '',
    '- 已经知道名字：按 Cmd/Ctrl + K 搜索。',
    '- 想看精选顺序：[按主题学习](/study/topics/) 或 [精选队列](/study/queue/)。',
    `- 想浏览全部内容：从下方主题分块进入；每块最多 ${taxonomy.chunk_size} 条。`,
    '',
    '## 规范主题',
    '',
    '| 主题 | English | 数量 | 分块 |',
    '|---|---|---:|---|',
  ];

  for (const topic of taxonomy.topics.filter((item) => item.area === area)) {
    const topicChunks = chunks.filter((chunk) => chunk.area === area && chunk.topic_id === topic.id);
    if (!topicChunks.length) continue;
    const count = topicChunks.reduce((sum, chunk) => sum + chunk.note_ids.length, 0);
    lines.push(`| ${escapeMd(topic.labels.zh)} | ${escapeMd(topic.labels.en)} | ${count} | ${chunkLinks(topicChunks)} |`);
  }
  lines.push('');
  lines.push('## 暂未收纳进主题路线');
  lines.push('');
  lines.push('<details class="study-details">');
  lines.push(`<summary>暂未收纳进主题路线（${stats.unclassified} ${meta.unit}）</summary>`);
  lines.push('');
  lines.push('这些内容已经有笔记，但现有 frontmatter 还不能稳定映射到 canonical topic；这不是质量低的标记，只代表它们还没有进入精选学习路径。预算只允许数量下降；确需增长时必须审查 `data/taxonomy.json`。');
  lines.push('');
  const unknownChunks = chunks.filter((chunk) => chunk.area === area && chunk.kind === 'unclassified');
  lines.push(unknownChunks.length ? chunkLinks(unknownChunks) : '- 当前没有待复核条目。');
  lines.push('');
  lines.push('</details>');
  lines.push('');
  lines.push('## 数据质量报告');
  lines.push('');
  lines.push(`- difficulty 未知：${stats.unknown_difficulty}`);
  lines.push(`- description 为空：${stats.empty_description}`);
  lines.push(`- sidecar 主键：${stats.total} 个唯一 \`area::slug\``);
  lines.push('');
  return `${lines.join('\n').trimEnd()}\n`;
}

export function renderAtlasChunk(chunk, notesById, siblingChunks, taxonomy) {
  const meta = areaMeta(chunk.area);
  const topicLabel = chunk.labels.zh;
  const title = chunk.kind === 'unclassified'
    ? `${meta.zh}待复核映射 · 第 ${chunk.page} 组`
    : `${topicLabel} · ${meta.zh} · 第 ${chunk.page} 组`;
  const siblings = siblingChunks
    .filter((item) => item.area === chunk.area && item.kind === chunk.kind && item.topic_id === chunk.topic_id)
    .sort((left, right) => left.page - right.page);
  const previous = siblings.find((item) => item.page === chunk.page - 1);
  const next = siblings.find((item) => item.page === chunk.page + 1);
  const lines = [
    '---',
    `title: ${JSON.stringify(title)}`,
    `description: ${JSON.stringify(`${chunk.note_ids.length} 条 ${topicLabel} Atlas 分块`)}`,
    'sidebar:',
    '  hidden: true',
    '---',
    '',
    GENERATED_MARKER,
    '',
    `[返回${meta.zh}全景索引](${meta.route})`,
    '',
    `本分块共 ${chunk.note_ids.length} 条，稳定上限为 ${taxonomy.chunk_size} 条。`,
    '',
    `| ${meta.zh} | Slug | 难度 | 可信状态 | 简介 |`,
    '|---|---|---|---|---|',
  ];
  for (const id of chunk.note_ids) {
    const note = notesById.get(id);
    lines.push(
      `| [${escapeMd(note.title)}](${note.route}) | \`${note.slug}\` | ${escapeMd(note.difficulty)} | ${escapeMd(note.trust.verification_status)} | ${escapeMd(shortDescription(note.description))} |`,
    );
  }
  lines.push('');
  const navigation = [
    previous ? `[上一组](${previous.route})` : null,
    next ? `[下一组](${next.route})` : null,
  ].filter(Boolean).join(' · ');
  if (navigation) lines.push(navigation, '');
  return `${lines.join('\n').trimEnd()}\n`;
}

export async function buildAtlasArtifacts(options = {}) {
  const rootDir = path.resolve(options.rootDir ?? ROOT);
  const docsDir = path.resolve(options.docsDir ?? path.join(rootDir, 'src/content/docs'));
  const taxonomyPath = path.resolve(options.taxonomyPath ?? path.join(rootDir, 'data/taxonomy.json'));
  const taxonomy = await loadTaxonomy(taxonomyPath);
  const records = loadNoteRecords({ docsDir, readContent: true });
  const built = buildNoteIndex({ taxonomy, notes: records, asOf: options.asOf ?? null });
  const planned = planAtlasChunks(built, taxonomy);
  const maxChunkEntries = Math.max(0, ...planned.chunks.map((chunk) => chunk.note_ids.length));
  const noteIndex = {
    ...planned.note_index,
    stats: {
      ...planned.note_index.stats,
      atlas: {
        chunks: planned.chunks.length,
        chunk_size: taxonomy.chunk_size,
        max_chunk_entries: maxChunkEntries,
      },
    },
    chunks: planned.chunks.map(({ note_ids, ...chunk }) => ({ ...chunk, entries: note_ids.length })),
  };
  const notesById = new Map(noteIndex.notes.map((note) => [note.id, note]));
  const artifacts = new Map();
  artifacts.set(path.join(rootDir, 'data/note-index.json'), `${JSON.stringify(noteIndex, null, 2)}\n`);
  for (const area of ['papers', 'projects']) {
    const meta = areaMeta(area);
    artifacts.set(
      path.join(docsDir, meta.landing),
      renderAtlasLanding(area, noteIndex, taxonomy, planned.chunks),
    );
  }
  for (const chunk of planned.chunks) {
    artifacts.set(
      path.join(docsDir, 'atlas', chunk.area, `${chunk.id}.md`),
      renderAtlasChunk(chunk, notesById, planned.chunks, taxonomy),
    );
  }
  return { rootDir, docsDir, taxonomy, noteIndex, chunks: planned.chunks, artifacts };
}

async function writeIfChanged(filePath, content) {
  try {
    if (await fs.readFile(filePath, 'utf8') === content) return false;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  await atomicWriteFile(filePath, content, { encoding: 'utf8' });
  return true;
}

async function removeStaleGeneratedChunks(model) {
  const expected = new Set([...model.artifacts.keys()].map((filePath) => path.resolve(filePath)));
  const removed = [];
  for (const area of ['papers', 'projects']) {
    const directory = path.join(model.docsDir, 'atlas', area);
    let entries;
    try {
      entries = await fs.readdir(directory, { withFileTypes: true });
    } catch (error) {
      if (error.code === 'ENOENT') continue;
      throw error;
    }
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
      const filePath = path.join(directory, entry.name);
      if (expected.has(path.resolve(filePath))) continue;
      const raw = await fs.readFile(filePath, 'utf8');
      if (!raw.includes(GENERATED_MARKER)) continue;
      await fs.unlink(filePath);
      removed.push(posixRelative(model.rootDir, filePath));
    }
  }
  return removed.sort();
}

export async function generateAtlas(options = {}) {
  const model = await buildAtlasArtifacts(options);
  const changed = [];
  for (const [filePath, content] of model.artifacts) {
    if (await writeIfChanged(filePath, content)) changed.push(posixRelative(model.rootDir, filePath));
  }
  const removed = await removeStaleGeneratedChunks(model);
  return {
    schema_version: 'study-atlas-generation-v1',
    notes: model.noteIndex.stats.summary.total,
    classified: model.noteIndex.stats.summary.classified,
    unclassified: model.noteIndex.stats.summary.unclassified,
    chunks: model.chunks.length,
    max_chunk_entries: model.noteIndex.stats.atlas.max_chunk_entries,
    changed: changed.sort(),
    removed,
  };
}

function parseArgs(argv) {
  const args = { json: false, asOf: null };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--json') args.json = true;
    else if (argv[index] === '--as-of') args.asOf = argv[++index];
    else throw new Error(`unknown argument: ${argv[index]}`);
  }
  return args;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const result = await generateAtlas({ rootDir: ROOT, docsDir: DOCS_DIR, taxonomyPath: path.join(DATA_DIR, 'taxonomy.json'), asOf: args.asOf });
    if (args.json) console.log(JSON.stringify(result, null, 2));
    else console.log(`atlas: ${result.notes} notes, ${result.chunks} chunks, ${result.changed.length} changed, ${result.removed.length} removed`);
  } catch (error) {
    console.error(`regen-atlas failed: ${error.message}`);
    process.exitCode = 1;
  }
}

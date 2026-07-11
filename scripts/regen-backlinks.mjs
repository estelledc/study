#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

import {
  createAliasIndex,
  createNoteIndex,
  extractWikilinks,
  formatWikilinkTarget,
  loadAliasConfig,
  loadNoteRecords,
  resolveWikilink,
} from './lib/note-id.mjs';
import { DATA_DIR, DOCS_DIR, ROOT } from './lib/paths.mjs';

const GENERATED_MARKER = '<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->';
const ALIAS_PATH = path.join(DATA_DIR, 'wikilink-aliases.json');

export function locateBacklinkSection(content) {
  const heading = /^## 反向链接[ \t]*$/m.exec(content);
  if (!heading) return null;
  const start = heading.index;
  const afterHeading = start + heading[0].length;
  const nextHeading = /\n##[ \t]+/.exec(content.slice(afterHeading));
  const end = nextHeading ? afterHeading + nextHeading.index + 1 : content.length;
  const section = content.slice(start, end);
  return { start, end, section, generated: section.includes(GENERATED_MARKER) };
}

export function stripGeneratedBacklinkSection(content) {
  const located = locateBacklinkSection(content);
  if (!located?.generated) return content;
  return content.slice(0, located.start) + content.slice(located.end);
}

function titleFromContent(content, slug) {
  const match = content.match(/^title:\s*(.+?)$/m);
  return match ? match[1].trim().replace(/^['"](.*)['"]$/, '$1') : slug;
}

function renderBacklinkSection(note, incoming, notesById, noteIndex, atEof) {
  const body = incoming.length === 0
    ? '（暂无反向链接）'
    : incoming.map((sourceId) => {
      const source = notesById.get(sourceId);
      const target = formatWikilinkTarget(sourceId, { noteIndex });
      return `- [[${target}]] —— ${source.title}`;
    }).join('\n');
  const section = `## 反向链接\n\n${GENERATED_MARKER}\n\n${body}`;
  return atEof ? `${section}\n` : `${section}\n\n`;
}

export function buildBacklinkPlan(notes, { aliasRecords = [] } = {}) {
  const normalized = notes.map((note) => ({
    ...note,
    title: note.title || titleFromContent(note.content, note.slug),
  }));
  const noteIndex = createNoteIndex(normalized);
  const aliasIndex = createAliasIndex(aliasRecords, noteIndex);
  const notesById = new Map(normalized.map((note) => [note.id, note]));
  const backrefs = new Map();
  let resolvedReferences = 0;
  let unresolvedReferences = 0;

  for (const source of normalized) {
    const authoredContent = stripGeneratedBacklinkSection(source.content);
    const seenTargets = new Set();
    for (const link of extractWikilinks(authoredContent)) {
      const resolved = resolveWikilink(link.parsed, {
        sourceArea: source.area,
        noteIndex,
        aliasIndex,
      });
      if (!resolved.ok) {
        unresolvedReferences += 1;
        continue;
      }
      resolvedReferences += 1;
      if (seenTargets.has(resolved.id)) continue;
      seenTargets.add(resolved.id);
      if (!backrefs.has(resolved.id)) backrefs.set(resolved.id, new Set());
      backrefs.get(resolved.id).add(source.id);
    }
  }

  const changes = [];
  let noSection = 0;
  let manualSection = 0;
  for (const note of normalized) {
    const located = locateBacklinkSection(note.content);
    if (!located) {
      noSection += 1;
      continue;
    }
    if (!located.generated) {
      manualSection += 1;
      continue;
    }
    const incoming = [...(backrefs.get(note.id) || [])].sort();
    const replacement = renderBacklinkSection(
      note,
      incoming,
      notesById,
      noteIndex,
      located.end === note.content.length,
    );
    const next = note.content.slice(0, located.start) + replacement + note.content.slice(located.end);
    if (stripGeneratedBacklinkSection(next) !== stripGeneratedBacklinkSection(note.content)) {
      throw new Error(`backlink generation escaped the generated section: ${note.id}`);
    }
    if (next !== note.content) changes.push({ ...note, next, incoming });
  }

  return {
    changes,
    backrefs,
    noteIndex,
    stats: {
      notes: normalized.length,
      changed: changes.length,
      no_section: noSection,
      manual_section: manualSection,
      resolved_references: resolvedReferences,
      unresolved_references: unresolvedReferences,
      duplicate_slugs: [...noteIndex.bySlug.values()].filter((areas) => areas.size > 1).length,
    },
  };
}

function parseArgs(argv) {
  const flags = new Set(argv.slice(2));
  const allowed = new Set(['--dry-run', '--check', '--json']);
  for (const flag of flags) {
    if (!allowed.has(flag)) throw new Error(`unknown argument: ${flag}`);
  }
  return {
    dryRun: flags.has('--dry-run') || flags.has('--check'),
    check: flags.has('--check'),
    json: flags.has('--json'),
  };
}

export function runBacklinkGeneration({
  docsDir = DOCS_DIR,
  aliasPath = ALIAS_PATH,
  dryRun = false,
  check = false,
  json = false,
} = {}) {
  const notes = loadNoteRecords({ docsDir, readContent: true });
  const plan = buildBacklinkPlan(notes, { aliasRecords: loadAliasConfig(aliasPath) });
  if (!dryRun) {
    for (const change of plan.changes) fs.writeFileSync(change.path, change.next, 'utf8');
  }

  const report = {
    ...plan.stats,
    mode: dryRun ? (check ? 'check' : 'dry-run') : 'write',
    changed_paths: plan.changes.map((change) => path.relative(ROOT, change.path).replaceAll(path.sep, '/')),
  };
  if (json) console.log(JSON.stringify(report, null, 2));
  else {
    console.log(
      `backlinks: ${report.changed} 篇${dryRun ? '待更新' : '更新'}，` +
      `${report.no_section} 篇跳过（无生成段），${report.manual_section} 篇保留手写段`,
    );
  }
  if (check && plan.changes.length > 0) process.exitCode = 1;
  return report;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runBacklinkGeneration(parseArgs(process.argv));
}

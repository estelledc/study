// Shared [[target]] / [[target|显示文本]] renderer.
// Public wikilinks accept bare slugs plus papers/projects slash or colon forms;
// internal identity always uses area::slug from lib/note-id.mjs.

import path from 'node:path';
import { visit } from 'unist-util-visit';

import {
  createAliasIndex,
  createNoteIndex,
  extractWikilinks,
  loadAliasConfig,
  loadNoteRecords,
  resolveWikilink,
} from './lib/note-id.mjs';
import { DATA_DIR, DOCS_DIR } from './lib/paths.mjs';

const DEFAULT_BASE = '/study';
const DEFAULT_ALIAS_PATH = path.join(DATA_DIR, 'wikilink-aliases.json');

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function sourceArea(filePath, docsDir = DOCS_DIR) {
  if (!filePath) return null;
  const relative = path.relative(docsDir, filePath).replaceAll(path.sep, '/');
  if (relative.startsWith('papers/')) return 'papers';
  if (relative.startsWith('projects/')) return 'projects';
  return null;
}

export function createRemarkWikilinks({
  noteIndex,
  aliasIndex,
  docsDir = DOCS_DIR,
  base = DEFAULT_BASE,
}) {
  const normalizedBase = base.replace(/\/+$/, '');
  return (tree, file) => {
    const fileArea = sourceArea(file?.path, docsDir);

    visit(tree, 'text', (node, index, parent) => {
      if (!node.value?.includes('[[') || !parent || parent.type === 'link' || parent.type === 'linkReference') return;
      const links = extractWikilinks(node.value);
      if (links.length === 0) return;

      const children = [];
      let cursor = 0;
      for (const link of links) {
        if (link.index > cursor) children.push({ type: 'text', value: node.value.slice(cursor, link.index) });
        const display = link.display || link.parsed.slug || link.target || '未命名链接';
        const resolved = resolveWikilink(link.parsed, {
          sourceArea: fileArea,
          noteIndex,
          aliasIndex,
        });

        if (resolved.ok) {
          children.push({
            type: 'link',
            url: `${normalizedBase}/${resolved.area}/${resolved.slug}/`,
            title: null,
            children: [{ type: 'text', value: display }],
          });
        } else {
          children.push({
            type: 'html',
            value: `<span class="wikilink-broken" aria-label="未解析链接：${escapeHtml(display)}" title="${escapeHtml(resolved.reason)}：${escapeHtml(resolved.slug)}">${escapeHtml(display)}</span>`,
          });
        }
        cursor = link.end;
      }
      if (cursor < node.value.length) children.push({ type: 'text', value: node.value.slice(cursor) });
      parent.children.splice(index, 1, ...children);
      return index + children.length;
    });
  };
}

export default function remarkWikilinks(options = {}) {
  const docsDir = options.docsDir || DOCS_DIR;
  const noteIndex = options.noteIndex || createNoteIndex(loadNoteRecords({ docsDir }));
  const aliasRecords = options.aliasRecords || loadAliasConfig(options.aliasPath || DEFAULT_ALIAS_PATH);
  const aliasIndex = options.aliasIndex || createAliasIndex(aliasRecords, noteIndex);
  return createRemarkWikilinks({
    noteIndex,
    aliasIndex,
    docsDir,
    base: options.base || DEFAULT_BASE,
  });
}

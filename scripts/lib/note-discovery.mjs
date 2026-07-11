import fs from 'node:fs/promises';
import path from 'node:path';

import { NOTE_AREAS, isNoteSlug } from './note-id.mjs';

async function walkMarkdown(directory, relativeDirectory = '') {
  let entries;
  try {
    entries = await fs.readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
  const found = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const relativePath = relativeDirectory ? `${relativeDirectory}/${entry.name}` : entry.name;
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      found.push(...await walkMarkdown(absolutePath, relativePath));
    } else if (entry.isFile() && /\.mdx?$/.test(entry.name)) {
      found.push({ absolutePath, relativePath });
    }
  }
  return found;
}

export async function discoverNotes(rootDir) {
  const notes = [];
  for (const area of NOTE_AREAS) {
    const areaDirectory = path.join(rootDir, 'src', 'content', 'docs', area);
    for (const entry of await walkMarkdown(areaDirectory)) {
      const filename = path.posix.basename(entry.relativePath);
      const extension = filename.endsWith('.mdx') ? '.mdx' : '.md';
      const slug = filename.slice(0, -extension.length);
      const pathIssues = [];
      if (entry.relativePath.includes('/')) pathIssues.push('noncanonical-nested-note-path');
      if (extension !== '.md') pathIssues.push('noncanonical-mdx-note-path');
      if (!isNoteSlug(slug)) pathIssues.push('noncanonical-note-slug');
      const canonicalPath = pathIssues.length === 0;
      notes.push({
        area,
        slug,
        path: entry.absolutePath,
        area_relative_path: entry.relativePath,
        canonical_path: canonicalPath,
        path_issues: pathIssues,
      });
    }
  }
  return notes.sort((left, right) => left.path.localeCompare(right.path));
}

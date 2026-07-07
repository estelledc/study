import fs from 'node:fs/promises';
import path from 'node:path';
import { docsAreaDir } from './paths.mjs';

export function noteSlugFromFilename(filename) {
  if (!filename.endsWith('.md') || filename.startsWith('_')) return null;
  return filename.replace(/\.md$/, '');
}

export async function listNoteFiles(dir) {
  try {
    const entries = await fs.readdir(dir);
    return entries
      .filter((entry) => noteSlugFromFilename(entry))
      .sort();
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
}

export async function listAreaNotes(area) {
  const dir = docsAreaDir(area);
  const files = await listNoteFiles(dir);
  return files.map((filename) => ({
    area,
    filename,
    slug: noteSlugFromFilename(filename),
    path: path.join(dir, filename),
  }));
}

export async function countNoteFiles(dir) {
  return (await listNoteFiles(dir)).length;
}

export async function countNotesByArea() {
  const [papers, projects] = await Promise.all([
    listAreaNotes('papers'),
    listAreaNotes('projects'),
  ]);
  return { papers: papers.length, projects: projects.length };
}

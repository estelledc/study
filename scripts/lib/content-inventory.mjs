import fs from 'node:fs/promises';
import path from 'node:path';

import { DOCS_DIR, PAPERS_DIR, PROJECTS_DIR, ROOT } from './paths.mjs';

const MARKDOWN_RE = /\.mdx?$/;

export async function listMarkdownEntries(directory) {
  let entries;
  try {
    entries = await fs.readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
  return entries
    .filter((entry) => entry.isFile() && MARKDOWN_RE.test(entry.name))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));
}

export async function buildContentInventory(options = {}) {
  const rootDir = path.resolve(options.rootDir ?? ROOT);
  const docsDir = path.resolve(options.docsDir ?? path.join(rootDir, 'src/content/docs'));
  const projectsDir = path.resolve(options.projectsDir ?? path.join(docsDir, 'projects'));
  const papersDir = path.resolve(options.papersDir ?? path.join(docsDir, 'papers'));
  const [projects, papers] = await Promise.all([
    listMarkdownEntries(projectsDir),
    listMarkdownEntries(papersDir),
  ]);

  return {
    rootDir,
    docsDir,
    projectsDir,
    papersDir,
    files: { projects, papers },
    counts: {
      projects: projects.length,
      papers: papers.length,
      total: projects.length + papers.length,
    },
  };
}

export const DEFAULT_CONTENT_DIRECTORIES = {
  docsDir: DOCS_DIR,
  projectsDir: PROJECTS_DIR,
  papersDir: PAPERS_DIR,
};

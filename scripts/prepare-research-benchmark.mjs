#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';

const RESEARCH_ROOT = path.join('src', 'content', 'docs', 'research');
const FRONTMATTER_PATTERN = /^---\n[\s\S]*?\n---(?:\n|$)/;
const HEADING_PATTERN = /^#\s+(.+)$/m;

function yamlString(value) {
  return JSON.stringify(value.replace(/\s+#+\s*$/, '').trim());
}

export function prepareResearchMarkdown(content, relativePath) {
  let next = content.replace(/\r\n?/g, '\n');
  if (!FRONTMATTER_PATTERN.test(next)) {
    const title = next.match(HEADING_PATTERN)?.[1];
    if (!title) {
      throw new Error(`${relativePath}: missing H1 title`);
    }
    next = [
      '---',
      `title: ${yamlString(title)}`,
      'sidebar:',
      '  hidden: true',
      '---',
      next,
    ].join('\n');
  }

  next = next.replaceAll(
    'src/content/docs/research/repos/',
    'research-worktrees/',
  );
  next = next.replaceAll(
    'explorations/research/repos/',
    'research-worktrees/',
  );
  next = next.replaceAll(
    'explorations/research/',
    'src/content/docs/research/',
  );
  next = next.replace(
    /\[([^\]]+)\]\(\.\.\/\.\.\/_meta\/([^)]+)\.md\)/g,
    '$1 (`$2`)',
  );
  return next.endsWith('\n') ? next : `${next}\n`;
}

async function listMarkdownFiles(rootDir) {
  const files = [];
  async function walk(directory) {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const filePath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await walk(filePath);
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        files.push(filePath);
      }
    }
  }
  await walk(rootDir);
  return files.sort();
}

export async function prepareResearchBenchmark(options = {}) {
  const rootDir = path.resolve(options.rootDir ?? process.cwd());
  const researchRoot = path.join(rootDir, RESEARCH_ROOT);
  const files = await listMarkdownFiles(researchRoot);
  let changed = 0;

  for (const filePath of files) {
    const relativePath = path.relative(rootDir, filePath).split(path.sep).join('/');
    const before = await fs.readFile(filePath, 'utf8');
    const after = prepareResearchMarkdown(before, relativePath);
    if (after !== before) {
      await fs.writeFile(filePath, after);
      changed += 1;
    }
  }
  return { files: files.length, changed };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = await prepareResearchBenchmark();
  console.log(
    `[research:prepare] files=${result.files} changed=${result.changed}`,
  );
}

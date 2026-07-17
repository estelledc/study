#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';

const RESEARCH_ROOT = path.join('src', 'content', 'docs', 'research');
const FRONTMATTER_PATTERN = /^---\n[\s\S]*?\n---(?:\n|$)/;

async function isFile(filePath) {
  try {
    return (await fs.stat(filePath)).isFile();
  } catch {
    return false;
  }
}

async function listFiles(rootDir) {
  const files = [];
  async function walk(directory) {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      if (entry.isDirectory() && ['__pycache__', '.ruff_cache'].includes(entry.name)) {
        continue;
      }
      const filePath = path.join(directory, entry.name);
      if (entry.isDirectory()) await walk(filePath);
      else if (entry.isFile()) files.push(filePath);
    }
  }
  await walk(rootDir);
  return files.sort();
}

export async function auditResearchBenchmark(options = {}) {
  const rootDir = path.resolve(options.rootDir ?? process.cwd());
  const researchRoot = path.join(rootDir, RESEARCH_ROOT);
  const manifest = JSON.parse(await fs.readFile(
    path.join(researchRoot, 'research-refresh-program', 'manifest.json'),
    'utf8',
  ));
  const files = await listFiles(researchRoot);
  const markdownFiles = files.filter((filePath) => filePath.endsWith('.md'));
  const testModules = files.filter((filePath) => (
    path.basename(filePath).startsWith('test_')
    && filePath.endsWith('.py')
    && filePath.split(path.sep).includes('labs')
  ));
  const failures = [];

  if (manifest.categories.length !== manifest.expected.categories) {
    failures.push('category-count-mismatch');
  }

  for (const category of manifest.categories) {
    const categoryRoot = path.join(researchRoot, category.directory);
    const required = [
      'README.md',
      category.entry,
      category.experiment,
      category.self_test,
      ...category.project_guides,
    ];
    for (const relativePath of new Set(required)) {
      if (!await isFile(path.join(categoryRoot, relativePath))) {
        failures.push(`${category.id}:missing:${relativePath}`);
      }
    }
  }

  for (const filePath of markdownFiles) {
    const relativePath = path.relative(rootDir, filePath).split(path.sep).join('/');
    const content = await fs.readFile(filePath, 'utf8');
    if (!FRONTMATTER_PATTERN.test(content)) {
      failures.push(`${relativePath}:missing-frontmatter`);
    }
    if (content.includes('explorations/research/')) {
      failures.push(`${relativePath}:legacy-research-path`);
    }
    if (content.includes('src/content/docs/research/repos/')) {
      failures.push(`${relativePath}:source-worktree-inside-content`);
    }
    if (content.includes('../../_meta/')) {
      failures.push(`${relativePath}:parent-project-card-link`);
    }
  }

  const categoryMarkdownFiles = manifest.categories.reduce(
    (total, category) => total + files.filter((filePath) => (
      filePath.endsWith('.md')
      && path.dirname(filePath).startsWith(
        path.join(researchRoot, category.directory),
      )
      && !path.relative(
        path.join(researchRoot, category.directory),
        filePath,
      ).includes(path.sep)
    )).length,
    0,
  );
  if (categoryMarkdownFiles !== manifest.expected.category_markdown_files) {
    failures.push(
      `category-markdown-count:${categoryMarkdownFiles}`
      + `!=${manifest.expected.category_markdown_files}`,
    );
  }
  if (testModules.length !== manifest.expected.lab_test_modules) {
    failures.push(
      `lab-test-count:${testModules.length}`
      + `!=${manifest.expected.lab_test_modules}`,
    );
  }

  return {
    schema_version: 'study-research-benchmark-audit-v1',
    summary: {
      categories: manifest.categories.length,
      relationships: manifest.expected.member_relationships,
      canonical_upstreams: manifest.expected.unique_upstreams,
      files: files.length,
      markdown: markdownFiles.length,
      lab_test_modules: testModules.length,
      failures: failures.length,
    },
    failures: failures.sort(),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = await auditResearchBenchmark();
  console.log(JSON.stringify(result, null, 2));
  if (result.failures.length > 0) process.exitCode = 1;
}

#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const docsDir = path.join(root, 'src/content/docs');
const projectsDir = path.join(docsDir, 'projects');
const papersDir = path.join(docsDir, 'papers');

function countMarkdown(dir) {
  if (!fs.existsSync(dir)) return 0;
  return fs.readdirSync(dir).filter((name) => /\.mdx?$/.test(name)).length;
}

function readLines(rel) {
  const file = path.join(docsDir, rel);
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8').split(/\r?\n/) : [];
}

function findLine(rel, pattern) {
  const lines = readLines(rel);
  const idx = lines.findIndex((line) => pattern.test(line));
  return idx === -1 ? null : { file: rel, line: idx + 1, text: lines[idx].trim() };
}

function expectLine(rel, pattern, expected, label) {
  const hit = findLine(rel, pattern);
  if (!hit) {
    problems.push({ file: rel, line: 0, reason: `${label} line not found` });
    return;
  }
  if (!expected.test(hit.text)) {
    problems.push({
      file: rel,
      line: hit.line,
      reason: `${label} does not match current counts`,
      text: hit.text,
    });
  }
}

const actual = {
  projects: countMarkdown(projectsDir),
  papers: countMarkdown(papersDir),
};
actual.total = actual.projects + actual.papers;
actual.totalRounded = `${Math.floor(actual.total / 100) * 100}+`;

const problems = [];
const staleValues = ['726', '785', '1511', '803', '873', '1500+'];
const criticalFiles = [
  'index.md',
  'queue.md',
  'papers-queue.md',
  'method.md',
  'papers-method.md',
  'about.md',
  'career-plan.md',
  'projects-atlas.md',
  'papers-atlas.md',
];

for (const rel of criticalFiles) {
  for (const [idx, line] of readLines(rel).entries()) {
    if (!/(论文|paper|项目|project|笔记|notes|规模|总数|总计|累计|全景)/i.test(line)) continue;
    for (const stale of staleValues) {
      if (line.includes(stale)) {
        problems.push({
          file: rel,
          line: idx + 1,
          reason: `stale public count ${stale}; actual projects=${actual.projects}, papers=${actual.papers}, total=${actual.total}`,
          text: line.trim(),
        });
      }
    }
  }
}

expectLine('index.md', /规模.*论文.*项目/, new RegExp(`${actual.papers}.*${actual.projects}.*${actual.total}`), 'home scale copy');
expectLine('queue.md', /当前站点.*项目笔记.*论文笔记/, new RegExp(`${actual.projects}.*${actual.papers}`), 'project queue scale copy');
expectLine('queue.md', /项目全景/, new RegExp(`${actual.projects}`), 'project atlas continuation count');
expectLine('queue.md', /论文全景/, new RegExp(`${actual.papers}`), 'paper atlas continuation count');
expectLine('papers-queue.md', /站内累计.*论文笔记/, new RegExp(`${actual.papers}`), 'paper queue scale copy');
expectLine('method.md', /这套方法跑过/, new RegExp(`${actual.projects}.*${actual.papers}.*${actual.total}`), 'method scale copy');
expectLine('papers-method.md', /论文目录共/, new RegExp(`${actual.papers}`), 'paper method scale copy');
expectLine('about.md', /论文笔记.*项目笔记/, new RegExp(`${actual.papers}.*${actual.projects}.*${actual.totalRounded.replace('+', '\\+')}`), 'about scale copy');
expectLine('career-plan.md', /当前规模/, new RegExp(`${actual.totalRounded.replace('+', '\\+')}.*${actual.papers}.*${actual.projects}`), 'career scale copy');
expectLine('projects-atlas.md', /description:/, new RegExp(`${actual.projects}`), 'generated projects atlas count');
expectLine('papers-atlas.md', /description:/, new RegExp(`${actual.papers}`), 'generated papers atlas count');

console.log(`[audit:counts] Actual content files: projects=${actual.projects}, papers=${actual.papers}, total=${actual.total}`);

if (problems.length) {
  console.error(`\n[audit:counts] Found ${problems.length} public count issue(s):\n`);
  for (const p of problems) {
    console.error(`- ${p.file}:${p.line} :: ${p.reason}`);
    if (p.text) console.error(`  ${p.text}`);
  }
  console.error('\nRun npm run atlas if generated atlas pages are stale, then update critical-page copy.');
  process.exit(1);
}

console.log('[audit:counts] OK: public scale counts match current content files.');

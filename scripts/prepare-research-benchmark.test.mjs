import assert from 'node:assert/strict';
import test from 'node:test';

import { prepareResearchMarkdown } from './prepare-research-benchmark.mjs';

test('adds hidden Starlight frontmatter from the first H1', () => {
  const result = prepareResearchMarkdown(
    '# 标杆标题\n\n正文\n',
    'src/content/docs/research/example.md',
  );
  assert.match(result, /^---\ntitle: "标杆标题"\nsidebar:\n  hidden: true\n---\n/);
});

test('is idempotent and rewrites executable research paths', () => {
  const input = [
    '---',
    'title: "实验"',
    'sidebar:',
    '  hidden: true',
    '---',
    '# 实验',
    '',
    '```bash',
    'python3 explorations/research/demo/lab.py',
    '```',
    '',
  ].join('\n');
  const once = prepareResearchMarkdown(input, 'example.md');
  const twice = prepareResearchMarkdown(once, 'example.md');
  assert.equal(once, twice);
  assert.match(once, /python3 src\/content\/docs\/research\/demo\/lab\.py/);
});

test('keeps external source worktrees outside the public content tree', () => {
  const result = prepareResearchMarkdown(
    '# 源码\n\n`explorations/research/repos/example/src/main.ts`\n',
    'example.md',
  );
  assert.match(result, /`research-worktrees\/example\/src\/main\.ts`/);
  assert.doesNotMatch(result, /src\/content\/docs\/research\/repos\/example/);
});

test('removes parent-repository project-card links from the public site', () => {
  const result = prepareResearchMarkdown(
    '# 清单\n\n[示例](../../_meta/example.md)\n',
    'example.md',
  );
  assert.match(result, /示例 \(`example`\)/);
  assert.doesNotMatch(result, /\.\.\/\.\.\/_meta/);
});

test('fails closed when a Markdown file has no H1', () => {
  assert.throws(
    () => prepareResearchMarkdown('正文\n', 'missing.md'),
    /missing H1 title/,
  );
});

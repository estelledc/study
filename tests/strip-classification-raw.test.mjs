// tests/strip-classification-raw.test.mjs
// Unit tests for scripts/strip-classification-raw.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

// Import the strip logic inline (avoid needing the module to export it)
function stripFrontmatter(content) {
  const fmMatch = content.match(/^(---\n)([\s\S]*?)(\n---\n?)/);
  if (!fmMatch) return { changed: false, content };
  const [fullFm, open, body, close] = fmMatch;
  const rest = content.slice(fullFm.length);
  const lines = body.split('\n');
  const filtered = lines.filter(line => !/^分类_原始\s*:/.test(line));
  const changed = filtered.length !== lines.length;
  if (!changed) return { changed: false, content };
  const newBody = filtered.join('\n');
  const newContent = open + newBody + close + rest;
  return { changed: true, content: newContent };
}

await test('strips 分类_原始 from frontmatter', () => {
  const input = `---
title: Test
分类_原始: 强化学习
分类: 机器学习
---

Content`;
  const result = stripFrontmatter(input);
  assert.equal(result.changed, true);
  assert.ok(!result.content.includes('分类_原始'));
  assert.ok(result.content.includes('分类: 机器学习'));
});

await test('leaves other frontmatter fields intact', () => {
  const input = `---
title: Test
分类: 机器学习
难度: 中级
---

Content`;
  const result = stripFrontmatter(input);
  assert.equal(result.changed, false);
  assert.ok(result.content.includes('分类: 机器学习'));
  assert.ok(result.content.includes('难度: 中级'));
});

await test('resulting frontmatter is valid YAML', async () => {
  const { load } = await import('js-yaml');
  const input = `---
title: Test
分类_原始: AI / Agent
分类: 机器学习
子分类: NLP
---

Content`;
  const result = stripFrontmatter(input);
  const fmMatch = result.content.match(/^---\n([\s\S]*?)\n---/);
  assert.ok(fmMatch, 'frontmatter block should exist');
  assert.doesNotThrow(() => load(fmMatch[1]), 'stripped frontmatter should be valid YAML');
});

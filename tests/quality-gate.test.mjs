// tests/quality-gate.test.mjs
// Unit tests for scripts/quality-gate.mjs
// Runner: node:test (built-in, zero deps)

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validate } from '../scripts/quality-gate.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.join(__dirname, 'fixtures/src/content/docs');

// ── helper ──────────────────────────────────────────────────────────────────
async function validateFixture(subdir, filename) {
  const fp = path.resolve(FIXTURES, subdir, filename);
  return validate(fp);
}

// ── tests ───────────────────────────────────────────────────────────────────

await test('good v3 fixture passes gate', async () => {
  const r = await validateFixture('papers', 'test-good-v3.md');
  assert.equal(r.pass, true, `expected pass, got: ${JSON.stringify(r.reasons)}`);
});

await test('legacy-long fixture passes gate with extended line range', async () => {
  const r = await validateFixture('papers', 'test-legacy-long.md');
  // legacy-long allows 140-280 lines; this fixture ~50 lines should pass on content
  assert.equal(r.pass, true, `expected pass, got: ${JSON.stringify(r.reasons)}`);
  assert.equal(r.schema, 'legacy-long');
});

await test('bad fixture missing title fails frontmatter check', async () => {
  const r = await validateFixture('papers', 'test-bad-no-title.md');
  assert.equal(r.pass, false, 'expected fail');
  // File path matches, but frontmatter missing title
  assert.ok(r.reasons.some(x => x.includes('frontmatter') || x.includes('title')),
    `no frontmatter reason in: ${JSON.stringify(r.reasons)}`);
});

await test('good project fixture passes gate', async () => {
  const r = await validateFixture('projects', 'test-good-project.md');
  assert.equal(r.pass, true, `expected pass, got: ${JSON.stringify(r.reasons)}`);
});

await test('schema_version legacy-short allows lines 140+ with no upper limit', async () => {
  const tmp = await fs.mkdtemp('/tmp/gate-test-');
  const dir = path.join(tmp, 'src/content/docs/papers');
  await fs.mkdir(dir, { recursive: true });
  const fp = path.join(dir, 'short-test.md');

  const fm = `---\ntitle: Short Test\n日期: 2026-01-01\n分类: 其他\n子分類: 测试\n难度: 初级\nschema_version: legacy-short\n---`;
  const sections = ['## 是什么','## 为什么重要','## 核心要点','## 实践案例',
    '## 踩过的坑','## 适用','## 历史小故事（可跳过）','## 学到什么',
    '## 延伸阅读','## 关联','## 反向链接\n<!-- auto -->'];
  let content = fm + '\n\n' + sections.join('\n\n内容。\n\n') + '\n';
  // Build to exactly 145 lines
  const linesArr = content.split('\n');
  while (linesArr.length < 145) linesArr.push('');
  content = linesArr.slice(0, 145).join('\n');

  await fs.writeFile(fp, content);
  const r = await validate(fp);
  await fs.rm(tmp, { recursive: true });

  assert.equal(r.schema, 'legacy-short');
  assert.ok(r.pass, `legacy-short 145 lines should pass, got: ${JSON.stringify(r.reasons)}`);
});

await test('default v3 allows lines > 200', async () => {
  const tmp = await fs.mkdtemp('/tmp/gate-test-');
  const dir = path.join(tmp, 'src/content/docs/papers');
  await fs.mkdir(dir, { recursive: true });
  const fp = path.join(dir, 'long-test.md');

  const fm = `---\ntitle: Long Test\n日期: 2026-01-01\n分类: 其他\n子分类: 测试\n难度: 初级\n---`;
  const sections = ['## 是什么','## 为什么重要','## 核心要点','## 实践案例',
    '## 踩过的坑','## 适用','## 历史小故事（可跳过）','## 学到什么',
    '## 延伸阅读','## 关联','## 反向链接\n<!-- auto -->'];
  let content = fm + '\n\n' + sections.join('\n\n内容。\n\n') + '\n';
  const linesArr = content.split('\n');
  while (linesArr.length < 250) linesArr.push('extra line');
  content = linesArr.join('\n');

  await fs.writeFile(fp, content);
  const r = await validate(fp);
  await fs.rm(tmp, { recursive: true });

  assert.ok(r.pass, `250 lines should pass default v3, got: ${JSON.stringify(r.reasons)}`);
  assert.equal(r.details?.lines?.lines, 250);
});

await test('template-reference schema is exempt from line/H2 checks', async () => {
  const tmp = await fs.mkdtemp('/tmp/gate-test-');
  const dir = path.join(tmp, 'src/content/docs/papers');
  await fs.mkdir(dir, { recursive: true });
  const fp = path.join(dir, 'template-ref.md');
  const content = `---\ntitle: Template Reference\n日期: 2026-01-01\nschema_version: template-reference\n---\n\n## 是什么\n\n只有一个段落。\n`;
  await fs.writeFile(fp, content);
  const r = await validate(fp);
  await fs.rm(tmp, { recursive: true });
  assert.equal(r.schema, 'template-reference');
  assert.equal(r.pass, true, `template-reference should pass, got: ${JSON.stringify(r.reasons)}`);
});

await test('red-line word triggers failure', async () => {
  const tmp = await fs.mkdtemp('/tmp/gate-test-');
  const dir = path.join(tmp, 'src/content/docs/papers');
  await fs.mkdir(dir, { recursive: true });
  const fp = path.join(dir, 'redline-test.md');
  const content = `---\ntitle: Red Line Test\n日期: 2026-01-01\n分类: 其他\n---\n\n## 内容\n\nThis mentions quanzhiping internal stuff.\n`;
  await fs.writeFile(fp, content);
  const r = await validate(fp);
  await fs.rm(tmp, { recursive: true });
  assert.equal(r.pass, false, 'red-line should fail');
  assert.ok(r.reasons.some(x => x.includes('red-line')));
});

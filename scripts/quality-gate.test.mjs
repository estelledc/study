import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { validate } from './quality-gate.mjs';

async function tempCorpus() {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'study-quality-gate-'));
  await fs.mkdir(path.join(rootDir, 'src/content/docs/papers'), { recursive: true });
  await fs.mkdir(path.join(rootDir, 'src/content/docs/projects'), { recursive: true });
  return rootDir;
}

function trustYaml(area, noteType) {
  const shared = [
    '  version: study-v2',
    `  source_kind: ${area === 'papers' ? 'paper' : 'project'}`,
    `  note_type: ${noteType}`,
    '  canonical_source: https://example.test/source',
    '  source_authority: AUTHOR_PRIMARY',
    "  accessed_at: '2026-07-09'",
    '  evidence_type: STATIC_ANALYSIS',
    '  verification_status: UNVERIFIED',
    "  reviewed_at: '2026-07-10'",
    `  review_after: ${area === 'papers' ? 'null' : "'2027-07-10'"}`,
  ];
  if (area === 'papers') shared.splice(6, 0, '  publication_id: doi:10.0000/example');
  else shared.splice(6, 0, '  immutable_revision: 0123456789abcdef0123456789abcdef01234567');
  return `trust:\n${shared.join('\n')}`;
}

function note(area, noteType, body, { withTrust = true, title = 'Fixture' } = {}) {
  return `---\ntitle: ${title}\n${withTrust ? `${trustYaml(area, noteType)}\n` : ''}---\n\n${body}`;
}

const bodies = {
  concept: '## 学到什么\n\n先用日常类比建立直觉。\n\n## 核心机制\n\n例如从输入跟到输出。\n',
  library: '## 实践案例\n\n比如先运行最小代码：\n\n```js\nconsole.log("object-specific")\n```\n\n## 学到什么\n\n能够解释 API 边界。\n',
  paper: '## 论文方法\n\n好比先提出问题再验证假设。\n\n## 学到什么\n\n能够复述方法与局限。\n',
};

test('three note types pass without sharing one H2 order or line quota', async () => {
  const rootDir = await tempCorpus();
  const fixtures = [
    ['projects', 'concept', bodies.concept],
    ['projects', 'library', bodies.library],
    ['papers', 'paper', bodies.paper],
  ];
  for (const [area, noteType, body] of fixtures) {
    const filePath = path.join(rootDir, `src/content/docs/${area}/${noteType}.md`);
    await fs.writeFile(filePath, note(area, noteType, body), 'utf8');
    const result = await validate(filePath, { enforceContract: true, skipSimilarity: true });
    assert.equal(result.pass, true, result.reasons.join('; '));
    assert.equal(result.details.lines.ok, true);
    assert.equal(result.details.lines.advisory, true);
  }
});

test('shape alone cannot pass without source and verification contract', async () => {
  const rootDir = await tempCorpus();
  const filePath = path.join(rootDir, 'src/content/docs/projects/missing-trust.md');
  const repeated = `${bodies.concept}\n${'补充解释。\n'.repeat(170)}`;
  await fs.writeFile(filePath, note('projects', 'concept', repeated, { withTrust: false }), 'utf8');
  const result = await validate(filePath, { enforceContract: true, skipSimilarity: true });
  assert.equal(result.pass, false);
  assert.match(result.reasons.join('\n'), /content-contract:legacy-unverified/);
});

test('ordinary v2 notes cannot self-assert OFFICIAL_PRIMARY with arbitrary HTTPS', async () => {
  const rootDir = await tempCorpus();
  const filePath = path.join(rootDir, 'src/content/docs/projects/arbitrary-official.md');
  const text = note('projects', 'concept', bodies.concept)
    .replace('source_authority: AUTHOR_PRIMARY', 'source_authority: OFFICIAL_PRIMARY');
  await fs.writeFile(filePath, text, 'utf8');
  const result = await validate(filePath, { enforceContract: true, skipSimilarity: true });
  assert.equal(result.pass, false);
  assert.match(result.reasons.join('\n'), /official-source-not-registered/);
});

test('legacy corpus remains report-only rather than requiring a rewrite', async () => {
  const rootDir = await tempCorpus();
  const filePath = path.join(rootDir, 'src/content/docs/projects/legacy.md');
  await fs.writeFile(filePath, note('projects', 'concept', '## 任意旧结构\n\n历史正文。\n', { withTrust: false }), 'utf8');
  const result = await validate(filePath, { enforceContract: false });
  assert.equal(result.pass, true, result.reasons.join('; '));
  assert.equal(result.details.contract.state, 'legacy-unverified');
  assert.equal(result.advisories.length > 0, true);
});

test('extreme body copy is a hard failure only for strict content', async () => {
  const rootDir = await tempCorpus();
  const longBody = `${bodies.library}\n${'这是对象特定解释，比如输入输出和失败边界。'.repeat(80)}`;
  const originalPath = path.join(rootDir, 'src/content/docs/projects/original.md');
  const copiedPath = path.join(rootDir, 'src/content/docs/projects/copied.md');
  await fs.writeFile(originalPath, note('projects', 'library', longBody, { title: 'Original' }), 'utf8');
  await fs.writeFile(copiedPath, note('projects', 'library', longBody, { title: 'Copied' }), 'utf8');

  const strict = await validate(copiedPath, { enforceContract: true, similarityRootDir: rootDir });
  assert.equal(strict.pass, false);
  assert.match(strict.reasons.join('\n'), /extreme-template-copy/);

  const legacy = await validate(copiedPath, { enforceContract: false, similarityRootDir: rootDir });
  assert.equal(legacy.details['template-similarity'].skipped, true);
});

test('zhuangyuan-v1.1 still runs trust, learning, permalink, and similarity gates', async () => {
  const rootDir = await tempCorpus();
  const filePath = path.join(rootDir, 'src/content/docs/projects/zhuangyuan.md');
  const copyPath = path.join(rootDir, 'src/content/docs/projects/original.md');
  const links = Array.from({ length: 4 }, (_, index) => (
    `https://github.com/example/repo/blob/0123456789abcdef/path-${index}.js`
  )).join('\n');
  const body = `## Figure 1\n\n图示。\n\n## self-classify\n\n分类。\n\n## 核心机制\n\n${'好比同一段对象说明。\n'.repeat(310)}\n${links}\n`;
  const frontmatter = `schema_version: zhuangyuan-v1.1\nbranch: C\ntitle: Zhuangyuan\n${trustYaml('projects', 'library')}`;
  const text = note('projects', 'library', body, { withTrust: false }).replace('title: Fixture', frontmatter);
  await fs.writeFile(copyPath, text.replace('title: Zhuangyuan', 'title: Original'), 'utf8');
  await fs.writeFile(filePath, text, 'utf8');

  const result = await validate(filePath, { enforceContract: true, similarityRootDir: rootDir });
  assert.equal(result.pass, false);
  assert.match(result.reasons.join('\n'), /learning-evidence/);
  assert.match(result.reasons.join('\n'), /github-permalinks/);
  assert.match(result.reasons.join('\n'), /extreme-template-copy/);
  assert.equal(result.details.contract.state, 'v2');
});

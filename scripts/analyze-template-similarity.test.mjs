import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  analyzeTemplateSimilarity,
  checkExtremeSimilarity,
  h2Signature,
  similarityScore,
} from './analyze-template-similarity.mjs';

function longBody(label, order = ['是什么', '核心机制', '学到什么']) {
  const detail = `${label} 的对象特定解释说明真实机制与边界。`.repeat(35);
  return order.map((heading) => `## ${heading}\n\n${detail}`).join('\n\n');
}

async function tempCorpus() {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'study-template-similarity-'));
  await fs.mkdir(path.join(rootDir, 'src/content/docs/papers'), { recursive: true });
  await fs.mkdir(path.join(rootDir, 'src/content/docs/projects'), { recursive: true });
  return rootDir;
}

test('H2 signatures preserve order without requiring one template', () => {
  assert.deepEqual(h2Signature('## 是什么\n## 核心机制\n'), ['是什么', '核心机制']);
  assert.notDeepEqual(
    h2Signature('## 是什么\n## 核心机制\n'),
    h2Signature('## 核心机制\n## 是什么\n'),
  );
});

test('extreme copy is rejected while object-specific content is not', async () => {
  const rootDir = await tempCorpus();
  const original = `---\ntitle: Original\n---\n${longBody('数据库')}`;
  await fs.writeFile(path.join(rootDir, 'src/content/docs/projects/original.md'), original, 'utf8');
  const copied = original.replace('title: Original', 'title: Copied');
  const distinct = `---\ntitle: Distinct\n---\n${longBody('渲染管线', ['学到什么', '实践案例', '核心机制'])}`;

  assert.equal(similarityScore(original, copied), 1);
  assert.equal((await checkExtremeSimilarity(copied, { rootDir })).ok, false);
  assert.equal((await checkExtremeSimilarity(distinct, { rootDir })).ok, true);
});

test('short complete and near-identical notes receive a real similarity score', () => {
  const original = '## 学到什么\n\n好比门卫检查通行证。\n\n## 核心机制\n\n输入经过验证后输出结果。';
  const exact = original;
  const near = original.replace('输出结果', '返回结果');
  assert.equal(similarityScore(original, exact), 1);
  assert.equal(similarityScore(original, near) > 0.8, true);
});

test('corpus report is deterministic and report-only', async () => {
  const rootDir = await tempCorpus();
  const body = longBody('一致内容');
  await fs.writeFile(path.join(rootDir, 'src/content/docs/papers/one.md'), `---\ntitle: One\n---\n${body}`, 'utf8');
  await fs.writeFile(path.join(rootDir, 'src/content/docs/projects/two.md'), `---\ntitle: Two\n---\n${body}`, 'utf8');
  const first = await analyzeTemplateSimilarity({ rootDir });
  const second = await analyzeTemplateSimilarity({ rootDir });
  assert.equal(JSON.stringify(first), JSON.stringify(second));
  assert.equal(first.readonly, true);
  assert.equal(first.summary.total_notes, 2);
  assert.equal(first.summary.top_h2_signature_count, 2);
  assert.equal(first.summary.exact_body_duplicate_groups, 1);
});

test('recursive discovery reports nested Markdown as noncanonical instead of ignoring it', async () => {
  const rootDir = await tempCorpus();
  const nested = path.join(rootDir, 'src/content/docs/projects/nested/example.md');
  await fs.mkdir(path.dirname(nested), { recursive: true });
  await fs.writeFile(nested, `---\ntitle: Nested\n---\n${longBody('嵌套笔记')}`, 'utf8');
  const report = await analyzeTemplateSimilarity({ rootDir });
  assert.equal(report.summary.total_notes, 1);
  assert.equal(report.summary.noncanonical_note_paths, 1);
  assert.deepEqual(report.noncanonical_note_paths, ['src/content/docs/projects/nested/example.md']);
});

test('top-level MDX participates in the report and is marked noncanonical', async () => {
  const rootDir = await tempCorpus();
  const mdx = path.join(rootDir, 'src/content/docs/papers/example.mdx');
  await fs.writeFile(mdx, `---\ntitle: MDX\n---\n${longBody('MDX 笔记')}`, 'utf8');
  const report = await analyzeTemplateSimilarity({ rootDir });
  assert.equal(report.summary.total_notes, 1);
  assert.equal(report.summary.noncanonical_note_paths, 1);
  assert.deepEqual(report.noncanonical_note_paths, ['src/content/docs/papers/example.mdx']);
});

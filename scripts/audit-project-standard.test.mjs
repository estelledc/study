import assert from 'node:assert/strict';
import test from 'node:test';

import { evaluateProjectNote } from './audit-project-standard.mjs';

const completeNote = `---
title: Example
来源: https://example.com/repo
trust:
  version: study-v2
  canonical_source: https://example.com/repo
  immutable_revision: abcdef123456
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
---
## 是什么
比如一个路由器。
## 为什么重要
价值明确。
## 核心机制
输入经过流程后得到输出。
## 实践案例
\`\`\`sh
echo ok
\`\`\`
## 取舍与限制
有代价。
## 学到什么
能解释机制。
## 自测
问题一？问题二？问题三？检查点：看答案。
## 延伸阅读
来源。
`;

test('recognizes a benchmark-aligned project page', () => {
  const result = evaluateProjectNote(completeNote, 'example');
  assert.equal(result.status, 'benchmark-aligned');
  assert.deepEqual(result.missing, []);
});

test('separates strong legacy structure from evidence readiness', () => {
  const legacy = completeNote
    .replace(/\ntrust:\n[\s\S]*?\n---/, '\n---');
  const result = evaluateProjectNote(legacy, 'legacy');
  assert.equal(result.status, 'needs-evidence');
  assert.ok(result.missing.includes('pinned_revision'));
  assert.ok(result.missing.includes('evidence_boundary'));
});

test('reports weak pages as structural work', () => {
  const result = evaluateProjectNote(
    '---\ntitle: Thin\n来源: https://example.com\n---\n## 是什么\n一句话。\n',
    'thin',
  );
  assert.equal(result.status, 'needs-structure');
});

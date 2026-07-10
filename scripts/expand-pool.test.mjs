import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildOrganicCandidates,
  extractOrganicLinksFromNote,
  extractTargetSections,
} from './expand-pool.mjs';

test('extractTargetSections keeps only extension and relation sections', () => {
  const text = [
    '---',
    '分类: databases',
    '---',
    '## 是什么',
    'ignore [[outside]]',
    '## 延伸阅读',
    '- [[paper-a]]',
    '## 其他',
    'ignore [[other]]',
    '## 关联',
    '- [[project-b]]',
  ].join('\n');
  const target = extractTargetSections(text);

  assert.match(target, /\[\[paper-a\]\]/);
  assert.match(target, /\[\[project-b\]\]/);
  assert.doesNotMatch(target, /\[\[outside\]\]/);
  assert.doesNotMatch(target, /\[\[other\]\]/);
});

test('extractOrganicLinksFromNote records category and source references', () => {
  const links = extractOrganicLinksFromNote([
    '---',
    '分类: compilers',
    '---',
    '## 延伸阅读',
    '- [[ssa]]',
    '- [[ssa]]',
  ].join('\n'), 'papers', 'source-note');

  assert.deepEqual(links.get('ssa'), {
    count: 2,
    sources: ['papers::source-note', 'papers::source-note'],
    category: 'compilers',
  });
});

test('buildOrganicCandidates excludes existing, written, and red-line slugs before picking top target', () => {
  const papersLinks = new Map([
    ['existing', { count: 10, sources: ['papers/a'], category: 'db' }],
    ['written', { count: 9, sources: ['papers/a'], category: 'db' }],
    ['fresh-a', { count: 3, sources: ['papers/a'], category: 'db' }],
    ['fresh-b', { count: 5, sources: ['papers/b'], category: 'db' }],
    ['sankuai-case', { count: 99, sources: ['papers/c'], category: 'db' }],
  ]);
  const projectsLinks = new Map([
    ['fresh-project', { count: 4, sources: ['projects/x'], category: 'tools' }],
    ['fresh-a', { count: 4, sources: ['projects/x'], category: 'tools' }],
  ]);

  const result = buildOrganicCandidates({
    papersLinks,
    projectsLinks,
    existing: [{ area: 'projects', slug: 'existing' }],
    writtenPapers: new Set(['written']),
    writtenProjects: new Set(),
    target: 2,
  });

  assert.deepEqual(result.picked.map((candidate) => [candidate.area, candidate.slug, candidate.organic_freq]), [
    ['papers', 'fresh-b', 5],
    ['projects', 'fresh-project', 4],
  ]);
  assert.ok(!result.newCandidates.some((candidate) => candidate.slug === 'sankuai-case'));
});

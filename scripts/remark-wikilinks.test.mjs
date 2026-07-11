import assert from 'node:assert/strict';
import test from 'node:test';

import { createAliasIndex, createNoteIndex } from './lib/note-id.mjs';
import { createRemarkWikilinks } from './remark-wikilinks.mjs';

const docsDir = '/repo/src/content/docs';
const noteIndex = createNoteIndex([
  { area: 'papers', slug: 'react' },
  { area: 'projects', slug: 'react' },
  { area: 'papers', slug: 'tls-1.3' },
  { area: 'projects', slug: 'dash.js' },
]);
const aliasIndex = createAliasIndex([
  { from: 'papers::transport-security', to: 'papers::tls-1.3' },
], noteIndex);

function transform(value, filePath) {
  const tree = { type: 'root', children: [{ type: 'paragraph', children: [{ type: 'text', value }] }] };
  createRemarkWikilinks({ noteIndex, aliasIndex, docsDir, base: '/study' })(tree, { path: filePath });
  return tree.children[0].children;
}

test('bare duplicate links preserve same-area behavior', () => {
  const paper = transform('[[react]]', `${docsDir}/papers/source.md`)[0];
  const project = transform('[[react]]', `${docsDir}/projects/source.md`)[0];
  assert.equal(paper.url, '/study/papers/react/');
  assert.equal(project.url, '/study/projects/react/');
});

test('slash and colon namespaces plus dotted slugs share one parser', () => {
  const nodes = transform(
    '[[papers/tls-1.3|TLS 1.3]] / [[projects:dash.js|Dash.js]]',
    `${docsDir}/papers/source.md`,
  );
  assert.equal(nodes[0].url, '/study/papers/tls-1.3/');
  assert.equal(nodes[0].children[0].value, 'TLS 1.3');
  assert.equal(nodes[2].url, '/study/projects/dash.js/');
});

test('aliases resolve to canonical URLs without changing URL shape', () => {
  const node = transform('[[transport-security|传输安全]]', `${docsDir}/papers/source.md`)[0];
  assert.equal(node.url, '/study/papers/tls-1.3/');
  assert.equal(node.children[0].value, '传输安全');
});

test('top-level duplicates and missing targets become escaped broken spans', () => {
  const duplicate = transform('[[react]]', `${docsDir}/start.md`)[0];
  const missing = transform('[[not-found|<未知>]]', `${docsDir}/papers/source.md`)[0];
  assert.equal(duplicate.type, 'html');
  assert.match(duplicate.value, /ambiguous target/);
  assert.match(duplicate.value, /aria-label="未解析链接：react"/);
  assert.equal(missing.type, 'html');
  assert.match(missing.value, /&lt;未知&gt;/);
});

test('wikilinks inside existing Markdown links are not nested', () => {
  const tree = {
    type: 'root',
    children: [{
      type: 'paragraph',
      children: [{ type: 'link', url: '/existing', children: [{ type: 'text', value: '[[react]]' }] }],
    }],
  };
  createRemarkWikilinks({ noteIndex, aliasIndex, docsDir })(tree, { path: `${docsDir}/papers/source.md` });
  assert.equal(tree.children[0].children[0].children[0].value, '[[react]]');
});

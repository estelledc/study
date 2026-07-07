import assert from 'node:assert/strict';
import test from 'node:test';

import {
  extractFrontmatterBlock,
  hasFrontmatterKey,
  parseFrontmatterLoose,
  replaceFrontmatterBlock,
} from './frontmatter.mjs';

test('extractFrontmatterBlock returns block and body', () => {
  const extracted = extractFrontmatterBlock('---\ntitle: React\n---\n# Body\n');
  assert.equal(extracted.block, 'title: React');
  assert.equal(extracted.body, '# Body\n');
});

test('parseFrontmatterLoose parses normal YAML', () => {
  const parsed = parseFrontmatterLoose('---\ntitle: React\nsidebar:\n  order: 1\n---\n');
  assert.deepEqual(parsed, { title: 'React', sidebar: { order: 1 } });
});

test('parseFrontmatterLoose falls back to key-value parsing for legacy invalid YAML', () => {
  const parsed = parseFrontmatterLoose('---\ntitle: value: extra\ndescription: a, b\n---\n');
  assert.deepEqual(parsed, { title: 'value: extra', description: 'a, b' });
});

test('missing frontmatter returns null and no key hits', () => {
  assert.equal(extractFrontmatterBlock('# Body\n'), null);
  assert.equal(parseFrontmatterLoose('# Body\n'), null);
  assert.equal(hasFrontmatterKey('# Body\n', 'title'), false);
});

test('hasFrontmatterKey and replaceFrontmatterBlock operate on the block only', () => {
  const text = '---\ntitle: Old\n---\ntitle: Body\n';
  assert.equal(hasFrontmatterKey(text, 'title'), true);
  assert.equal(replaceFrontmatterBlock(text, 'title: New'), '---\ntitle: New\n---\ntitle: Body\n');
});

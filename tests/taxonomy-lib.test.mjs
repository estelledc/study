// tests/taxonomy-lib.test.mjs
// Tests for scripts/taxonomy-lib.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTaxonomy } from '../scripts/taxonomy-lib.mjs';

await test('taxonomy loads successfully', async () => {
  const t = await loadTaxonomy();
  assert.ok(t, 'taxonomy should be truthy');
  assert.ok(Array.isArray(t.themes), 'themes should be an array');
  assert.ok(t.themes.length > 0, 'should have at least one theme');
});

await test('taxonomy has required fields', async () => {
  const t = await loadTaxonomy();
  for (const theme of t.themes) {
    assert.ok(theme.id, 'theme should have id');
    assert.ok(theme.label, 'theme should have label');
    assert.ok(typeof theme.order === 'number', 'theme.order should be a number');
  }
});

await test('taxonomy has "其他" fallback theme', async () => {
  const t = await loadTaxonomy();
  const other = t.themes.find(x => x.label === '其他');
  assert.ok(other, 'taxonomy should have 其他 fallback theme');
  assert.equal(other.order, 99, '其他 should have order 99');
});

await test('topicLabels maps exist', async () => {
  const t = await loadTaxonomy();
  assert.ok(typeof t.topicLabels === 'object', 'topicLabels should be an object');
  assert.ok(Object.keys(t.topicLabels).length > 0, 'topicLabels should not be empty');
});

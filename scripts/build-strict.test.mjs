import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { clearAstroCache } from './build-strict.mjs';

test('strict builds clear generated and content-layer Astro caches only', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'study-build-strict-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  fs.mkdirSync(path.join(root, '.astro'), { recursive: true });
  fs.writeFileSync(path.join(root, '.astro', 'content-assets.mjs'), 'stale');
  fs.mkdirSync(path.join(root, 'node_modules', '.astro'), { recursive: true });
  fs.writeFileSync(path.join(root, 'node_modules', '.astro', 'data-store.json'), '{}');
  fs.writeFileSync(path.join(root, 'node_modules', 'keep.txt'), 'dependency');
  fs.writeFileSync(path.join(root, 'keep.txt'), 'source');

  clearAstroCache(root);

  assert.equal(fs.existsSync(path.join(root, '.astro')), false);
  assert.equal(fs.existsSync(path.join(root, 'node_modules', '.astro')), false);
  assert.equal(fs.readFileSync(path.join(root, 'keep.txt'), 'utf8'), 'source');
  assert.equal(fs.readFileSync(path.join(root, 'node_modules', 'keep.txt'), 'utf8'), 'dependency');
});

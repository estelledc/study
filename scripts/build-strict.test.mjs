import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { clearAstroCache } from './build-strict.mjs';

test('strict builds clear only the derived Astro cache', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'study-build-strict-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  fs.mkdirSync(path.join(root, '.astro'), { recursive: true });
  fs.writeFileSync(path.join(root, '.astro', 'content-assets.mjs'), 'stale');
  fs.writeFileSync(path.join(root, 'keep.txt'), 'source');

  clearAstroCache(root);

  assert.equal(fs.existsSync(path.join(root, '.astro')), false);
  assert.equal(fs.readFileSync(path.join(root, 'keep.txt'), 'utf8'), 'source');
});

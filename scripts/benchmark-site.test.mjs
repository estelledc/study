import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  checkPerformanceBudget,
  collectPerformanceMetrics,
  comparePerformance,
} from './benchmark-site.mjs';

test('collects deterministic size metrics and checks hard budgets', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'study-perf-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'dist', 'pagefind'), { recursive: true });
  fs.mkdirSync(path.join(root, 'public'), { recursive: true });
  fs.writeFileSync(path.join(root, 'dist', 'index.html'), 'x'.repeat(20));
  fs.writeFileSync(path.join(root, 'dist', 'pagefind', 'index.js'), 'x'.repeat(8));
  fs.writeFileSync(path.join(root, 'public', 'asset.webp'), 'x'.repeat(5));
  const metrics = collectPerformanceMetrics(root);
  assert.equal(metrics.dist.files, 2);
  assert.equal(metrics.dist.largest_html.bytes, 20);
  const generous = {
    dist: { max_files: 3, max_bytes: 30, max_html_bytes: 20 },
    pagefind: { max_files: 1, max_bytes: 8 },
    public: { max_files: 1, max_bytes: 5 },
  };
  assert.deepEqual(checkPerformanceBudget(metrics, generous), []);
  const failures = checkPerformanceBudget(metrics, { ...generous, dist: { ...generous.dist, max_html_bytes: 19 } });
  assert.deepEqual(failures, ['dist.largest_html.bytes=20 exceeds 19']);
});

test('reports baseline-relative regressions without absolute paths or environment values', () => {
  const baseline = { dist: { bytes: 100 }, pagefind: { bytes: 20 } };
  const current = { dist: { bytes: 112 }, pagefind: { bytes: 21 } };
  const result = comparePerformance(current, baseline, {
    'dist.bytes': 0.1,
    'pagefind.bytes': 0.1,
  });
  assert.deepEqual(result.failures, ['dist.bytes=112 exceeds baseline=100, threshold=111']);
  assert.equal(JSON.stringify(result).includes(process.env.HOME || '/no-home'), false);
});

test('fails closed when a required comparable metric is missing', () => {
  const result = comparePerformance({ dist: {} }, { dist: { bytes: 10 } }, { 'dist.bytes': 0.1 });
  assert.deepEqual(result.failures, [
    'dist.bytes cannot be compared because current, baseline, or growth limit is missing',
  ]);
});

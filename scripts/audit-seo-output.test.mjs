import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { auditSeoOutput, parseSeoArgs } from './audit-seo-output.mjs';

test('--json does not become the dist directory', () => {
  const parsed = parseSeoArgs(['--json']);
  assert.equal(parsed.json, true);
  assert.equal(path.basename(parsed.distDir), 'dist');
});

test('validates canonical, sitemap, robots, and /study targets', (t) => {
  const dist = fs.mkdtempSync(path.join(os.tmpdir(), 'study-seo-'));
  t.after(() => fs.rmSync(dist, { recursive: true, force: true }));
  fs.mkdirSync(path.join(dist, 'start'), { recursive: true });
  fs.writeFileSync(path.join(dist, 'index.html'), '<link rel="canonical" href="https://estelledc.github.io/study/">');
  fs.writeFileSync(path.join(dist, 'start', 'index.html'), '<link rel="canonical" href="https://estelledc.github.io/study/start/">');
  fs.writeFileSync(path.join(dist, 'sitemap-0.xml'), '<urlset><url><loc>https://estelledc.github.io/study/</loc></url><url><loc>https://estelledc.github.io/study/start/</loc></url></urlset>');
  fs.writeFileSync(path.join(dist, 'robots.txt'), 'User-agent: *\nAllow: /\nSitemap: https://estelledc.github.io/study/sitemap-index.xml\n');
  assert.deepEqual(auditSeoOutput(dist).failures, []);
  fs.writeFileSync(path.join(dist, 'start', 'index.html'), '<h1>no canonical</h1>');
  assert.ok(auditSeoOutput(dist).failures.some((failure) => failure.includes('0 canonical')));
});

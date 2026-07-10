import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import sharp from 'sharp';

import { buildAssetReport } from './audit-assets.mjs';

test('audits base-safe image URLs, alt text, targets, dimensions, and orphans', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'study-assets-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const publicDir = path.join(root, 'public');
  const docsDir = path.join(root, 'docs');
  fs.mkdirSync(path.join(publicDir, 'projects', 'demo'), { recursive: true });
  fs.mkdirSync(docsDir, { recursive: true });
  await sharp({ create: { width: 2, height: 3, channels: 3, background: '#fff' } })
    .webp()
    .toFile(path.join(publicDir, 'projects', 'demo', 'used.webp'));
  await sharp({ create: { width: 1, height: 1, channels: 3, background: '#000' } })
    .webp()
    .toFile(path.join(publicDir, 'orphan.webp'));
  fs.writeFileSync(path.join(docsDir, 'demo.md'), [
    '![Used](/study/projects/demo/used.webp)',
    '![](/projects/demo/used.webp)',
    '![Missing](/study/projects/demo/missing.webp)',
    '```md',
    '![Example only](/ignored/example.webp)',
    '```',
  ].join('\n'));
  fs.writeFileSync(path.join(docsDir, 'extra.mdx'), '![MDX image](/study/projects/demo/used.webp)\n');
  fs.writeFileSync(path.join(docsDir, 'decorative.md'), [
    '<!-- decorative -->',
    '![](/study/projects/demo/used.webp)',
  ].join('\n'));

  const report = await buildAssetReport({ publicDir, docsDir });
  assert.equal(report.manifest.summary.assets, 2);
  assert.deepEqual(report.orphanPaths, ['public/orphan.webp']);
  assert.ok(report.issues.some((issue) => issue.includes('alt text is empty')));
  assert.ok(report.issues.some((issue) => issue.includes('bypasses the /study base')));
  assert.ok(report.issues.some((issue) => issue.includes('target is missing')));
  assert.equal(report.issues.some((issue) => issue.includes('decorative.md')), false);
  const used = report.manifest.assets.find((asset) => asset.path.endsWith('used.webp'));
  assert.equal(used.width, 2);
  assert.equal(used.height, 3);
  assert.equal(used.referenced_by.some((source) => source.includes('extra.mdx')), true);
});

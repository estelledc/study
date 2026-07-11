import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import sharp from 'sharp';

import {
  buildAssetReport,
  collectSiteMetadataImageReferences,
  evaluateOrphanLifecycle,
} from './audit-assets.mjs';

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

  const report = await buildAssetReport({ publicDir, docsDir, configFile: null });
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

test('treats canonical site metadata images as first-class asset references', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'study-metadata-assets-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const publicDir = path.join(root, 'public');
  const docsDir = path.join(root, 'docs');
  const configFile = path.join(root, 'astro.config.mjs');
  fs.mkdirSync(publicDir, { recursive: true });
  fs.mkdirSync(docsDir, { recursive: true });
  await sharp({ create: { width: 1200, height: 630, channels: 3, background: '#fff' } })
    .webp()
    .toFile(path.join(publicDir, 'og-study.webp'));
  fs.writeFileSync(configFile, [
    "content: 'https://estelledc.github.io/study/og-study.webp',",
    "content: 'https://example.com/study/external.webp',",
  ].join('\n'));

  assert.deepEqual(collectSiteMetadataImageReferences(configFile), [{
    kind: 'metadata',
    source: 'astro.config.mjs',
    line: 1,
    url: '/study/og-study.webp',
  }]);
  const report = await buildAssetReport({ publicDir, docsDir, configFile });
  assert.deepEqual(report.orphanPaths, []);
  assert.deepEqual(report.issues, []);
  assert.deepEqual(report.manifest.assets[0].referenced_by, ['astro.config.mjs:1']);
});

test('requires explicit provenance for newly retained orphan assets', () => {
  const commit = '7'.repeat(40);
  const lifecycle = evaluateOrphanLifecycle(
    ['public/legacy.webp', 'public/new.webp'],
    ['public/legacy.webp'],
    [{
      path: 'public/new.webp',
      reason: 'Reference was removed upstream; retain until a dedicated deletion review.',
      source_commit: commit,
      disposition: 'retain-pending-dedicated-deletion',
    }],
  );
  assert.deepEqual(lifecycle.issues, []);
  assert.deepEqual(lifecycle.allowedOrphans, ['public/new.webp']);
  assert.deepEqual(lifecycle.newOrphans, []);

  const stale = evaluateOrphanLifecycle([], [], [{
    path: 'public/new.webp',
    reason: 'Reference was removed upstream; retain until a dedicated deletion review.',
    source_commit: commit,
    disposition: 'retain-pending-dedicated-deletion',
  }]);
  assert.equal(stale.issues.some((issue) => issue.includes('stale or missing')), true);
});

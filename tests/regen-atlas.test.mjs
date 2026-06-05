// tests/regen-atlas.test.mjs
// Integration test: regen-atlas.mjs produces valid output

import test from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

await test('regen-atlas runs without error', () => {
  assert.doesNotThrow(() => {
    execSync('node scripts/regen-atlas.mjs', {
      cwd: ROOT,
      encoding: 'utf8',
      timeout: 60000,
    });
  }, 'regen-atlas should run without throwing');
});

await test('papers-atlas.md is generated and contains expected sections', async () => {
  const atlasPath = path.join(ROOT, 'src/content/docs/papers-atlas.md');
  const content = await fs.readFile(atlasPath, 'utf8');
  assert.ok(content.includes('## 全部'), 'papers-atlas should have 全部 section');
  assert.ok(content.includes('| 论文 | 质量 |'), 'papers-atlas should have quality column');
  assert.ok(content.includes('✅ v3') || content.includes('🗄 存量'), 'papers-atlas should have quality badges');
});

await test('projects-atlas.md is generated and contains expected sections', async () => {
  const atlasPath = path.join(ROOT, 'src/content/docs/projects-atlas.md');
  const content = await fs.readFile(atlasPath, 'utf8');
  assert.ok(content.includes('## 全部'), 'projects-atlas should have 全部 section');
  assert.ok(content.includes('| 项目 | 质量 |'), 'projects-atlas should have quality column');
});

await test('atlas contains hindley-milner entry', async () => {
  const atlasPath = path.join(ROOT, 'src/content/docs/papers-atlas.md');
  const content = await fs.readFile(atlasPath, 'utf8');
  assert.ok(content.includes('hindley-milner'), 'papers-atlas should contain hindley-milner');
});

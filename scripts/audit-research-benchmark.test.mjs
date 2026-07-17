import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { auditResearchBenchmark } from './audit-research-benchmark.mjs';

test('current repository satisfies the imported research contract', async () => {
  const result = await auditResearchBenchmark();
  assert.deepEqual(result.failures, []);
  assert.equal(result.summary.categories, 14);
  assert.equal(result.summary.lab_test_modules, 11);
});

test('fails closed on old parent paths', async () => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'research-audit-'));
  const researchRoot = path.join(
    rootDir,
    'src',
    'content',
    'docs',
    'research',
  );
  await fs.mkdir(path.join(researchRoot, 'research-refresh-program'), {
    recursive: true,
  });
  await fs.writeFile(
    path.join(researchRoot, 'research-refresh-program', 'manifest.json'),
    JSON.stringify({
      expected: {
        categories: 0,
        member_relationships: 0,
        unique_upstreams: 0,
        category_markdown_files: 0,
        lab_test_modules: 0,
      },
      categories: [],
    }),
  );
  await fs.writeFile(
    path.join(researchRoot, 'README.md'),
    '---\ntitle: "bad"\n---\n# bad\n\nexplorations/research/repos/x\n',
  );
  const result = await auditResearchBenchmark({ rootDir });
  assert.ok(result.failures.some((failure) => (
    failure.endsWith(':legacy-research-path')
  )));
});

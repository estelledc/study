import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { auditPagesArtifact } from './audit-pages-artifact.mjs';

test('accepts normal Pages files and rejects public diagnostics', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'study-pages-audit-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'projects'), { recursive: true });
  fs.mkdirSync(path.join(root, 'papers', 'resolution-diagnostics-llm'), { recursive: true });
  fs.writeFileSync(path.join(root, 'index.html'), '<h1>Study</h1>');
  fs.writeFileSync(path.join(root, 'papers', 'resolution-diagnostics-llm', 'index.html'), '<h1>Legitimate page</h1>');
  assert.deepEqual(auditPagesArtifact(root), []);

  for (const relative of ['build-info.txt', 'build.log', 'assets/site-diagnostics.json']) {
    const file = path.join(root, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, 'fixture');
  }
  const failures = auditPagesArtifact(root);
  assert.equal(failures.length, 3);
  assert.ok(failures.every((failure) => failure.includes('must not be published')));
});

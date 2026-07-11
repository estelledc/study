import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { summarizeBuild } from './build-diagnostics.mjs';

test('emits only aggregate diagnostics and never copies log content', (t) => {
  const dist = fs.mkdtempSync(path.join(os.tmpdir(), 'study-diagnostics-'));
  t.after(() => fs.rmSync(dist, { recursive: true, force: true }));
  fs.writeFileSync(path.join(dist, 'index.html'), '<h1>Study</h1>');
  fs.writeFileSync(path.join(dist, 'asset.js'), 'x');
  const runnerPath = `/${'home'}/runner`;
  const secret = `TOKEN=fake-secret ${runnerPath}/work/study/study \u001b[31mWarning\u001b[0m Error`;

  const payload = summarizeBuild({ logText: secret, distDir: dist });
  const serialized = JSON.stringify(payload);
  assert.equal(payload.dist.files, 2);
  assert.equal(payload.dist.html_files, 1);
  assert.equal(payload.build_log.warning_lines, 1);
  assert.equal(payload.build_log.error_lines, 1);
  for (const forbidden of ['fake-secret', runnerPath, 'TOKEN=', 'study/study']) {
    assert.equal(serialized.includes(forbidden), false);
  }
});

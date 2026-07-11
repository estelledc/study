import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { auditDocLifecycle, LIFECYCLE_CONTRACT } from './audit-doc-lifecycle.mjs';

test('current repository satisfies the operations document lifecycle contract', () => {
  assert.deepEqual(auditDocLifecycle(), []);
});

test('missing lifecycle evidence is reported without echoing document contents', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'study-doc-lifecycle-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const contract of LIFECYCLE_CONTRACT) {
    const file = path.join(root, contract.path);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, 'placeholder\n');
  }
  const failures = auditDocLifecycle(root);
  assert.equal(failures.length > 0, true);
  assert.equal(failures.every((failure) => !failure.includes('placeholder')), true);
});

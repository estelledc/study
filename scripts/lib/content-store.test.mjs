import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { countNoteFiles, listNoteFiles, noteSlugFromFilename } from './content-store.mjs';

async function tempDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'study-content-store-'));
}

test('noteSlugFromFilename accepts content markdown and rejects support files', () => {
  assert.equal(noteSlugFromFilename('raft.md'), 'raft');
  assert.equal(noteSlugFromFilename('_template.md'), null);
  assert.equal(noteSlugFromFilename('notes.txt'), null);
});

test('listNoteFiles returns sorted markdown notes and ignores underscore files', async () => {
  const dir = await tempDir();
  await fs.writeFile(path.join(dir, 'zeta.md'), '', 'utf8');
  await fs.writeFile(path.join(dir, '_draft.md'), '', 'utf8');
  await fs.writeFile(path.join(dir, 'alpha.md'), '', 'utf8');
  await fs.writeFile(path.join(dir, 'readme.txt'), '', 'utf8');

  assert.deepEqual(await listNoteFiles(dir), ['alpha.md', 'zeta.md']);
  assert.equal(await countNoteFiles(dir), 2);
});

test('listNoteFiles returns empty arrays for missing directories', async () => {
  const dir = path.join(await tempDir(), 'missing');

  assert.deepEqual(await listNoteFiles(dir), []);
  assert.equal(await countNoteFiles(dir), 0);
});

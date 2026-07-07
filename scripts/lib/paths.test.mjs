import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';

import {
  CANDIDATES_PATH,
  DATA_DIR,
  DOCS_DIR,
  DOCS_RELATIVE_DIR,
  PAPERS_DIR,
  PROJECTS_DIR,
  ROOT,
  docsAreaDir,
  docsEntryRelativePath,
  docsEntryPath,
} from './paths.mjs';

test('paths point at the study repository layout', () => {
  assert.equal(path.basename(ROOT), 'study');
  assert.equal(DOCS_RELATIVE_DIR, 'src/content/docs');
  assert.equal(DOCS_DIR, path.join(ROOT, DOCS_RELATIVE_DIR));
  assert.equal(PAPERS_DIR, path.join(DOCS_DIR, 'papers'));
  assert.equal(PROJECTS_DIR, path.join(DOCS_DIR, 'projects'));
  assert.equal(CANDIDATES_PATH, path.join(DATA_DIR, 'candidates.jsonl'));
});

test('docsAreaDir and docsEntryPath resolve known areas', () => {
  assert.equal(docsAreaDir('papers'), PAPERS_DIR);
  assert.equal(docsAreaDir('projects'), PROJECTS_DIR);
  assert.equal(docsEntryPath('papers', 'react'), path.join(PAPERS_DIR, 'react.md'));
  assert.equal(docsEntryRelativePath('projects', 'react'), path.join(DOCS_RELATIVE_DIR, 'projects', 'react.md'));
});

test('docsAreaDir rejects unknown areas', () => {
  assert.throws(() => docsAreaDir('notes'), /Unknown docs area/);
});

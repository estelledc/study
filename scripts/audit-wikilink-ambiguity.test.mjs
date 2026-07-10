import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  auditWikilinks,
  baselineFromAudit,
} from './audit-wikilink-ambiguity.mjs';
import { loadNoteRecords } from './lib/note-id.mjs';

function fixture(t) {
  const docsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'study-wikilink-audit-'));
  t.after(() => fs.rmSync(docsDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }));
  return docsDir;
}

function write(docsDir, relative, content) {
  const file = path.join(docsDir, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

function scan(docsDir, options = {}) {
  return auditWikilinks({
    docsDir,
    noteRecords: loadNoteRecords({ docsDir }),
    enforceBaseline: false,
    ...options,
  });
}

test('same-area bare, dotted, slash, and colon links resolve without blocking', (t) => {
  const docsDir = fixture(t);
  write(docsDir, 'papers/react.md', '[[react]] [[papers/tls-1.3]] [[projects:dash.js]]');
  write(docsDir, 'papers/tls-1.3.md', '');
  write(docsDir, 'projects/react.md', '[[react]]');
  write(docsDir, 'projects/dash.js.md', '');
  const result = scan(docsDir);
  assert.equal(result.valid, true);
  assert.equal(result.summary.blocking, 0);
  assert.equal(result.summary.unresolved_occurrences, 0);
});

test('top-level duplicate and explicit missing targets remain blocking', (t) => {
  const docsDir = fixture(t);
  write(docsDir, 'papers/react.md', '[[papers/missing]]');
  write(docsDir, 'projects/react.md', '');
  write(docsDir, 'start.md', '[[react]]');
  const result = scan(docsDir);
  assert.equal(result.valid, false);
  assert.equal(result.summary.blocking, 2);
  assert.equal(result.summary.namespaced_missing, 1);
});

test('baseline classifies every historical group and rejects one new unknown', (t) => {
  const docsDir = fixture(t);
  write(docsDir, 'papers/source.md', '[[planned-target]] [[legacy-unknown]]');
  const initial = scan(docsDir);
  const baseline = baselineFromAudit(initial, { sourceCommit: 'a'.repeat(40) });
  baseline.groups.find((group) => group.target === 'planned-target').category = 'planned-note';
  baseline.groups.find((group) => group.target === 'planned-target').owner = 'learning-roadmap';
  baseline.groups.find((group) => group.target === 'planned-target').decision = 'requires-explicit-approval';
  baseline.budgets.unknown_occurrences = 1;

  const stable = scan(docsDir, { baseline, enforceBaseline: true });
  assert.equal(stable.valid, true);
  assert.equal(stable.summary.categories['planned-note'], 1);
  assert.equal(stable.summary.categories.unknown, 1);

  write(docsDir, 'papers/source.md', '[[planned-target]] [[legacy-unknown]] [[new-unknown]]');
  const grown = scan(docsDir, { baseline, enforceBaseline: true });
  assert.equal(grown.valid, false);
  assert.ok(grown.budget_failures.some((failure) => failure.reason === 'new unresolved group'));
});

test('aliases resolve while cycles and ambiguous definitions fail closed', (t) => {
  const docsDir = fixture(t);
  write(docsDir, 'papers/source.md', '[[old-target]]');
  write(docsDir, 'papers/target.md', '');
  const resolved = scan(docsDir, {
    aliasRecords: [{ from: 'papers::old-target', to: 'papers::target' }],
  });
  assert.equal(resolved.summary.alias_resolved_occurrences, 1);
  assert.equal(resolved.summary.unresolved_occurrences, 0);

  assert.throws(() => scan(docsDir, { aliasRecords: [
    { from: 'papers::one', to: 'papers::two' },
    { from: 'papers::two', to: 'papers::one' },
  ] }), (error) => error?.code === 'ALIAS_CYCLE');
  assert.throws(() => scan(docsDir, { aliasRecords: [
    { from: 'papers::old', to: 'papers::target' },
    { from: 'papers::old', to: 'papers::source' },
  ] }), (error) => error?.code === 'ALIAS_AMBIGUOUS');
});

test('classification output aggregates source NoteId and target without copying body text', (t) => {
  const docsDir = fixture(t);
  write(docsDir, 'papers/source.md', 'private prose [[missing]] private prose\n[[missing]]');
  const result = scan(docsDir);
  assert.deepEqual(result.unresolved_groups, [{
    source_id: 'papers::source',
    target: 'missing',
    count: 2,
    category: 'unknown',
    owner: 'content-maintainers',
    decision: 'triage-required',
  }]);
  assert.doesNotMatch(JSON.stringify(result), /private prose/);
});

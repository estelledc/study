import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createAliasIndex,
  createNoteIndex,
  extractWikilinks,
  formatWikilinkTarget,
  parseNoteId,
  parseWikilinkTarget,
  resolveWikilink,
  serializeNoteId,
  slugFromNoteFilename,
} from './note-id.mjs';

const noteIndex = createNoteIndex([
  { area: 'papers', slug: 'react' },
  { area: 'projects', slug: 'react' },
  { area: 'papers', slug: 'tls-1.3' },
  { area: 'projects', slug: 'dash.js' },
  { area: 'projects', slug: 'unique-project' },
]);

function expectCode(fn, code) {
  assert.throws(fn, (error) => error?.code === code);
}

test('NoteId and filename grammar supports real dotted slugs', () => {
  assert.equal(serializeNoteId('papers', 'tls-1.3'), 'papers::tls-1.3');
  assert.deepEqual(parseNoteId('projects::dash.js'), {
    id: 'projects::dash.js',
    area: 'projects',
    slug: 'dash.js',
  });
  assert.equal(slugFromNoteFilename('gemini-1.5-2024.md'), 'gemini-1.5-2024');
  expectCode(() => serializeNoteId('notes', 'react'), 'AREA_INVALID');
  expectCode(() => serializeNoteId('papers', '../react'), 'SLUG_INVALID');
});

test('parseWikilinkTarget preserves bare, slash, and colon syntax', () => {
  assert.deepEqual(parseWikilinkTarget('react'), {
    valid: true,
    kind: 'bare',
    raw: 'react',
    slug: 'react',
  });
  assert.equal(parseWikilinkTarget('papers/tls-1.3').id, 'papers::tls-1.3');
  assert.equal(parseWikilinkTarget('projects:dash.js').id, 'projects::dash.js');
  assert.equal(parseWikilinkTarget('papers::react').valid, false);
});

test('bare duplicates prefer the source area while top-level remains ambiguous', () => {
  assert.equal(resolveWikilink('react', { sourceArea: 'papers', noteIndex }).id, 'papers::react');
  assert.equal(resolveWikilink('react', { sourceArea: 'projects', noteIndex }).id, 'projects::react');
  assert.match(resolveWikilink('react', { noteIndex }).reason, /ambiguous/);
  assert.equal(resolveWikilink('unique-project', { sourceArea: 'papers', noteIndex }).id, 'projects::unique-project');
});

test('explicit namespace and dotted slugs resolve to stable NoteIds', () => {
  assert.equal(resolveWikilink('papers/tls-1.3', { noteIndex }).id, 'papers::tls-1.3');
  assert.equal(resolveWikilink('projects:dash.js', { noteIndex }).id, 'projects::dash.js');
  assert.match(resolveWikilink('papers/missing', { noteIndex }).reason, /missing namespace/);
});

test('aliases resolve explicitly and by unique or same-area bare target', () => {
  const aliasIndex = createAliasIndex([
    { from: 'papers::old-react', to: 'papers::react' },
    { from: 'projects::dashboard-js', to: 'projects::dash.js' },
    { from: 'papers::chain-start', to: 'papers::old-react' },
  ], noteIndex);
  assert.equal(resolveWikilink('papers/old-react', { noteIndex, aliasIndex }).id, 'papers::react');
  assert.equal(resolveWikilink('old-react', { sourceArea: 'papers', noteIndex, aliasIndex }).id, 'papers::react');
  assert.equal(resolveWikilink('dashboard-js', { noteIndex, aliasIndex }).id, 'projects::dash.js');
  assert.equal(resolveWikilink('chain-start', { sourceArea: 'papers', noteIndex, aliasIndex }).id, 'papers::react');
});

test('alias collisions, ambiguity, missing targets, and cycles fail closed', () => {
  expectCode(
    () => createAliasIndex([{ from: 'papers::react', to: 'papers::tls-1.3' }], noteIndex),
    'ALIAS_COLLIDES_WITH_NOTE',
  );
  expectCode(
    () => createAliasIndex([
      { from: 'papers::old', to: 'papers::react' },
      { from: 'papers::old', to: 'papers::tls-1.3' },
    ], noteIndex),
    'ALIAS_AMBIGUOUS',
  );
  expectCode(
    () => createAliasIndex([{ from: 'papers::old', to: 'papers::missing' }], noteIndex),
    'ALIAS_TARGET_MISSING',
  );
  expectCode(
    () => createAliasIndex([
      { from: 'papers::one', to: 'papers::two' },
      { from: 'papers::two', to: 'papers::one' },
    ], noteIndex),
    'ALIAS_CYCLE',
  );
});

test('extractWikilinks uses the shared grammar and preserves Chinese display text', () => {
  const links = extractWikilinks('先看 [[papers/tls-1.3|TLS 协议]]，再看 [[dash.js]]。');
  assert.equal(links.length, 2);
  assert.equal(links[0].parsed.id, 'papers::tls-1.3');
  assert.equal(links[0].display, 'TLS 协议');
  assert.equal(links[1].parsed.slug, 'dash.js');
});

test('generated targets namespace only cross-area duplicate slugs', () => {
  assert.equal(formatWikilinkTarget('papers::react', { noteIndex }), 'papers/react');
  assert.equal(formatWikilinkTarget('projects::react', { noteIndex }), 'projects/react');
  assert.equal(formatWikilinkTarget('papers::tls-1.3', { noteIndex }), 'tls-1.3');
  assert.equal(formatWikilinkTarget('papers::tls-1.3', { noteIndex, forceNamespace: true }), 'papers/tls-1.3');
});

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));

const CONSUMERS = [
  {
    path: 'scripts/lib/queue-store.mjs',
    importPath: './note-id.mjs',
    symbols: ['serializeNoteId'],
  },
  {
    path: 'scripts/remark-wikilinks.mjs',
    importPath: './lib/note-id.mjs',
    symbols: ['extractWikilinks', 'resolveWikilink'],
  },
  {
    path: 'scripts/regen-backlinks.mjs',
    importPath: './lib/note-id.mjs',
    symbols: ['extractWikilinks', 'resolveWikilink'],
  },
  {
    path: 'scripts/run-pipeline.mjs',
    importPath: './lib/note-id.mjs',
    symbols: ['isNoteArea', 'isNoteSlug'],
  },
];

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function importedSymbols(source, importPath) {
  const pattern = new RegExp(
    `import\\s*\\{([^}]*)\\}\\s*from\\s*['\"]${escapeRegex(importPath)}['\"]`,
    'u',
  );
  const match = source.match(pattern);
  assert.ok(match, `missing shared NoteId import from ${importPath}`);
  return new Set(match[1].split(',').map((name) => name.trim()).filter(Boolean));
}

test('identity consumers import their canonical grammar from note-id.mjs', () => {
  for (const consumer of CONSUMERS) {
    const source = fs.readFileSync(path.join(ROOT, consumer.path), 'utf8');
    const imported = importedSymbols(source, consumer.importPath);
    for (const symbol of consumer.symbols) {
      assert.equal(
        imported.has(symbol),
        true,
        `${consumer.path} must import ${symbol} from ${consumer.importPath}`,
      );
    }
  }
});

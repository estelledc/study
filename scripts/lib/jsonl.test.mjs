import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { parseJsonl, readJsonl, serializeJsonl, writeJsonl } from './jsonl.mjs';

test('parseJsonl skips blank lines and parses records', () => {
  assert.deepEqual(parseJsonl('{"a":1}\n\n{"b":2}\n'), [{ a: 1 }, { b: 2 }]);
});

test('parseJsonl annotates invalid line numbers', () => {
  assert.throws(
    () => parseJsonl('{"ok":true}\n{bad}\n', 'sample.jsonl'),
    /sample\.jsonl:2:/
  );
});

test('readJsonl returns empty array for missing optional files', async () => {
  const rows = await readJsonl(path.join(tmpdir(), 'study-missing-jsonl-file.jsonl'), {
    missing: 'empty',
  });
  assert.deepEqual(rows, []);
});

test('writeJsonl preserves non-empty final newline mode', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'study-jsonl-'));
  try {
    const filePath = path.join(dir, 'rows.jsonl');
    await writeJsonl(filePath, [], { finalNewline: 'non-empty' });
    assert.equal(await readFile(filePath, 'utf8'), '');

    await writeJsonl(filePath, [{ slug: 'react' }], { finalNewline: 'non-empty' });
    assert.equal(await readFile(filePath, 'utf8'), '{"slug":"react"}\n');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('serializeJsonl keeps the existing JSONL byte contract', () => {
  assert.equal(serializeJsonl([{ a: 1 }, { b: 2 }]), '{"a":1}\n{"b":2}\n');
  assert.equal(serializeJsonl([], { finalNewline: 'non-empty' }), '');
});

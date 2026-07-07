import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { parseJson, readJson, readJsonOptional, writeJson } from './json-store.mjs';

async function tempDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'study-json-store-'));
}

test('readJson returns configured fallback for missing files', async () => {
  const dir = await tempDir();
  const fallback = { ok: true };
  assert.equal(await readJson(path.join(dir, 'missing.json'), { missing: fallback }), fallback);
});

test('readJsonOptional reports missing files without swallowing invalid JSON', async () => {
  const dir = await tempDir();
  const missing = await readJsonOptional(path.join(dir, 'missing.json'));
  assert.deepEqual(missing, { data: null, missing: true });

  const invalid = path.join(dir, 'invalid.json');
  await fs.writeFile(invalid, '{bad', 'utf8');
  await assert.rejects(() => readJsonOptional(invalid), /invalid\.json/);
});

test('writeJson creates parent directories and preserves stable formatting', async () => {
  const dir = await tempDir();
  const filePath = path.join(dir, 'nested', 'state.json');
  await writeJson(filePath, { b: 2, a: [1] }, { finalNewline: true });

  assert.equal(await fs.readFile(filePath, 'utf8'), '{\n  "b": 2,\n  "a": [\n    1\n  ]\n}\n');
  assert.deepEqual(await readJson(filePath), { b: 2, a: [1] });
});

test('parseJson annotates the source on parse failures', () => {
  assert.throws(() => parseJson('{bad', 'inline-json'), /inline-json/);
});

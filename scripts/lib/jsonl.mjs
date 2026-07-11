import fs from 'node:fs/promises';
import { atomicWriteFile } from './json-store.mjs';

export function parseJsonl(raw, source = 'jsonl') {
  return raw
    .split(/\r?\n/)
    .filter((line) => line.trim() !== '')
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (err) {
        err.message = `${source}:${index + 1}: ${err.message}`;
        throw err;
      }
    });
}

export async function readJsonl(filePath, options = {}) {
  const { missing = 'throw' } = options;
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return parseJsonl(raw, filePath);
  } catch (err) {
    if (err.code === 'ENOENT' && missing === 'empty') {
      return [];
    }
    throw err;
  }
}

export function serializeJsonl(rows, options = {}) {
  const { finalNewline = 'always' } = options;
  const body = rows.map((row) => JSON.stringify(row)).join('\n');
  const suffix = finalNewline === 'always' || (finalNewline === 'non-empty' && rows.length)
    ? '\n'
    : '';
  return body + suffix;
}

export async function writeJsonl(filePath, rows, options = {}) {
  await atomicWriteFile(filePath, serializeJsonl(rows, options), {
    encoding: 'utf8',
    beforeRename: options.beforeRename,
  });
}

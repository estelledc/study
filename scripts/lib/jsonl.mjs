import fs from 'node:fs/promises';

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

export async function writeJsonl(filePath, rows, options = {}) {
  const { finalNewline = 'always' } = options;
  const body = rows.map((row) => JSON.stringify(row)).join('\n');
  const suffix = finalNewline === 'always' || (finalNewline === 'non-empty' && rows.length)
    ? '\n'
    : '';
  await fs.writeFile(filePath, body + suffix, 'utf8');
}

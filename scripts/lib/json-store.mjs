import fs from 'node:fs/promises';
import path from 'node:path';

export function parseJson(raw, source = 'json') {
  try {
    return JSON.parse(raw);
  } catch (err) {
    err.message = `${source}: ${err.message}`;
    throw err;
  }
}

export async function readJson(filePath, options = {}) {
  const { missing = 'throw' } = options;
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return parseJson(raw, filePath);
  } catch (err) {
    if (err.code === 'ENOENT' && missing !== 'throw') {
      return missing;
    }
    throw err;
  }
}

export async function readJsonOptional(filePath) {
  try {
    return { data: await readJson(filePath), missing: false };
  } catch (err) {
    if (err.code === 'ENOENT') return { data: null, missing: true };
    throw err;
  }
}

export async function writeJson(filePath, data, options = {}) {
  const { finalNewline = false, space = 2 } = options;
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const suffix = finalNewline ? '\n' : '';
  await fs.writeFile(filePath, JSON.stringify(data, null, space) + suffix, 'utf8');
}

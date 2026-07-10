import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const UNSUPPORTED_DIRECTORY_SYNC_CODES = new Set(['EINVAL', 'ENOTSUP', 'EISDIR', 'EPERM']);

export async function syncDirectory(directory) {
  let handle;
  try {
    handle = await fs.open(directory, 'r');
    await handle.sync();
  } catch (err) {
    if (!UNSUPPORTED_DIRECTORY_SYNC_CODES.has(err.code)) throw err;
  } finally {
    await handle?.close();
  }
}

export async function atomicWriteFile(filePath, data, options = {}) {
  const directory = path.dirname(filePath);
  const basename = path.basename(filePath);
  const tempPath = path.join(directory, `.${basename}.${process.pid}.${randomUUID()}.tmp`);
  await fs.mkdir(directory, { recursive: true });

  let handle;
  try {
    let mode = options.mode;
    if (mode == null) {
      try {
        mode = (await fs.stat(filePath)).mode & 0o777;
      } catch (err) {
        if (err.code !== 'ENOENT') throw err;
      }
    }
    handle = await fs.open(tempPath, 'wx', mode == null ? 0o666 : mode);
    await handle.writeFile(data, options.encoding ? { encoding: options.encoding } : undefined);
    await handle.sync();
    await handle.close();
    handle = null;
    await options.beforeRename?.({ filePath, tempPath });
    await fs.rename(tempPath, filePath);
    await syncDirectory(directory);
  } catch (err) {
    await handle?.close().catch(() => {});
    await fs.unlink(tempPath).catch((cleanupErr) => {
      if (cleanupErr.code !== 'ENOENT') throw cleanupErr;
    });
    throw err;
  }
}

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
  const suffix = finalNewline ? '\n' : '';
  await atomicWriteFile(filePath, JSON.stringify(data, null, space) + suffix, {
    encoding: 'utf8',
    beforeRename: options.beforeRename,
  });
}

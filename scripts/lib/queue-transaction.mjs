import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import { atomicWriteFile, parseJson, syncDirectory } from './json-store.mjs';

export const QUEUE_TRANSACTION_MANIFEST = '.queue-transaction.json';
const TRANSACTION_SCHEMA_VERSION = 1;

function sha256(data) {
  return createHash('sha256').update(data).digest('hex');
}

async function readOptionalBytes(filePath) {
  try {
    return await fs.readFile(filePath);
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

function digestOrNull(data) {
  return data == null ? null : sha256(data);
}

function transactionDirectory(updates, explicitDirectory) {
  if (explicitDirectory) return path.resolve(explicitDirectory);
  if (updates.length === 0) throw new Error('queue transaction requires at least one update');
  const directories = new Set(updates.map((update) => path.resolve(path.dirname(update.path))));
  if (directories.size !== 1) {
    throw new Error('queue transaction targets must share one directory');
  }
  return [...directories][0];
}

function validateEntryName(name, label) {
  if (!name || path.basename(name) !== name) {
    throw new Error(`invalid queue transaction ${label}: ${name || '<empty>'}`);
  }
  return name;
}

function validateManifest(manifest) {
  if (manifest?.schema_version !== TRANSACTION_SCHEMA_VERSION || !manifest.generation) {
    throw new Error('unsupported or malformed queue transaction manifest');
  }
  if (!Array.isArray(manifest.files) || manifest.files.length === 0) {
    throw new Error('queue transaction manifest has no files');
  }
  const targets = new Set();
  for (const entry of manifest.files) {
    validateEntryName(entry.target, 'target');
    validateEntryName(entry.staged, 'staged file');
    if (targets.has(entry.target)) throw new Error(`duplicate queue transaction target: ${entry.target}`);
    targets.add(entry.target);
    if (!/^[a-f0-9]{64}$/.test(entry.next_sha256 || '')) {
      throw new Error(`invalid next digest for ${entry.target}`);
    }
    if (entry.previous_sha256 != null && !/^[a-f0-9]{64}$/.test(entry.previous_sha256)) {
      throw new Error(`invalid previous digest for ${entry.target}`);
    }
  }
  return manifest;
}

async function writeExclusiveDurable(filePath, data, options = {}) {
  const directory = path.dirname(filePath);
  const preparedPath = path.join(
    directory,
    `.${path.basename(filePath)}.${process.pid}.${randomUUID()}.prepared`,
  );
  await fs.mkdir(directory, { recursive: true });
  try {
    // Publish only a fully written, fsynced inode. link(2) gives us atomic
    // no-replace semantics: concurrent transactions cannot overwrite the
    // canonical manifest, and a crash while writing never exposes partial JSON.
    await atomicWriteFile(preparedPath, data, { mode: 0o600, encoding: 'utf8' });
    await options.afterStaged?.({ filePath, preparedPath });
    await fs.link(preparedPath, filePath);
    await options.afterPublished?.({ filePath, preparedPath });
    await syncDirectory(directory);
    await fs.unlink(preparedPath);
    await syncDirectory(directory);
  } catch (err) {
    await fs.unlink(preparedPath).catch((cleanupErr) => {
      if (cleanupErr.code !== 'ENOENT') throw cleanupErr;
    });
    throw err;
  }
}

export async function inspectQueueTransaction(options = {}) {
  const directory = path.resolve(options.directory);
  const manifestPath = path.join(directory, options.manifestName || QUEUE_TRANSACTION_MANIFEST);
  try {
    const manifest = validateManifest(parseJson(await fs.readFile(manifestPath, 'utf8'), manifestPath));
    return { pending: true, directory, manifestPath, manifest };
  } catch (err) {
    if (err.code === 'ENOENT') return { pending: false, directory, manifestPath, manifest: null };
    throw err;
  }
}

export async function assertNoPendingQueueTransaction(options = {}) {
  const pending = await inspectQueueTransaction(options);
  if (pending.pending) {
    throw new Error(`pending queue transaction ${pending.manifest.generation}; run queue recovery first`);
  }
  return pending;
}

export async function commitQueueTransaction(updates, options = {}) {
  const directory = transactionDirectory(updates, options.directory);
  await assertNoPendingQueueTransaction({ directory, manifestName: options.manifestName });

  const generation = String(options.generation || randomUUID());
  const safeGeneration = generation.replace(/[^a-zA-Z0-9_.-]/g, '_');
  const transactionId = randomUUID();
  const seenTargets = new Set();
  const prepared = [];
  let manifestWritten = false;
  let mutatedTargets = 0;

  try {
    for (const [index, update] of updates.entries()) {
      const targetPath = path.resolve(update.path);
      if (path.dirname(targetPath) !== directory) {
        throw new Error(`queue transaction target is outside ${directory}: ${targetPath}`);
      }
      const target = path.basename(targetPath);
      if (seenTargets.has(target)) throw new Error(`duplicate queue transaction target: ${target}`);
      seenTargets.add(target);

      const content = Buffer.isBuffer(update.content)
        ? update.content
        : Buffer.from(String(update.content), update.encoding || 'utf8');
      const previous = await readOptionalBytes(targetPath);
      if (Object.hasOwn(update, 'expectedContent')) {
        const expected = update.expectedContent == null
          ? null
          : Buffer.isBuffer(update.expectedContent)
            ? update.expectedContent
            : Buffer.from(String(update.expectedContent), update.encoding || 'utf8');
        if (digestOrNull(previous) !== digestOrNull(expected)) {
          throw new Error(`queue transaction expected input mismatch: ${target}`);
        }
      }
      const staged = `.queue-transaction.${safeGeneration}.${transactionId}.${index}.next`;
      const stagedPath = path.join(directory, staged);
      let targetMode = 0o666;
      try {
        targetMode = (await fs.stat(targetPath)).mode & 0o777;
      } catch (err) {
        if (err.code !== 'ENOENT') throw err;
      }
      await atomicWriteFile(stagedPath, content, { mode: targetMode });
      prepared.push({
        target,
        staged,
        previous_sha256: digestOrNull(previous),
        next_sha256: sha256(content),
        bytes: content.byteLength,
      });
      await options.hooks?.afterStage?.({ index, generation, targetPath, stagedPath });
    }

    await options.hooks?.beforeManifest?.({ generation, files: prepared });
    const manifest = {
      schema_version: TRANSACTION_SCHEMA_VERSION,
      generation,
      transaction_id: transactionId,
      state: 'prepared',
      created_at: new Date().toISOString(),
      files: prepared,
    };
    const manifestPath = path.join(directory, options.manifestName || QUEUE_TRANSACTION_MANIFEST);
    await writeExclusiveDurable(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, {
      afterStaged: ({ preparedPath }) => options.hooks?.afterManifestStaged?.({
        generation,
        manifestPath,
        preparedPath,
      }),
      afterPublished: ({ preparedPath }) => {
        // Once the complete inode is linked at the canonical name, staged
        // queue files must be retained for recovery even if later cleanup or
        // an injected hook fails.
        manifestWritten = true;
        return options.hooks?.afterManifestPublished?.({
          generation,
          manifestPath,
          preparedPath,
        });
      },
    });
    manifestWritten = true;
    await options.hooks?.afterManifest?.({ generation, manifestPath });

    for (const [index, entry] of prepared.entries()) {
      const targetPath = path.join(directory, entry.target);
      const stagedPath = path.join(directory, entry.staged);
      const current = await readOptionalBytes(targetPath);
      const currentDigest = digestOrNull(current);
      if (currentDigest === entry.next_sha256) {
        await fs.unlink(stagedPath).catch((cleanupErr) => {
          if (cleanupErr.code !== 'ENOENT') throw cleanupErr;
        });
        continue;
      }
      if (currentDigest !== entry.previous_sha256) {
        const conflict = new Error(`queue transaction input changed before apply: ${entry.target}`);
        conflict.code = 'QUEUE_TRANSACTION_INPUT_CHANGED';
        throw conflict;
      }
      await options.hooks?.beforeApply?.({ index, generation, targetPath, stagedPath });
      await fs.rename(stagedPath, targetPath);
      mutatedTargets++;
      await syncDirectory(directory);
      await options.hooks?.afterApply?.({ index, generation, targetPath });
    }

    await fs.unlink(manifestPath);
    await syncDirectory(directory);
    return { generation, applied: prepared.map((entry) => entry.target) };
  } catch (err) {
    const safePreApplyConflict = manifestWritten &&
      mutatedTargets === 0 &&
      err.code === 'QUEUE_TRANSACTION_INPUT_CHANGED';
    if (!manifestWritten || safePreApplyConflict) {
      if (safePreApplyConflict) {
        await fs.unlink(path.join(directory, options.manifestName || QUEUE_TRANSACTION_MANIFEST)).catch((cleanupErr) => {
          if (cleanupErr.code !== 'ENOENT') throw cleanupErr;
        });
      }
      await Promise.all(prepared.map((entry) =>
        fs.unlink(path.join(directory, entry.staged)).catch((cleanupErr) => {
          if (cleanupErr.code !== 'ENOENT') throw cleanupErr;
        })
      ));
      await syncDirectory(directory);
    }
    throw err;
  }
}

export async function recoverQueueTransaction(options = {}) {
  const pending = await inspectQueueTransaction(options);
  if (!pending.pending) return { recovered: false, generation: null, applied: [] };

  const { directory, manifestPath, manifest } = pending;
  const applied = [];
  for (const [index, entry] of manifest.files.entries()) {
    const targetPath = path.join(directory, entry.target);
    const stagedPath = path.join(directory, entry.staged);
    const targetDigest = digestOrNull(await readOptionalBytes(targetPath));
    if (targetDigest === entry.next_sha256) {
      await fs.unlink(stagedPath).catch((err) => {
        if (err.code !== 'ENOENT') throw err;
      });
      continue;
    }
    if (targetDigest !== entry.previous_sha256) {
      throw new Error(`cannot recover queue transaction ${manifest.generation}: ${entry.target} diverged`);
    }
    const stagedDigest = digestOrNull(await readOptionalBytes(stagedPath));
    if (stagedDigest !== entry.next_sha256) {
      throw new Error(`cannot recover queue transaction ${manifest.generation}: staged ${entry.staged} is missing or corrupt`);
    }
    await options.hooks?.beforeApply?.({ index, generation: manifest.generation, targetPath, stagedPath });
    await fs.rename(stagedPath, targetPath);
    await syncDirectory(directory);
    applied.push(entry.target);
    await options.hooks?.afterApply?.({ index, generation: manifest.generation, targetPath });
  }

  await fs.unlink(manifestPath);
  await syncDirectory(directory);
  return { recovered: true, generation: manifest.generation, applied };
}

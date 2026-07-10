import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import { atomicWriteFile, parseJson, syncDirectory } from './json-store.mjs';

export const QUEUE_TRANSACTION_MANIFEST = '.queue-transaction.json';
const QUEUE_TRANSACTION_GUARD = '.queue-transaction.guard';
const TRANSACTION_SCHEMA_VERSION = 1;
const TRANSACTION_GUARD_SCHEMA_VERSION = 1;
const MAX_APPEND_SEGMENT_BYTES = 256 * 1024;

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

function processIsAlive(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return null;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    if (err.code === 'ESRCH') return false;
    if (err.code === 'EPERM') return true;
    return null;
  }
}

async function createTransactionGuard(guardPath) {
  const metadata = {
    schema_version: TRANSACTION_GUARD_SCHEMA_VERSION,
    owner_token: randomUUID(),
    pid: process.pid,
    acquired_at: new Date().toISOString(),
  };
  let handle;
  let created = false;
  try {
    handle = await fs.open(guardPath, 'wx', 0o600);
    created = true;
    await handle.writeFile(`${JSON.stringify(metadata)}\n`, 'utf8');
    await handle.sync();
    await handle.close();
    handle = null;
    await syncDirectory(path.dirname(guardPath));
    return metadata;
  } catch (err) {
    await handle?.close().catch(() => {});
    if (created) {
      await fs.unlink(guardPath).catch((cleanupErr) => {
        if (cleanupErr.code !== 'ENOENT') throw cleanupErr;
      });
    }
    throw err;
  }
}

async function inspectTransactionGuard(guardPath) {
  let metadata;
  try {
    metadata = JSON.parse(await fs.readFile(guardPath, 'utf8'));
  } catch (err) {
    throw new Error(`queue transaction guard is unreadable: ${err.message}`);
  }
  if (
    metadata?.schema_version !== TRANSACTION_GUARD_SCHEMA_VERSION
    || typeof metadata.owner_token !== 'string'
    || metadata.owner_token.length === 0
    || !Number.isSafeInteger(metadata.pid)
    || metadata.pid <= 0
  ) {
    throw new Error('queue transaction guard is malformed');
  }
  return metadata;
}

async function acquireTransactionGuard(directory) {
  const guardPath = path.join(directory, QUEUE_TRANSACTION_GUARD);
  await fs.mkdir(directory, { recursive: true });
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      return { guardPath, metadata: await createTransactionGuard(guardPath) };
    } catch (err) {
      if (err.code !== 'EEXIST') throw err;
      const existing = await inspectTransactionGuard(guardPath);
      if (processIsAlive(existing.pid) !== false) {
        const busy = new Error('another queue transaction operation is active');
        busy.code = 'QUEUE_TRANSACTION_ACTIVE';
        throw busy;
      }

      const quarantine = `${guardPath}.stale-${randomUUID()}`;
      try {
        await fs.rename(guardPath, quarantine);
      } catch (renameErr) {
        if (renameErr.code === 'ENOENT') continue;
        throw renameErr;
      }
      const moved = await inspectTransactionGuard(quarantine);
      if (moved.owner_token !== existing.owner_token) {
        await fs.rename(quarantine, guardPath).catch(() => {});
        const busy = new Error('queue transaction guard changed during stale recovery');
        busy.code = 'QUEUE_TRANSACTION_ACTIVE';
        throw busy;
      }
      await fs.unlink(quarantine);
      await syncDirectory(directory);
    }
  }
  throw new Error('could not acquire queue transaction guard after stale recovery');
}

async function releaseTransactionGuard(guard) {
  const current = await inspectTransactionGuard(guard.guardPath);
  if (current.owner_token !== guard.metadata.owner_token) {
    throw new Error('queue transaction guard owner mismatch at release');
  }
  await fs.unlink(guard.guardPath);
  await syncDirectory(path.dirname(guard.guardPath));
}

async function withTransactionGuard(directory, operation) {
  const guard = await acquireTransactionGuard(directory);
  let result;
  let operationError;
  try {
    result = await operation();
  } catch (err) {
    operationError = err;
  }

  let releaseError;
  try {
    await releaseTransactionGuard(guard);
  } catch (err) {
    releaseError = err;
  }
  if (operationError) {
    if (releaseError) operationError.message += `; transaction guard release also failed: ${releaseError.message}`;
    throw operationError;
  }
  if (releaseError) throw releaseError;
  return result;
}

function digestOrNull(data) {
  return data == null ? null : sha256(data);
}

function isCompleteJsonl(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0 || buffer.at(-1) !== 0x0a) return false;
  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    return false;
  }
  const lines = text.slice(0, -1).split('\n');
  if (lines.length === 0 || lines.some((line) => line.trim() === '')) return false;
  try {
    for (const line of lines) JSON.parse(line);
  } catch {
    return false;
  }
  return true;
}

function appendOnlyState(current, entry) {
  if (entry.append_only !== true) return { valid: false, matches: 0 };
  const bytes = current ?? Buffer.alloc(0);
  if (!Buffer.isBuffer(bytes) || bytes.length < entry.previous_bytes) return { valid: false, matches: 0 };
  if (entry.previous_exists === true) {
    if (current == null || sha256(bytes.subarray(0, entry.previous_bytes)) !== entry.previous_sha256) {
      return { valid: false, matches: 0 };
    }
  } else if (entry.previous_sha256 != null || entry.previous_bytes !== 0) {
    return { valid: false, matches: 0 };
  }
  if (bytes.length > 0 && !isCompleteJsonl(bytes)) return { valid: false, matches: 0 };

  const suffix = bytes.subarray(entry.previous_bytes);
  let matches = 0;
  for (let start = 0; start + entry.append_bytes <= suffix.length; start += 1) {
    if (start > 0 && suffix[start - 1] !== 0x0a) continue;
    const candidate = suffix.subarray(start, start + entry.append_bytes);
    if (candidate.at(-1) !== 0x0a) continue;
    if (sha256(candidate) === entry.append_sha256) matches += 1;
  }
  return { valid: true, matches };
}

function stagedAppendSegment(stagedBytes, entry) {
  if (
    !Buffer.isBuffer(stagedBytes)
    || stagedBytes.length !== entry.next_bytes
    || sha256(stagedBytes) !== entry.next_sha256
    || !isCompleteJsonl(stagedBytes)
  ) return null;
  const segment = stagedBytes.subarray(entry.previous_bytes);
  if (
    segment.length !== entry.append_bytes
    || sha256(segment) !== entry.append_sha256
    || !isCompleteJsonl(segment)
  ) return null;
  return segment;
}

async function appendDurable(targetPath, segment) {
  if (segment.length > MAX_APPEND_SEGMENT_BYTES) {
    throw new Error(`append-only queue transaction exceeds the ${MAX_APPEND_SEGMENT_BYTES}-byte single-write limit`);
  }
  const handle = await fs.open(targetPath, 'a');
  try {
    const { bytesWritten } = await handle.write(segment, 0, segment.length, null);
    if (bytesWritten !== segment.length) {
      throw new Error(`append-only queue transaction wrote ${bytesWritten} of ${segment.length} bytes`);
    }
    await handle.sync();
  } finally {
    await handle.close();
  }
  await syncDirectory(path.dirname(targetPath));
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

function validateManifest(manifest, manifestName = QUEUE_TRANSACTION_MANIFEST) {
  if (manifest?.schema_version !== TRANSACTION_SCHEMA_VERSION || !manifest.generation) {
    throw new Error('unsupported or malformed queue transaction manifest');
  }
  if (!Array.isArray(manifest.files) || manifest.files.length === 0) {
    throw new Error('queue transaction manifest has no files');
  }
  if (typeof manifest.generation !== 'string' || manifest.generation.length === 0) {
    throw new Error('queue transaction manifest has an invalid generation');
  }
  if (!/^[a-f0-9-]{36}$/.test(manifest.transaction_id || '')) {
    throw new Error('queue transaction manifest has an invalid transaction id');
  }
  const targets = new Set();
  const stagedNames = new Set();
  const safeGeneration = manifest.generation.replace(/[^a-zA-Z0-9_.-]/g, '_');
  for (const [index, entry] of manifest.files.entries()) {
    validateEntryName(entry.target, 'target');
    validateEntryName(entry.staged, 'staged file');
    if (targets.has(entry.target)) throw new Error(`duplicate queue transaction target: ${entry.target}`);
    if (stagedNames.has(entry.staged)) throw new Error(`duplicate queue transaction staged file: ${entry.staged}`);
    if (entry.target === manifestName || entry.target === QUEUE_TRANSACTION_GUARD) {
      throw new Error(`queue transaction target uses a reserved name: ${entry.target}`);
    }
    const expectedStaged = `.queue-transaction.${safeGeneration}.${manifest.transaction_id}.${index}.next`;
    if (entry.staged !== expectedStaged) {
      throw new Error(`invalid queue transaction staged file: ${entry.staged}`);
    }
    targets.add(entry.target);
    stagedNames.add(entry.staged);
    if (!/^[a-f0-9]{64}$/.test(entry.next_sha256 || '')) {
      throw new Error(`invalid next digest for ${entry.target}`);
    }
    if (entry.previous_sha256 != null && !/^[a-f0-9]{64}$/.test(entry.previous_sha256)) {
      throw new Error(`invalid previous digest for ${entry.target}`);
    }
    if (entry.append_only != null && typeof entry.append_only !== 'boolean') {
      throw new Error(`invalid append-only marker for ${entry.target}`);
    }
    if (entry.next_bytes != null && (!Number.isSafeInteger(entry.next_bytes) || entry.next_bytes < 0)) {
      throw new Error(`invalid next byte length for ${entry.target}`);
    }
    if (entry.append_only === true && !Number.isSafeInteger(entry.next_bytes)) {
      throw new Error(`append-only entry is missing next byte length for ${entry.target}`);
    }
    if (entry.append_only === true) {
      if (typeof entry.previous_exists !== 'boolean') throw new Error(`append-only entry is missing previous existence for ${entry.target}`);
      if (!Number.isSafeInteger(entry.previous_bytes) || entry.previous_bytes < 0) throw new Error(`append-only entry has invalid previous byte length for ${entry.target}`);
      if (!Number.isSafeInteger(entry.append_bytes) || entry.append_bytes <= 0) throw new Error(`append-only entry has invalid append byte length for ${entry.target}`);
      if (entry.append_bytes > MAX_APPEND_SEGMENT_BYTES) throw new Error(`append-only entry exceeds the single-write limit for ${entry.target}`);
      if (!/^[a-f0-9]{64}$/.test(entry.append_sha256 || '')) throw new Error(`append-only entry has invalid append digest for ${entry.target}`);
      if (entry.previous_bytes + entry.append_bytes !== entry.next_bytes) throw new Error(`append-only entry byte lengths disagree for ${entry.target}`);
    }
    if (entry.bytes != null && entry.next_bytes != null && entry.bytes !== entry.next_bytes) {
      throw new Error(`queue transaction byte lengths disagree for ${entry.target}`);
    }
  }
  for (const staged of stagedNames) {
    if (targets.has(staged) || staged === manifestName || staged === QUEUE_TRANSACTION_GUARD) {
      throw new Error(`queue transaction staged file collides with a reserved target: ${staged}`);
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
    const manifest = validateManifest(
      parseJson(await fs.readFile(manifestPath, 'utf8'), manifestPath),
      path.basename(manifestPath),
    );
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

async function commitQueueTransactionUnlocked(updates, options = {}) {
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
      const appendOnly = update.appendOnly === true;
      if (update.appendOnly != null && typeof update.appendOnly !== 'boolean') {
        throw new Error(`queue transaction append-only marker is invalid: ${target}`);
      }
      if (appendOnly) {
        if (!Object.hasOwn(update, 'expectedContent')) {
          throw new Error(`append-only queue transaction requires expected content: ${target}`);
        }
        const previousBytes = previous?.length ?? 0;
        if (previous && !content.subarray(0, previousBytes).equals(previous)) {
          throw new Error(`append-only queue transaction replaced existing content: ${target}`);
        }
        const appendSegment = content.subarray(previousBytes);
        if (!isCompleteJsonl(content) || !isCompleteJsonl(appendSegment)) {
          throw new Error(`append-only queue transaction requires complete JSONL: ${target}`);
        }
        if (appendSegment.length > MAX_APPEND_SEGMENT_BYTES) {
          throw new Error(`append-only queue transaction exceeds the ${MAX_APPEND_SEGMENT_BYTES}-byte single-write limit: ${target}`);
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
        next_bytes: content.byteLength,
        append_only: appendOnly,
        ...(appendOnly ? {
          previous_exists: previous != null,
          previous_bytes: previous?.length ?? 0,
          append_bytes: content.length - (previous?.length ?? 0),
          append_sha256: sha256(content.subarray(previous?.length ?? 0)),
        } : {}),
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
      if (entry.append_only) {
        const state = appendOnlyState(current, entry);
        if (!state.valid || state.matches > 1) {
          const conflict = new Error(`queue transaction input changed before apply: ${entry.target}`);
          conflict.code = 'QUEUE_TRANSACTION_INPUT_CHANGED';
          throw conflict;
        }
        if (state.matches === 1) {
          await fs.unlink(stagedPath).catch((cleanupErr) => {
            if (cleanupErr.code !== 'ENOENT') throw cleanupErr;
          });
          continue;
        }
        const stagedBytes = await readOptionalBytes(stagedPath);
        const segment = stagedAppendSegment(stagedBytes, entry);
        if (!segment) throw new Error(`queue transaction staged append is missing or corrupt: ${entry.target}`);
        await options.hooks?.beforeApply?.({ index, generation, targetPath, stagedPath });
        const refreshed = appendOnlyState(await readOptionalBytes(targetPath), entry);
        if (!refreshed.valid || refreshed.matches > 1) {
          const conflict = new Error(`queue transaction input changed before append: ${entry.target}`);
          conflict.code = 'QUEUE_TRANSACTION_INPUT_CHANGED';
          throw conflict;
        }
        if (refreshed.matches === 0) {
          await appendDurable(targetPath, segment);
          mutatedTargets++;
        }
        await fs.unlink(stagedPath);
        await options.hooks?.afterApply?.({ index, generation, targetPath });
        continue;
      }
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

async function recoverQueueTransactionUnlocked(options = {}) {
  const pending = await inspectQueueTransaction(options);
  if (!pending.pending) return { recovered: false, generation: null, applied: [] };

  const { directory, manifestPath, manifest } = pending;
  const applied = [];
  for (const [index, entry] of manifest.files.entries()) {
    const targetPath = path.join(directory, entry.target);
    const stagedPath = path.join(directory, entry.staged);
    const targetBytes = await readOptionalBytes(targetPath);
    const targetDigest = digestOrNull(targetBytes);
    if (entry.append_only) {
      const state = appendOnlyState(targetBytes, entry);
      if (!state.valid || state.matches > 1) {
        throw new Error(`cannot recover queue transaction ${manifest.generation}: ${entry.target} diverged`);
      }
      if (state.matches === 1) {
        await fs.unlink(stagedPath).catch((err) => {
          if (err.code !== 'ENOENT') throw err;
        });
        continue;
      }
      const stagedBytes = await readOptionalBytes(stagedPath);
      const segment = stagedAppendSegment(stagedBytes, entry);
      if (!segment) {
        throw new Error(`cannot recover queue transaction ${manifest.generation}: staged ${entry.staged} is missing or corrupt`);
      }
      await options.hooks?.beforeApply?.({ index, generation: manifest.generation, targetPath, stagedPath });
      const refreshed = appendOnlyState(await readOptionalBytes(targetPath), entry);
      if (!refreshed.valid || refreshed.matches > 1) {
        throw new Error(`cannot recover queue transaction ${manifest.generation}: ${entry.target} diverged`);
      }
      if (refreshed.matches === 0) await appendDurable(targetPath, segment);
      await fs.unlink(stagedPath);
      applied.push(entry.target);
      await options.hooks?.afterApply?.({ index, generation: manifest.generation, targetPath });
      continue;
    }
    if (targetDigest === entry.next_sha256) {
      await fs.unlink(stagedPath).catch((err) => {
        if (err.code !== 'ENOENT') throw err;
      });
      continue;
    }
    if (targetDigest !== entry.previous_sha256) {
      throw new Error(`cannot recover queue transaction ${manifest.generation}: ${entry.target} diverged`);
    }
    const stagedBytes = await readOptionalBytes(stagedPath);
    const stagedDigest = digestOrNull(stagedBytes);
    if (
      stagedDigest !== entry.next_sha256
      || (entry.next_bytes != null && stagedBytes?.length !== entry.next_bytes)
    ) {
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

export async function commitQueueTransaction(updates, options = {}) {
  const directory = transactionDirectory(updates, options.directory);
  return withTransactionGuard(directory, () => commitQueueTransactionUnlocked(updates, {
    ...options,
    directory,
  }));
}

export async function recoverQueueTransaction(options = {}) {
  const directory = path.resolve(options.directory);
  return withTransactionGuard(directory, () => recoverQueueTransactionUnlocked({
    ...options,
    directory,
  }));
}

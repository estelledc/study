import { execFile as execFileCallback } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

import { scanBufferForPublicRedlines } from '../audit-public-redlines.mjs';
import { parseFrontmatterLoose } from './frontmatter.mjs';
import { gitMaybe, gitOutput } from './git.mjs';
import { atomicWriteFile } from './json-store.mjs';
import { isNoteArea, isNoteSlug } from './note-id.mjs';
import {
  digestReceipt,
  expectedSourceRevision,
  validateReceipt,
  verifyReceiptAgainstNote,
} from './review-receipt.mjs';

const execFile = promisify(execFileCallback);

export class ReviewCompanionError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ReviewCompanionError';
    this.code = code;
  }
}

function reject(code, message) {
  throw new ReviewCompanionError(code, message);
}

export function reviewReceiptRelativePath(area, slug) {
  if (!isNoteArea(area) || !isNoteSlug(slug)) {
    reject('REVIEW_COMPANION_IDENTITY_INVALID', 'review companion note identity is invalid');
  }
  return `data/review-receipts/${area}/${slug}.json`;
}

function assertSafeCompanionPath(relativePath, area, slug) {
  const evidencePrefix = `data/review-evidence/${area}/${slug}/`;
  const receiptPath = reviewReceiptRelativePath(area, slug);
  if (
    typeof relativePath !== 'string'
    || relativePath.includes('\0')
    || relativePath.includes('\\')
    || path.posix.isAbsolute(relativePath)
    || relativePath.split('/').some((part) => !part || part === '.' || part === '..')
    || (relativePath !== receiptPath
      && (!relativePath.startsWith(evidencePrefix) || !relativePath.endsWith('.json')))
  ) {
    reject('REVIEW_COMPANION_PATH_INVALID', 'review companion path is outside the note allowlist');
  }
  return relativePath;
}

export function referencedEvidencePaths(receipt) {
  const paths = [];
  for (const reviewer of Array.isArray(receipt?.reviewers) ? receipt.reviewers : []) {
    const execution = reviewer?.execution;
    const actualRun = execution?.review_mode === 'ACTUAL_RUN' || execution?.code_mode === 'ACTUAL_RUN';
    if (!actualRun) continue;
    const relativePath = execution?.evidence_artifact?.path;
    if (typeof relativePath === 'string' && !paths.includes(relativePath)) paths.push(relativePath);
  }
  return paths.sort();
}

export function parsePorcelainStatus(raw) {
  const text = Buffer.isBuffer(raw) ? raw.toString('utf8') : String(raw || '');
  const tokens = text.split('\0');
  if (tokens.at(-1) === '') tokens.pop();
  const entries = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token.length < 4 || token[2] !== ' ') {
      reject('REVIEW_COMPANION_STATUS_INVALID', 'source worktree status could not be parsed');
    }
    const status = token.slice(0, 2);
    if (/[RC]/.test(status)) {
      reject('REVIEW_COMPANION_STATUS_INVALID', 'renamed or copied companion paths are forbidden');
    }
    entries.push({ status, path: token.slice(3) });
  }
  return entries;
}

async function readRegularFile(filePath, code) {
  let stats;
  try {
    stats = await fs.lstat(filePath);
  } catch (error) {
    if (error.code === 'ENOENT') reject(code, 'required review companion file is missing');
    throw error;
  }
  if (!stats.isFile() || stats.isSymbolicLink()) {
    reject(code, 'review companion must be a regular file');
  }
  return fs.readFile(filePath);
}

function rejectPublicRedlines(bytes, relativePath) {
  const findings = scanBufferForPublicRedlines(bytes, relativePath);
  if (findings.length > 0) {
    reject('REVIEW_COMPANION_PUBLIC_REDLINE', 'review companion contains forbidden public data');
  }
}

async function gitRaw(cwd, args) {
  const { stdout } = await execFile('git', args, {
    cwd,
    encoding: null,
    maxBuffer: 16 * 1024 * 1024,
  });
  return stdout;
}

async function readOptionalCanonicalReceipt(rootDir, relativePath) {
  const absolutePath = path.join(rootDir, ...relativePath.split('/'));
  let bytes;
  try {
    bytes = await readRegularFile(absolutePath, 'CANONICAL_RECEIPT_INVALID');
  } catch (error) {
    if (error instanceof ReviewCompanionError && error.code === 'CANONICAL_RECEIPT_INVALID') {
      try {
        await fs.access(absolutePath);
      } catch (accessError) {
        if (accessError.code === 'ENOENT') return null;
      }
    }
    throw error;
  }
  rejectPublicRedlines(bytes, relativePath);
  let receipt;
  try {
    receipt = JSON.parse(bytes.toString('utf8'));
  } catch {
    reject('CANONICAL_RECEIPT_INVALID', 'canonical predecessor receipt is not valid JSON');
  }
  const validation = validateReceipt(receipt, { allowLegacyWaiver: true });
  if (!validation.ok) reject('CANONICAL_RECEIPT_INVALID', 'canonical predecessor receipt is invalid');
  return { receipt, bytes };
}

export async function prepareReviewCompanion({
  sourceRoot,
  canonicalRoot,
  area,
  slug,
  noteRelativePath,
}) {
  const receiptPath = reviewReceiptRelativePath(area, slug);
  const expectedNotePath = `src/content/docs/${area}/${slug}.md`;
  if (noteRelativePath !== expectedNotePath) {
    reject('REVIEW_COMPANION_NOTE_PATH_MISMATCH', 'review companion note path does not match the assignment');
  }
  assertSafeCompanionPath(receiptPath, area, slug);
  const sourceReceiptPath = path.join(sourceRoot, ...receiptPath.split('/'));
  const receiptBytes = await readRegularFile(sourceReceiptPath, 'REVIEW_RECEIPT_MISSING');
  rejectPublicRedlines(receiptBytes, receiptPath);

  let receipt;
  try {
    receipt = JSON.parse(receiptBytes.toString('utf8'));
  } catch {
    reject('REVIEW_RECEIPT_INVALID', 'review receipt is not valid UTF-8 JSON');
  }
  const receiptValidation = validateReceipt(receipt);
  if (!receiptValidation.ok) reject('REVIEW_RECEIPT_INVALID', 'review receipt schema is invalid');
  if (receipt.note.area !== area || receipt.note.slug !== slug) {
    reject('REVIEW_RECEIPT_IDENTITY_MISMATCH', 'review receipt does not match the active assignment');
  }

  const evidencePaths = referencedEvidencePaths(receipt)
    .map((relativePath) => assertSafeCompanionPath(relativePath, area, slug));
  const requiredPaths = [receiptPath, ...evidencePaths];
  const status = parsePorcelainStatus(await gitRaw(sourceRoot, [
    'status', '--porcelain=v1', '-z', '--untracked-files=all',
  ]));
  const statusByPath = new Map(status.map((entry) => [entry.path, entry.status]));
  const statusPaths = [...statusByPath.keys()].sort();
  const expectedStatusPaths = [...requiredPaths].sort();
  if (
    statusPaths.length !== expectedStatusPaths.length
    || statusPaths.some((value, index) => value !== expectedStatusPaths[index])
  ) {
    reject(
      'REVIEW_COMPANION_SOURCE_STATUS_MISMATCH',
      'source worktree must contain only the current receipt and its referenced evidence changes',
    );
  }
  for (const evidencePath of evidencePaths) {
    const evidenceStatus = statusByPath.get(evidencePath);
    if (!evidenceStatus || evidenceStatus === '??' || evidenceStatus[0] === ' ') {
      reject('REVIEW_EVIDENCE_NOT_STAGED', 'ACTUAL_RUN evidence must be staged for canonical ingestion');
    }
  }

  const notePath = path.join(sourceRoot, ...noteRelativePath.split('/'));
  const noteBytes = await readRegularFile(notePath, 'REVIEW_NOTE_MISSING');
  const noteText = noteBytes.toString('utf8');
  const trust = parseFrontmatterLoose(noteText)?.trust;
  const sourceRevision = expectedSourceRevision(trust);
  if (!sourceRevision) reject('REVIEW_NOTE_PROVENANCE_INVALID', 'note has no immutable source revision');

  const verification = await verifyReceiptAgainstNote(receipt, noteText, {
    rootDir: sourceRoot,
    area,
    slug,
    sourceRevision,
    evidenceType: trust?.evidence_type,
  });
  if (!verification.ok) {
    reject('REVIEW_RECEIPT_STALE_OR_UNVERIFIED', 'review receipt does not verify the current note and evidence');
  }
  if (trust?.verification_status === 'VERIFIED' && verification.evidence_state !== 'VERIFIED') {
    reject('REVIEW_RECEIPT_FALSE_VERIFIED', 'note cannot claim VERIFIED without verified execution evidence');
  }

  const predecessor = await readOptionalCanonicalReceipt(canonicalRoot, receiptPath);
  const predecessorDigest = predecessor ? digestReceipt(predecessor.receipt) : null;
  const expectedGeneration = predecessor ? predecessor.receipt.generation + 1 : 1;
  if (
    receipt.generation !== expectedGeneration
    || receipt.predecessor_digest_sha256 !== predecessorDigest
  ) {
    reject('REVIEW_RECEIPT_PREDECESSOR_MISMATCH', 'review receipt does not extend the canonical predecessor');
  }

  const files = [{ path: receiptPath, bytes: receiptBytes }];
  for (const evidencePath of evidencePaths) {
    const bytes = await readRegularFile(
      path.join(sourceRoot, ...evidencePath.split('/')),
      'REVIEW_EVIDENCE_MISSING',
    );
    rejectPublicRedlines(bytes, evidencePath);
    files.push({ path: evidencePath, bytes });
  }

  return {
    area,
    slug,
    noteRelativePath,
    noteText,
    receipt,
    receiptPath,
    evidencePaths,
    predecessorDigest,
    verification,
    files,
  };
}

async function captureExistingFiles(rootDir, files) {
  const backups = [];
  for (const file of files) {
    const absolutePath = path.join(rootDir, ...file.path.split('/'));
    try {
      const stats = await fs.lstat(absolutePath);
      if (!stats.isFile() || stats.isSymbolicLink()) {
        reject('CANONICAL_COMPANION_PATH_INVALID', 'canonical companion destination is not a regular file');
      }
      backups.push({ path: file.path, existed: true, bytes: await fs.readFile(absolutePath), mode: stats.mode & 0o777 });
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      backups.push({ path: file.path, existed: false, bytes: null, mode: null });
    }
  }
  return backups;
}

async function restoreFiles(rootDir, backups) {
  for (const backup of backups) {
    const absolutePath = path.join(rootDir, ...backup.path.split('/'));
    if (backup.existed) {
      await atomicWriteFile(absolutePath, backup.bytes, { mode: backup.mode });
    } else {
      await fs.unlink(absolutePath).catch((error) => {
        if (error.code !== 'ENOENT') throw error;
      });
    }
  }
}

export async function installReviewCompanion(prepared, options = {}) {
  const rootDir = options.rootDir;
  const gitMaybeFn = options.gitMaybeFn || gitMaybe;
  const gitOutputFn = options.gitOutputFn || gitOutput;
  const initialHead = gitOutputFn(['rev-parse', 'HEAD'], { cwd: rootDir });
  const backups = await captureExistingFiles(rootDir, prepared.files);
  try {
    for (const file of prepared.files) {
      const destination = path.join(rootDir, ...file.path.split('/'));
      await atomicWriteFile(destination, file.bytes, { mode: 0o644 });
    }
    const added = gitMaybeFn(['add', '--', ...prepared.files.map((file) => file.path)], { cwd: rootDir });
    if (!added.ok) reject('REVIEW_COMPANION_STAGE_FAILED', 'could not stage canonical review companion');
    const amended = gitMaybeFn(['commit', '--amend', '--no-edit'], { cwd: rootDir });
    if (!amended.ok) reject('REVIEW_COMPANION_COMMIT_FAILED', 'could not amend canonical review companion');
    return { commit: gitOutputFn(['rev-parse', 'HEAD'], { cwd: rootDir }) };
  } catch (error) {
    const currentHead = gitOutputFn(['rev-parse', 'HEAD'], { cwd: rootDir });
    if (currentHead === initialHead) {
      gitMaybeFn(['read-tree', 'HEAD'], { cwd: rootDir });
      await restoreFiles(rootDir, backups);
    }
    throw error;
  }
}

function parseNameStatus(raw) {
  const fields = raw.toString('utf8').split('\0');
  if (fields.at(-1) === '') fields.pop();
  if (fields.length % 2 !== 0) {
    reject('CANONICAL_COMPANION_SCOPE_INVALID', 'canonical merge diff is malformed');
  }
  const changes = [];
  for (let index = 0; index < fields.length; index += 2) {
    changes.push({ status: fields[index], path: fields[index + 1] });
  }
  return changes;
}

export async function verifyInstalledReviewCompanion(prepared, options = {}) {
  const { rootDir, commit, expectedParent, reviewedScope } = options;
  const parents = (await gitRaw(rootDir, ['rev-list', '--parents', '-n', '1', commit]))
    .toString('utf8').trim().split(/\s+/);
  if (parents.length !== 2 || parents[0] !== commit || parents[1] !== expectedParent) {
    reject('CANONICAL_COMPANION_PARENT_MISMATCH', 'canonical merge commit parent is not the captured HEAD');
  }
  const changes = parseNameStatus(await gitRaw(rootDir, [
    'diff-tree', '--no-commit-id', '--name-status', '-r', '-z', '--no-renames', expectedParent, commit,
  ]));
  const expectedPaths = [reviewedScope.expectedPath, ...prepared.files.map((file) => file.path)].sort();
  const actualPaths = changes.map((change) => change.path).sort();
  if (
    actualPaths.length !== expectedPaths.length
    || actualPaths.some((value, index) => value !== expectedPaths[index])
    || changes.some((change) => !['A', 'M'].includes(change.status))
  ) {
    reject('CANONICAL_COMPANION_SCOPE_INVALID', 'canonical merge commit changed paths outside the signed allowlist');
  }

  const noteEntry = (await gitRaw(rootDir, ['ls-tree', '-z', commit, '--', reviewedScope.expectedPath]))
    .toString('utf8');
  const noteMatch = noteEntry.match(/^(\d{6}) blob ([0-9a-f]{40})\t/);
  if (!noteMatch || noteMatch[1] !== reviewedScope.mode || noteMatch[2] !== reviewedScope.blob) {
    reject('CANONICAL_NOTE_BLOB_MISMATCH', 'canonical note blob differs from the reviewed worker commit');
  }
  for (const file of prepared.files) {
    const entry = (await gitRaw(rootDir, ['ls-tree', '-z', commit, '--', file.path])).toString('utf8');
    if (!/^100644 blob [0-9a-f]{40}\t/.test(entry)) {
      reject('CANONICAL_COMPANION_MODE_INVALID', 'canonical review companion is not a regular 100644 blob');
    }
    const committedBytes = await gitRaw(rootDir, ['show', `${commit}:${file.path}`]);
    if (!committedBytes.equals(file.bytes)) {
      reject('CANONICAL_COMPANION_BLOB_MISMATCH', 'canonical review companion bytes differ from the verified source');
    }
  }

  const canonicalNote = await fs.readFile(path.join(rootDir, ...prepared.noteRelativePath.split('/')), 'utf8');
  const canonicalVerification = await verifyReceiptAgainstNote(prepared.receipt, canonicalNote, {
    rootDir,
    area: prepared.area,
    slug: prepared.slug,
    sourceRevision: prepared.receipt.source_revision,
    evidenceType: parseFrontmatterLoose(canonicalNote)?.trust?.evidence_type,
  });
  if (!canonicalVerification.ok) {
    reject('CANONICAL_RECEIPT_VERIFICATION_FAILED', 'installed receipt or evidence is not valid in the canonical repository');
  }
  return { ok: true, verification: canonicalVerification, paths: expectedPaths };
}

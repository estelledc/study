import { createHash } from 'node:crypto';
import { execFile as execFileCallback } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

import { atomicWriteFile } from './json-store.mjs';
import { isNoteArea, isNoteSlug } from './note-id.mjs';
import { stripGeneratedBacklinkSection } from '../regen-backlinks.mjs';

const execFile = promisify(execFileCallback);

export const RECEIPT_SCHEMA_VERSION = 'study-review-receipt-v1';
export const REVIEWER_ROLES = ['ZERO_BASE', 'ENGINEER', 'ACADEMIC'];
export const EXECUTION_MODES = [
  'ACTUAL_RUN',
  'STATIC_REVIEW',
  'MANUAL_SIMULATION',
  'NOT_APPLICABLE',
];

const SHA256_RE = /^[a-f0-9]{64}$/;
const ISO_INSTANT_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
const DECISIONS = new Set(['PASS', 'PASS_WITH_NOTES', 'FAIL']);
const WAIVER_REASONS = new Set(['NOT_APPLICABLE', 'EXTERNAL_DEPENDENCY', 'LEGACY_CONTENT']);
const EVIDENCE_SCHEMA_VERSION = 'study-execution-evidence-v1';
const EVIDENCE_STATUS = new Set(['PASS', 'FAIL']);
const EVIDENCE_PATH_RE = /^data\/review-evidence\/(papers|projects)\/([a-z0-9][a-z0-9_.-]*)\/([a-z0-9][a-z0-9_.-]*)\.json$/;

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function canonicalizeNote(noteText) {
  const withoutGenerated = stripGeneratedBacklinkSection(String(noteText).replace(/\r\n?/g, '\n'));
  return `${withoutGenerated.split('\n').map((line) => line.replace(/[ \t]+$/g, '')).join('\n').trimEnd()}\n`;
}

export function digestNote(noteText) {
  return sha256(canonicalizeNote(noteText));
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function digestReceipt(receipt) {
  return sha256(stableJson(receipt));
}

export function receiptPath(receiptsRoot, area, slug) {
  if (!isNoteArea(area)) throw new Error(`invalid receipt area: ${area}`);
  if (!isNoteSlug(slug)) throw new Error(`invalid receipt slug: ${slug}`);
  return path.join(receiptsRoot, area, `${slug}.json`);
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function checkExactKeys(value, allowed, label, errors) {
  if (!isPlainObject(value)) {
    errors.push(`${label} must be an object`);
    return false;
  }
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) errors.push(`${label} has unknown field: ${key}`);
  }
  return true;
}

function checkInstant(value, label, errors) {
  let canonical = null;
  if (typeof value === 'string' && ISO_INSTANT_RE.test(value)) {
    canonical = value.includes('.')
      ? value.replace(/\.(\d{1,3})Z$/, (_match, fraction) => `.${fraction.padEnd(3, '0')}Z`)
      : value.replace(/Z$/, '.000Z');
  }
  const parsed = typeof value === 'string' ? new Date(value) : null;
  if (!canonical || Number.isNaN(parsed.valueOf()) || parsed.toISOString() !== canonical) {
    errors.push(`${label} must be a UTC ISO-8601 instant`);
  }
}

function checkHash(value, label, errors) {
  if (typeof value !== 'string' || !SHA256_RE.test(value)) {
    errors.push(`${label} must be a lowercase SHA-256 digest`);
  }
}

export function validateReceipt(receipt, options = {}) {
  const errors = [];
  if (!checkExactKeys(receipt, new Set([
    'schema_version',
    'generation',
    'predecessor_digest_sha256',
    'note',
    'source_revision',
    'research_input_sha256',
    'reviewers',
    'waivers',
    'created_at',
  ]), 'receipt', errors)) {
    return { ok: false, errors };
  }

  if (receipt.schema_version !== RECEIPT_SCHEMA_VERSION) {
    errors.push(`schema_version must be ${RECEIPT_SCHEMA_VERSION}`);
  }
  if (!Number.isSafeInteger(receipt.generation) || receipt.generation < 1) {
    errors.push('generation must be a positive safe integer');
  }
  if (receipt.generation === 1) {
    if (receipt.predecessor_digest_sha256 !== null) {
      errors.push('generation 1 predecessor_digest_sha256 must be null');
    }
  } else {
    checkHash(receipt.predecessor_digest_sha256, 'predecessor_digest_sha256', errors);
  }

  if (checkExactKeys(receipt.note, new Set(['area', 'slug', 'digest_sha256']), 'note', errors)) {
    if (!isNoteArea(receipt.note.area)) errors.push('note.area must be papers or projects');
    if (!isNoteSlug(receipt.note.slug)) errors.push('note.slug is invalid');
    checkHash(receipt.note.digest_sha256, 'note.digest_sha256', errors);
  }
  if (typeof receipt.source_revision !== 'string'
    || receipt.source_revision.length < 1
    || receipt.source_revision.length > 240
    || /[\u0000\r\n]/.test(receipt.source_revision)) {
    errors.push('source_revision must contain 1-240 characters');
  }
  checkHash(receipt.research_input_sha256, 'research_input_sha256', errors);
  checkInstant(receipt.created_at, 'created_at', errors);

  const reviewers = Array.isArray(receipt.reviewers) ? receipt.reviewers : [];
  const waivers = Array.isArray(receipt.waivers) ? receipt.waivers : [];
  if (!Array.isArray(receipt.reviewers)) errors.push('reviewers must be an array');
  if (!Array.isArray(receipt.waivers)) errors.push('waivers must be an array');
  if (reviewers.length > REVIEWER_ROLES.length) errors.push('reviewers has too many entries');
  if (waivers.length > REVIEWER_ROLES.length) errors.push('waivers has too many entries');

  const coveredRoles = new Set();
  for (const [index, reviewer] of reviewers.entries()) {
    const label = `reviewers[${index}]`;
    if (!checkExactKeys(reviewer, new Set([
      'role', 'reviewer_version', 'decision', 'score', 'warnings', 'execution',
    ]), label, errors)) continue;
    if (!REVIEWER_ROLES.includes(reviewer.role)) errors.push(`${label}.role is invalid`);
    if (coveredRoles.has(reviewer.role)) errors.push(`role ${reviewer.role} is duplicated`);
    coveredRoles.add(reviewer.role);
    if (typeof reviewer.reviewer_version !== 'string'
      || reviewer.reviewer_version.length < 1
      || reviewer.reviewer_version.length > 80
      || /[\u0000\r\n]/.test(reviewer.reviewer_version)) {
      errors.push(`${label}.reviewer_version must contain 1-80 characters`);
    }
    if (!DECISIONS.has(reviewer.decision)) errors.push(`${label}.decision is invalid`);
    if (!Number.isInteger(reviewer.score) || reviewer.score < 0 || reviewer.score > 100) {
      errors.push(`${label}.score must be an integer from 0 to 100`);
    }
    if (!Array.isArray(reviewer.warnings)
      || reviewer.warnings.length > 20
      || reviewer.warnings.some((warning) => (
        typeof warning !== 'string' || warning.length > 240 || /[\u0000\r\n]/.test(warning)
      ))) {
      errors.push(`${label}.warnings must contain at most 20 short strings`);
    }
    if (checkExactKeys(reviewer.execution, new Set([
      'review_mode', 'code_mode', 'evidence_artifact',
    ]), `${label}.execution`, errors)) {
      const { review_mode: reviewMode, code_mode: codeMode, evidence_artifact: artifact } = reviewer.execution;
      if (!EXECUTION_MODES.includes(reviewMode)) errors.push(`${label}.execution.review_mode is invalid`);
      if (!EXECUTION_MODES.includes(codeMode)) errors.push(`${label}.execution.code_mode is invalid`);
      if (reviewMode === 'NOT_APPLICABLE') errors.push(`${label}.execution.review_mode cannot be NOT_APPLICABLE`);
      const actualRun = reviewMode === 'ACTUAL_RUN' || codeMode === 'ACTUAL_RUN';
      if (actualRun && !artifact) {
        errors.push(`${label}.execution.evidence_artifact is required for ACTUAL_RUN`);
      }
      if (!actualRun && artifact !== undefined) {
        errors.push(`${label}.execution.evidence_artifact is allowed only for ACTUAL_RUN`);
      }
      if (artifact !== undefined && checkExactKeys(
        artifact,
        new Set(['path', 'sha256']),
        `${label}.execution.evidence_artifact`,
        errors,
      )) {
        if (typeof artifact.path !== 'string' || !EVIDENCE_PATH_RE.test(artifact.path)) {
          errors.push(`${label}.execution.evidence_artifact.path is outside the allowed repository directory`);
        } else {
          const [, artifactArea, artifactSlug] = artifact.path.match(EVIDENCE_PATH_RE);
          if (artifactArea !== receipt?.note?.area || artifactSlug !== receipt?.note?.slug) {
            errors.push(`${label}.execution.evidence_artifact.path must match the receipt note identity`);
          }
        }
        checkHash(artifact.sha256, `${label}.execution.evidence_artifact.sha256`, errors);
      }
    }
  }

  for (const [index, waiver] of waivers.entries()) {
    const label = `waivers[${index}]`;
    if (!checkExactKeys(waiver, new Set([
      'role', 'reason_code', 'approved_by_role', 'created_at',
    ]), label, errors)) continue;
    if (!REVIEWER_ROLES.includes(waiver.role)) errors.push(`${label}.role is invalid`);
    if (coveredRoles.has(waiver.role)) errors.push(`role ${waiver.role} is duplicated`);
    coveredRoles.add(waiver.role);
    if (!WAIVER_REASONS.has(waiver.reason_code)) errors.push(`${label}.reason_code is invalid`);
    if (!options.allowLegacyWaiver && waiver.reason_code === 'LEGACY_CONTENT') {
      errors.push(`${label}.reason_code LEGACY_CONTENT is not valid for new or changed notes`);
    }
    if (waiver.approved_by_role !== 'MAINTAINER') errors.push(`${label}.approved_by_role must be MAINTAINER`);
    checkInstant(waiver.created_at, `${label}.created_at`, errors);
  }

  for (const role of REVIEWER_ROLES) {
    if (!coveredRoles.has(role)) errors.push(`missing reviewer or waiver for role ${role}`);
  }
  return { ok: errors.length === 0, errors };
}

export function expectedSourceRevision(trust) {
  if (!trust || typeof trust !== 'object') return null;
  if (trust.source_kind === 'project') return trust.immutable_revision ?? null;
  if (trust.source_kind === 'paper') return trust.source_version ?? trust.publication_id ?? null;
  return null;
}

function shortString(value, maximum = 240) {
  return typeof value === 'string' && value.length >= 1 && value.length <= maximum && !/[\u0000\r\n]/.test(value);
}

async function verifyEvidenceArtifact(reference, expected = {}) {
  const errors = [];
  if (!expected.rootDir) {
    return { ok: false, errors: ['ACTUAL_RUN evidence verification requires repository rootDir'] };
  }
  const rootDir = path.resolve(expected.rootDir);
  const relativePath = reference?.path;
  if (typeof relativePath !== 'string' || !EVIDENCE_PATH_RE.test(relativePath)) {
    return { ok: false, errors: ['ACTUAL_RUN evidence artifact path is invalid'] };
  }
  const absolutePath = path.resolve(rootDir, relativePath);
  if (!absolutePath.startsWith(`${rootDir}${path.sep}`)) {
    return { ok: false, errors: ['ACTUAL_RUN evidence artifact escapes repository root'] };
  }

  let bytes;
  try {
    const stats = await fs.lstat(absolutePath);
    if (!stats.isFile() || stats.isSymbolicLink()) {
      return { ok: false, errors: ['ACTUAL_RUN evidence artifact must be a regular repository file'] };
    }
    bytes = await fs.readFile(absolutePath);
  } catch {
    return { ok: false, errors: ['ACTUAL_RUN evidence artifact is missing'] };
  }
  if (sha256(bytes) !== reference.sha256) errors.push('ACTUAL_RUN evidence artifact digest does not match');
  try {
    await execFile('git', ['ls-files', '--error-unmatch', '--', relativePath], {
      cwd: rootDir,
      maxBuffer: 1024 * 1024,
    });
  } catch {
    errors.push('ACTUAL_RUN evidence artifact is not Git tracked');
  }

  let artifact;
  try {
    artifact = JSON.parse(bytes.toString('utf8'));
  } catch {
    errors.push('ACTUAL_RUN evidence artifact is not valid UTF-8 JSON');
    return { ok: false, errors };
  }
  if (!checkExactKeys(
    artifact,
    new Set(['schema_version', 'command', 'exit_code', 'result', 'created_at']),
    'evidence artifact',
    errors,
  )) return { ok: false, errors };
  if (artifact.schema_version !== EVIDENCE_SCHEMA_VERSION) {
    errors.push(`evidence artifact schema_version must be ${EVIDENCE_SCHEMA_VERSION}`);
  }
  if (checkExactKeys(artifact.command, new Set(['argv', 'cwd']), 'evidence artifact command', errors)) {
    if (!Array.isArray(artifact.command.argv)
      || artifact.command.argv.length < 1
      || artifact.command.argv.length > 40
      || artifact.command.argv.some((part) => !shortString(part, 240))) {
      errors.push('evidence artifact command.argv must contain 1-40 short argument strings');
    }
    if (!shortString(artifact.command.cwd, 240)
      || path.isAbsolute(artifact.command.cwd)
      || artifact.command.cwd.split(/[\\/]/).includes('..')) {
      errors.push('evidence artifact command.cwd must be repository-relative');
    }
  }
  if (!Number.isInteger(artifact.exit_code) || artifact.exit_code < 0 || artifact.exit_code > 255) {
    errors.push('evidence artifact exit_code must be an integer from 0 to 255');
  }
  if (checkExactKeys(artifact.result, new Set(['status', 'summary']), 'evidence artifact result', errors)) {
    if (!EVIDENCE_STATUS.has(artifact.result.status)) errors.push('evidence artifact result.status is invalid');
    if (!shortString(artifact.result.summary, 240)) errors.push('evidence artifact result.summary must be a short string');
  }
  checkInstant(artifact.created_at, 'evidence artifact created_at', errors);
  if (artifact.exit_code !== 0 || artifact.result?.status !== 'PASS') {
    errors.push('ACTUAL_RUN evidence artifact did not record a passing execution');
  }
  return { ok: errors.length === 0, errors };
}

export async function verifyReceiptAgainstNote(receipt, noteText, expected = {}) {
  const validation = validateReceipt(receipt, {
    allowLegacyWaiver: expected.allowLegacyWaiver === true,
  });
  const errors = [...validation.errors];
  const currentDigest = digestNote(noteText);

  if (receipt?.note?.area !== expected.area) errors.push('receipt note area does not match');
  if (receipt?.note?.slug !== expected.slug) errors.push('receipt note slug does not match');
  if (receipt?.note?.digest_sha256 !== currentDigest) errors.push('receipt is stale for current note digest');
  if (expected.sourceRevision && receipt?.source_revision !== expected.sourceRevision) {
    errors.push('receipt source revision does not match trust provenance');
  }

  const reviewers = Array.isArray(receipt?.reviewers) ? receipt.reviewers : [];
  const hasManualSimulation = reviewers.some(({ execution }) => (
    execution?.review_mode === 'MANUAL_SIMULATION' || execution?.code_mode === 'MANUAL_SIMULATION'
  ));
  const hasWaivers = Array.isArray(receipt?.waivers) && receipt.waivers.length > 0;
  const decisionsPass = reviewers.every(({ decision }) => decision === 'PASS' || decision === 'PASS_WITH_NOTES');
  if (!decisionsPass) errors.push('review receipt contains a failed decision');
  const requiresExecutedCode = expected.evidenceType === 'EXECUTED_EXPERIMENT';
  const engineer = reviewers.find(({ role }) => role === 'ENGINEER');
  const hasExecutedCode = engineer?.execution?.code_mode === 'ACTUAL_RUN';
  if (requiresExecutedCode && !hasExecutedCode) {
    errors.push('executed-experiment evidence requires an ENGINEER ACTUAL_RUN code mode');
  }

  const actualRuns = reviewers.filter(({ execution }) => (
    execution?.review_mode === 'ACTUAL_RUN' || execution?.code_mode === 'ACTUAL_RUN'
  ));
  let verifiedArtifactCount = 0;
  for (const reviewer of actualRuns) {
    const checked = await verifyEvidenceArtifact(reviewer.execution?.evidence_artifact, expected);
    errors.push(...checked.errors.map((error) => `${reviewer.role}: ${error}`));
    if (checked.ok) verifiedArtifactCount += 1;
  }

  return {
    ok: errors.length === 0,
    errors,
    current_digest_sha256: currentDigest,
    evidence_state: errors.length === 0
      && decisionsPass
      && !hasManualSimulation
      && !hasWaivers
      && actualRuns.length > 0
      && verifiedArtifactCount === actualRuns.length
      ? 'VERIFIED'
      : 'UNVERIFIED',
    has_manual_simulation: hasManualSimulation,
    has_waivers: hasWaivers,
    has_executed_code: hasExecutedCode,
    actual_run_count: actualRuns.length,
    verified_artifact_count: verifiedArtifactCount,
  };
}

export async function writeReceiptAtomic(filePath, receipt, options = {}) {
  const validation = validateReceipt(receipt, options);
  if (!validation.ok) {
    throw new Error(`invalid review receipt: ${validation.errors.join('; ')}`);
  }
  const lockPath = `${filePath}.lock`;
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  let lock;
  try {
    lock = await fs.open(lockPath, 'wx', 0o600);
  } catch (error) {
    if (error.code === 'EEXIST') throw new Error('review receipt CAS lock is already held');
    throw error;
  }
  try {
    let current = null;
    try {
      current = JSON.parse(await fs.readFile(filePath, 'utf8'));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    const currentDigest = current ? digestReceipt(current) : null;
    const expectedPredecessor = options.expectedPredecessorDigest ?? null;
    if (currentDigest !== expectedPredecessor) {
      throw new Error('review receipt CAS predecessor mismatch');
    }
    const expectedGeneration = current ? current.generation + 1 : 1;
    if (receipt.generation !== expectedGeneration) {
      throw new Error(`review receipt generation mismatch: expected ${expectedGeneration}`);
    }
    if (receipt.predecessor_digest_sha256 !== currentDigest) {
      throw new Error('review receipt predecessor digest mismatch');
    }
    const serialized = `${JSON.stringify(receipt, null, 2)}\n`;
    await atomicWriteFile(filePath, serialized, { encoding: 'utf8', mode: 0o644 });
  } finally {
    await lock.close().catch(() => {});
    await fs.unlink(lockPath).catch(() => {});
  }
}

export async function readReceipt(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'));
}

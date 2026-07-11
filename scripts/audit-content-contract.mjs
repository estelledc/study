#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { execFile as execFileCallback } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

import { parseFrontmatterLoose } from './lib/frontmatter.mjs';
import { discoverNotes } from './lib/note-discovery.mjs';
import { matchOfficialSource } from './lib/official-source.mjs';
import {
  expectedSourceRevision,
  readReceipt,
  receiptPath,
  verifyReceiptAgainstNote,
} from './lib/review-receipt.mjs';
import { stripGeneratedBacklinkSection } from './regen-backlinks.mjs';

const execFile = promisify(execFileCallback);
const CONTRACT_VERSION = 'study-v2';
const AREAS = ['papers', 'projects'];
const TRUST_KEYS = new Set([
  'version',
  'source_kind',
  'note_type',
  'canonical_source',
  'source_authority',
  'accessed_at',
  'immutable_revision',
  'publication_id',
  'source_version',
  'evidence_type',
  'verification_status',
  'reviewed_at',
  'review_after',
  'applicable_version',
]);
const EVIDENCE_TYPES = new Set([
  'PRIMARY_SOURCE',
  'STATIC_ANALYSIS',
  'EXECUTED_EXPERIMENT',
  'USER_OBSERVATION',
  'NOT_APPLICABLE',
]);
const VERIFICATION_STATUSES = new Set([
  'UNVERIFIED',
  'PARTIALLY_VERIFIED',
  'VERIFIED',
  'NOT_APPLICABLE',
]);
const SOURCE_AUTHORITIES = new Set(['OFFICIAL_PRIMARY', 'AUTHOR_PRIMARY', 'SECONDARY']);
const NOTE_TYPES_BY_AREA = {
  papers: new Set(['paper', 'concept', 'protocol', 'security-guidance']),
  projects: new Set(['concept', 'library', 'system', 'protocol', 'tool', 'platform-api', 'security-guidance']),
};
const DEFAULT_OFFICIAL_SOURCE_REGISTRY = JSON.parse(await fs.readFile(
  new URL('../data/official-source-registry.json', import.meta.url),
  'utf8',
));

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function posixRelative(rootDir, filePath) {
  return path.relative(rootDir, filePath).split(path.sep).join('/');
}

function normalizeDate(value) {
  if (value instanceof Date && !Number.isNaN(value.valueOf())) return value.toISOString().slice(0, 10);
  return typeof value === 'string' ? value : null;
}

function isCalendarDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value ?? '')) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

function isHttpUrl(value) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

export function validateTrust(frontmatter, area, options = {}) {
  const trust = frontmatter?.trust;
  if (trust === undefined) return { state: 'legacy-unverified', errors: [] };
  const errors = [];
  if (!trust || typeof trust !== 'object' || Array.isArray(trust)) {
    return { state: 'invalid-v2', errors: ['trust-must-be-object'] };
  }
  for (const key of Object.keys(trust)) {
    if (!TRUST_KEYS.has(key)) errors.push(`unknown-trust-field:${key}`);
  }
  if (trust.version !== CONTRACT_VERSION) errors.push('invalid-contract-version');
  const expectedKind = area === 'papers' ? 'paper' : 'project';
  if (trust.source_kind !== expectedKind) errors.push('source-kind-area-mismatch');
  if (!NOTE_TYPES_BY_AREA[area].has(trust.note_type)) errors.push('invalid-note-type');
  if (!isHttpUrl(trust.canonical_source)) errors.push('invalid-canonical-source');
  if (!SOURCE_AUTHORITIES.has(trust.source_authority)) errors.push('invalid-source-authority');
  if (trust.source_authority === 'OFFICIAL_PRIMARY') {
    const official = matchOfficialSource(
      options.officialSourceRegistry ?? DEFAULT_OFFICIAL_SOURCE_REGISTRY,
      trust.canonical_source,
    );
    if (!official.ok) errors.push(official.reason);
  }
  if (!EVIDENCE_TYPES.has(trust.evidence_type)) errors.push('invalid-evidence-type');
  if (!VERIFICATION_STATUSES.has(trust.verification_status)) errors.push('invalid-verification-status');

  const reviewedAt = normalizeDate(trust.reviewed_at);
  const accessedAt = normalizeDate(trust.accessed_at);
  const reviewAfter = normalizeDate(trust.review_after);
  if (!isCalendarDate(reviewedAt)) errors.push('invalid-reviewed-at');
  if (!isCalendarDate(accessedAt)) errors.push('invalid-accessed-at');
  if (!Object.hasOwn(trust, 'review_after')) errors.push('review-after-must-be-explicit');
  if (trust.review_after !== null && !isCalendarDate(reviewAfter)) errors.push('invalid-review-after');
  if (isCalendarDate(accessedAt) && isCalendarDate(reviewedAt) && accessedAt > reviewedAt) {
    errors.push('accessed-at-after-review');
  }
  if (isCalendarDate(reviewedAt) && isCalendarDate(reviewAfter) && reviewAfter < reviewedAt) {
    errors.push('review-after-before-reviewed-at');
  }
  if (trust.applicable_version !== undefined && (
    typeof trust.applicable_version !== 'string'
    || trust.applicable_version.length < 1
    || trust.applicable_version.length > 120
  )) {
    errors.push('invalid-applicable-version');
  }

  if (expectedKind === 'project') {
    if (typeof trust.immutable_revision !== 'string' || trust.immutable_revision.length < 7 || trust.immutable_revision.length > 128) {
      errors.push('invalid-immutable-revision');
    }
    if ('publication_id' in trust || 'source_version' in trust) errors.push('paper-provenance-on-project');
  } else {
    if (typeof trust.publication_id !== 'string' || trust.publication_id.length < 3 || trust.publication_id.length > 240) {
      errors.push('invalid-publication-id');
    }
    if ('immutable_revision' in trust) errors.push('project-provenance-on-paper');
    if (trust.source_version !== undefined && (
      typeof trust.source_version !== 'string'
      || trust.source_version.length < 1
      || trust.source_version.length > 120
    )) {
      errors.push('invalid-source-version');
    }
  }
  if (trust.verification_status === 'VERIFIED' && (
    trust.evidence_type === 'NOT_APPLICABLE' || trust.evidence_type === 'USER_OBSERVATION'
  )) {
    errors.push('verified-without-non-user-evidence');
  }
  if ((trust.verification_status === 'NOT_APPLICABLE') !== (trust.evidence_type === 'NOT_APPLICABLE')) {
    errors.push('not-applicable-status-mismatch');
  }
  return { state: errors.length === 0 ? 'v2' : 'invalid-v2', errors: [...new Set(errors)].sort(), trust };
}

export function canonicalizeForMaterialChange(noteText) {
  let value = String(noteText).replace(/\r\n?/g, '\n');
  value = value.replace(/^---\n[\s\S]*?\n---(?:\n|$)/, '');
  // Only the marker-owned generated section is derivative data. A handwritten
  // section with the same heading remains authored content and must be audited.
  value = stripGeneratedBacklinkSection(value);
  value = value.replace(/(!?\[[^\]]*\])\([^\n)]*\)/g, '$1(<link-target>)');
  value = value.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_match, _target, label) => (
    label ? `[[<link-target>|${label}]]` : '[[<link-target>]]'
  ));
  value = value.replace(/\b(href|src)=(['"])[^'"]*\2/g, '$1=$2<link-target>$2');
  return `${value.split('\n').map((line) => line.trimEnd()).join('\n').trim()}\n`;
}

export function isMaterialNoteChange(before, after) {
  if (before === null || before === undefined) return true;
  const beforeTrust = parseFrontmatterLoose(before)?.trust;
  const afterTrust = parseFrontmatterLoose(after)?.trust;
  if ((beforeTrust !== undefined || afterTrust !== undefined)
    && JSON.stringify(beforeTrust) !== JSON.stringify(afterTrust)) return true;
  return canonicalizeForMaterialChange(before) !== canonicalizeForMaterialChange(after);
}

function emptyAreaStats() {
  return { total: 0, v2: 0, legacy_unverified: 0, invalid_v2: 0 };
}

export async function auditContentContract(options = {}) {
  const rootDir = path.resolve(options.rootDir ?? process.cwd());
  const baseline = options.baseline ?? JSON.parse(await fs.readFile(
    path.join(rootDir, 'data', 'content-contract-baseline.json'),
    'utf8',
  ));
  const changedPaths = new Set([...(options.changedPaths ?? [])].map((value) => value.split(path.sep).join('/')));
  const materialChanges = options.materialChanges
    ? new Set([...options.materialChanges].map((value) => value.split(path.sep).join('/')))
    : changedPaths;
  const receiptsRoot = options.receiptsRoot ?? path.join(rootDir, 'data', 'review-receipts');
  const checkReceipts = options.checkReceipts !== false;
  const byArea = { papers: emptyAreaStats(), projects: emptyAreaStats() };
  const findings = [];
  const legacyIds = [];

  for (const note of await discoverNotes(rootDir)) {
    const relativePath = posixRelative(rootDir, note.path);
    const noteText = await fs.readFile(note.path, 'utf8');
    const frontmatter = parseFrontmatterLoose(noteText);
    const validation = validateTrust(frontmatter, note.area);
    byArea[note.area].total += 1;
    byArea[note.area][validation.state === 'v2' ? 'v2' : validation.state.replace('-', '_')] += 1;

    const codes = [...validation.errors];
    if (!note.canonical_path) codes.push(...note.path_issues);
    if (validation.state === 'legacy-unverified') {
      legacyIds.push(note.canonical_path ? `${note.area}/${note.slug}` : `${note.area}/${note.area_relative_path}`);
      if (materialChanges.has(relativePath)) codes.push('materially-changed-legacy-note');
    } else if (validation.state === 'v2' && checkReceipts && note.canonical_path) {
      const filePath = receiptPath(receiptsRoot, note.area, note.slug);
      try {
        const receipt = await readReceipt(filePath);
        const checked = await verifyReceiptAgainstNote(receipt, noteText, {
          area: note.area,
          slug: note.slug,
          sourceRevision: expectedSourceRevision(validation.trust),
          evidenceType: validation.trust.evidence_type,
          rootDir,
        });
        if (!checked.ok) codes.push(...checked.errors.map(() => 'invalid-or-stale-review-receipt'));
        if (validation.trust.verification_status === 'VERIFIED' && checked.evidence_state !== 'VERIFIED') {
          codes.push('false-verified-status');
        }
      } catch (error) {
        codes.push(error?.code === 'ENOENT' ? 'review-receipt-missing' : 'review-receipt-unreadable');
      }
    }

    if (codes.length > 0) {
      findings.push({
        path: relativePath,
        area: note.area,
        slug: note.slug,
        state: validation.state,
        blocking: true,
        codes: [...new Set(codes)].sort(),
      });
    }
  }

  const summary = {
    total: byArea.papers.total + byArea.projects.total,
    v2: byArea.papers.v2 + byArea.projects.v2,
    legacy_unverified: byArea.papers.legacy_unverified + byArea.projects.legacy_unverified,
    invalid_v2: byArea.papers.invalid_v2 + byArea.projects.invalid_v2,
  };
  for (const area of AREAS) {
    if (byArea[area].legacy_unverified > baseline.legacy_unverified_max[area]) {
      findings.push({
        path: 'data/content-contract-baseline.json',
        area,
        slug: null,
        state: 'baseline-growth',
        blocking: true,
        codes: ['legacy-baseline-growth'],
      });
    }
  }
  if (summary.legacy_unverified > baseline.legacy_unverified_max.total) {
    findings.push({
      path: 'data/content-contract-baseline.json',
      area: 'all',
      slug: null,
      state: 'baseline-growth',
      blocking: true,
      codes: ['legacy-baseline-total-growth'],
    });
  }
  findings.sort((left, right) => (
    left.path.localeCompare(right.path)
    || String(left.area).localeCompare(String(right.area))
    || String(left.slug).localeCompare(String(right.slug))
  ));

  return {
    schema_version: 'study-content-contract-audit-v1',
    contract_version: CONTRACT_VERSION,
    baseline_commit: baseline.baseline_commit,
    changed_policy: 'new-or-material-note-content',
    summary: { ...summary, blocking: findings.filter(({ blocking }) => blocking).length },
    by_area: byArea,
    legacy_baseline: {
      maximum: baseline.legacy_unverified_max,
      current_paths_sha256: sha256(`${legacyIds.sort().join('\n')}\n`),
      status: findings.some(({ codes }) => codes.includes('legacy-baseline-growth')) ? 'GROWTH' : 'WITHIN_BASELINE',
    },
    findings,
  };
}

export async function collectMaterialChanges(rootDir, baseRef) {
  const { stdout } = await execFile('git', [
    'diff', '--name-only', '--diff-filter=ACMR', baseRef, '--',
    'src/content/docs/papers', 'src/content/docs/projects',
  ], { cwd: rootDir, maxBuffer: 10 * 1024 * 1024 });
  const trackedChanges = stdout.split(/\r?\n/).filter(Boolean);
  const { stdout: untrackedOutput } = await execFile('git', [
    'ls-files', '--others', '--exclude-standard', '-z', '--',
    'src/content/docs/papers', 'src/content/docs/projects',
  ], { cwd: rootDir, encoding: 'buffer', maxBuffer: 10 * 1024 * 1024 });
  const untracked = untrackedOutput.toString('utf8').split('\0').filter(Boolean);
  const changedPaths = new Set([...trackedChanges, ...untracked]);
  const materialChanges = new Set();

  for (const relativePath of changedPaths) {
    if (!/\.mdx?$/.test(relativePath)) continue;
    let before = null;
    try {
      const result = await execFile('git', ['show', `${baseRef}:${relativePath}`], {
        cwd: rootDir,
        maxBuffer: 10 * 1024 * 1024,
      });
      before = result.stdout;
    } catch {
      before = null;
    }
    let after;
    try {
      after = await fs.readFile(path.join(rootDir, relativePath), 'utf8');
    } catch {
      continue;
    }
    if (isMaterialNoteChange(before, after)) materialChanges.add(relativePath);
  }
  return { changedPaths, materialChanges };
}

function parseArgs(argv) {
  const args = { json: false, changedFrom: null };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--json') args.json = true;
    else if (argv[index] === '--changed-from') args.changedFrom = argv[++index];
    else throw new Error(`unknown argument: ${argv[index]}`);
  }
  if (args.changedFrom === undefined) throw new Error('--changed-from requires a ref');
  return args;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const changes = args.changedFrom
      ? await collectMaterialChanges(process.cwd(), args.changedFrom)
      : { changedPaths: new Set(), materialChanges: new Set() };
    const report = await auditContentContract({ rootDir: process.cwd(), ...changes });
    if (args.json) console.log(JSON.stringify(report, null, 2));
    else console.log(`content-contract: ${report.summary.blocking} blocking, ${report.summary.v2} v2, ${report.summary.legacy_unverified} legacy-unverified`);
    process.exitCode = report.summary.blocking === 0 ? 0 : 1;
  } catch (error) {
    console.error(`content-contract audit failed: ${error.message}`);
    process.exitCode = 2;
  }
}

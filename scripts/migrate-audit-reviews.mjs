#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { AUDIT_REVIEWS_DIR, ROOT } from './lib/paths.mjs';

const ARCHIVE_RELATIVE_PATH = 'data/audit-reviews/legacy-audit-reviews.jsonl';
const MANIFEST_RELATIVE_PATH = 'data/audit-reviews/manifest.json';
const SOURCE_DIRECTORIES = [
  { area: 'papers', relativePath: 'data/audit-reviews/papers' },
  { area: 'projects', relativePath: 'data/audit-reviews/projects' },
];
const RECORD_SCHEMA_VERSION = 'study-legacy-audit-review-record-v1';
const MANIFEST_SCHEMA_VERSION = 'study-legacy-audit-review-manifest-v1';

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function toPortablePath(relativePath) {
  return relativePath.split(path.sep).join('/');
}

function gitHead(root) {
  const result = spawnSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' });
  if (result.status !== 0) return 'UNKNOWN';
  return result.stdout.trim();
}

function listJsonFiles(directory) {
  if (!fs.existsSync(directory)) throw new Error(`missing audit review source directory: ${directory}`);
  const files = [];
  const stack = [directory];
  while (stack.length > 0) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(absolute);
      else if (entry.isFile() && entry.name.endsWith('.json')) files.push(absolute);
    }
  }
  return files.sort((a, b) => a.localeCompare(b));
}

export function buildLegacyAuditReviewArchive({ root = ROOT } = {}) {
  const records = [];
  for (const source of SOURCE_DIRECTORIES) {
    const sourceRoot = path.join(root, source.relativePath);
    for (const absolutePath of listJsonFiles(sourceRoot)) {
      const raw = fs.readFileSync(absolutePath, 'utf8');
      JSON.parse(raw);
      const relativePath = toPortablePath(path.relative(root, absolutePath));
      const slug = path.basename(absolutePath, '.json');
      const bytes = Buffer.byteLength(raw);
      const digest = sha256(raw);
      records.push({
        schema_version: RECORD_SCHEMA_VERSION,
        path: relativePath,
        area: source.area,
        slug,
        bytes,
        sha256: digest,
        raw,
      });
    }
  }
  records.sort((a, b) => a.path.localeCompare(b.path));
  const jsonl = `${records.map((record) => JSON.stringify(record)).join('\n')}\n`;
  const archiveBytes = Buffer.byteLength(jsonl);
  const manifest = {
    schema_version: MANIFEST_SCHEMA_VERSION,
    storage: 'jsonl-raw-records',
    source: {
      commit: gitHead(root),
      directories: SOURCE_DIRECTORIES.map((source) => source.relativePath),
    },
    archive: {
      path: ARCHIVE_RELATIVE_PATH,
      record_count: records.length,
      bytes: archiveBytes,
      sha256: sha256(jsonl),
    },
    totals: {
      files: records.length,
      raw_bytes: records.reduce((sum, record) => sum + record.bytes, 0),
    },
    entries: records.map(({ path: recordPath, area, slug, bytes, sha256: digest }) => ({
      path: recordPath,
      area,
      slug,
      bytes,
      sha256: digest,
    })),
  };
  return { jsonl, manifest, records };
}

function readJsonl(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const lines = raw.split('\n');
  if (lines.at(-1) === '') lines.pop();
  return { raw, records: lines.filter(Boolean).map((line) => JSON.parse(line)) };
}

export function verifyLegacyAuditReviewArchive({ root = ROOT } = {}) {
  const manifestPath = path.join(root, MANIFEST_RELATIVE_PATH);
  const archivePath = path.join(root, ARCHIVE_RELATIVE_PATH);
  if (!fs.existsSync(manifestPath)) throw new Error(`missing legacy audit manifest: ${MANIFEST_RELATIVE_PATH}`);
  if (!fs.existsSync(archivePath)) throw new Error(`missing legacy audit archive: ${ARCHIVE_RELATIVE_PATH}`);

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (manifest.schema_version !== MANIFEST_SCHEMA_VERSION) {
    throw new Error(`unsupported legacy audit manifest schema: ${manifest.schema_version}`);
  }
  if (manifest.archive?.path !== ARCHIVE_RELATIVE_PATH) {
    throw new Error('legacy audit archive path does not match manifest');
  }

  const archive = readJsonl(archivePath);
  const archiveBytes = Buffer.byteLength(archive.raw);
  if (manifest.archive.bytes !== archiveBytes) {
    throw new Error(`legacy audit archive byte mismatch: manifest=${manifest.archive.bytes} actual=${archiveBytes}`);
  }
  const archiveDigest = sha256(archive.raw);
  if (manifest.archive.sha256 !== archiveDigest) {
    throw new Error(`legacy audit archive sha256 mismatch: manifest=${manifest.archive.sha256} actual=${archiveDigest}`);
  }
  if (manifest.archive.record_count !== archive.records.length) {
    throw new Error(`legacy audit archive record count mismatch: manifest=${manifest.archive.record_count} actual=${archive.records.length}`);
  }
  if (manifest.entries.length !== archive.records.length) {
    throw new Error(`legacy audit manifest entry count mismatch: manifest=${manifest.entries.length} actual=${archive.records.length}`);
  }

  let rawBytes = 0;
  for (let index = 0; index < archive.records.length; index += 1) {
    const record = archive.records[index];
    const entry = manifest.entries[index];
    if (record.schema_version !== RECORD_SCHEMA_VERSION) throw new Error(`unsupported legacy audit record schema at index ${index}`);
    for (const key of ['path', 'area', 'slug', 'bytes', 'sha256']) {
      if (record[key] !== entry[key]) throw new Error(`legacy audit manifest mismatch for ${entry.path || index}: ${key}`);
    }
    if (Buffer.byteLength(record.raw) !== record.bytes) throw new Error(`legacy audit raw byte mismatch for ${record.path}`);
    if (sha256(record.raw) !== record.sha256) throw new Error(`legacy audit raw sha256 mismatch for ${record.path}`);
    JSON.parse(record.raw);
    rawBytes += record.bytes;
  }
  if (manifest.totals.files !== archive.records.length) {
    throw new Error(`legacy audit total file mismatch: manifest=${manifest.totals.files} actual=${archive.records.length}`);
  }
  if (manifest.totals.raw_bytes !== rawBytes) {
    throw new Error(`legacy audit raw byte total mismatch: manifest=${manifest.totals.raw_bytes} actual=${rawBytes}`);
  }
  return {
    records: archive.records.length,
    raw_bytes: rawBytes,
    archive_bytes: archiveBytes,
    archive_sha256: archiveDigest,
  };
}

export function writeLegacyAuditReviewArchive({ root = ROOT } = {}) {
  const { jsonl, manifest } = buildLegacyAuditReviewArchive({ root });
  fs.mkdirSync(AUDIT_REVIEWS_DIR.replace(ROOT, root), { recursive: true });
  fs.writeFileSync(path.join(root, ARCHIVE_RELATIVE_PATH), jsonl);
  fs.writeFileSync(path.join(root, MANIFEST_RELATIVE_PATH), `${JSON.stringify(manifest, null, 2)}\n`);
  return verifyLegacyAuditReviewArchive({ root });
}

function parseArgs(argv = process.argv.slice(2)) {
  const args = { write: false, verify: false, json: false };
  for (const arg of argv) {
    if (arg === '--write') args.write = true;
    else if (arg === '--verify') args.verify = true;
    else if (arg === '--json') args.json = true;
    else throw new Error(`unknown argument: ${arg}`);
  }
  if (!args.write && !args.verify) throw new Error('expected --write or --verify');
  return args;
}

function main() {
  const args = parseArgs();
  let result = null;
  if (args.write) result = writeLegacyAuditReviewArchive();
  if (args.verify) result = verifyLegacyAuditReviewArchive();
  if (args.json) console.log(JSON.stringify(result));
  else {
    console.log(`[audit-reviews:migrate] verified ${result.records} records, raw=${result.raw_bytes}B archive=${result.archive_bytes}B`);
  }
}

if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1] || '')) {
  try {
    main();
  } catch (error) {
    console.error(`[audit-reviews:migrate] ${error.message}`);
    process.exit(1);
  }
}

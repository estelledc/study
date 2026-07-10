#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { execFile as execFileCallback } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

const execFile = promisify(execFileCallback);
const FROZEN_PUBLIC_REDLINE_BASELINE_COMMIT = 'acbf24baf4641c0f80a2a6c624abfb37f4cadefc';
const PUBLIC_REDLINE_BASELINE_SCHEMA = 'study-public-redline-baseline-v1';
const FROZEN_PUBLIC_REDLINE_ENTRY_COUNT = 6;
const FROZEN_PUBLIC_REDLINE_ENTRIES_SHA256 = 'a843e8f165d32bbb22609247e59785df702b63e6ad1450549c79097d528a21fb';
const BASELINE_VERIFICATION_ERROR = 'public-redline baseline verification failed';
const PLACEHOLDER_USERS = new Set([
  'app', 'coder', 'container', 'default', 'home', 'me', 'name', 'node', 'oai',
  'public', 'root', 'runner', 'ubuntu', 'user', 'username',
]);
// Known tutorial/test persona only. The value is never stored in reversible form.
const ILLUSTRATIVE_USER_FINGERPRINTS = new Set([
  '06b9a6eacd7a77b9361123fd19776455eb16b9c83426a1abbf514a414792b73f',
]);
const SENSITIVE_EXTENSIONS = new Set([
  '.cer', '.crt', '.der', '.jks', '.key', '.keystore', '.mobileprovision', '.p12', '.pem', '.pfx',
  '.provisionprofile',
]);
const BINARY_EXTENSIONS = new Set([
  '.7z', '.bin', '.dmg', '.gif', '.gz', '.ico', '.jar', '.jpeg', '.jpg', '.mov', '.mp4',
  '.pdf', '.png', '.tar', '.tgz', '.wasm', '.webm', '.woff', '.woff2', '.zip',
]);
const TEXT_EXTENSIONS = new Set([
  '.astro', '.cjs', '.conf', '.css', '.csv', '.html', '.ini', '.js', '.json', '.jsonl',
  '.lock', '.md', '.mdx', '.mjs', '.py', '.sh', '.svg', '.toml', '.ts', '.tsx', '.txt',
  '.xml', '.yaml', '.yml',
]);
const TEXT_BASENAMES = new Set([
  '.editorconfig', '.gitattributes', '.gitignore', '.gitkeep', '.nojekyll', '.npmrc',
  '.prettierignore', 'CNAME', 'Dockerfile', 'LICENSE', 'Makefile', 'VERSION',
]);

function normalizePath(value) {
  return value.split(path.sep).join('/').replace(/^\.\//, '');
}

function normalizeMatch(category, value) {
  let normalized = value.normalize('NFKC').trim();
  if (category.includes('absolute-path')) {
    normalized = normalized.replace(/\\/g, '/').replace(/\/{2,}/g, '/');
    normalized = normalized.replace(/[,.;:]+$/g, '');
  } else {
    normalized = normalized.replace(/\s+/g, ' ');
  }
  return normalized;
}

export function fingerprintMatch(category, value) {
  return createHash('sha256').update(normalizeMatch(category, value)).digest('hex');
}

function lineNumberAt(text, index) {
  return text.slice(0, index).split('\n').length;
}

function collectRegex(text, category, regex, findings, filter = () => true) {
  for (const match of text.matchAll(regex)) {
    if (!filter(match)) continue;
    findings.push({
      category,
      line: lineNumberAt(text, match.index),
      fingerprint: fingerprintMatch(category, match[0]),
    });
  }
}

function isIllustrativeUser(match, illustrativeOnly) {
  if (!illustrativeOnly) return false;
  const fingerprint = createHash('sha256').update(match[1].toLowerCase()).digest('hex');
  return ILLUSTRATIVE_USER_FINGERPRINTS.has(fingerprint);
}

function fileNameFinding(relativePath) {
  const basename = path.posix.basename(relativePath).toLowerCase();
  if ((/^\.env(?:\..+)?$/.test(basename) && basename !== '.env.example') || basename === '.envrc') {
    return 'environment-file';
  }
  if (SENSITIVE_EXTENSIONS.has(path.posix.extname(basename))) return 'credential-file-type';
  if (/^(?:id_rsa|id_ed25519|credentials)(?:\..*)?$/.test(basename) || basename === '.netrc') {
    return 'credential-file-name';
  }
  return null;
}

export function scanTextForPublicRedlines(text, relativePath) {
  const normalizedPath = normalizePath(relativePath);
  const findings = [];
  const illustrativeOnly = normalizedPath.startsWith('research/')
    || /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(normalizedPath);
  const fileCategory = fileNameFinding(normalizedPath);
  if (fileCategory) {
    findings.push({
      category: fileCategory,
      line: 1,
      fingerprint: fingerprintMatch(fileCategory, normalizedPath),
    });
  }

  collectRegex(
    text,
    'posix-user-absolute-path',
    /(?<![A-Za-z0-9:/])\/(?:Users|home)\/([A-Za-z0-9._-]+)(?:\/[A-Za-z0-9._~@%+=:,/-]+)*/g,
    findings,
    (match) => !PLACEHOLDER_USERS.has(match[1].toLowerCase())
      && !isIllustrativeUser(match, illustrativeOnly),
  );
  collectRegex(
    text,
    'windows-user-absolute-path',
    /\b[A-Za-z]:\\Users\\([A-Za-z0-9._-]+)(?:\\[A-Za-z0-9._~@%+=:,-]+)+/g,
    findings,
    (match) => !PLACEHOLDER_USERS.has(match[1].toLowerCase())
      && !isIllustrativeUser(match, illustrativeOnly),
  );
  const privateKeyPattern = new RegExp([
    '-----BEGIN',
    ' ',
    '(?:RSA |EC |DSA |OPENSSH )?',
    'PRIVATE',
    ' KEY-----',
  ].join(''), 'g');
  collectRegex(text, 'private-key-material', privateKeyPattern, findings);
  collectRegex(text, 'github-token', /\bgh[pousr]_[A-Za-z0-9]{30,}\b/g, findings);
  const fineGrainedPrefix = ['github', 'pat', ''].join('_');
  collectRegex(text, 'github-token', new RegExp(`\\b${fineGrainedPrefix}[A-Za-z0-9_]{20,}\\b`, 'g'), findings);
  const cloudKeyPrefix = ['AK', 'IA'].join('');
  collectRegex(text, 'cloud-access-key', new RegExp(`\\b${cloudKeyPrefix}[0-9A-Z]{16}\\b`, 'g'), findings);
  collectRegex(
    text,
    'apple-signing-identifier',
    /\b(?:DEVELOPMENT_TEAM|TEAM_ID|UDID)\s*[:=]\s*['"]?([A-Za-z0-9.-]{10,})/g,
    findings,
    (match) => !/^(?:example|replace|your)/i.test(match[1]),
  );

  const unique = new Map();
  for (const finding of findings) {
    unique.set(`${finding.category}\0${finding.line}\0${finding.fingerprint}`, {
      path: normalizedPath,
      ...finding,
    });
  }
  return [...unique.values()].sort((left, right) => (
    left.line - right.line
    || left.category.localeCompare(right.category)
    || left.fingerprint.localeCompare(right.fingerprint)
  ));
}

function decodeUtf16Be(buffer) {
  const evenLength = buffer.length - (buffer.length % 2);
  const swapped = Buffer.allocUnsafe(evenLength);
  for (let index = 0; index < evenLength; index += 2) {
    swapped[index] = buffer[index + 1];
    swapped[index + 1] = buffer[index];
  }
  return swapped.toString('utf16le');
}

function isStrictWebp(buffer, relativePath) {
  if (path.posix.extname(normalizePath(relativePath)).toLowerCase() !== '.webp') return false;
  if (buffer.length < 20) return false;
  if (buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WEBP') return false;
  if (buffer.readUInt32LE(4) + 8 !== buffer.length) return false;
  if (!new Set(['VP8 ', 'VP8L', 'VP8X']).has(buffer.toString('ascii', 12, 16))) return false;
  const firstChunkLength = buffer.readUInt32LE(16);
  const firstChunkEnd = 20 + firstChunkLength + (firstChunkLength % 2);
  return firstChunkEnd <= buffer.length;
}

function isKnownTextPath(relativePath) {
  const normalizedPath = normalizePath(relativePath);
  const basename = path.posix.basename(normalizedPath);
  return TEXT_BASENAMES.has(basename) || TEXT_EXTENSIONS.has(path.posix.extname(basename).toLowerCase());
}

function textValidationCategory(buffer) {
  if (buffer.includes(0)) return 'text-file-contains-nul';
  let decoded;
  try {
    // Decode the complete file: an arbitrary sample boundary can split a valid
    // multi-byte character and must never turn Chinese Markdown into "binary".
    decoded = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    return 'text-file-invalid-utf8';
  }
  for (const character of decoded) {
    const codePoint = character.codePointAt(0);
    const allowedWhitespace = codePoint === 0x09 || codePoint === 0x0a || codePoint === 0x0d;
    if (!allowedWhitespace && (codePoint < 0x20 || (codePoint >= 0x7f && codePoint <= 0x9f))) {
      return 'text-file-unicode-control';
    }
  }
  return null;
}

function binaryDisposition(buffer, relativePath) {
  const extension = path.posix.extname(normalizePath(relativePath)).toLowerCase();
  if (extension === '.webp') return isStrictWebp(buffer, relativePath) ? 'ALLOWED' : 'INVALID_MAGIC';
  if (BINARY_EXTENSIONS.has(extension)) return 'NOT_ALLOWLISTED';
  if (isKnownTextPath(relativePath)) return textValidationCategory(buffer) ?? 'TEXT';
  return 'NOT_ALLOWLISTED';
}

export function scanBufferForPublicRedlines(buffer, relativePath) {
  const bytes = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  const normalizedPath = normalizePath(relativePath);
  const findings = [];
  const decodings = [
    bytes.toString('latin1'),
    bytes.toString('utf8'),
    bytes.toString('utf16le'),
    decodeUtf16Be(bytes),
  ];
  for (const decoded of decodings) findings.push(...scanTextForPublicRedlines(decoded, normalizedPath));

  const disposition = binaryDisposition(bytes, normalizedPath);
  if (disposition === 'INVALID_MAGIC') {
    findings.push({
      path: normalizedPath,
      line: 1,
      category: 'binary-file-magic-invalid',
      fingerprint: fingerprintMatch('binary-file-magic-invalid', normalizedPath),
    });
  } else if (disposition === 'NOT_ALLOWLISTED') {
    findings.push({
      path: normalizedPath,
      line: 1,
      category: 'binary-file-not-allowlisted',
      fingerprint: fingerprintMatch('binary-file-not-allowlisted', normalizedPath),
    });
  } else if (disposition.startsWith('text-file-')) {
    findings.push({
      path: normalizedPath,
      line: 1,
      category: disposition,
      fingerprint: fingerprintMatch(disposition, normalizedPath),
    });
  }

  const unique = new Map();
  for (const finding of findings) {
    unique.set(`${finding.category}\0${finding.path}\0${finding.fingerprint}`, finding);
  }
  return [...unique.values()].sort((left, right) => (
    left.line - right.line
    || left.category.localeCompare(right.category)
    || left.fingerprint.localeCompare(right.fingerprint)
  ));
}

export async function loadPublicRedlineBaseline(rootDir = process.cwd()) {
  try {
    const baseline = JSON.parse(await fs.readFile(
      path.join(rootDir, 'data', 'public-redline-baseline.json'),
      'utf8',
    ));
    await verifyPublicRedlineBaseline(baseline, rootDir);
    return baseline;
  } catch {
    throw new Error(BASELINE_VERIFICATION_ERROR);
  }
}

function isCanonicalBaselinePath(value) {
  if (typeof value !== 'string' || value.length === 0 || value.includes('\0')) return false;
  if (value !== normalizePath(value) || path.posix.isAbsolute(value)) return false;
  return value.split('/').every((segment) => segment !== '' && segment !== '.' && segment !== '..');
}

function baselineEntryKey(entry) {
  return `${entry.category}\0${entry.path}\0${entry.fingerprint}`;
}

async function scanFrozenBaselineBlob(rootDir, relativePath) {
  const objectSpec = `${FROZEN_PUBLIC_REDLINE_BASELINE_COMMIT}:${relativePath}`;
  const { stdout } = await execFile('git', ['cat-file', 'blob', objectSpec], {
    cwd: rootDir,
    encoding: 'buffer',
    maxBuffer: 50 * 1024 * 1024,
  });
  return scanBufferForPublicRedlines(stdout, relativePath);
}

export async function verifyPublicRedlineBaseline(baseline, rootDir = process.cwd()) {
  try {
    if (baseline?.schema_version !== PUBLIC_REDLINE_BASELINE_SCHEMA) throw new Error();
    if (baseline.baseline_commit !== FROZEN_PUBLIC_REDLINE_BASELINE_COMMIT) throw new Error();
    if (!Array.isArray(baseline.entries)) throw new Error();

    const seenEntries = new Set();
    const findingsByPath = new Map();
    for (const entry of baseline.entries) {
      if (!entry || typeof entry !== 'object') throw new Error();
      if (!/^[a-z0-9-]+$/.test(entry.category ?? '')) throw new Error();
      if (!isCanonicalBaselinePath(entry.path)) throw new Error();
      if (!/^[a-f0-9]{64}$/.test(entry.fingerprint ?? '')) throw new Error();

      const key = baselineEntryKey(entry);
      if (seenEntries.has(key)) throw new Error();
      seenEntries.add(key);

      if (!findingsByPath.has(entry.path)) {
        const frozenFindings = await scanFrozenBaselineBlob(rootDir, entry.path);
        findingsByPath.set(entry.path, new Set(frozenFindings.map(baselineEntryKey)));
      }
      if (!findingsByPath.get(entry.path).has(key)) throw new Error();
    }
    const canonicalEntries = `${[...seenEntries].sort().join('\n')}\n`;
    if (
      seenEntries.size !== FROZEN_PUBLIC_REDLINE_ENTRY_COUNT
      || createHash('sha256').update(canonicalEntries).digest('hex') !== FROZEN_PUBLIC_REDLINE_ENTRIES_SHA256
    ) throw new Error();
  } catch {
    // Do not propagate Git stderr, paths, fingerprints, or matched source values.
    throw new Error(BASELINE_VERIFICATION_ERROR);
  }
}

export function classifyWithBaseline(findings, baseline) {
  const allowed = new Set((baseline.entries ?? []).map((entry) => (
    `${entry.category}\0${normalizePath(entry.path)}\0${entry.fingerprint}`
  )));
  return findings.map((finding) => ({
    ...finding,
    status: allowed.has(`${finding.category}\0${finding.path}\0${finding.fingerprint}`)
      ? 'LEGACY_BASELINE'
      : 'BLOCKING',
  }));
}

async function trackedFiles(rootDir) {
  const { stdout } = await execFile('git', ['ls-files', '-z'], {
    cwd: rootDir,
    encoding: 'buffer',
    maxBuffer: 50 * 1024 * 1024,
  });
  return stdout.toString('utf8').split('\0').filter(Boolean).map(normalizePath);
}

function isInsideRoot(rootDir, relativePath) {
  const resolved = path.resolve(rootDir, relativePath);
  return resolved === rootDir || resolved.startsWith(`${rootDir}${path.sep}`);
}

export async function auditPublicRedlines(options = {}) {
  const rootDir = path.resolve(options.rootDir ?? process.cwd());
  const hasSuppliedBaseline = options.baseline !== undefined && options.baseline !== null;
  const baseline = options.baseline ?? await loadPublicRedlineBaseline(rootDir);
  if (hasSuppliedBaseline) await verifyPublicRedlineBaseline(baseline, rootDir);
  const tracked = await trackedFiles(rootDir);
  const trackedSet = new Set(tracked);
  const supplied = options.suppliedPaths
    ? [...options.suppliedPaths].map(normalizePath)
    : tracked;
  const selected = [...new Set(supplied)]
    .filter((relativePath) => trackedSet.has(relativePath) && isInsideRoot(rootDir, relativePath))
    .sort();
  const rawFindings = [];
  let binaryAllowed = 0;
  let binaryBlocked = 0;
  let invalidText = 0;
  let symlinks = 0;

  for (const relativePath of selected) {
    const filePath = path.join(rootDir, relativePath);
    let stats;
    try {
      stats = await fs.lstat(filePath);
    } catch (error) {
      if (error.code === 'ENOENT') continue;
      throw error;
    }
    if (stats.isSymbolicLink()) {
      symlinks += 1;
      rawFindings.push({
        path: relativePath,
        line: 1,
        category: 'tracked-symlink',
        fingerprint: fingerprintMatch('tracked-symlink', relativePath),
      });
      continue;
    }
    if (!stats.isFile()) continue;
    const buffer = await fs.readFile(filePath);
    const disposition = binaryDisposition(buffer, relativePath);
    if (disposition === 'ALLOWED') binaryAllowed += 1;
    else if (disposition === 'INVALID_MAGIC' || disposition === 'NOT_ALLOWLISTED') binaryBlocked += 1;
    else if (disposition.startsWith('text-file-')) invalidText += 1;
    rawFindings.push(...scanBufferForPublicRedlines(buffer, relativePath));
  }

  const findings = classifyWithBaseline(rawFindings, baseline).sort((left, right) => (
    left.path.localeCompare(right.path)
    || left.line - right.line
    || left.category.localeCompare(right.category)
    || left.fingerprint.localeCompare(right.fingerprint)
  ));
  return {
    schema_version: 'study-public-redline-audit-v1',
    scope: 'git-tracked-files-only',
    baseline_commit: baseline.baseline_commit,
    summary: {
      tracked_files: tracked.length,
      files_scanned: selected.length,
      supplied_untracked_ignored: supplied.length - selected.length,
      binary_skipped: 0,
      binary_allowed: binaryAllowed,
      binary_blocked: binaryBlocked,
      invalid_text: invalidText,
      symlinks,
      blocking: findings.filter(({ status }) => status === 'BLOCKING').length,
      legacy_baseline: findings.filter(({ status }) => status === 'LEGACY_BASELINE').length,
    },
    findings,
  };
}

async function readStdinZero() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8').split('\0').filter(Boolean);
}

function parseArgs(argv) {
  const args = { tracked: false, stdin0: false, json: false };
  for (const arg of argv) {
    if (arg === '--tracked') args.tracked = true;
    else if (arg === '--stdin0') args.stdin0 = true;
    else if (arg === '--json') args.json = true;
    else throw new Error(`unknown argument: ${arg}`);
  }
  if (args.tracked === args.stdin0) throw new Error('choose exactly one of --tracked or --stdin0');
  return args;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const suppliedPaths = args.stdin0 ? await readStdinZero() : undefined;
    const report = await auditPublicRedlines({ rootDir: process.cwd(), suppliedPaths });
    if (args.json) console.log(JSON.stringify(report, null, 2));
    else console.log(`public-redlines: ${report.summary.blocking} blocking, ${report.summary.legacy_baseline} legacy-baseline`);
    process.exitCode = report.summary.blocking === 0 ? 0 : 1;
  } catch (error) {
    console.error(`public-redline audit failed: ${error.message}`);
    process.exitCode = 2;
  }
}

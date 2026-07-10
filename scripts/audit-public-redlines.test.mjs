import assert from 'node:assert/strict';
import { execFile as execFileCallback } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';

import {
  auditPublicRedlines,
  classifyWithBaseline,
  scanBufferForPublicRedlines,
  scanTextForPublicRedlines,
} from './audit-public-redlines.mjs';

const execFile = promisify(execFileCallback);

function fictionalSensitiveText() {
  const mac = ['', 'Users', 'sample-person', 'work', 'repo'].join('/');
  const linux = ['', 'home', 'sample-person', 'work', 'repo'].join('/');
  const windows = ['C:', 'Users', 'sample-person', 'work', 'repo'].join('\\');
  const privateKey = ['-----BEGIN ', 'PRIVATE KEY-----'].join('');
  const token = [['gh', 'p_'].join(''), 'f'.repeat(36)].join('');
  return [mac, linux, windows, privateKey, token].join('\n');
}

test('fictional fixtures detect three user-home forms, key headers and tokens', () => {
  const findings = scanTextForPublicRedlines(fictionalSensitiveText(), 'fixture.txt');
  assert.deepEqual(findings.map(({ category }) => category).sort(), [
    'github-token',
    'posix-user-absolute-path',
    'posix-user-absolute-path',
    'private-key-material',
    'windows-user-absolute-path',
  ]);
});

test('reports expose only category, relative location and irreversible fingerprint', () => {
  const raw = fictionalSensitiveText();
  const findings = classifyWithBaseline(
    scanTextForPublicRedlines(raw, 'fixture.txt'),
    { entries: [] },
  );
  const serialized = JSON.stringify(findings);
  for (const line of raw.split('\n')) assert.equal(serialized.includes(line), false);
  assert.equal(findings.every(({ fingerprint }) => /^[a-f0-9]{64}$/.test(fingerprint)), true);
  assert.equal(findings.every(({ status }) => status === 'BLOCKING'), true);
});

test('legacy baseline is keyed by category, path and fingerprint rather than line', () => {
  const [finding] = scanTextForPublicRedlines(
    ['', 'home', 'sample-person', 'repo'].join('/'),
    'src/content/docs/projects/example.md',
  );
  const baseline = { entries: [{
    category: finding.category,
    path: finding.path,
    fingerprint: finding.fingerprint,
  }] };
  const movedLine = { ...finding, line: finding.line + 20 };
  assert.equal(classifyWithBaseline([movedLine], baseline)[0].status, 'LEGACY_BASELINE');
  assert.equal(classifyWithBaseline([{ ...movedLine, path: 'elsewhere.md' }], baseline)[0].status, 'BLOCKING');
});

test('placeholder paths and URL path fragments are suppressed', () => {
  const placeholders = [
    ['https:', '', 'example.test', 'home', 'person', 'repo'].join('/'),
    ['', 'home', 'runner', 'work', 'repo'].join('/'),
    ['', 'Users', 'me', 'repo'].join('/'),
  ].join('\n');
  assert.deepEqual(scanTextForPublicRedlines(placeholders, 'example.md'), []);
});

test('test files suppress only the hashed tutorial persona, not arbitrary users', () => {
  const arbitrary = ['', 'Users', 'sample-person', 'repo'].join('/');
  assert.equal(scanTextForPublicRedlines(arbitrary, 'sample.test.mjs').length, 1);
});

test('tracked environment variants and signing artifacts are file-level violations', () => {
  assert.equal(scanTextForPublicRedlines('placeholder\n', '.env.local')[0].category, 'environment-file');
  assert.equal(scanTextForPublicRedlines('placeholder\n', '.envrc')[0].category, 'environment-file');
  assert.equal(scanTextForPublicRedlines('placeholder\n', 'signing/example.mobileprovision')[0].category, 'credential-file-type');
  assert.equal(scanTextForPublicRedlines('placeholder\n', '.netrc')[0].category, 'credential-file-name');
  assert.deepEqual(scanTextForPublicRedlines('PLACEHOLDER=value\n', '.env.example'), []);
});

test('supplied stdin candidates are intersected with Git tracked files', async () => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'study-redlines-'));
  await execFile('git', ['init', '-q'], { cwd: rootDir });
  await fs.writeFile(path.join(rootDir, '.gitignore'), '.env.*\n', 'utf8');
  await fs.writeFile(path.join(rootDir, 'safe.txt'), 'public text\n', 'utf8');
  await fs.writeFile(
    path.join(rootDir, '.env.local'),
    ['token=', 'f'.repeat(40)].join(''),
    'utf8',
  );
  await execFile('git', ['add', '.gitignore', 'safe.txt'], { cwd: rootDir });

  const report = await auditPublicRedlines({
    rootDir,
    baseline: { baseline_commit: 'test', entries: [] },
    suppliedPaths: ['safe.txt', '.env.local'],
  });
  assert.equal(report.summary.files_scanned, 1);
  assert.equal(report.summary.supplied_untracked_ignored, 1);
  assert.equal(report.summary.blocking, 0);
  assert.deepEqual(report.findings, []);
});

test('tracked symlinks are blocked without following an ignored target', async () => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'study-redline-link-'));
  await execFile('git', ['init', '-q'], { cwd: rootDir });
  await fs.writeFile(path.join(rootDir, '.gitignore'), '.env.*\n', 'utf8');
  await fs.writeFile(path.join(rootDir, '.env.local'), fictionalSensitiveText(), 'utf8');
  await fs.symlink('.env.local', path.join(rootDir, 'linked-runtime'));
  await execFile('git', ['add', '.gitignore', 'linked-runtime'], { cwd: rootDir });

  const report = await auditPublicRedlines({
    rootDir,
    baseline: { baseline_commit: 'test', entries: [] },
    suppliedPaths: ['linked-runtime', '.env.local'],
  });
  assert.equal(report.summary.files_scanned, 1);
  assert.equal(report.summary.supplied_untracked_ignored, 1);
  assert.equal(report.summary.symlinks, 1);
  assert.equal(report.summary.blocking, 1);
  assert.equal(report.findings[0].category, 'tracked-symlink');
});

function webp(payload = Buffer.alloc(0)) {
  const padded = payload.length % 2 === 0 ? payload : Buffer.concat([payload, Buffer.alloc(1)]);
  const buffer = Buffer.alloc(20);
  buffer.write('RIFF', 0, 'ascii');
  buffer.writeUInt32LE(12 + padded.length, 4);
  buffer.write('WEBP', 8, 'ascii');
  buffer.write('VP8 ', 12, 'ascii');
  buffer.writeUInt32LE(payload.length, 16);
  return Buffer.concat([buffer, padded]);
}

test('raw, UTF-8, and UTF-16 credential bytes are scanned even inside binary assets', () => {
  const token = [['gh', 'p_'].join(''), 'f'.repeat(36)].join('');
  const raw = scanBufferForPublicRedlines(webp(Buffer.from(token, 'utf8')), 'public/secret.webp');
  const utf16le = scanBufferForPublicRedlines(Buffer.from(token, 'utf16le'), 'public/secret.bin');
  const swapped = Buffer.from(token, 'utf16le');
  for (let index = 0; index + 1 < swapped.length; index += 2) {
    [swapped[index], swapped[index + 1]] = [swapped[index + 1], swapped[index]];
  }
  const utf16be = scanBufferForPublicRedlines(swapped, 'public/secret-be.bin');
  assert.equal(raw.some(({ category }) => category === 'github-token'), true);
  assert.equal(utf16le.some(({ category }) => category === 'github-token'), true);
  assert.equal(utf16be.some(({ category }) => category === 'github-token'), true);
});

test('binary policy accepts strict WebP magic and fails closed for other or malformed binary files', () => {
  assert.deepEqual(scanBufferForPublicRedlines(webp(), 'public/valid.webp'), []);
  assert.equal(
    scanBufferForPublicRedlines(Buffer.from([0, 1, 2, 3]), 'public/new.bin')
      .some(({ category }) => category === 'binary-file-not-allowlisted'),
    true,
  );
  assert.equal(
    scanBufferForPublicRedlines(Buffer.from('printable payload'), 'public/printable.bin')
      .some(({ category }) => category === 'binary-file-not-allowlisted'),
    true,
  );
  assert.equal(
    scanBufferForPublicRedlines(Buffer.from('not-webp\0'), 'public/fake.webp')
      .some(({ category }) => category === 'binary-file-magic-invalid'),
    true,
  );
});

test('known text extensions decode the whole UTF-8 file before checking Unicode controls', () => {
  const splitMultibyteAtOldSampleBoundary = Buffer.from(`${'a'.repeat(8191)}中\n`, 'utf8');
  assert.deepEqual(
    scanBufferForPublicRedlines(splitMultibyteAtOldSampleBoundary, 'docs/chinese.md')
      .filter(({ category }) => category.startsWith('binary-') || category.startsWith('text-file-')),
    [],
  );

  const invalidUtf8 = scanBufferForPublicRedlines(Buffer.from([0x61, 0xc3, 0x28]), 'docs/invalid.md');
  assert.equal(invalidUtf8.some(({ category }) => category === 'text-file-invalid-utf8'), true);

  const unicodeControl = scanBufferForPublicRedlines(Buffer.from('safe\u0085text', 'utf8'), 'docs/control.md');
  assert.equal(unicodeControl.some(({ category }) => category === 'text-file-unicode-control'), true);
});

test('tracked binary audit blocks embedded tokens while allowing a strict WebP fixture', async () => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'study-redline-binary-'));
  await execFile('git', ['init', '-q'], { cwd: rootDir });
  await fs.mkdir(path.join(rootDir, 'public'), { recursive: true });
  const token = [['gh', 'p_'].join(''), 'f'.repeat(36)].join('');
  await fs.writeFile(path.join(rootDir, 'public/valid.webp'), webp());
  await fs.writeFile(path.join(rootDir, 'public/secret.webp'), webp(Buffer.from(token, 'utf16le')));
  await execFile('git', ['add', 'public'], { cwd: rootDir });
  const report = await auditPublicRedlines({
    rootDir,
    baseline: { baseline_commit: 'test', entries: [] },
  });
  assert.equal(report.summary.binary_allowed, 2);
  assert.equal(report.summary.blocking >= 1, true);
  assert.equal(report.findings.some(({ category }) => category === 'github-token'), true);
});

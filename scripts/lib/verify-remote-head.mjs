#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import path from 'node:path';

const FULL_SHA_RE = /^[0-9a-f]{40}$/;
const REMOTE_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const BRANCH_RE = /^[A-Za-z0-9][A-Za-z0-9._/-]*$/;

export class RemoteHeadVerificationError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'RemoteHeadVerificationError';
    this.code = code;
  }
}

function reject(code, message) {
  throw new RemoteHeadVerificationError(code, message);
}

function normalizeRepositoryPath(value) {
  let repositoryPath;
  try {
    repositoryPath = decodeURIComponent(value);
  } catch {
    reject('REMOTE_URL_UNSAFE', 'remote URL contains an invalid encoded path');
  }
  repositoryPath = repositoryPath.replace(/^\/+|\/+$/g, '').replace(/\.git$/i, '');
  if (
    !repositoryPath ||
    repositoryPath.includes('\\') ||
    repositoryPath.split('/').some((part) => !part || part === '.' || part === '..')
  ) {
    reject('REMOTE_URL_UNSAFE', 'remote URL does not identify one canonical repository path');
  }
  return repositoryPath;
}

export function normalizeRemoteIdentity(remoteUrl) {
  const value = String(remoteUrl || '').trim();
  if (!value || /[\0\r\n]/.test(value)) {
    reject('REMOTE_URL_UNSAFE', 'remote URL is empty or contains control characters');
  }

  if (path.isAbsolute(value)) {
    return `file:${path.resolve(value)}`;
  }

  if (value.startsWith('file:')) {
    let fileUrl;
    try {
      fileUrl = new URL(value);
    } catch {
      reject('REMOTE_URL_UNSAFE', 'file remote URL is malformed');
    }
    if (fileUrl.hostname && fileUrl.hostname !== 'localhost') {
      reject('REMOTE_URL_UNSAFE', 'file remotes may not name a remote host');
    }
    return `file:${path.resolve(decodeURIComponent(fileUrl.pathname))}`;
  }

  const scp = value.match(/^(?:[^@/:\s]+@)?([^/:\s]+):([^\s]+)$/);
  if (scp && !value.includes('://')) {
    const host = scp[1].toLowerCase();
    const repositoryPath = normalizeRepositoryPath(scp[2]);
    return `${host}/${host === 'github.com' ? repositoryPath.toLowerCase() : repositoryPath}`;
  }

  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    reject('REMOTE_URL_UNSAFE', 'remote URL must use an approved absolute transport');
  }
  if (parsed.protocol === 'file:') {
    if (parsed.hostname && parsed.hostname !== 'localhost') {
      reject('REMOTE_URL_UNSAFE', 'file remotes may not name a remote host');
    }
    return `file:${path.resolve(decodeURIComponent(parsed.pathname))}`;
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'ssh:') {
    reject('REMOTE_URL_UNSAFE', `remote URL transport is not approved: ${parsed.protocol}`);
  }
  if (parsed.password || parsed.search || parsed.hash) {
    reject('REMOTE_URL_UNSAFE', 'remote URL may not contain credentials, query, or fragment');
  }
  const defaultPort = parsed.protocol === 'https:' ? '443' : '22';
  if (parsed.port && parsed.port !== defaultPort) {
    reject('REMOTE_URL_UNSAFE', 'remote URL uses a non-canonical port');
  }
  const host = parsed.hostname.toLowerCase();
  const repositoryPath = normalizeRepositoryPath(parsed.pathname);
  return `${host}/${host === 'github.com' ? repositoryPath.toLowerCase() : repositoryPath}`;
}

function urlRows(output) {
  return String(output || '').split(/\r?\n/).map((row) => row.trim()).filter(Boolean);
}

export function verifyRemoteIdentity({ fetchUrls, pushUrls, allowedIdentities }) {
  if (!Array.isArray(fetchUrls) || fetchUrls.length !== 1 ||
      !Array.isArray(pushUrls) || pushUrls.length !== 1) {
    reject('REMOTE_URL_AMBIGUOUS', 'remote must resolve to exactly one fetch URL and one push URL');
  }
  if (!Array.isArray(allowedIdentities) || allowedIdentities.length === 0 ||
      allowedIdentities.some((identity) => !identity || /[\0\r\n\s]/.test(identity))) {
    reject('REMOTE_ALLOWLIST_INVALID', 'at least one canonical repository identity is required');
  }
  const fetchIdentity = normalizeRemoteIdentity(fetchUrls[0]);
  const pushIdentity = normalizeRemoteIdentity(pushUrls[0]);
  const canonicalAllowlist = allowedIdentities.map((identity) =>
    identity.startsWith('file:') ? normalizeRemoteIdentity(identity) : identity
  );
  if (fetchIdentity !== pushIdentity || !canonicalAllowlist.includes(fetchIdentity)) {
    reject('REMOTE_IDENTITY_MISMATCH', 'fetch and push URLs must resolve to one allowlisted repository identity');
  }
  return {
    identity: fetchIdentity,
    fetchUrl: fetchUrls[0],
    pushUrl: pushUrls[0],
    verified: true,
  };
}

export function queryAndVerifyRemoteIdentity({
  remote = 'origin',
  cwd = process.cwd(),
  allowedIdentities,
  execFileSyncFn = execFileSync,
}) {
  if (!REMOTE_RE.test(remote || '')) reject('REMOTE_NAME_INVALID', 'remote name is invalid');
  let fetchOutput;
  let pushOutput;
  try {
    fetchOutput = execFileSyncFn('git', ['remote', 'get-url', '--all', remote], {
      cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    });
    pushOutput = execFileSyncFn('git', ['remote', 'get-url', '--push', '--all', remote], {
      cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch {
    reject('REMOTE_IDENTITY_QUERY_FAILED', `could not resolve canonical URLs for remote ${remote}`);
  }
  return verifyRemoteIdentity({
    fetchUrls: urlRows(fetchOutput),
    pushUrls: urlRows(pushOutput),
    allowedIdentities,
  });
}

export function verifyRemoteHead({ expectedSha, ref, lsRemoteOutput }) {
  if (!FULL_SHA_RE.test(expectedSha || '')) {
    reject('EXPECTED_SHA_INVALID', 'expected local HEAD must be a full 40-character SHA');
  }
  if (!ref?.startsWith('refs/heads/')) {
    reject('REMOTE_REF_INVALID', 'remote ref must be under refs/heads/');
  }

  const rows = String(lsRemoteOutput || '').trim().split('\n').filter(Boolean);
  if (rows.length === 0) reject('REMOTE_HEAD_MISSING', `remote ref is missing: ${ref}`);
  if (rows.length !== 1) reject('REMOTE_HEAD_AMBIGUOUS', `remote ref is ambiguous: ${ref}`);

  const match = rows[0].match(/^([0-9a-f]{40})\t(.+)$/);
  if (!match || match[2] !== ref) {
    reject('REMOTE_HEAD_MALFORMED', `remote did not return the exact requested ref: ${ref}`);
  }
  const remoteSha = match[1];
  if (remoteSha !== expectedSha) {
    reject('REMOTE_HEAD_MISMATCH', `remote HEAD does not match expected local HEAD for ${ref}`);
  }
  return { expectedSha, remoteSha, ref, verified: true };
}

export function queryAndVerifyRemoteHead({
  expectedSha,
  remote = 'origin',
  branch = 'main',
  cwd = process.cwd(),
  allowedIdentities = null,
  execFileSyncFn = execFileSync,
}) {
  if (!REMOTE_RE.test(remote || '')) reject('REMOTE_NAME_INVALID', 'remote name is invalid');
  if (!BRANCH_RE.test(branch || '') || branch.includes('..') || branch.endsWith('/')) {
    reject('REMOTE_BRANCH_INVALID', 'remote branch name is invalid');
  }
  if (allowedIdentities) {
    queryAndVerifyRemoteIdentity({ remote, cwd, allowedIdentities, execFileSyncFn });
  }
  const ref = `refs/heads/${branch}`;
  let output;
  try {
    output = execFileSyncFn('git', [
      '-c', 'http.followRedirects=false',
      'ls-remote', '--exit-code', '--refs', remote, ref,
    ], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch {
    reject('REMOTE_QUERY_FAILED', `could not query ${remote}/${branch}`);
  }
  return verifyRemoteHead({ expectedSha, ref, lsRemoteOutput: output });
}

function parseArgs(argv) {
  const args = {
    expectedSha: null,
    remote: 'origin',
    branch: 'main',
    cwd: process.cwd(),
    allowedIdentities: [],
    identityOnly: false,
  };
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--expected') args.expectedSha = argv[++index];
    else if (arg === '--remote') args.remote = argv[++index];
    else if (arg === '--branch') args.branch = argv[++index];
    else if (arg === '--repo') args.cwd = argv[++index];
    else if (arg === '--allowed-identity') args.allowedIdentities.push(argv[++index]);
    else if (arg === '--identity-only') args.identityOnly = true;
    else reject('ARGUMENT_INVALID', `unknown argument: ${arg}`);
  }
  if (!args.identityOnly && !args.expectedSha) reject('ARGUMENT_MISSING', '--expected is required');
  if (args.allowedIdentities.length === 0) {
    reject('ARGUMENT_MISSING', '--allowed-identity is required');
  }
  return args;
}

function main() {
  try {
    const args = parseArgs(process.argv);
    const result = args.identityOnly
      ? queryAndVerifyRemoteIdentity(args)
      : queryAndVerifyRemoteHead(args);
    console.log(JSON.stringify(result));
  } catch (error) {
    const code = error instanceof RemoteHeadVerificationError ? error.code : 'REMOTE_VERIFY_ERROR';
    console.error(`[publish:remote-head] ${code}: ${error.message}`);
    process.exitCode = 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main();

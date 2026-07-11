import { gitOutput } from './git.mjs';
import { ROOT } from './paths.mjs';

const FULL_SHA_RE = /^[0-9a-f]{40}$/;
const ORDINARY_FILE_MODES = new Set(['100644', '100755']);

export class CommitScopeError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'CommitScopeError';
    this.code = code;
  }
}

function reject(code, message) {
  throw new CommitScopeError(code, message);
}

function parseSingleChange(raw) {
  const fields = raw.split('\0');
  if (fields.at(-1) === '') fields.pop();
  if (fields.length !== 2) {
    reject('CHANGESET_NOT_SINGLE_TARGET', 'commit must contain exactly one path change');
  }

  const [status, path] = fields;
  if (status !== 'A' && status !== 'M') {
    reject('CHANGE_TYPE_NOT_ALLOWED', `commit change type is not allowed: ${status || '<empty>'}`);
  }
  return { status, path };
}

function parseTreeEntry(raw, expectedPath, { required = true } = {}) {
  const entries = raw.split('\0').filter(Boolean);
  if (entries.length === 0 && !required) return null;
  if (entries.length !== 1) {
    reject('TREE_ENTRY_INVALID', `expected one tree entry for ${expectedPath}`);
  }

  const match = entries[0].match(/^(\d{6}) (\S+) ([0-9a-f]{40})\t([\s\S]+)$/);
  if (!match || match[4] !== expectedPath) {
    reject('TREE_ENTRY_INVALID', `could not prove tree entry for ${expectedPath}`);
  }
  const [, mode, type, blob, path] = match;
  if (!ORDINARY_FILE_MODES.has(mode) || type !== 'blob') {
    reject('TARGET_NOT_ORDINARY_FILE', `target must be an ordinary file: ${expectedPath}`);
  }
  return { mode, type, blob, path };
}

/**
 * Prove that a commit has one parent and changes exactly one ordinary file by
 * adding or modifying it. The returned blob/mode signature can be compared
 * with the commit produced by cherry-pick.
 */
export function validateCommitScope({ commit, expectedPath, expectedParent = null }, options = {}) {
  if (!/^[0-9a-f]{7,40}$/.test(commit || '')) {
    reject('COMMIT_FORMAT_INVALID', 'commit must be a hexadecimal object ID');
  }
  if (
    typeof expectedPath !== 'string' ||
    !expectedPath ||
    expectedPath.startsWith('/') ||
    expectedPath.includes('\0') ||
    expectedPath.includes('\\') ||
    expectedPath.split('/').some((part) => !part || part === '.' || part === '..')
  ) {
    reject('TARGET_PATH_INVALID', 'expected target must be a repository-relative path');
  }
  if (expectedParent && !FULL_SHA_RE.test(expectedParent)) {
    reject('EXPECTED_PARENT_INVALID', 'expected parent must be a full 40-character SHA');
  }
  const cwd = options.cwd || ROOT;
  const gitOutputFn = options.gitOutputFn || gitOutput;
  const run = (args, code = 'COMMIT_SCOPE_INSPECTION_FAILED') => {
    try {
      return gitOutputFn(args, { cwd });
    } catch {
      reject(code, 'git could not inspect the requested commit scope');
    }
  };

  const resolved = run(['rev-parse', '--verify', `${commit}^{commit}`], 'COMMIT_NOT_FOUND');
  if (!FULL_SHA_RE.test(resolved)) {
    reject('COMMIT_NOT_FULL_SHA', 'resolved commit is not a full SHA');
  }

  const parentFields = run(
    ['rev-list', '--parents', '-n', '1', resolved],
    'PARENT_INSPECTION_FAILED',
  ).trim().split(/\s+/);
  if (parentFields.length !== 2 || parentFields[0] !== resolved) {
    reject('COMMIT_NOT_SINGLE_PARENT', 'commit must have exactly one parent');
  }
  const parent = parentFields[1];
  if (expectedParent && parent !== expectedParent) {
    reject('PARENT_MISMATCH', 'commit parent does not match the captured pre-pick HEAD');
  }

  const change = parseSingleChange(run([
    'diff-tree',
    '--no-commit-id',
    '--name-status',
    '-r',
    '-z',
    '-M',
    '-C',
    parent,
    resolved,
  ], 'DIFF_INSPECTION_FAILED'));
  if (change.path !== expectedPath) {
    reject('TARGET_PATH_MISMATCH', `commit does not exclusively change ${expectedPath}`);
  }

  const target = parseTreeEntry(
    run(['ls-tree', '-z', resolved, '--', expectedPath], 'TREE_INSPECTION_FAILED'),
    expectedPath,
  );
  const previous = parseTreeEntry(
    run(['ls-tree', '-z', parent, '--', expectedPath], 'TREE_INSPECTION_FAILED'),
    expectedPath,
    { required: change.status === 'M' },
  );

  if (change.status === 'A' && previous) {
    reject('ADD_TARGET_ALREADY_EXISTS', 'added target already exists in the parent tree');
  }
  if (change.status === 'M') {
    if (!previous) reject('MODIFY_TARGET_MISSING', 'modified target is missing from the parent tree');
    if (previous.mode !== target.mode) {
      reject('FILE_MODE_CHANGED', 'target file mode changes are not allowed');
    }
    if (previous.blob === target.blob) {
      reject('TARGET_CONTENT_UNCHANGED', 'target content blob did not change');
    }
  }

  return {
    commit: resolved,
    parent,
    expectedPath,
    status: change.status,
    mode: target.mode,
    blob: target.blob,
  };
}

export function assertEquivalentCommitScope(expected, actual) {
  for (const field of ['expectedPath', 'status', 'mode', 'blob']) {
    if (expected[field] !== actual[field]) {
      reject('POST_PICK_SCOPE_MISMATCH', `post-pick ${field} does not match the reviewed commit`);
    }
  }
  return actual;
}

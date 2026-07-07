import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { ROOT } from './paths.mjs';

export function gitOutput(args, options = {}) {
  if (!Array.isArray(args)) throw new TypeError('git args must be an array');
  const execFile = options.execFileSync || execFileSync;
  return execFile('git', args, {
    cwd: options.cwd || ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

export function gitMaybe(args, options = {}) {
  try {
    return { ok: true, out: gitOutput(args, options) };
  } catch (err) {
    return { ok: false, error: String(err.stderr || err.message) };
  }
}

export function currentBranch(cwd = ROOT, options = {}) {
  return gitOutput(['branch', '--show-current'], { ...options, cwd });
}

export function statusPorcelain(cwd = ROOT, options = {}) {
  const execFile = options.execFileSync || execFileSync;
  return execFile('git', ['status', '--porcelain'], {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).replace(/\s+$/u, '');
}

export function requireCleanWorktree(cwd = ROOT, options = {}) {
  const status = statusPorcelain(cwd, options);
  if (status) throw new Error(`worktree must be clean:\n${status}`);
}

export function validateCommitHash(hash) {
  if (!/^[0-9a-f]{7,40}$/i.test(hash || '')) {
    throw new Error(`Invalid commit hash: ${hash || '<empty>'}`);
  }
  return hash;
}

export function relativeToRoot(filePath) {
  return path.relative(ROOT, filePath);
}

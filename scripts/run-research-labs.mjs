#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

const RESEARCH_ROOT = path.join('src', 'content', 'docs', 'research');
const EXPECTED_MODULES = 11;
const LANGGRAPH_TEST = [
  RESEARCH_ROOT,
  'langgraph-ecosystem-study',
  'labs',
  'test_stategraph_lab.py',
].join('/');
const LANGGRAPH_REVISION = '49ae27c2ae983cfb92091b0dea9f7bc37a716479';

export async function discoverResearchLabTests(options = {}) {
  const rootDir = path.resolve(options.rootDir ?? process.cwd());
  const researchRoot = path.join(rootDir, RESEARCH_ROOT);
  const tests = [];

  async function walk(directory) {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const filePath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await walk(filePath);
      } else if (
        entry.isFile()
        && path.basename(path.dirname(filePath)) === 'labs'
        && /^test_.*\.py$/.test(entry.name)
      ) {
        tests.push(path.relative(rootDir, filePath).split(path.sep).join('/'));
      }
    }
  }
  await walk(researchRoot);
  return tests.sort();
}

export function runResearchLabTests(testPaths, options = {}) {
  const rootDir = path.resolve(options.rootDir ?? process.cwd());
  const expectedModules = options.expectedModules ?? EXPECTED_MODULES;
  if (testPaths.length !== expectedModules) {
    throw new Error(
      `expected ${expectedModules} research lab test modules, got ${testPaths.length}`,
    );
  }

  const includeExternal = options.includeExternal === true;
  const runnable = includeExternal
    ? testPaths
    : testPaths.filter((testPath) => testPath !== LANGGRAPH_TEST);
  for (const testPath of runnable) {
    console.log(`[research:labs] ${testPath}`);
    let command = 'python3';
    let args = [testPath, '-v'];
    let cwd = rootDir;
    if (testPath === LANGGRAPH_TEST) {
      const sourceRoot = path.join(rootDir, 'research-worktrees', 'langgraph');
      const revision = spawnSync('git', ['rev-parse', 'HEAD'], {
        cwd: sourceRoot,
        encoding: 'utf8',
      });
      if (revision.status !== 0 || revision.stdout.trim() !== LANGGRAPH_REVISION) {
        return {
          ok: false,
          failed: testPath,
          status: 1,
          reason: 'langgraph-worktree-missing-or-unpinned',
        };
      }
      command = 'uv';
      args = [
        'run',
        '--no-project',
        '--with-editable',
        path.join(sourceRoot, 'libs', 'langgraph'),
        'python',
        '-m',
        'unittest',
        '-v',
        path.resolve(rootDir, testPath),
      ];
      cwd = path.dirname(path.resolve(rootDir, testPath));
    }
    const result = spawnSync(command, args, { cwd, stdio: 'inherit' });
    if ((result.status ?? 1) !== 0) {
      return { ok: false, failed: testPath, status: result.status ?? 1 };
    }
  }
  return {
    ok: true,
    failed: null,
    status: 0,
    portable_modules: testPaths.length - 1,
    external_modules: includeExternal ? 1 : 0,
    external_not_run: includeExternal ? [] : [LANGGRAPH_TEST],
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const tests = await discoverResearchLabTests();
  const includeExternal = process.argv.includes('--full');
  const result = runResearchLabTests(tests, { includeExternal });
  if (!result.ok) process.exitCode = result.status;
  else {
    console.log(
      `[research:labs] PASS portable=${result.portable_modules}`
      + ` external=${result.external_modules}`,
    );
    if (result.external_not_run.length > 0) {
      console.log(
        `[research:labs] EXTERNAL_NOT_RESTORED ${result.external_not_run[0]}`,
      );
    }
  }
}

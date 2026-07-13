#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';

import { benchmarkAtlas } from './benchmark-atlas.mjs';
import { verifyLegacyAuditReviewArchive } from './migrate-audit-reviews.mjs';
import { DATA_DIR, ROOT } from './lib/paths.mjs';

const BASELINE_PATH = path.join(DATA_DIR, 'performance-baseline.json');
const BUDGET_PATH = path.join(DATA_DIR, 'performance-budget.json');

function summarizeTree(directory) {
  const summary = { files: 0, bytes: 0 };
  if (!fs.existsSync(directory)) return summary;
  const stack = [directory];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(absolute);
      else if (entry.isFile()) {
        summary.files += 1;
        summary.bytes += fs.statSync(absolute).size;
      }
    }
  }
  return summary;
}

function largestHtml(directory) {
  let largest = { path: null, bytes: 0 };
  if (!fs.existsSync(directory)) return largest;
  const stack = [directory];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(absolute);
      else if (entry.isFile() && entry.name.endsWith('.html')) {
        const bytes = fs.statSync(absolute).size;
        if (bytes > largest.bytes) {
          largest = { path: path.relative(directory, absolute).split(path.sep).join('/'), bytes };
        }
      }
    }
  }
  return largest;
}

function runGit(root, args, options = {}) {
  return spawnSync('git', ['-C', root, ...args], {
    encoding: Object.prototype.hasOwnProperty.call(options, 'encoding') ? options.encoding : 'utf8',
    maxBuffer: 128 * 1024 * 1024,
  });
}

export function collectLegacyAuditReviewMetrics(root = ROOT, verifier = verifyLegacyAuditReviewArchive) {
  const manifestPath = path.join(root, 'data/audit-reviews/manifest.json');
  if (!fs.existsSync(manifestPath)) {
    return {
      legacy_audit_review_items: 0,
      legacy_audit_review_raw_bytes: 0,
      legacy_audit_review_archive_bytes: 0,
    };
  }
  const verified = verifier({ root });
  return {
    legacy_audit_review_items: verified.records,
    legacy_audit_review_raw_bytes: verified.raw_bytes,
    legacy_audit_review_archive_bytes: verified.archive_bytes,
  };
}

export function collectRepositoryMetrics(root = ROOT, gitRunner = runGit) {
  const listed = gitRunner(root, ['ls-files', '-z']);
  if (listed.status !== 0) throw new Error('unable to list tracked repository files');
  const files = String(listed.stdout || '').split('\0').filter(Boolean);
  let trackedBytes = 0;
  for (const relative of files) {
    const absolute = path.join(root, relative);
    if (fs.existsSync(absolute) && fs.statSync(absolute).isFile()) trackedBytes += fs.statSync(absolute).size;
  }

  const archive = gitRunner(root, ['archive', '--format=zip', 'HEAD'], { encoding: null });
  if (archive.status !== 0 || !Buffer.isBuffer(archive.stdout)) {
    throw new Error('unable to measure the committed source archive');
  }
  return {
    tracked_files: files.length,
    tracked_bytes: trackedBytes,
    source_archive_bytes: archive.stdout.length,
    ...collectLegacyAuditReviewMetrics(root),
  };
}

export function collectPerformanceMetrics(root = ROOT) {
  const dist = path.join(root, 'dist');
  return {
    schema_version: '2.0',
    dist: { ...summarizeTree(dist), largest_html: largestHtml(dist) },
    pagefind: summarizeTree(path.join(dist, 'pagefind')),
    public: summarizeTree(path.join(root, 'public')),
  };
}

function getMetric(value, dottedPath) {
  return dottedPath.split('.').reduce((current, key) => current?.[key], value);
}

export function checkPerformanceBudget(metrics, budget) {
  const failures = [];
  const checks = [
    ['dist.files', budget.dist?.max_files],
    ['dist.bytes', budget.dist?.max_bytes],
    ['dist.largest_html.bytes', budget.dist?.max_html_bytes],
    ['pagefind.files', budget.pagefind?.max_files],
    ['pagefind.bytes', budget.pagefind?.max_bytes],
    ['public.files', budget.public?.max_files],
    ['public.bytes', budget.public?.max_bytes],
    ['atlas.output_files', budget.atlas?.max_output_files],
    ['atlas.output_bytes', budget.atlas?.max_output_bytes],
    ['atlas.max_chunk_entries', budget.atlas?.max_chunk_entries],
    ['repository.tracked_files', budget.repository?.max_tracked_files],
    ['repository.tracked_bytes', budget.repository?.max_tracked_bytes],
    ['repository.source_archive_bytes', budget.repository?.max_source_archive_bytes],
  ];
  for (const [name, maximum] of checks) {
    if (maximum === undefined) continue;
    const actual = getMetric(metrics, name);
    if (!Number.isFinite(actual)) failures.push(`${name} is missing or non-numeric`);
    else if (!Number.isFinite(maximum)) failures.push(`${name} has no numeric maximum`);
    else if (actual > maximum) failures.push(`${name}=${actual} exceeds ${maximum}`);
  }
  return failures;
}

export function comparePerformance(metrics, baseline, relativeGrowth = {}) {
  const failures = [];
  const observations = [];
  for (const [name, growth] of Object.entries(relativeGrowth)) {
    const current = getMetric(metrics, name);
    const previous = getMetric(baseline, name);
    if (!Number.isFinite(current) || !Number.isFinite(previous) || !Number.isFinite(growth)) {
      failures.push(`${name} cannot be compared because current, baseline, or growth limit is missing`);
      continue;
    }
    const threshold = Math.ceil(previous * (1 + growth));
    observations.push({ metric: name, baseline: previous, current, threshold, max_growth: growth });
    if (current > threshold) failures.push(`${name}=${current} exceeds baseline=${previous}, threshold=${threshold}`);
  }
  return { failures, observations };
}

function sourceMetadata(root = ROOT) {
  const commit = runGit(root, ['rev-parse', 'HEAD']);
  const npm = spawnSync('npm', ['--version'], { encoding: 'utf8' });
  return {
    commit: commit.status === 0 ? commit.stdout.trim() : 'UNKNOWN',
    node: process.version,
    npm: npm.status === 0 ? npm.stdout.trim() : 'UNKNOWN',
    platform: `${process.platform}-${process.arch}`,
  };
}

function runStrictBuild(root = ROOT) {
  const started = performance.now();
  const result = spawnSync('npm', ['run', 'build:strict'], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    env: process.env,
  });
  if (result.status !== 0) throw new Error(`strict build failed with exit ${result.status ?? 1}`);
  return Number((performance.now() - started).toFixed(2));
}

export async function collectFullPerformanceReport({ root = ROOT, build = false } = {}) {
  const buildWallMs = build ? runStrictBuild(root) : null;
  const metrics = collectPerformanceMetrics(root);
  if (!metrics.dist.files) throw new Error('dist is empty; run the strict build first or pass --build');
  const atlas = await benchmarkAtlas({ rootDir: root });
  metrics.atlas = atlas.deterministic;
  metrics.repository = collectRepositoryMetrics(root);
  metrics.source = sourceMetadata(root);
  return {
    metrics,
    advisory: {
      build_wall_ms: buildWallMs,
      atlas_generation_ms: atlas.advisory.model_generation_ms,
      peak_rss_bytes: null,
    },
  };
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const allowedFlags = new Set(['--build', '--json', '--write-baseline']);
  let compare = null;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--compare') {
      compare = args[index + 1];
      if (!compare) throw new Error('--compare requires a baseline path');
      index += 1;
    } else if (!allowedFlags.has(arg)) throw new Error(`unknown argument: ${arg}`);
  }
  return {
    build: args.includes('--build'),
    json: args.includes('--json'),
    writeBaseline: args.includes('--write-baseline'),
    compare,
  };
}

async function main() {
  const options = parseArgs(process.argv);
  const { metrics, advisory } = await collectFullPerformanceReport({ build: options.build });
  const budget = JSON.parse(fs.readFileSync(BUDGET_PATH, 'utf8'));
  const failures = checkPerformanceBudget(metrics, budget);
  let comparison = null;
  if (options.compare) {
    const raw = JSON.parse(fs.readFileSync(path.resolve(options.compare), 'utf8'));
    const baseline = raw.metrics || raw;
    comparison = comparePerformance(metrics, baseline, budget.relative_growth || {});
    failures.push(...comparison.failures);
  }
  if (options.writeBaseline) fs.writeFileSync(BASELINE_PATH, `${JSON.stringify(metrics, null, 2)}\n`);

  const report = { metrics, advisory, comparison, failures };
  if (options.json) console.log(JSON.stringify(report));
  else {
    console.log(`[benchmark:site] dist=${metrics.dist.bytes}B/${metrics.dist.files} files pagefind=${metrics.pagefind.bytes}B atlas=${metrics.atlas.output_bytes}B repo=${metrics.repository.tracked_bytes}B`);
    for (const failure of failures) console.error(`[benchmark:site] ${failure}`);
  }
  if (failures.length) process.exit(1);
}

if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1] || '')) {
  main().catch((error) => {
    console.error(`[benchmark:site] ${error.message}`);
    process.exit(1);
  });
}

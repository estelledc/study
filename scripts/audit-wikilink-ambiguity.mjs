#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import {
  createAliasIndex,
  createNoteIndex,
  extractWikilinks,
  loadAliasConfig,
  loadNoteRecords,
  resolveWikilink,
  serializeNoteId,
  slugFromNoteFilename,
} from './lib/note-id.mjs';
import { DATA_DIR, DOCS_DIR, ROOT } from './lib/paths.mjs';

export const WIKILINK_CATEGORIES = Object.freeze([
  'typo',
  'alias',
  'planned-note',
  'external-concept',
  'intentional-placeholder',
  'unknown',
]);

const DEFAULT_BASELINE_PATH = path.join(DATA_DIR, 'wikilink-baseline.json');
const DEFAULT_TRANSITION_PATH = path.join(DATA_DIR, 'wikilink-baseline-transition.json');
const DEFAULT_ALIAS_PATH = path.join(DATA_DIR, 'wikilink-aliases.json');
const COMMIT_SHA_RE = /^[0-9a-f]{40}$/i;
const SHA256_RE = /^[0-9a-f]{64}$/i;

function walkMarkdown(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkMarkdown(full, acc);
    else if (/\.mdx?$/.test(entry.name)) acc.push(full);
  }
  return acc;
}

function areaForFile(file, docsDir) {
  const relative = path.relative(docsDir, file).replaceAll(path.sep, '/');
  if (relative.startsWith('papers/')) return 'papers';
  if (relative.startsWith('projects/')) return 'projects';
  return null;
}

function sourceIdForFile(file, docsDir) {
  const area = areaForFile(file, docsDir);
  return area ? serializeNoteId(area, slugFromNoteFilename(path.basename(file))) : null;
}

function groupKey(sourceId, target) {
  return `${sourceId}\0${target}`;
}

export function validateWikilinkBaseline(baseline) {
  if (baseline?.version !== 1 || !baseline.budgets || !Array.isArray(baseline.groups)) {
    throw new Error('wikilink baseline must use version 1 with budgets and groups');
  }
  const groups = new Map();
  for (const record of baseline.groups) {
    if (!record.source_id || !record.target || !Number.isInteger(record.count) || record.count < 1) {
      throw new Error('wikilink baseline contains an invalid group');
    }
    if (!WIKILINK_CATEGORIES.includes(record.category) || !record.owner || !record.decision) {
      throw new Error(`wikilink baseline group lacks classification ownership: ${record.source_id}`);
    }
    const key = groupKey(record.source_id, record.target);
    if (groups.has(key)) throw new Error(`duplicate wikilink baseline group: ${record.source_id} -> ${record.target}`);
    groups.set(key, record);
  }
  return groups;
}

export function validateWikilinkBaselineTransition(transition, baseline, baselineBytes) {
  if (!transition || transition.schema_version !== 'study-wikilink-baseline-transition-v1') {
    throw new Error('wikilink baseline transition has an invalid schema');
  }
  for (const side of ['from', 'to']) {
    if (!COMMIT_SHA_RE.test(String(transition[side]?.source_commit || ''))
      || !SHA256_RE.test(String(transition[side]?.baseline_sha256 || ''))) {
      throw new Error(`wikilink baseline transition ${side} provenance is invalid`);
    }
  }
  const currentHash = crypto.createHash('sha256').update(baselineBytes).digest('hex');
  if (transition.to.baseline_sha256 !== currentHash) {
    throw new Error('wikilink baseline transition does not match the current baseline bytes');
  }
  if (transition.to.source_commit !== baseline.source_commit) {
    throw new Error('wikilink baseline transition does not match the current source commit');
  }
  if (transition.to.unresolved_occurrences !== baseline.budgets.unresolved_occurrences
    || transition.to.groups !== baseline.groups.length) {
    throw new Error('wikilink baseline transition counts do not match the current baseline');
  }
  if (!Number.isInteger(transition.added_or_grown_groups)
    || !Number.isInteger(transition.removed_or_reduced_groups)
    || typeof transition.reason !== 'string'
    || transition.reason.trim().length < 20) {
    throw new Error('wikilink baseline transition lacks reviewed change evidence');
  }
  return true;
}

function defaultClassification() {
  return { category: 'unknown', owner: 'content-maintainers', decision: 'triage-required' };
}

export function auditWikilinks({
  docsDir,
  noteRecords,
  aliasRecords = [],
  baseline = null,
  enforceBaseline = true,
}) {
  const noteIndex = createNoteIndex(noteRecords);
  const aliasIndex = createAliasIndex(aliasRecords, noteIndex);
  const baselineGroups = baseline ? validateWikilinkBaseline(baseline) : new Map();
  const unresolved = new Map();
  const blocking = [];
  const resolutionCounts = { direct: 0, 'same-area': 0, unique: 0, alias: 0 };
  let occurrences = 0;
  let namespacedMissing = 0;

  for (const file of walkMarkdown(docsDir)) {
    const relativeFile = path.relative(ROOT, file).replaceAll(path.sep, '/');
    const sourceArea = areaForFile(file, docsDir);
    const sourceId = sourceIdForFile(file, docsDir);
    const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);

    lines.forEach((line, index) => {
      for (const link of extractWikilinks(line)) {
        occurrences += 1;
        const stableTarget = link.target || '<empty>';
        const resolved = resolveWikilink(link.parsed, { sourceArea, noteIndex, aliasIndex });
        if (resolved.ok) {
          resolutionCounts[resolved.resolution] = (resolutionCounts[resolved.resolution] || 0) + 1;
          continue;
        }

        const problem = {
          file: relativeFile,
          line: index + 1,
          target: stableTarget,
          reason: resolved.reason,
        };
        if (link.parsed.kind === 'explicit') namespacedMissing += 1;
        if (!sourceId || link.parsed.kind === 'explicit') {
          blocking.push(problem);
          continue;
        }

        const key = groupKey(sourceId, stableTarget);
        if (!unresolved.has(key)) {
          const classification = baselineGroups.get(key) || defaultClassification();
          unresolved.set(key, {
            source_id: sourceId,
            target: stableTarget,
            count: 0,
            category: classification.category,
            owner: classification.owner,
            decision: classification.decision,
          });
        }
        unresolved.get(key).count += 1;
      }
    });
  }

  const groups = [...unresolved.values()].sort((a, b) =>
    a.source_id.localeCompare(b.source_id) || a.target.localeCompare(b.target));
  const categories = Object.fromEntries(WIKILINK_CATEGORIES.map((category) => [category, 0]));
  for (const group of groups) categories[group.category] += group.count;
  const unresolvedOccurrences = groups.reduce((sum, group) => sum + group.count, 0);
  const duplicates = [...noteIndex.bySlug.entries()]
    .filter(([, areas]) => areas.size > 1)
    .map(([slug, areas]) => ({ slug, areas: [...areas.keys()].sort() }));
  const budgetFailures = [];

  if (enforceBaseline) {
    if (!baseline) {
      budgetFailures.push({ reason: 'wikilink baseline is missing' });
    } else {
      const budgets = baseline.budgets;
      if (unresolvedOccurrences > budgets.unresolved_occurrences) {
        budgetFailures.push({ reason: 'unresolved occurrence budget grew', current: unresolvedOccurrences, baseline: budgets.unresolved_occurrences });
      }
      if (categories.unknown > budgets.unknown_occurrences) {
        budgetFailures.push({ reason: 'unknown occurrence budget grew', current: categories.unknown, baseline: budgets.unknown_occurrences });
      }
      for (const group of groups) {
        const previous = baselineGroups.get(groupKey(group.source_id, group.target));
        if (!previous || group.count > previous.count) {
          budgetFailures.push({
            reason: previous ? 'historical unresolved group grew' : 'new unresolved group',
            source_id: group.source_id,
            target: group.target,
            current: group.count,
            baseline: previous?.count || 0,
          });
        }
      }
    }
  }

  const summary = {
    notes: noteIndex.byId.size,
    wikilink_occurrences: occurrences,
    resolved_occurrences: Object.values(resolutionCounts).reduce((sum, count) => sum + count, 0),
    alias_resolved_occurrences: resolutionCounts.alias,
    unresolved_occurrences: unresolvedOccurrences,
    unresolved_unique_groups: groups.length,
    categories,
    duplicate_slugs: duplicates.length,
    blocking: blocking.length,
    namespaced_missing: namespacedMissing,
    budget_failures: budgetFailures.length,
  };

  return {
    valid: blocking.length === 0 && budgetFailures.length === 0,
    summary,
    resolution_counts: resolutionCounts,
    duplicates,
    blocking,
    budget_failures: budgetFailures,
    unresolved_groups: groups,
  };
}

export function baselineFromAudit(result, { sourceCommit = null } = {}) {
  return {
    version: 1,
    source_commit: sourceCommit,
    budgets: {
      blocking: 0,
      namespaced_missing: 0,
      unresolved_occurrences: result.summary.unresolved_occurrences,
      unknown_occurrences: result.summary.categories.unknown,
    },
    groups: result.unresolved_groups,
  };
}

function parseArgs(argv) {
  const args = { json: false, writeBaseline: null, sourceCommit: null };
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--json') args.json = true;
    else if (arg === '--write-baseline') args.writeBaseline = argv[++index];
    else if (arg === '--source-commit') args.sourceCommit = argv[++index];
    else throw new Error(`unknown argument: ${arg}`);
  }
  return args;
}

export function runWikilinkAudit({
  docsDir = DOCS_DIR,
  baselinePath = DEFAULT_BASELINE_PATH,
  transitionPath = DEFAULT_TRANSITION_PATH,
  aliasPath = DEFAULT_ALIAS_PATH,
  json = false,
  writeBaseline = null,
  sourceCommit = null,
  silent = false,
} = {}) {
  const noteRecords = loadNoteRecords({ docsDir });
  const aliasRecords = loadAliasConfig(aliasPath);
  const baselineBytes = fs.existsSync(baselinePath) ? fs.readFileSync(baselinePath) : null;
  const baseline = baselineBytes ? JSON.parse(baselineBytes.toString('utf8')) : null;
  if (!writeBaseline && baseline && fs.existsSync(transitionPath)) {
    validateWikilinkBaselineTransition(
      JSON.parse(fs.readFileSync(transitionPath, 'utf8')),
      baseline,
      baselineBytes,
    );
  }
  const result = auditWikilinks({
    docsDir,
    noteRecords,
    aliasRecords,
    baseline,
    enforceBaseline: !writeBaseline,
  });

  if (writeBaseline) {
    if (!COMMIT_SHA_RE.test(String(sourceCommit || '')) || /^0{40}$/.test(sourceCommit)) {
      throw new Error('refusing to write a baseline without a full immutable source commit');
    }
    if (result.summary.blocking > 0 || result.summary.namespaced_missing > 0) {
      throw new Error('refusing to write a baseline with blocking wikilink issues');
    }
    fs.writeFileSync(writeBaseline, `${JSON.stringify(baselineFromAudit(result, { sourceCommit }), null, 2)}\n`, 'utf8');
  }

  if (!silent && json) console.log(JSON.stringify(result, null, 2));
  else if (!silent) {
    console.log(
      `[audit:wikilinks] notes=${result.summary.notes} unresolved=${result.summary.unresolved_occurrences} ` +
      `unknown=${result.summary.categories.unknown} blocking=${result.summary.blocking} ` +
      `budget_failures=${result.summary.budget_failures}`,
    );
    if (!result.valid) {
      for (const problem of result.blocking) {
        console.error(`- ${problem.file}:${problem.line} target=${problem.target} :: ${problem.reason}`);
      }
      for (const failure of result.budget_failures.slice(0, 20)) {
        console.error(`- ${failure.reason}${failure.source_id ? `: ${failure.source_id} -> ${failure.target}` : ''}`);
      }
    }
  }
  if (!result.valid) process.exitCode = 1;
  return result;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runWikilinkAudit(parseArgs(process.argv));
}

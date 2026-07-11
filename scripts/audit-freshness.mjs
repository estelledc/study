#!/usr/bin/env node

import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import { parseFrontmatterLoose } from './lib/frontmatter.mjs';
import { classifyFreshness, isCalendarDate } from './lib/freshness.mjs';
import { discoverNotes } from './lib/note-discovery.mjs';

const AREAS = ['papers', 'projects'];

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function emptyStats() {
  return { total: 0, legacy_unverified: 0, current: 0, review_due: 0, due_soon: 0, invalid: 0 };
}

export async function auditFreshness(options) {
  const rootDir = path.resolve(options.rootDir ?? process.cwd());
  if (!isCalendarDate(options.asOf)) throw new Error('--as-of must be a real YYYY-MM-DD date');
  const policy = options.policy ?? JSON.parse(await fs.readFile(
    path.join(rootDir, 'data', 'freshness-policy.json'),
    'utf8',
  ));
  let officialSourceRegistry = options.officialSourceRegistry;
  if (!officialSourceRegistry) {
    try {
      officialSourceRegistry = JSON.parse(await fs.readFile(
        path.join(rootDir, 'data', 'official-source-registry.json'),
        'utf8',
      ));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      officialSourceRegistry = JSON.parse(await fs.readFile(
        new URL('../data/official-source-registry.json', import.meta.url),
        'utf8',
      ));
    }
  }
  const byArea = { papers: emptyStats(), projects: emptyStats() };
  const actionable = [];
  const legacyIds = [];
  const v2Statuses = [];

  for (const note of await discoverNotes(rootDir)) {
    const text = await fs.readFile(note.path, 'utf8');
    const result = note.canonical_path
      ? classifyFreshness(parseFrontmatterLoose(text), { asOf: options.asOf, policy, officialSourceRegistry })
      : {
          status: 'invalid', due_soon: false, no_deadline: false, policy_rule: null,
          reviewed_at: null, review_after: null, errors: [...note.path_issues].sort(),
        };
    const relativePath = path.relative(rootDir, note.path).split(path.sep).join('/');
    const stats = byArea[note.area];
    stats.total += 1;
    if (result.status === 'legacy-unverified') {
      stats.legacy_unverified += 1;
      legacyIds.push(`${note.area}/${note.slug}`);
    } else {
      const statusKey = result.status.replace('-', '_');
      stats[statusKey] += 1;
      if (result.due_soon) stats.due_soon += 1;
      v2Statuses.push({
        path: relativePath,
        status: result.status,
        due_soon: result.due_soon,
        no_deadline: result.no_deadline,
        policy_rule: result.policy_rule,
        reviewed_at: result.reviewed_at,
        review_after: result.review_after,
      });
      if (result.status === 'review-due' || result.status === 'invalid' || result.due_soon) {
        actionable.push({
          path: relativePath,
          area: note.area,
          slug: note.slug,
          status: result.status,
          due_soon: result.due_soon,
          review_after: result.review_after,
          errors: result.errors,
        });
      }
    }
  }

  const summary = emptyStats();
  for (const area of AREAS) {
    for (const key of Object.keys(summary)) summary[key] += byArea[area][key];
  }
  summary.blocking = summary.invalid;
  actionable.sort((left, right) => left.path.localeCompare(right.path));
  v2Statuses.sort((left, right) => left.path.localeCompare(right.path));
  return {
    schema_version: 'study-freshness-audit-v1',
    as_of: options.asOf,
    readonly: true,
    summary,
    by_area: byArea,
    legacy_paths_sha256: sha256(`${legacyIds.sort().join('\n')}\n`),
    v2_statuses: v2Statuses,
    actionable,
  };
}

function parseArgs(argv) {
  const args = { asOf: null, json: false };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--as-of') args.asOf = argv[++index];
    else if (argv[index] === '--json') args.json = true;
    else throw new Error(`unknown argument: ${argv[index]}`);
  }
  if (!args.asOf) throw new Error('--as-of is required');
  return args;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const report = await auditFreshness({ rootDir: process.cwd(), asOf: args.asOf });
    if (args.json) console.log(JSON.stringify(report, null, 2));
    else console.log(`freshness: ${report.summary.review_due} due, ${report.summary.due_soon} soon, ${report.summary.invalid} invalid, ${report.summary.legacy_unverified} legacy-unverified`);
    process.exitCode = report.summary.blocking === 0 ? 0 : 1;
  } catch (error) {
    console.error(`freshness audit failed: ${error.message}`);
    process.exitCode = 2;
  }
}

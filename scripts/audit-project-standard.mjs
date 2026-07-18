#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';

import { parseFrontmatterLoose } from './lib/frontmatter.mjs';

const PROJECTS_ROOT = path.join('src', 'content', 'docs', 'projects');
const SNAPSHOT_PATH = path.join('data', 'project-standard-audit.json');
const QUESTION_PATTERN = /[?？]/g;

function hasHeading(content, terms) {
  const headings = [...content.matchAll(/^##\s+(.+)$/gm)].map((match) => match[1]);
  return terms.some((term) => headings.some((heading) => heading.includes(term)));
}

function sourceFromFrontmatter(frontmatter) {
  if (frontmatter?.trust?.canonical_source) {
    return frontmatter.trust.canonical_source;
  }
  const source = frontmatter?.来源;
  if (typeof source !== 'string') return null;
  return source.match(/https?:\/\/\S+/)?.[0] ?? null;
}

export function evaluateProjectNote(content, slug) {
  const frontmatter = parseFrontmatterLoose(content) ?? {};
  const trust = frontmatter.trust;
  const checks = {
    source: Boolean(sourceFromFrontmatter(frontmatter)),
    pinned_revision: Boolean(
      trust?.version === 'study-v2'
      && typeof trust.immutable_revision === 'string'
      && trust.immutable_revision.length >= 7
    ),
    evidence_boundary: Boolean(
      trust?.evidence_type && trust?.verification_status
    ),
    identity_and_value: (
      hasHeading(content, ['是什么'])
      && hasHeading(content, ['为什么', '价值', '重要'])
    ),
    beginner_explanation: /类比|就像|好比|比如|例如/.test(content),
    mechanism_or_flow: hasHeading(
      content,
      ['核心', '机制', '架构', '流程', '地形', '数据流'],
    ),
    runnable_practice: (
      hasHeading(content, ['实践', '实验', '案例', '复现'])
      && /```[^\n]*\n[\s\S]*?```/.test(content)
    ),
    tradeoffs_and_limits: hasHeading(
      content,
      ['踩过的坑', '限制', '取舍', '适用', '不适用'],
    ),
    learning_outcomes: hasHeading(
      content,
      ['学到', '学习目标', '能力', '完成标准'],
    ),
    self_test: (
      (content.match(QUESTION_PATTERN)?.length ?? 0) >= 3
      && /答案|检查点|自测/.test(content)
    ),
    further_sources: hasHeading(content, ['延伸阅读', '来源', '参考']),
  };
  const missing = Object.entries(checks)
    .filter(([, passed]) => !passed)
    .map(([name]) => name);
  const contentChecks = [
    'identity_and_value',
    'beginner_explanation',
    'mechanism_or_flow',
    'runnable_practice',
    'tradeoffs_and_limits',
    'learning_outcomes',
    'self_test',
    'further_sources',
  ];
  const contentScore = contentChecks.filter((name) => checks[name]).length;

  let status = 'benchmark-aligned';
  if (missing.length > 0) {
    if (contentScore < 5) status = 'needs-structure';
    else if (!checks.pinned_revision || !checks.evidence_boundary) {
      status = 'needs-evidence';
    } else if (!checks.runnable_practice || !checks.self_test) {
      status = 'needs-practice';
    } else {
      status = 'needs-refinement';
    }
  }

  return {
    slug,
    title: frontmatter.title ?? slug,
    source: sourceFromFrontmatter(frontmatter),
    status,
    checks,
    missing,
  };
}

function stableStringify(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export async function buildProjectStandardAudit(options = {}) {
  const rootDir = path.resolve(options.rootDir ?? process.cwd());
  const projectsRoot = path.join(rootDir, PROJECTS_ROOT);
  const entries = [];
  for (const name of (await fs.readdir(projectsRoot)).sort()) {
    if (!name.endsWith('.md') || name.startsWith('_')) continue;
    const slug = name.slice(0, -3);
    const content = await fs.readFile(path.join(projectsRoot, name), 'utf8');
    entries.push(evaluateProjectNote(content, slug));
  }
  const byStatus = {};
  for (const entry of entries) {
    byStatus[entry.status] = (byStatus[entry.status] ?? 0) + 1;
  }
  return {
    schema_version: 'study-project-standard-audit-v1',
    standard: 'research-benchmark-v1',
    summary: {
      total: entries.length,
      by_status: Object.fromEntries(
        Object.entries(byStatus).sort(([left], [right]) => (
          left.localeCompare(right)
        )),
      ),
    },
    projects: entries,
  };
}

export async function auditProjectStandardSnapshot(options = {}) {
  const rootDir = path.resolve(options.rootDir ?? process.cwd());
  const result = await buildProjectStandardAudit({ rootDir });
  const output = stableStringify(result);
  const snapshotPath = path.join(rootDir, SNAPSHOT_PATH);
  if (options.write) {
    await fs.writeFile(snapshotPath, output);
    return { ...result, snapshot_status: 'WRITTEN' };
  }
  const expected = await fs.readFile(snapshotPath, 'utf8');
  return {
    ...result,
    snapshot_status: output === expected ? 'CURRENT' : 'STALE',
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const write = process.argv.includes('--write');
  const result = await auditProjectStandardSnapshot({ write });
  console.log(JSON.stringify({
    ...result.summary,
    snapshot_status: result.snapshot_status,
  }, null, 2));
  if (!write && result.snapshot_status !== 'CURRENT') process.exitCode = 1;
}

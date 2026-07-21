#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';

import { auditContentContract } from './audit-content-contract.mjs';
import { buildContentInventory } from './lib/content-inventory.mjs';
import { atomicWriteFile, readJson } from './lib/json-store.mjs';
import { DATA_DIR, DOCS_DIR, ROOT } from './lib/paths.mjs';

export const SITE_STATE_SCHEMA_VERSION = 'study-site-state-v1';
export const SITE_STATE_PATH = path.join(DATA_DIR, 'site-state.json');
export const HOME_PATH = path.join(DOCS_DIR, 'index.md');
export const SITE_STATE_MARKER = 'STUDY:SITE_STATE';

export function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function markerBounds(content, marker) {
  const begin = `<!-- ${marker}:BEGIN -->`;
  const end = `<!-- ${marker}:END -->`;
  const start = content.indexOf(begin);
  const stop = content.indexOf(end);
  if (start === -1 || stop === -1 || stop < start) {
    throw new Error(`${marker} marker block is missing or malformed`);
  }
  return { begin, end, start, stop: stop + end.length };
}

export function replaceMarkerBlock(content, marker, body) {
  const bounds = markerBounds(content, marker);
  const replacement = `${bounds.begin}\n${body.trimEnd()}\n${bounds.end}`;
  return `${content.slice(0, bounds.start)}${replacement}${content.slice(bounds.stop)}`;
}

async function optionalJson(filePath, fallback) {
  try {
    return await readJson(filePath);
  } catch (error) {
    if (error.code === 'ENOENT') return fallback;
    throw error;
  }
}

async function deriveHomepageDisplayCounts(rootDir) {
  const learningPaths = await optionalJson(path.join(rootDir, 'data', 'learning-paths.json'), null);
  return {
    learningPaths: Array.isArray(learningPaths?.paths) ? learningPaths.paths.length : 0,
  };
}

export async function deriveSiteState(options = {}) {
  const rootDir = path.resolve(options.rootDir ?? ROOT);
  const inventory = await buildContentInventory({ rootDir });
  const content = inventory.counts;
  const projectStandard = await readJson(path.join(rootDir, 'data', 'project-standard-audit.json'));
  const projectSummary = projectStandard?.summary;
  const byStatus = projectSummary?.by_status ?? {};
  if (projectSummary?.total !== content.projects) {
    throw new Error(
      `project-standard total ${projectSummary?.total ?? '<missing>'} does not match project files ${content.projects}`,
    );
  }

  const contentContract = await auditContentContract({ rootDir });
  if (contentContract.summary.total !== content.total) {
    throw new Error(
      `content-contract total ${contentContract.summary.total} does not match content files ${content.total}`,
    );
  }

  return {
    schema_version: SITE_STATE_SCHEMA_VERSION,
    content: {
      projects: content.projects,
      papers: content.papers,
      total: content.total,
    },
    project_standard: {
      total: projectSummary.total,
      benchmark_aligned: byStatus['benchmark-aligned'] ?? 0,
      needs_evidence: byStatus['needs-evidence'] ?? 0,
    },
    content_contract: {
      v2: contentContract.summary.v2,
      legacy_unverified: contentContract.summary.legacy_unverified,
      blocking: contentContract.summary.blocking,
    },
  };
}

export function renderHomepageSiteState(state, displayCounts) {
  return `
<div class="jx-proof__metrics" aria-label="当前内容规模">
<div class="jx-proof__metric"><strong>${state.content.total}</strong><span>篇项目与论文笔记</span></div>
<div class="jx-proof__metric"><strong>${state.project_standard.benchmark_aligned}</strong><span>个项目已对齐标杆标准</span></div>
<div class="jx-proof__metric"><strong>${displayCounts.learningPaths}</strong><span>条新手首选路径</span></div>
</div>
<div class="jx-proof__links" aria-label="证据入口">
<a class="jx-pill" href="/study/method/">项目精读方法</a>
<a class="jx-pill" href="/study/papers-method/">论文精读方法</a>
<a class="jx-pill" href="/study/about/">立场与协作声明</a>
<a class="jx-pill" href="https://github.com/estelledc/study">公开仓库</a>
</div>
</div>
<dl class="jx-proof__meta">
<div><dt>Jason / Judgment</dt><dd>决定定位、信念、筛选标准；阅读、提观点、编辑与要求重写。</dd></div>
<div><dt>Claude Code / Leverage</dt><dd>本地源码研究、内容初稿，以及 Astro + Starlight 站点基础设施。</dd></div>
<div><dt>Evidence / 证据</dt><dd>笔记回到真实源码、论文原文、永久链接与可复现实验；方法论公开。</dd></div>
<div><dt>Limitations / 局限</dt><dd class="jx-proof__limitation">大规模覆盖不等于每篇同等成熟；AI 初稿可能误读，关键结论应回到引用来源核查。</dd></div>
</dl>
  </div>

  <p class="study-muted"><strong>当前规模：</strong>${state.content.papers} 篇论文 + ${state.content.projects} 个项目 = ${state.content.total} 篇笔记。当前状态来自 <code>data/site-state.json</code>；数量已移出首屏，只作为覆盖面证据。</p>
`.trim();
}

export async function buildSiteStateArtifacts(options = {}) {
  const rootDir = path.resolve(options.rootDir ?? ROOT);
  const state = await deriveSiteState({ rootDir });
  const displayCounts = await deriveHomepageDisplayCounts(rootDir);
  return {
    state,
    files: new Map([
      [path.join(rootDir, 'data', 'site-state.json'), stableJson(state)],
      [
        path.join(rootDir, 'src', 'content', 'docs', 'index.md'),
        replaceMarkerBlock(
          await fs.readFile(path.join(rootDir, 'src', 'content', 'docs', 'index.md'), 'utf8'),
          SITE_STATE_MARKER,
          renderHomepageSiteState(state, displayCounts),
        ),
      ],
    ]),
  };
}

async function writeIfChanged(filePath, content) {
  let current = null;
  try {
    current = await fs.readFile(filePath, 'utf8');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  if (current === content) return false;
  await atomicWriteFile(filePath, content, { encoding: 'utf8' });
  return true;
}

export async function runSiteState(options = {}) {
  const rootDir = path.resolve(options.rootDir ?? ROOT);
  const artifacts = await buildSiteStateArtifacts({ rootDir });
  const changed = [];
  const stale = [];

  for (const [filePath, expected] of artifacts.files) {
    if (options.write) {
      if (await writeIfChanged(filePath, expected)) changed.push(path.relative(rootDir, filePath));
    } else {
      let actual = null;
      try {
        actual = await fs.readFile(filePath, 'utf8');
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
      if (actual !== expected) stale.push(path.relative(rootDir, filePath));
    }
  }

  return {
    state: artifacts.state,
    mode: options.write ? 'write' : 'check',
    changed: changed.sort(),
    stale: stale.sort(),
  };
}

function parseArgs(argv) {
  const args = { write: false, check: false, json: false };
  for (const arg of argv) {
    if (arg === '--write') args.write = true;
    else if (arg === '--check') args.check = true;
    else if (arg === '--json') args.json = true;
    else throw new Error(`unknown argument: ${arg}`);
  }
  if (args.write && args.check) throw new Error('--write and --check cannot be combined');
  return args;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const result = await runSiteState({ write: args.write });
    if (args.json) {
      console.log(JSON.stringify(result, null, 2));
    } else if (args.write) {
      console.log(`site-state: ${result.changed.length} changed`);
      for (const file of result.changed) console.log(`- ${file}`);
    } else if (result.stale.length > 0) {
      console.error('site-state is stale:');
      for (const file of result.stale) console.error(`- ${file}`);
    } else {
      console.log(
        `site-state: current, projects=${result.state.content.projects}, papers=${result.state.content.papers}, total=${result.state.content.total}`,
      );
    }
    if (!args.write && result.stale.length > 0) process.exitCode = 1;
  } catch (error) {
    console.error(`site-state failed: ${error.message}`);
    process.exitCode = 2;
  }
}

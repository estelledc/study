#!/usr/bin/env node

import { runWikilinkAudit, WIKILINK_CATEGORIES } from './audit-wikilink-ambiguity.mjs';

const json = process.argv.slice(2).includes('--json');
const unknown = process.argv.slice(2).filter((arg) => arg !== '--json');
if (unknown.length) throw new Error(`unknown argument: ${unknown.join(', ')}`);

const result = runWikilinkAudit({ silent: true });
if (json) {
  console.log(JSON.stringify({
    valid: result.valid,
    summary: result.summary,
    unresolved_groups: result.unresolved_groups,
  }, null, 2));
} else {
  console.log('# Wikilink 分类报告\n');
  console.log('| 类别 | occurrence |');
  console.log('|---|---:|');
  for (const category of WIKILINK_CATEGORIES) {
    console.log(`| ${category} | ${result.summary.categories[category]} |`);
  }
  console.log(`\n聚合组：${result.summary.unresolved_unique_groups}`);
  console.log(`\n阻断：${result.summary.blocking}；预算失败：${result.summary.budget_failures}`);
  console.log('\n逐组 owner/decision 见 data/wikilink-baseline.json；报告不复制笔记正文。');
}

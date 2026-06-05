// remark-search-aliases.mjs
// 在每篇 papers/projects 笔记的 <body> 注入隐藏的 data-pagefind-meta 别名节点，
// 让 Pagefind 能通过英文缩写、拼音首字母等搜索到对应笔记。
//
// 别名来源：
//   1. 笔记 title 中的英文词（如 "DDPM"、"HM"）
//   2. taxonomy.json topicLabels 的英文 key（如 "agents" → 智能体）
//
// 输出：<div data-pagefind-meta="alias:ddpm hm diffusion ..." style="display:none"></div>

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { visit } from 'unist-util-visit';

const TAXONOMY_PATH = join(process.cwd(), 'data/taxonomy.json');
let taxonomyAliases = {};

function loadTaxonomyAliases() {
  if (!existsSync(TAXONOMY_PATH)) return {};
  try {
    const t = JSON.parse(readFileSync(TAXONOMY_PATH, 'utf8'));
    const aliases = {};
    // Map each English key to its Chinese label and reverse
    for (const [key, label] of Object.entries(t.topicLabels || {})) {
      if (/^[a-z]/.test(key)) {
        aliases[label] = key; // Chinese label → English key alias
      }
    }
    return aliases;
  } catch {
    return {};
  }
}

taxonomyAliases = loadTaxonomyAliases();

// Extract uppercase acronyms and English words from title
function extractAliases(title, subcategory) {
  const aliases = new Set();

  // Uppercase sequences (acronyms like DDPM, RLHF, BM25)
  const acronyms = title.match(/\b[A-Z][A-Z0-9]{1,}\b/g) || [];
  for (const a of acronyms) aliases.add(a.toLowerCase());

  // Lower-case English words (>= 3 chars)
  const words = title.match(/\b[a-zA-Z]{3,}\b/g) || [];
  for (const w of words) {
    if (!['the', 'and', 'for', 'with', 'from', 'that', 'this', 'are', 'was'].includes(w.toLowerCase())) {
      aliases.add(w.toLowerCase());
    }
  }

  // Subcategory English alias from taxonomy
  if (subcategory && taxonomyAliases[subcategory]) {
    aliases.add(taxonomyAliases[subcategory]);
  }

  return [...aliases].join(' ');
}

export default function remarkSearchAliases() {
  return (tree, file) => {
    // Only inject into papers/projects pages
    const fp = file?.history?.[0] || '';
    if (!fp.includes('/docs/papers/') && !fp.includes('/docs/projects/')) return;

    // Get frontmatter data from vfile.data (Astro injects it)
    const fm = file?.data?.astro?.frontmatter || {};
    const title = fm.title || '';
    const subcategory = fm['子分类'] || fm.subcategory || '';

    const aliasStr = extractAliases(title, subcategory);
    if (!aliasStr) return;

    // Inject a hidden div at end of document body
    const aliasNode = {
      type: 'html',
      value: `<div data-pagefind-meta="alias:${aliasStr}" style="display:none" aria-hidden="true"></div>`,
    };
    tree.children.push(aliasNode);
  };
}

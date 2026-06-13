#!/usr/bin/env node
// Shared taxonomy helpers for classify-notes + regen-atlas

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(__dirname, '..');
export const TAXONOMY_PATH = path.join(ROOT, 'data/taxonomy.json');

let _cached = null;

export async function loadTaxonomy() {
  if (_cached?.themeById) return _cached;
  const raw = await fs.readFile(TAXONOMY_PATH, 'utf8');
  const parsed = JSON.parse(raw);
  const themeById = new Map(parsed.themes.map((t) => [t.id, t]));
  const themeByLabel = new Map(parsed.themes.map((t) => [t.label, t]));
  const themeOrder = new Map(parsed.themes.map((t) => [t.label, t.order]));
  _cached = { ...parsed, themeById, themeByLabel, themeOrder };
  return _cached;
}

export function parseFrontmatter(raw) {
  const m = raw.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return { fm: {}, body: raw };
  const block = m[1];
  const fm = {};
  for (const line of block.split('\n')) {
    const km = line.match(/^([A-Za-z_一-龥][A-Za-z0-9_一-龥]*)\s*:\s*(.*)$/u);
    if (!km) continue;
    let v = km[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    fm[km[1]] = v;
  }
  return { fm, body: raw.slice(m[0].length) };
}

export function normalizeRawCategory(raw) {
  if (!raw || raw === '(none)') return '';
  return raw.replace(/^['"]|['"]$/g, '').trim();
}

export function themeLabelFromId(taxonomy, themeId) {
  return taxonomy.themeById.get(themeId)?.label ?? '其他';
}

export function inferThemeFromCategory(taxonomy, rawCategory) {
  const raw = normalizeRawCategory(rawCategory);
  if (!raw) return null;

  // Exact label match
  if (taxonomy.themeByLabel.has(raw)) {
    return taxonomy.themeByLabel.get(raw).id;
  }

  if (taxonomy.categoryExactMap?.[raw]) {
    return taxonomy.categoryExactMap[raw];
  }

  // English topic keys → theme
  if (taxonomy.topicToTheme[raw]) {
    return taxonomy.topicToTheme[raw];
  }

  // projects / 数据可视化 or papers / 内存管理 → strip prefix
  const slash = raw.match(/^(?:projects|papers)\s*\/\s*(.+)$/i);
  if (slash) {
    const inner = slash[1].trim();
    if (taxonomy.themeByLabel.has(inner)) return taxonomy.themeByLabel.get(inner).id;
    const innerTheme = inferThemeFromCategory(taxonomy, inner);
    if (innerTheme) return innerTheme;
  }

  // Rule patterns
  for (const rule of taxonomy.themeFromCategoryRules || []) {
    const re = new RegExp(rule.pattern, 'i');
    if (re.test(raw)) return rule.themeId;
  }

  // projects-only generic
  if (/^projects$/i.test(raw)) return 'backend-api';

  return null;
}

export function subcategoryFromTopic(taxonomy, topicKey) {
  if (!topicKey) return '综合';
  return taxonomy.topicLabels[topicKey] ?? topicKey;
}

export function classifySlug(taxonomy, { slug, area, fm, candidate }) {
  let themeId = null;
  let subcategory = null;
  let source = null;
  let confidence = 'high';

  const override = taxonomy.slugOverrides?.[`${area}::${slug}`];
  if (override) {
    return {
      slug,
      area,
      theme: themeLabelFromId(taxonomy, override.themeId),
      themeId: override.themeId,
      subcategory: override.subcategory,
      source: 'slugOverrides',
      confidence: 'high',
      rawCategory: normalizeRawCategory(fm['分类'] ?? '') || null,
    };
  }

  if (candidate?.topic) {
    themeId = taxonomy.topicToTheme[candidate.topic] ?? null;
    subcategory = subcategoryFromTopic(taxonomy, candidate.topic);
    source = 'candidates.topic';
  }

  const rawCat = normalizeRawCategory(fm['分类'] ?? '');
  if (!themeId && rawCat) {
    themeId = inferThemeFromCategory(taxonomy, rawCat);
    if (themeId) {
      source = source ? `${source}+category` : 'category';
      if (!subcategory) {
        subcategory = fm['子分类'] || inferSubcategoryFromRaw(taxonomy, rawCat) || subcategoryFromTopic(taxonomy, rawCat);
      }
    }
  }

  if (fm['子分类'] && !subcategory) subcategory = fm['子分类'];

  // Heuristic from slug
  if (!themeId) {
    themeId = inferThemeFromSlug(taxonomy, slug, area);
    if (themeId) {
      source = 'slug-heuristic';
      confidence = 'low';
      subcategory = subcategory || '综合';
    }
  }

  if (!themeId) {
    themeId = 'other';
    source = source || 'fallback';
    confidence = 'low';
  }

  if (!subcategory) subcategory = '综合';

  const theme = themeLabelFromId(taxonomy, themeId);
  return { slug, area, theme, themeId, subcategory, source, confidence, rawCategory: rawCat || null };
}

function inferSubcategoryFromRaw(taxonomy, raw) {
  for (const [key, label] of Object.entries(taxonomy.subcategoryFromCategory || {})) {
    if (raw.includes(key)) return label;
  }
  return null;
}

function inferThemeFromSlug(taxonomy, slug, area) {
  const s = slug.toLowerCase();
  const rules = [
    [/^(paxos|raft|spanner|chubby|zab|epaxos|vr-|consensus)/, 'distributed-systems'],
    [/^(postgres|mysql|redis|rocksdb|kafka|clickhouse|duckdb|sqlite|dynamo|bigtable)/, 'databases'],
    [/^(react|vue|svelte|next-|nuxt|vite|webpack|esbuild)/, 'backend-api'],
    [/^(kubernetes|docker|k8s|helm|terraform|prometheus|grafana)/, 'infrastructure'],
    [/^(tcp|quic|tls|http|dns|bbr)/, 'network-protocols'],
    [
      /^(hkdf|hmac|aes-|gcm-|rsa|oauth|zk-|snark|regev|dilithium|sgx|trustzone|spectre|meltdown|rowhammer|ckks|pbkdf|argon|noise-protocol|dwork-|abadi-dpsgd|kdf-|key-deriv|log4shell)/,
      'security-privacy',
    ],
    [/^(bert|gpt|llama|transformer|attention|clip|diffusion|lstm)/, 'machine-learning'],
    [/^(bitcoin|ethereum|solidity|zk-)/, 'blockchain'],
    [/^(llvm|wasm|v8|compiler|parser)/, 'compilers'],
    [/^(hoare|coq|tla|separation|verification)/, 'formal-methods'],
  ];
  for (const [re, id] of rules) {
    if (re.test(s)) return id;
  }
  return null;
}

/**
 * Score one note for classification (SDK / pipeline consumer).
 * Wraps classifySlug with a stable { theme, score, needsReview } shape.
 *
 * @param {{ slug: string, area: 'papers'|'projects', fm?: Record<string,string>, candidate?: object|null, title?: string, tags?: string[], snippet?: string }} item
 * @returns {Promise<{ theme: string, score: number, needsReview: boolean, themeId: string, subcategory: string }>}
 */
export async function scoreItem(item) {
  const taxonomy = await loadTaxonomy();
  const fm = { ...(item.fm ?? {}) };
  if (item.title && !fm.title) fm.title = item.title;
  if (item.tags?.length && !fm.tags) fm.tags = item.tags.join(', ');
  const snippet = item.snippet ?? '';
  if (snippet && !fm['分类']) {
    // Body keywords can reinforce security/crypto notes when slug is ambiguous.
    if (/hkdf|hmac|key derivation|kdf|密钥派生/i.test(snippet)) {
      fm['分类'] = fm['分类'] || '安全与隐私';
    }
  }
  const c = classifySlug(taxonomy, {
    slug: item.slug,
    area: item.area,
    fm,
    candidate: item.candidate ?? null,
  });
  const score = c.themeId === 'other' ? 0 : c.confidence === 'high' ? 80 : 45;
  return {
    theme: c.theme,
    themeId: c.themeId,
    subcategory: c.subcategory,
    score,
    needsReview: c.confidence === 'low' || c.themeId === 'other',
  };
}

export async function loadCandidates() {
  const p = path.join(ROOT, 'data/candidates.jsonl');
  const map = new Map();
  try {
    const raw = await fs.readFile(p, 'utf8');
    for (const line of raw.split('\n').filter(Boolean)) {
      const o = JSON.parse(line);
      map.set(`${o.area}::${o.slug}`, o);
    }
  } catch {
    // optional
  }
  return map;
}

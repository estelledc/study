#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

import { DATA_DIR, DOCS_DIR, ROOT } from './lib/paths.mjs';

const IMAGE_EXTENSIONS = new Set(['.webp', '.png', '.jpg', '.jpeg', '.gif', '.svg']);
const MANIFEST_PATH = path.join(DATA_DIR, 'asset-manifest.json');
const ORPHAN_BASELINE_PATH = path.join(DATA_DIR, 'asset-orphan-baseline.json');
const ORPHAN_ALLOWLIST_PATH = path.join(DATA_DIR, 'asset-orphan-allowlist.json');

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function walk(directory, predicate) {
  if (!fs.existsSync(directory)) return [];
  const results = [];
  const stack = [directory];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true }).sort((a, b) => b.name.localeCompare(a.name))) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(absolute);
      else if (entry.isFile() && predicate(absolute)) results.push(absolute);
    }
  }
  return results.sort();
}

function stripCodeFences(markdown) {
  return markdown.replace(/```[\s\S]*?```/g, '');
}

export function collectImageReferences(docsDir = DOCS_DIR) {
  const references = [];
  for (const file of walk(docsDir, (candidate) => /\.mdx?$/i.test(candidate))) {
    const text = stripCodeFences(fs.readFileSync(file, 'utf8'));
    const lines = text.split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
      const pattern = /!\[([^\]]*)\]\((\/(?:[^)\s]+\.(?:webp|png|jpe?g|gif|svg)))(?:\s+[^)]*)?\)/gi;
      for (const match of lines[index].matchAll(pattern)) {
        const decorative = /<!--\s*decorative\s*-->/i.test(lines[index])
          || /<!--\s*decorative\s*-->/i.test(lines[index - 1] || '');
        references.push({
          kind: 'content',
          source: path.relative(ROOT, file).split(path.sep).join('/'),
          line: index + 1,
          alt: match[1].trim(),
          decorative,
          url: match[2],
        });
      }
    }
  }
  return references.sort((a, b) => `${a.source}:${a.line}:${a.url}`.localeCompare(`${b.source}:${b.line}:${b.url}`));
}

export function collectSiteMetadataImageReferences(configFile = path.join(ROOT, 'astro.config.mjs')) {
  if (!configFile || !fs.existsSync(configFile)) return [];
  const source = path.resolve(configFile).startsWith(`${path.resolve(ROOT)}${path.sep}`)
    ? path.relative(ROOT, configFile).split(path.sep).join('/')
    : path.basename(configFile);
  const references = [];
  const lines = fs.readFileSync(configFile, 'utf8').split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const pattern = /content:\s*(['"])(https:\/\/[^'"]+\.(?:webp|png|jpe?g|gif|svg))\1/gi;
    for (const match of lines[index].matchAll(pattern)) {
      let parsed;
      try {
        parsed = new URL(match[2]);
      } catch {
        continue;
      }
      if (parsed.hostname !== 'estelledc.github.io') continue;
      references.push({
        kind: 'metadata',
        source,
        line: index + 1,
        url: parsed.pathname,
      });
    }
  }
  return references.sort((a, b) => `${a.source}:${a.line}:${a.url}`.localeCompare(`${b.source}:${b.line}:${b.url}`));
}

export async function buildAssetReport({
  publicDir = path.join(ROOT, 'public'),
  docsDir = DOCS_DIR,
  configFile = path.join(ROOT, 'astro.config.mjs'),
} = {}) {
  const issues = [];
  const references = [
    ...collectImageReferences(docsDir),
    ...collectSiteMetadataImageReferences(configFile),
  ];
  const referencedBy = new Map();

  for (const reference of references) {
    if (reference.kind === 'content') {
      if (!reference.alt && !reference.decorative) {
        issues.push(`${reference.source}:${reference.line} image alt text is empty without an explicit decorative marker`);
      }
      if (reference.alt && reference.decorative) {
        issues.push(`${reference.source}:${reference.line} decorative image must use empty alt text`);
      }
    }
    if (!reference.url.startsWith('/study/')) {
      issues.push(`${reference.source}:${reference.line} image URL bypasses the /study base: ${reference.url}`);
    }
    const publicRelative = reference.url.replace(/^\/study\//, '').replace(/^\//, '');
    const target = path.join(publicDir, publicRelative);
    if (!fs.existsSync(target)) issues.push(`${reference.source}:${reference.line} image target is missing: ${reference.url}`);
    if (!referencedBy.has(publicRelative)) referencedBy.set(publicRelative, []);
    referencedBy.get(publicRelative).push(`${reference.source}:${reference.line}`);
  }

  const assets = [];
  for (const file of walk(publicDir, (candidate) => IMAGE_EXTENSIONS.has(path.extname(candidate).toLowerCase()))) {
    const relative = path.relative(publicDir, file).split(path.sep).join('/');
    let metadata = {};
    try {
      metadata = await sharp(file).metadata();
      if (!metadata.width || !metadata.height) issues.push(`public/${relative} has no decodable dimensions`);
    } catch {
      issues.push(`public/${relative} cannot be decoded`);
    }
    assets.push({
      path: `public/${relative}`,
      sha256: sha256(file),
      bytes: fs.statSync(file).size,
      width: metadata.width || null,
      height: metadata.height || null,
      format: metadata.format || path.extname(file).slice(1).toLowerCase(),
      referenced_by: (referencedBy.get(relative) || []).sort(),
    });
  }

  const orphanPaths = assets.filter((asset) => asset.referenced_by.length === 0).map((asset) => asset.path);
  const duplicateHashes = Object.entries(Object.groupBy(assets, (asset) => asset.sha256))
    .filter(([, items]) => items.length > 1)
    .map(([hash, items]) => ({ sha256: hash, paths: items.map((item) => item.path).sort() }))
    .sort((a, b) => a.sha256.localeCompare(b.sha256));
  const manifest = {
    schema_version: '1.0',
    summary: {
      assets: assets.length,
      bytes: assets.reduce((sum, asset) => sum + asset.bytes, 0),
      referenced: assets.length - orphanPaths.length,
      legacy_unreferenced: orphanPaths.length,
      duplicate_hash_groups: duplicateHashes.length,
    },
    assets,
    duplicate_hashes: duplicateHashes,
  };
  return { manifest, orphanPaths, issues };
}

function canonical(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export function evaluateOrphanLifecycle(orphanPaths, baselinePaths = [], allowlistEntries = []) {
  const issues = [];
  const orphanSet = new Set(orphanPaths);
  const baselineSet = new Set(baselinePaths);
  const allowedSet = new Set();

  for (const entry of allowlistEntries) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      issues.push('asset orphan allowlist contains a non-object entry');
      continue;
    }
    const assetPath = String(entry.path || '');
    if (!/^public\/[A-Za-z0-9._/-]+$/.test(assetPath)) {
      issues.push(`asset orphan allowlist has invalid path: ${assetPath || '<empty>'}`);
      continue;
    }
    if (allowedSet.has(assetPath)) {
      issues.push(`asset orphan allowlist has duplicate path: ${assetPath}`);
      continue;
    }
    if (typeof entry.reason !== 'string' || entry.reason.trim().length < 20) {
      issues.push(`asset orphan allowlist needs a specific reason: ${assetPath}`);
    }
    if (!/^[0-9a-f]{40}$/i.test(String(entry.source_commit || ''))) {
      issues.push(`asset orphan allowlist needs a full source commit: ${assetPath}`);
    }
    if (entry.disposition !== 'retain-pending-dedicated-deletion') {
      issues.push(`asset orphan allowlist has unsupported disposition: ${assetPath}`);
    }
    if (!orphanSet.has(assetPath)) {
      issues.push(`asset orphan allowlist entry is stale or missing: ${assetPath}`);
      continue;
    }
    allowedSet.add(assetPath);
  }

  return {
    issues,
    allowedOrphans: [...allowedSet].sort(),
    newOrphans: orphanPaths.filter((asset) => !baselineSet.has(asset) && !allowedSet.has(asset)),
  };
}

async function main() {
  const write = process.argv.includes('--write');
  const refreshBaseline = process.argv.includes('--refresh-baseline');
  const json = process.argv.includes('--json');
  const report = await buildAssetReport();
  const baseline = fs.existsSync(ORPHAN_BASELINE_PATH)
    ? JSON.parse(fs.readFileSync(ORPHAN_BASELINE_PATH, 'utf8'))
    : { paths: [] };
  let allowlist = { entries: [] };
  const allowlistIssues = [];
  try {
    if (fs.existsSync(ORPHAN_ALLOWLIST_PATH)) {
      allowlist = JSON.parse(fs.readFileSync(ORPHAN_ALLOWLIST_PATH, 'utf8'));
      if (allowlist.schema_version !== '1.0' || !Array.isArray(allowlist.entries)) {
        allowlistIssues.push('data/asset-orphan-allowlist.json has an invalid schema');
        allowlist = { entries: [] };
      }
    }
  } catch {
    allowlistIssues.push('data/asset-orphan-allowlist.json is invalid JSON');
    allowlist = { entries: [] };
  }
  const lifecycle = evaluateOrphanLifecycle(
    report.orphanPaths,
    baseline.paths || [],
    allowlist.entries || [],
  );
  const newOrphans = lifecycle.newOrphans;

  if (write) {
    fs.writeFileSync(MANIFEST_PATH, canonical(report.manifest));
    if (refreshBaseline) {
      fs.writeFileSync(ORPHAN_BASELINE_PATH, canonical({
        schema_version: '1.0',
        policy: 'legacy-report-only; fail newly unreferenced assets',
        paths: report.orphanPaths.filter((asset) => !lifecycle.allowedOrphans.includes(asset)),
      }));
    }
  }

  const staleManifest = fs.existsSync(MANIFEST_PATH)
    && fs.readFileSync(MANIFEST_PATH, 'utf8') !== canonical(report.manifest);
  const failures = [...report.issues, ...allowlistIssues, ...lifecycle.issues];
  if (!write && staleManifest) failures.push('data/asset-manifest.json is stale; run audit-assets --write after reviewing changes');
  if (!refreshBaseline && newOrphans.length) failures.push(`${newOrphans.length} newly unreferenced asset(s): ${newOrphans.slice(0, 5).join(', ')}`);

  const result = {
    ...report.manifest.summary,
    issues: [...report.issues, ...allowlistIssues, ...lifecycle.issues],
    allowed_orphans: lifecycle.allowedOrphans,
    new_orphans: newOrphans,
  };
  if (json) console.log(JSON.stringify(result));
  else console.log(`[audit:assets] assets=${result.assets} referenced=${result.referenced} legacy_unreferenced=${result.legacy_unreferenced} new_unreferenced=${newOrphans.length}`);
  if (failures.length) {
    for (const failure of failures) console.error(`[audit:assets] ${failure}`);
    process.exit(1);
  }
}

if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1] || '')) {
  main().catch((error) => {
    console.error(`[audit:assets] ${error.message}`);
    process.exit(1);
  });
}

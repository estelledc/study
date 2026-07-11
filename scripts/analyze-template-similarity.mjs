#!/usr/bin/env node

import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import { discoverNotes } from './lib/note-discovery.mjs';
import { stripGeneratedBacklinkSection } from './regen-backlinks.mjs';

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function stripFrontmatter(text) {
  return String(text).replace(/\r\n?/g, '\n').replace(/^---\n[\s\S]*?\n---(?:\n|$)/, '');
}

export function normalizeSimilarityText(text) {
  let value = stripGeneratedBacklinkSection(stripFrontmatter(text));
  value = value.replace(/<!--[^]*?-->/g, '');
  value = value.replace(/https?:\/\/[^\s)>]+/g, '<url>');
  value = value.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_match, _target, label) => label ?? '<wikilink>');
  value = value.replace(/(!?\[[^\]]*\])\([^\n)]*\)/g, '$1');
  value = value.replace(/\b\d+(?:\.\d+)*\b/g, '<n>');
  value = value.replace(/[`*_>#|~-]+/g, ' ');
  return value.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
}

function characterShingles(value, width = 24) {
  const compact = value.replace(/\s+/g, ' ');
  if (compact.length < width) return new Set(compact ? [compact] : []);
  const shingles = new Set();
  for (let index = 0; index <= compact.length - width; index += 1) {
    shingles.add(compact.slice(index, index + width));
  }
  return shingles;
}

function editSimilarity(left, right) {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const substitution = previous[rightIndex - 1] + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1);
      current[rightIndex] = Math.min(
        previous[rightIndex] + 1,
        current[rightIndex - 1] + 1,
        substitution,
      );
    }
    for (let index = 0; index < current.length; index += 1) previous[index] = current[index];
  }
  return 1 - (previous[right.length] / Math.max(left.length, right.length));
}

export function similarityScore(leftText, rightText) {
  const left = normalizeSimilarityText(leftText);
  const right = normalizeSimilarityText(rightText);
  if (!left || !right) return 0;
  if (left === right) return 1;
  const minimumLength = Math.min(left.length, right.length);
  if (minimumLength < 400) return editSimilarity(left, right);
  const width = Math.min(24, Math.max(4, Math.floor(minimumLength / 10)));
  const leftSet = characterShingles(left, width);
  const rightSet = characterShingles(right, width);
  let intersection = 0;
  const [small, large] = leftSet.size <= rightSet.size ? [leftSet, rightSet] : [rightSet, leftSet];
  for (const shingle of small) if (large.has(shingle)) intersection += 1;
  const union = leftSet.size + rightSet.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

export function h2Signature(text) {
  return String(text).replace(/\r\n?/g, '\n').split('\n')
    .map((line) => line.match(/^##\s+(.+?)\s*$/)?.[1])
    .filter(Boolean)
    .map((heading) => heading.normalize('NFKC').toLowerCase().replace(/[`*_]/g, '').replace(/\s+/g, ' ').trim());
}

function paragraphOpeningFingerprints(text) {
  const withoutCode = stripGeneratedBacklinkSection(stripFrontmatter(text)).replace(/```[^\n]*\n[\s\S]*?```/g, '');
  const fingerprints = [];
  for (const paragraph of withoutCode.split(/\n\s*\n/)) {
    const normalized = paragraph
      .replace(/^#{1,6}\s+.*$/gm, '')
      .replace(/^\s*(?:[-*+] |\d+[.)] ).*$/gm, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (normalized.length < 24) continue;
    fingerprints.push(sha256(normalized.normalize('NFKC').toLowerCase().slice(0, 80)));
  }
  return [...new Set(fingerprints)];
}

function exampleFingerprints(text) {
  const fingerprints = [];
  for (const match of String(text).matchAll(/```[^\n]*\n([\s\S]*?)```/g)) {
    const normalized = match[1].normalize('NFKC').replace(/\s+/g, ' ').trim();
    if (normalized.length >= 32) fingerprints.push(sha256(normalized));
  }
  return [...new Set(fingerprints)];
}

function increment(map, key, item = null) {
  const current = map.get(key) ?? { count: 0, items: [] };
  current.count += 1;
  if (item !== null) current.items.push(item);
  map.set(key, current);
}

function repeatedGroups(map, minimum, limit = 20) {
  return [...map.entries()]
    .filter(([, value]) => value.count >= minimum)
    .map(([fingerprint, value]) => ({ fingerprint, count: value.count, items: value.items.sort() }))
    .sort((left, right) => right.count - left.count || left.fingerprint.localeCompare(right.fingerprint))
    .slice(0, limit);
}

export async function analyzeTemplateSimilarity(options = {}) {
  const rootDir = path.resolve(options.rootDir ?? process.cwd());
  const signatureCounts = new Map();
  const paragraphCounts = new Map();
  const exampleCounts = new Map();
  const bodyCounts = new Map();
  let h2Count11 = 0;
  const notes = await discoverNotes(rootDir);
  const noncanonicalNotePaths = notes
    .filter((note) => !note.canonical_path)
    .map((note) => path.relative(rootDir, note.path).split(path.sep).join('/'))
    .sort();

  for (const note of notes) {
    const text = await fs.readFile(note.path, 'utf8');
    const relativePath = path.relative(rootDir, note.path).split(path.sep).join('/');
    const signature = h2Signature(text);
    if (signature.length === 11) h2Count11 += 1;
    increment(signatureCounts, sha256(signature.join('\n')), relativePath);
    for (const fingerprint of paragraphOpeningFingerprints(text)) increment(paragraphCounts, fingerprint);
    for (const fingerprint of exampleFingerprints(text)) increment(exampleCounts, fingerprint);
    increment(bodyCounts, sha256(normalizeSimilarityText(text)), relativePath);
  }

  const topSignatures = repeatedGroups(signatureCounts, 1, 20).map(({ fingerprint, count }) => ({
    fingerprint,
    count,
  }));
  const repeatedParagraphs = repeatedGroups(paragraphCounts, 5, 20).map(({ fingerprint, count }) => ({
    fingerprint,
    count,
  }));
  const repeatedExamples = repeatedGroups(exampleCounts, 2, 20).map(({ fingerprint, count }) => ({
    fingerprint,
    count,
  }));
  const exactBodies = repeatedGroups(bodyCounts, 2, 100);
  return {
    schema_version: 'study-template-similarity-report-v1',
    readonly: true,
    summary: {
      total_notes: notes.length,
      unique_h2_signatures: signatureCounts.size,
      top_h2_signature_count: topSignatures[0]?.count ?? 0,
      h2_count_11: h2Count11,
      repeated_paragraph_opening_groups: [...paragraphCounts.values()].filter(({ count }) => count >= 5).length,
      repeated_example_groups: [...exampleCounts.values()].filter(({ count }) => count >= 2).length,
      exact_body_duplicate_groups: exactBodies.length,
      noncanonical_note_paths: noncanonicalNotePaths.length,
    },
    top_h2_signatures: topSignatures,
    top_repeated_paragraph_openings: repeatedParagraphs,
    top_repeated_examples: repeatedExamples,
    exact_body_duplicate_groups: exactBodies,
    noncanonical_note_paths: noncanonicalNotePaths,
  };
}

export async function checkExtremeSimilarity(noteText, options = {}) {
  const rootDir = path.resolve(options.rootDir ?? process.cwd());
  const excludePath = options.excludePath ? path.resolve(options.excludePath) : null;
  const excludeRelativePath = options.excludeRelativePath?.split(path.sep).join('/') ?? null;
  const threshold = options.threshold ?? 0.94;
  let best = null;
  for (const note of await discoverNotes(rootDir)) {
    const relativePath = path.relative(rootDir, note.path).split(path.sep).join('/');
    if ((excludePath && path.resolve(note.path) === excludePath)
      || (excludeRelativePath && relativePath === excludeRelativePath)) continue;
    const other = await fs.readFile(note.path, 'utf8');
    const score = similarityScore(noteText, other);
    if (!best || score > best.score) {
      best = {
        path: relativePath,
        score,
        fingerprint: sha256(normalizeSimilarityText(other)),
      };
    }
    if (score === 1) break;
  }
  const roundedBest = best ? { ...best, score: Number(best.score.toFixed(4)) } : null;
  return {
    ok: !best || best.score < threshold,
    threshold,
    best: roundedBest,
  };
}

function parseArgs(argv) {
  const args = { json: false };
  for (const arg of argv) {
    if (arg === '--json') args.json = true;
    else throw new Error(`unknown argument: ${arg}`);
  }
  return args;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const report = await analyzeTemplateSimilarity({ rootDir: process.cwd() });
    if (args.json) console.log(JSON.stringify(report, null, 2));
    else console.log(`template-similarity: ${report.summary.total_notes} notes, top H2 signature ${report.summary.top_h2_signature_count}, exact duplicate groups ${report.summary.exact_body_duplicate_groups}`);
  } catch (error) {
    console.error(`template similarity analysis failed: ${error.message}`);
    process.exitCode = 2;
  }
}

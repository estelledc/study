import fs from 'node:fs/promises';

import { validateTrust } from '../audit-content-contract.mjs';
import { parseFrontmatterLoose } from './frontmatter.mjs';
import {
  NOTE_AREAS,
  createNoteIndex,
  parseNoteId,
  serializeNoteId,
} from './note-id.mjs';

export const TAXONOMY_SCHEMA_VERSION = 'taxonomy-v1';
export const NOTE_INDEX_SCHEMA_VERSION = 'study-note-index-v1';
export const DEFAULT_ATLAS_CHUNK_SIZE = 100;

const TOPIC_ID_RE = /^(papers|projects)-[a-z0-9]+(?:-[a-z0-9]+)*$/;
const PATH_ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export class TaxonomyError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'TaxonomyError';
    this.code = code;
  }
}

function reject(code, message) {
  throw new TaxonomyError(code, message);
}

function assertLabelSet(labels, context) {
  if (!labels || typeof labels !== 'object') reject('LABELS_INVALID', `${context} labels must be an object`);
  for (const locale of ['zh', 'en']) {
    if (typeof labels[locale] !== 'string' || !labels[locale].trim()) {
      reject('LABELS_INVALID', `${context} requires a non-empty ${locale} label`);
    }
  }
}

function assertBudget(value, label) {
  if (!Number.isInteger(value) || value < 0) reject('BUDGET_INVALID', `${label} must be a non-negative integer`);
}

export function normalizeCategory(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function validateTaxonomy(taxonomy) {
  if (!taxonomy || taxonomy.schema_version !== TAXONOMY_SCHEMA_VERSION) {
    reject('SCHEMA_INVALID', `taxonomy schema_version must be ${TAXONOMY_SCHEMA_VERSION}`);
  }
  if (!Number.isInteger(taxonomy.chunk_size) || taxonomy.chunk_size < 25 || taxonomy.chunk_size > 250) {
    reject('CHUNK_SIZE_INVALID', 'taxonomy chunk_size must be an integer in [25, 250]');
  }
  if (!Array.isArray(taxonomy.learning_paths) || taxonomy.learning_paths.length !== 6) {
    reject('LEARNING_PATHS_INVALID', 'taxonomy must define exactly six learning paths');
  }
  const pathIds = new Set();
  for (const learningPath of taxonomy.learning_paths) {
    if (!PATH_ID_RE.test(learningPath?.id || '') || pathIds.has(learningPath.id)) {
      reject('LEARNING_PATH_INVALID', `invalid or duplicate learning path: ${learningPath?.id || '<empty>'}`);
    }
    pathIds.add(learningPath.id);
    assertLabelSet(learningPath.labels, `learning path ${learningPath.id}`);
    if (learningPath.href !== `/study/topics/${learningPath.id}/`) {
      reject('LEARNING_PATH_INVALID', `learning path ${learningPath.id} must use its stable /study/topics/ URL`);
    }
  }

  if (!Array.isArray(taxonomy.topics) || taxonomy.topics.length === 0) {
    reject('TOPICS_INVALID', 'taxonomy topics must be a non-empty array');
  }
  const topicById = new Map();
  for (const topic of taxonomy.topics) {
    if (!TOPIC_ID_RE.test(topic?.id || '')) reject('TOPIC_ID_INVALID', `invalid topic id: ${topic?.id || '<empty>'}`);
    if (!NOTE_AREAS.includes(topic.area) || !topic.id.startsWith(`${topic.area}-`)) {
      reject('TOPIC_AREA_INVALID', `topic ${topic.id} has an invalid area`);
    }
    if (topicById.has(topic.id)) reject('TOPIC_ID_DUPLICATE', `duplicate topic id: ${topic.id}`);
    assertLabelSet(topic.labels, `topic ${topic.id}`);
    if (typeof topic.description !== 'string' || !topic.description.trim()) {
      reject('TOPIC_DESCRIPTION_INVALID', `topic ${topic.id} requires a description`);
    }
    topicById.set(topic.id, topic);
  }

  if (!Array.isArray(taxonomy.category_rules)) reject('CATEGORY_RULES_INVALID', 'category_rules must be an array');
  for (const [index, rule] of taxonomy.category_rules.entries()) {
    const topic = topicById.get(rule?.topic_id);
    if (!NOTE_AREAS.includes(rule?.area) || !topic || topic.area !== rule.area) {
      reject('CATEGORY_RULE_INVALID', `category rule ${index} references an invalid area/topic pair`);
    }
    if (!Array.isArray(rule.match_any) || rule.match_any.length === 0) {
      reject('CATEGORY_RULE_INVALID', `category rule ${index} has no match_any values`);
    }
    const normalized = rule.match_any.map(normalizeCategory);
    if (normalized.some((value) => !value) || new Set(normalized).size !== normalized.length) {
      reject('CATEGORY_RULE_INVALID', `category rule ${index} contains empty or duplicate match values`);
    }
  }

  if (!Array.isArray(taxonomy.curated_assignments)) {
    reject('ASSIGNMENTS_INVALID', 'curated_assignments must be an array');
  }
  const assigned = new Set();
  for (const assignment of taxonomy.curated_assignments) {
    const note = parseNoteId(assignment?.note_id);
    const topic = topicById.get(assignment?.topic_id);
    if (!topic || topic.area !== note.area) {
      reject('ASSIGNMENT_TOPIC_INVALID', `assignment ${note.id} references an invalid topic`);
    }
    if (assigned.has(note.id)) reject('ASSIGNMENT_DUPLICATE', `duplicate curated assignment: ${note.id}`);
    assigned.add(note.id);
  }

  const budgets = taxonomy.budgets;
  if (!budgets || typeof budgets !== 'object') reject('BUDGET_INVALID', 'taxonomy budgets are required');
  for (const area of NOTE_AREAS) assertBudget(budgets.unclassified_max?.[area], `unclassified_max.${area}`);
  assertBudget(budgets.unclassified_max?.total, 'unclassified_max.total');
  assertBudget(budgets.unknown_difficulty_max, 'unknown_difficulty_max');
  assertBudget(budgets.empty_description_max, 'empty_description_max');
  return taxonomy;
}

export async function loadTaxonomy(filePath) {
  return validateTaxonomy(JSON.parse(await fs.readFile(filePath, 'utf8')));
}

export function createTaxonomyIndex(taxonomy) {
  validateTaxonomy(taxonomy);
  const topicById = new Map(taxonomy.topics.map((topic) => [topic.id, topic]));
  const curatedByNoteId = new Map(
    taxonomy.curated_assignments.map((assignment) => [assignment.note_id, assignment.topic_id]),
  );
  const rulesByArea = new Map(NOTE_AREAS.map((area) => [
    area,
    taxonomy.category_rules
      .filter((rule) => rule.area === area)
      .map((rule) => ({ ...rule, match_any: rule.match_any.map(normalizeCategory) })),
  ]));
  return { taxonomy, topicById, curatedByNoteId, rulesByArea };
}

function categoryIncludes(category, needle) {
  if (/^[a-z0-9]{1,2}$/.test(needle)) {
    const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(?:^|[^a-z0-9])${escaped}(?:$|[^a-z0-9])`).test(category);
  }
  return category.includes(needle);
}

export function classifyNote(note, taxonomyIndex, rawCategory) {
  const id = note.id || serializeNoteId(note.area, note.slug);
  const curatedTopicId = taxonomyIndex.curatedByNoteId.get(id);
  if (curatedTopicId) {
    return { state: 'classified', source: 'curated-assignment', topic_id: curatedTopicId };
  }
  const category = normalizeCategory(rawCategory);
  if (category) {
    for (const rule of taxonomyIndex.rulesByArea.get(note.area) || []) {
      const matched = rule.match_any.find((needle) => categoryIncludes(category, needle));
      if (matched) {
        return {
          state: 'classified',
          source: 'frontmatter-category',
          topic_id: rule.topic_id,
          matched_category: matched,
        };
      }
    }
  }
  return { state: 'unclassified', source: 'unmapped', topic_id: null };
}

function normalizeDate(value) {
  if (value instanceof Date && Number.isFinite(value.valueOf())) return value.toISOString().slice(0, 10);
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function freshnessState(trust, asOf) {
  const reviewedAt = normalizeDate(trust?.reviewed_at);
  const reviewAfter = normalizeDate(trust?.review_after);
  if (!reviewedAt) return { state: 'UNKNOWN', reviewed_at: null, review_after: reviewAfter };
  if (!asOf) return { state: 'NOT_EVALUATED', reviewed_at: reviewedAt, review_after: reviewAfter };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf)) reject('AS_OF_INVALID', `invalid --as-of date: ${asOf}`);
  return {
    state: reviewAfter && reviewAfter <= asOf ? 'REVIEW_DUE' : 'CURRENT',
    reviewed_at: reviewedAt,
    review_after: reviewAfter,
    as_of: asOf,
  };
}

function emptyStats() {
  return { total: 0, classified: 0, unclassified: 0, unknown_difficulty: 0, empty_description: 0 };
}

export function assertTaxonomyBudgets(stats, budgets) {
  const checks = [
    ['unclassified papers', stats.by_area.papers.unclassified, budgets.unclassified_max.papers],
    ['unclassified projects', stats.by_area.projects.unclassified, budgets.unclassified_max.projects],
    ['unclassified total', stats.summary.unclassified, budgets.unclassified_max.total],
    ['unknown difficulty', stats.summary.unknown_difficulty, budgets.unknown_difficulty_max],
    ['empty description', stats.summary.empty_description, budgets.empty_description_max],
  ];
  const exceeded = checks.filter(([, current, maximum]) => current > maximum);
  if (exceeded.length) {
    reject(
      'TAXONOMY_BUDGET_GROWTH',
      exceeded.map(([label, current, maximum]) => `${label} grew to ${current} (max ${maximum})`).join('; '),
    );
  }
  return true;
}

export function buildNoteIndex({ taxonomy, notes, asOf = null, enforceBudgets = true }) {
  const taxonomyIndex = createTaxonomyIndex(taxonomy);
  createNoteIndex(notes.map((note) => ({ id: note.id || serializeNoteId(note.area, note.slug) })));
  const indexed = [];
  const byArea = { papers: emptyStats(), projects: emptyStats() };

  for (const note of notes) {
    const id = note.id || serializeNoteId(note.area, note.slug);
    const content = String(note.content ?? '');
    const frontmatter = parseFrontmatterLoose(content) ?? {};
    const rawCategory = frontmatter['分类'] ?? frontmatter.topic ?? null;
    const classification = classifyNote({ ...note, id }, taxonomyIndex, rawCategory);
    const description = typeof frontmatter.description === 'string' ? frontmatter.description.trim() : '';
    const difficulty = typeof frontmatter.difficulty === 'string' && frontmatter.difficulty.trim()
      ? frontmatter.difficulty.trim()
      : 'unknown';
    const trustValidation = validateTrust(frontmatter, note.area);
    const trust = {
      contract_state: trustValidation.state,
      verification_status: frontmatter.trust?.verification_status ?? 'UNVERIFIED',
    };
    const row = {
      id,
      area: note.area,
      slug: note.slug,
      title: typeof frontmatter.title === 'string' && frontmatter.title.trim()
        ? frontmatter.title.trim()
        : note.slug,
      description,
      difficulty,
      canonical_topics: classification.topic_id ? [classification.topic_id] : [],
      classification: {
        ...classification,
        raw_category: rawCategory == null ? null : String(rawCategory),
      },
      trust,
      freshness: freshnessState(frontmatter.trust, asOf),
      route: `/study/${note.area}/${note.slug}/`,
    };
    indexed.push(row);
    const stats = byArea[note.area];
    stats.total += 1;
    stats[classification.state] += 1;
    if (difficulty === 'unknown') stats.unknown_difficulty += 1;
    if (!description) stats.empty_description += 1;
  }
  indexed.sort((left, right) => left.id.localeCompare(right.id));
  const summary = {
    total: indexed.length,
    classified: byArea.papers.classified + byArea.projects.classified,
    unclassified: byArea.papers.unclassified + byArea.projects.unclassified,
    unknown_difficulty: byArea.papers.unknown_difficulty + byArea.projects.unknown_difficulty,
    empty_description: byArea.papers.empty_description + byArea.projects.empty_description,
  };
  const noteIds = new Set(indexed.map((note) => note.id));
  const missingCuratedAssignments = taxonomy.curated_assignments
    .map((assignment) => assignment.note_id)
    .filter((id) => !noteIds.has(id))
    .sort();
  const stats = { summary, by_area: byArea, missing_curated_assignments: missingCuratedAssignments };
  if (enforceBudgets) assertTaxonomyBudgets(stats, taxonomy.budgets);
  return {
    schema_version: NOTE_INDEX_SCHEMA_VERSION,
    taxonomy_version: taxonomy.schema_version,
    stats,
    notes: indexed,
  };
}

function partition(rows, size) {
  const parts = [];
  for (let index = 0; index < rows.length; index += size) parts.push(rows.slice(index, index + size));
  return parts;
}

export function planAtlasChunks(noteIndex, taxonomy, options = {}) {
  const chunkSize = options.chunkSize ?? taxonomy.chunk_size ?? DEFAULT_ATLAS_CHUNK_SIZE;
  if (!Number.isInteger(chunkSize) || chunkSize <= 0) reject('CHUNK_SIZE_INVALID', 'chunk size must be positive');
  const topicById = new Map(taxonomy.topics.map((topic) => [topic.id, topic]));
  const notes = noteIndex.notes.map((note) => ({ ...note }));
  const chunks = [];

  for (const area of NOTE_AREAS) {
    const areaNotes = notes.filter((note) => note.area === area);
    const groups = [];
    for (const topic of taxonomy.topics.filter((item) => item.area === area)) {
      const members = areaNotes.filter((note) => note.canonical_topics[0] === topic.id);
      if (members.length) groups.push({ kind: 'topic', topic, members });
    }
    const unknown = areaNotes.filter((note) => note.canonical_topics.length === 0);
    if (unknown.length) groups.push({ kind: 'unclassified', topic: null, members: unknown });

    for (const group of groups) {
      group.members.sort((left, right) => left.slug.localeCompare(right.slug));
      const pages = partition(group.members, chunkSize);
      pages.forEach((members, pageIndex) => {
        const base = group.kind === 'topic' ? `topic-${group.topic.id}` : 'unclassified';
        const id = `${base}-${String(pageIndex + 1).padStart(2, '0')}`;
        const route = `/study/atlas/${area}/${id}/`;
        const chunk = {
          id,
          area,
          kind: group.kind,
          topic_id: group.topic?.id ?? null,
          labels: group.topic?.labels ?? { zh: '暂未分类', en: 'Unclassified' },
          page: pageIndex + 1,
          pages: pages.length,
          route,
          note_ids: members.map((note) => note.id),
        };
        chunks.push(chunk);
        for (const member of members) {
          const target = notes.find((note) => note.id === member.id);
          target.atlas = { chunk_id: id, chunk_route: route };
        }
      });
    }
  }

  if (notes.some((note) => !note.atlas)) reject('CHUNK_ASSIGNMENT_MISSING', 'every note must belong to one Atlas chunk');
  const knownTopics = new Set(topicById.keys());
  if (notes.some((note) => note.canonical_topics.some((id) => !knownTopics.has(id)))) {
    reject('CHUNK_TOPIC_INVALID', 'note index contains an unknown canonical topic');
  }
  chunks.sort((left, right) => left.area.localeCompare(right.area) || left.id.localeCompare(right.id));
  return {
    note_index: { ...noteIndex, notes },
    chunks,
  };
}

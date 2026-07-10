import fs from 'node:fs';
import path from 'node:path';

export const NOTE_AREAS = Object.freeze(['papers', 'projects']);
export const SLUG_RE = /^[a-z0-9][a-z0-9._-]*$/;

export class NoteIdError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'NoteIdError';
    this.code = code;
  }
}

function reject(code, message) {
  throw new NoteIdError(code, message);
}

export function isNoteArea(area) {
  return NOTE_AREAS.includes(area);
}

export function isNoteSlug(slug) {
  return SLUG_RE.test(slug || '');
}

export function serializeNoteId(area, slug) {
  if (!isNoteArea(area)) reject('AREA_INVALID', `invalid note area: ${area || '<empty>'}`);
  if (!isNoteSlug(slug)) reject('SLUG_INVALID', `invalid note slug: ${slug || '<empty>'}`);
  return `${area}::${slug}`;
}

export function parseNoteId(value) {
  const match = String(value || '').match(/^(papers|projects)::([a-z0-9][a-z0-9._-]*)$/);
  if (!match) reject('NOTE_ID_INVALID', `invalid NoteId: ${value || '<empty>'}`);
  const [, area, slug] = match;
  return { id: `${area}::${slug}`, area, slug };
}

export function slugFromNoteFilename(filename) {
  const match = String(filename || '').match(/^([a-z0-9][a-z0-9._-]*)\.mdx?$/);
  if (!match) reject('NOTE_FILENAME_INVALID', `invalid note filename: ${filename || '<empty>'}`);
  return match[1];
}

export function parseWikilinkTarget(value) {
  const raw = String(value || '').trim();
  const explicit = raw.match(/^(papers|projects)([/:])([a-z0-9][a-z0-9._-]*)$/);
  if (explicit) {
    const [, area, separator, slug] = explicit;
    return {
      valid: true,
      kind: 'explicit',
      raw,
      area,
      slug,
      separator,
      id: serializeNoteId(area, slug),
    };
  }
  if (isNoteSlug(raw)) return { valid: true, kind: 'bare', raw, slug: raw };
  return { valid: false, kind: 'invalid', raw, reason: 'invalid wikilink target grammar' };
}

export function extractWikilinks(text) {
  const regex = /\[\[([^\]|\r\n]+?)(?:\|([^\]\r\n]+))?\]\]/g;
  const links = [];
  for (const match of String(text || '').matchAll(regex)) {
    const [full, rawTarget, rawDisplay] = match;
    links.push({
      full,
      index: match.index,
      end: match.index + full.length,
      target: rawTarget.trim(),
      display: rawDisplay == null ? null : rawDisplay.trim(),
      parsed: parseWikilinkTarget(rawTarget),
    });
  }
  return links;
}

export function createNoteIndex(entries) {
  const byId = new Map();
  const bySlug = new Map();
  const byArea = new Map(NOTE_AREAS.map((area) => [area, new Map()]));

  for (const entry of entries) {
    const parsed = typeof entry === 'string'
      ? parseNoteId(entry)
      : parseNoteId(entry?.id || serializeNoteId(entry?.area, entry?.slug));
    if (byId.has(parsed.id)) reject('NOTE_ID_DUPLICATE', `duplicate NoteId: ${parsed.id}`);
    const note = { ...(typeof entry === 'string' ? {} : entry), ...parsed };
    byId.set(note.id, note);
    byArea.get(note.area).set(note.slug, note);
    if (!bySlug.has(note.slug)) bySlug.set(note.slug, new Map());
    bySlug.get(note.slug).set(note.area, note);
  }

  return { byId, bySlug, byArea };
}

export function loadNoteRecords({ docsDir, readContent = false }) {
  const records = [];
  for (const area of NOTE_AREAS) {
    const areaDir = path.join(docsDir, area);
    if (!fs.existsSync(areaDir)) continue;
    for (const filename of fs.readdirSync(areaDir).filter((name) => /\.mdx?$/.test(name)).sort()) {
      const slug = slugFromNoteFilename(filename);
      const filePath = path.join(areaDir, filename);
      records.push({
        id: serializeNoteId(area, slug),
        area,
        slug,
        filename,
        path: filePath,
        ...(readContent ? { content: fs.readFileSync(filePath, 'utf8') } : {}),
      });
    }
  }
  return records;
}

export function loadAliasConfig(aliasPath) {
  const parsed = JSON.parse(fs.readFileSync(aliasPath, 'utf8'));
  if (parsed?.version !== 1 || !Array.isArray(parsed.aliases)) {
    reject('ALIASES_INVALID', 'wikilink alias config must use version 1 with an aliases array');
  }
  return parsed.aliases;
}

export function createAliasIndex(records, noteIndex) {
  if (!Array.isArray(records)) reject('ALIASES_INVALID', 'wikilink aliases must be an array');
  const direct = new Map();

  for (const record of records) {
    const from = parseNoteId(record?.from).id;
    const to = parseNoteId(record?.to).id;
    if (noteIndex.byId.has(from)) reject('ALIAS_COLLIDES_WITH_NOTE', `alias collides with an existing note: ${from}`);
    if (direct.has(from)) reject('ALIAS_AMBIGUOUS', `alias has multiple definitions: ${from}`);
    direct.set(from, to);
  }

  const resolved = new Map();
  const resolving = new Set();

  function resolveAlias(id) {
    if (resolved.has(id)) return resolved.get(id);
    if (resolving.has(id)) reject('ALIAS_CYCLE', `wikilink alias cycle includes: ${id}`);
    const next = direct.get(id);
    if (!next) reject('ALIAS_TARGET_MISSING', `wikilink alias target is missing: ${id}`);
    resolving.add(id);
    const target = noteIndex.byId.has(next) ? next : resolveAlias(next);
    resolving.delete(id);
    resolved.set(id, target);
    return target;
  }

  for (const id of direct.keys()) resolveAlias(id);

  const bySlug = new Map();
  for (const [from, target] of resolved) {
    const alias = parseNoteId(from);
    if (!bySlug.has(alias.slug)) bySlug.set(alias.slug, new Map());
    bySlug.get(alias.slug).set(alias.area, target);
  }
  return { direct, resolved, bySlug };
}

function resolvedNote(noteIndex, id, resolution, aliasId = null) {
  const note = noteIndex.byId.get(id);
  return {
    ok: true,
    id: note.id,
    area: note.area,
    slug: note.slug,
    resolution,
    ...(aliasId ? { alias_id: aliasId } : {}),
  };
}

export function resolveWikilink(target, { sourceArea = null, noteIndex, aliasIndex = null } = {}) {
  const parsed = typeof target === 'string' ? parseWikilinkTarget(target) : target;
  if (!parsed?.valid) {
    return { ok: false, slug: parsed?.raw || String(target || ''), reason: 'invalid target grammar' };
  }

  if (parsed.kind === 'explicit') {
    if (noteIndex.byId.has(parsed.id)) return resolvedNote(noteIndex, parsed.id, 'direct');
    const aliasTarget = aliasIndex?.resolved.get(parsed.id);
    if (aliasTarget) return resolvedNote(noteIndex, aliasTarget, 'alias', parsed.id);
    return { ok: false, slug: parsed.slug, area: parsed.area, reason: `missing namespace target ${parsed.area}/${parsed.slug}` };
  }

  const directAreas = noteIndex.bySlug.get(parsed.slug);
  if (sourceArea && directAreas?.has(sourceArea)) {
    return resolvedNote(noteIndex, directAreas.get(sourceArea).id, 'same-area');
  }
  if (directAreas?.size === 1) {
    return resolvedNote(noteIndex, [...directAreas.values()][0].id, 'unique');
  }
  if (directAreas?.size > 1) {
    return {
      ok: false,
      slug: parsed.slug,
      reason: `ambiguous target: ${[...directAreas.keys()].sort().join(', ')}; use an explicit namespace`,
    };
  }

  const aliases = aliasIndex?.bySlug.get(parsed.slug);
  if (sourceArea && aliases?.has(sourceArea)) {
    const aliasId = serializeNoteId(sourceArea, parsed.slug);
    return resolvedNote(noteIndex, aliases.get(sourceArea), 'alias', aliasId);
  }
  if (aliases?.size) {
    const targets = new Set(aliases.values());
    if (targets.size === 1) {
      const aliasId = serializeNoteId([...aliases.keys()].sort()[0], parsed.slug);
      return resolvedNote(noteIndex, [...targets][0], 'alias', aliasId);
    }
    return { ok: false, slug: parsed.slug, reason: 'ambiguous alias target; use an explicit namespace' };
  }

  return { ok: false, slug: parsed.slug, reason: 'missing target' };
}

export function formatWikilinkTarget(noteId, { noteIndex, forceNamespace = false } = {}) {
  const note = parseNoteId(typeof noteId === 'string' ? noteId : noteId.id);
  const duplicate = (noteIndex.bySlug.get(note.slug)?.size || 0) > 1;
  return forceNamespace || duplicate ? `${note.area}/${note.slug}` : note.slug;
}

const MAX_CITATIONS = 5;
const HIGH_CONFIDENCE = 0.85;

function firstValue(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== '');
}

function compactObject(value) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined && item !== null && item !== ''));
}

function asArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (Array.isArray(value.results)) return value.results;
  if (Array.isArray(value.items)) return value.items;
  if (Array.isArray(value.papers)) return value.papers;
  if (Array.isArray(value.data)) return value.data;
  if (Array.isArray(value.works)) return value.works;
  return [];
}

function toNumber(value) {
  if (value === undefined || value === null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function toYear(value) {
  const direct = toNumber(value);
  if (direct && direct >= 1000 && direct <= 3000) return direct;
  const match = String(value ?? '').match(/\b(19|20)\d{2}\b/);
  return match ? Number(match[0]) : null;
}

export function parseJsonResult(raw, source = 'json') {
  if (raw === undefined || raw === null || raw === '') return null;
  if (typeof raw !== 'string') return raw;
  try {
    return JSON.parse(raw);
  } catch (error) {
    error.message = `${source}: ${error.message}`;
    throw error;
  }
}

export function normalizeDoi(value) {
  if (!value) return null;
  return String(value)
    .trim()
    .replace(/^https?:\/\/(dx\.)?doi\.org\//i, '')
    .replace(/^doi:/i, '')
    .trim()
    .toLowerCase() || null;
}

export function normalizeOpenAlexId(value) {
  if (!value) return null;
  const match = String(value).trim().match(/(?:openalex\.org\/)?(W\d+)/i);
  return match ? `W${match[1].slice(1)}` : null;
}

export function normalizeAuthors(authors) {
  if (!authors) return [];
  if (typeof authors === 'string') return authors.split(/\s*,\s*|\s+and\s+/i).map((item) => item.trim()).filter(Boolean);
  if (!Array.isArray(authors)) return [];
  return authors.map((author) => {
    if (typeof author === 'string') return author;
    return firstValue(author.display_name, author.name, author.author?.display_name, author.author?.name, author.fullName);
  }).filter(Boolean);
}

export function slugifyTitle(title, year = null) {
  const words = String(title ?? '')
    .normalize('NFKD')
    .replace(/['"]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter((word) => word && !['the', 'a', 'an', 'of', 'and', 'to', 'for', 'in', 'on'].includes(word))
    .slice(0, 7);
  if (!words.length) return '';
  if (year && !words.includes(String(year))) words.push(String(year));
  return words.join('-');
}

export function normalizePaperRecord(record = {}, source = 'unknown') {
  const ids = record.ids || record.externalIds || record.external_ids || {};
  const meta = record.meta || {};
  const title = firstValue(record.title, record.display_name, record.name, meta.title);
  const year = toYear(firstValue(record.year, record.publication_year, record.publishedDate, record.date, meta.year));
  return compactObject({
    title,
    authors: normalizeAuthors(firstValue(record.authors, record.authorships, meta.authors)),
    year,
    doi: normalizeDoi(firstValue(record.doi, ids.doi, ids.DOI, meta.doi)),
    openalex_id: normalizeOpenAlexId(firstValue(record.openalex_id, record.openAlexId, record.openalex, ids.openalex, ids.openAlex, record.id)),
    url: firstValue(record.url, record.landingPageUrl, record.landing_page_url, record.link, record.primary_location?.landing_page_url),
    pdf_url: firstValue(record.pdfUrl, record.pdf_url, record.openAccessPdf?.url, record.best_oa_location?.pdf_url),
    citation_count: toNumber(firstValue(record.citationCount, record.citation_count, record.cited_by_count, record.citations)),
    venue: firstValue(record.venue, record.source, record.host_venue?.display_name, record.primary_location?.source?.display_name),
    resource_id: firstValue(record.resource_id, record.resourceId, record.libraryResourceId, record.library_resource_id),
    source,
  });
}

export function normalizeLrSearchResults(raw) {
  return asArray(parseJsonResult(raw, 'lr search'))
    .map((item) => normalizePaperRecord(item, 'lr-search'))
    .filter((item) => item.title || item.doi || item.openalex_id);
}

function mergePaperRecords(...records) {
  const merged = {};
  for (const record of records) {
    for (const [key, value] of Object.entries(record || {})) {
      if (value !== undefined && value !== null && value !== '') merged[key] = value;
    }
  }
  return compactObject(merged);
}

function normalizeOpenAlexWork(work = {}) {
  const paper = normalizePaperRecord({
    ...work,
    title: work.title || work.display_name,
    year: work.publication_year,
    authors: work.authorships,
    citationCount: work.cited_by_count,
    url: firstValue(work.primary_location?.landing_page_url, work.url, work.id),
    pdfUrl: firstValue(work.best_oa_location?.pdf_url, work.primary_location?.pdf_url),
    venue: firstValue(work.primary_location?.source?.display_name, work.host_venue?.display_name),
  }, 'openalex');
  return {
    paper,
    referenced_work_ids: Array.isArray(work.referenced_works) ? work.referenced_works.map(normalizeOpenAlexId).filter(Boolean) : [],
    cited_by_api_url: work.cited_by_api_url || null,
  };
}

function normalizeCitationRecord(record = {}, source = 'unknown', confidence = 0.7) {
  const paper = normalizePaperRecord(record, source);
  const title = paper.title || record.display_name;
  if (!title) return null;
  const year = paper.year || toYear(record.year);
  return compactObject({
    title,
    year,
    slug: record.slug || slugifyTitle(title, year),
    source,
    confidence,
    doi: paper.doi,
    openalex_id: paper.openalex_id,
    citation_count: paper.citation_count,
    url: paper.url,
  });
}

export function extractReferencesSection(markdown = '') {
  const lines = String(markdown).split(/\r?\n/);
  const start = lines.findIndex((line) =>
    /^\s{0,3}#{1,4}\s*(references|bibliography|参考文献)\b/i.test(line) ||
    /^\s*(references|bibliography|参考文献)\s*$/i.test(line)
  );
  if (start < 0) return '';
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^\s{0,3}#{1,3}\s+\S/.test(lines[index]) && index > start + 3) {
      end = index;
      break;
    }
  }
  return lines.slice(start + 1, end).join('\n').trim();
}

function startsReference(line) {
  return /^\s*(?:\[\d+\]|\d+[.)]|-\s+|\*\s+)/.test(line);
}

function cleanReferenceText(text) {
  return String(text)
    .replace(/\[[^\]]+\]\(([^)]+)\)/g, '$1')
    .replace(/\s+/g, ' ')
    .replace(/^\s*(?:\[\d+\]|\d+[.)]|-\s+|\*\s+)/, '')
    .trim();
}

function extractReferenceTitle(entry, year) {
  const quoted = entry.match(/[“"]([^”"]{8,})[”"]/);
  if (quoted) return quoted[1].trim();
  if (year) {
    const afterYear = entry.slice(entry.indexOf(String(year)) + 4).replace(/^[).,;:\s-]+/, '');
    const candidate = afterYear.match(/^(.{8,}?)(?:\.\s+[A-Z(]|\.\s*$)/)?.[1]?.trim() || afterYear.trim();
    if (candidate.split(/\s+/).length >= 3) return candidate;
  }
  const parts = entry.split(/\.\s+/).map((part) => part.trim()).filter(Boolean);
  return parts.find((part) => part.split(/\s+/).length >= 3 && !/\b(19|20)\d{2}\b/.test(part)) || '';
}

export function parseReferences(section = '', options = {}) {
  const { limit = MAX_CITATIONS } = options;
  const entries = [];
  let current = '';
  for (const rawLine of String(section).split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    if (startsReference(line) && current) {
      entries.push(current);
      current = line;
    } else {
      current = current ? `${current} ${line}` : line;
    }
  }
  if (current) entries.push(current);
  return entries
    .map(cleanReferenceText)
    .map((entry) => {
      const year = toYear(entry);
      const title = extractReferenceTitle(entry, year);
      return title ? normalizeCitationRecord({ title, year }, 'references', 0.7) : null;
    })
    .filter(Boolean)
    .slice(0, limit);
}

function dedupeCitations(citations) {
  const seen = new Set();
  const result = [];
  for (const citation of citations) {
    const key = (citation.openalex_id || citation.doi || citation.title || '').toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(citation);
  }
  return result;
}

function buildLinkableSlugs(citations, writtenText = '') {
  const written = new Set(String(writtenText).split(/\r?\n/).map((line) => line.trim()).filter(Boolean));
  const result = [];
  const seen = new Set();
  for (const citation of citations) {
    if (!citation.slug || seen.has(citation.slug)) continue;
    if (written.has(citation.slug) || citation.confidence >= HIGH_CONFIDENCE) {
      seen.add(citation.slug);
      result.push(citation.slug);
    }
  }
  return result.slice(0, 10);
}

export function formatManualCitation(paper = {}) {
  const authors = paper.authors?.length ? paper.authors.slice(0, 3).join(', ') : 'Unknown author';
  const title = paper.title || 'Untitled paper';
  const venue = paper.venue ? `${paper.venue} ` : '';
  const year = paper.year ? `${paper.year}` : 'n.d.';
  return `${authors}. "${title}". ${venue}${year}`.trim();
}

async function runCommand(runner, command, args) {
  const result = await runner(command, args);
  return typeof result === 'string' ? result : result?.stdout ?? '';
}

export async function maybeFormatCitation({ paper, runner, warnings }) {
  if (!paper.resource_id) {
    warnings.push('cite-format-skipped-missing-resource-id');
    return { source_text: formatManualCitation(paper), used_manual: true };
  }
  try {
    const raw = await runCommand(runner, 'lr', ['cite', 'format', paper.resource_id, '--style', 'apa', '--format', 'json']);
    const parsed = parseJsonResult(raw, 'lr cite format');
    const sourceText = firstValue(parsed?.citation, parsed?.formatted, parsed?.text, parsed?.data?.citation, parsed);
    if (typeof sourceText === 'string' && sourceText.trim()) return { source_text: sourceText.trim(), used_manual: false };
  } catch (error) {
    warnings.push(`cite-format-failed: ${error.message}`);
  }
  return { source_text: formatManualCitation(paper), used_manual: true };
}

async function fetchJson(fetchImpl, url) {
  const response = await fetchImpl(url);
  if (!response.ok) throw new Error(`OpenAlex request failed (${response.status})`);
  return response.json();
}

function withApiKey(url, apiKey) {
  const parsed = new URL(url);
  parsed.searchParams.set('api_key', apiKey);
  return parsed.toString();
}

async function fetchWorksByIds(ids, apiKey, fetchImpl) {
  const works = [];
  for (const id of ids.slice(0, MAX_CITATIONS)) {
    try {
      works.push(await fetchJson(fetchImpl, withApiKey(`https://api.openalex.org/works/${id}`, apiKey)));
    } catch {
      // A missing referenced work should not fail the whole paper context.
    }
  }
  return works;
}

async function fetchOpenAlexContext({ paper, title, apiKey, fetchImpl, warnings }) {
  if (!apiKey) {
    warnings.push('openalex-skipped-missing-key');
    return { paper: {}, citations_in: [], citations_out: [] };
  }
  let workUrl;
  if (paper.openalex_id) workUrl = `https://api.openalex.org/works/${paper.openalex_id}`;
  else if (paper.doi) workUrl = `https://api.openalex.org/works/doi:${encodeURIComponent(paper.doi)}`;
  else {
    const url = new URL('https://api.openalex.org/works');
    url.searchParams.set('search', title);
    url.searchParams.set('per-page', '1');
    workUrl = url.toString();
  }

  const rawWork = await fetchJson(fetchImpl, withApiKey(workUrl, apiKey));
  const work = rawWork.results ? rawWork.results[0] : rawWork;
  if (!work) return { paper: {}, citations_in: [], citations_out: [] };
  const normalized = normalizeOpenAlexWork(work);
  const citedByUrl = normalized.cited_by_api_url
    ? withApiKey(`${normalized.cited_by_api_url}${normalized.cited_by_api_url.includes('?') ? '&' : '?'}per-page=${MAX_CITATIONS}&sort=cited_by_count:desc`, apiKey)
    : null;
  const citedBy = citedByUrl ? asArray(await fetchJson(fetchImpl, citedByUrl)).map((item) => normalizeCitationRecord(item, 'openalex', 0.9)).filter(Boolean) : [];
  const references = (await fetchWorksByIds(normalized.referenced_work_ids, apiKey, fetchImpl))
    .map((item) => normalizeCitationRecord(item, 'openalex', 0.9))
    .filter(Boolean);
  return {
    paper: normalized.paper,
    citations_in: dedupeCitations(citedBy).slice(0, MAX_CITATIONS),
    citations_out: dedupeCitations(references).slice(0, MAX_CITATIONS),
  };
}

async function runLrSearch({ title, runner, warnings }) {
  try {
    const raw = await runCommand(runner, 'lr', ['search', title, '--format', 'json', '--limit', '3']);
    return normalizeLrSearchResults(raw);
  } catch (error) {
    warnings.push(`lr-search-failed: ${error.message}`);
    return [];
  }
}

async function runLrGraph({ title, openalexId, runner, warnings }) {
  let seedId = openalexId;
  try {
    if (!seedId) {
      const raw = await runCommand(runner, 'lr', ['graph', 'search', title, '--format', 'json']);
      seedId = asArray(parseJsonResult(raw, 'lr graph search')).map((item) => normalizePaperRecord(item, 'lr-graph-search')).find((item) => item.openalex_id)?.openalex_id || null;
    }
    if (!seedId) {
      warnings.push('lr-graph-skipped-missing-openalex-id');
      return { citations_in: [], citations_out: [] };
    }
    const raw = await runCommand(runner, 'lr', ['graph', 'build', seedId, '--wait', '--format', 'json']);
    const root = parseJsonResult(raw, 'lr graph') || {};
    const citationsIn = asArray(root.citations_in || root.cited_by || root.graph?.citations_in).map((item) => normalizeCitationRecord(item, 'lr-graph', 0.85)).filter(Boolean);
    const citationsOut = asArray(root.citations_out || root.references || root.graph?.citations_out).map((item) => normalizeCitationRecord(item, 'lr-graph', 0.85)).filter(Boolean);
    if (!citationsIn.length && !citationsOut.length) warnings.push('lr-graph-empty');
    return { citations_in: dedupeCitations(citationsIn).slice(0, MAX_CITATIONS), citations_out: dedupeCitations(citationsOut).slice(0, MAX_CITATIONS) };
  } catch (error) {
    warnings.push(`lr-graph-failed: ${error.message}`);
    return { citations_in: [], citations_out: [] };
  }
}

export async function buildPaperContext(input, deps = {}) {
  const runner = deps.runner || (async () => { throw new Error('runner not configured'); });
  const fetchImpl = deps.fetchImpl || globalThis.fetch;
  const warnings = [];
  const fallbackUsed = new Set();
  let paper = compactObject({ title: input.title, year: toYear(input.year), url: input.url });

  const lrPaper = (await runLrSearch({ title: input.title, runner, warnings }))[0] || {};
  paper = mergePaperRecords(paper, lrPaper);

  let openalex = { paper: {}, citations_in: [], citations_out: [] };
  try {
    openalex = await fetchOpenAlexContext({ paper, title: input.title, apiKey: input.apiKey, fetchImpl, warnings });
    if (Object.keys(openalex.paper).length) fallbackUsed.add('openalex');
    paper = mergePaperRecords(paper, openalex.paper);
  } catch (error) {
    warnings.push(`openalex-failed: ${error.message}`);
  }

  const graph = await runLrGraph({ title: input.title, openalexId: paper.openalex_id, runner, warnings });
  if (graph.citations_in.length || graph.citations_out.length) fallbackUsed.add('lr-graph');

  const referenceCitations = parseReferences(extractReferencesSection(input.fullMarkdown || ''));
  if (referenceCitations.length) fallbackUsed.add('references');
  else warnings.push('references-empty');

  const citationFormat = await maybeFormatCitation({ paper, runner, warnings });
  if (citationFormat.used_manual) fallbackUsed.add('manual-citation');

  const citationsIn = dedupeCitations([...graph.citations_in, ...openalex.citations_in]).slice(0, MAX_CITATIONS);
  const citationsOut = dedupeCitations([...graph.citations_out, ...openalex.citations_out, ...referenceCitations]).slice(0, MAX_CITATIONS);
  return {
    slug: input.slug,
    paper: {
      title: paper.title || input.title,
      authors: paper.authors || [],
      year: paper.year || toYear(input.year),
      doi: paper.doi || null,
      openalex_id: paper.openalex_id || null,
      url: paper.url || input.url || null,
      pdf_url: paper.pdf_url || null,
      citation_count: paper.citation_count ?? null,
    },
    citations_in: citationsIn,
    citations_out: citationsOut,
    linkable_slugs: buildLinkableSlugs([...citationsIn, ...citationsOut], input.writtenText || ''),
    source_text: citationFormat.source_text,
    fallback_used: [...fallbackUsed],
    warnings,
  };
}

import fs from 'node:fs/promises';
import path from 'node:path';

import { auditContentContract, validateTrust } from '../audit-content-contract.mjs';
import { parseFrontmatterLoose } from './frontmatter.mjs';
import {
  classifyFreshness,
  resolveFreshnessAsOf,
} from './freshness.mjs';
import { atomicWriteFile, readJson } from './json-store.mjs';
import {
  expectedSourceRevision,
  readReceipt,
  receiptPath,
  verifyReceiptAgainstNote,
} from './review-receipt.mjs';
import { DATA_DIR, DOCS_DIR, ROOT } from './paths.mjs';

export const LEARNING_PATHS_SCHEMA_VERSION = 'study-learning-paths-v1';
export const LEARNING_PATHS_PATH = path.join(DATA_DIR, 'learning-paths.json');

export const LEARNING_PATH_MARKERS = {
  home: 'STUDY:LEARNING_PATHS:HOME',
  start: 'STUDY:LEARNING_PATHS:START',
  topic: {
    'frontend-foundations': 'STUDY:LEARNING_PATHS:TOPIC:FRONTEND',
    'ai-agent-foundations': 'STUDY:LEARNING_PATHS:TOPIC:AI_AGENT',
    'distributed-systems-foundations': 'STUDY:LEARNING_PATHS:TOPIC:DISTRIBUTED_SYSTEMS',
  },
};

const TOPIC_PAGE_BY_PATH = {
  'frontend-foundations': 'topics/frontend.md',
  'ai-agent-foundations': 'topics/ai-agent.md',
  'distributed-systems-foundations': 'topics/distributed-systems.md',
};

const MATURITY = new Set(['legacy-entry', 'published-legacy', 'certified']);
const ID_RE = /^[a-z0-9][a-z0-9-]*$/;
const STEP_KIND = new Set(['note']);
const CANONICAL_ROUTES = new Map([
  ['papers/react', '/study/papers/react/'],
  ['papers/raft', '/study/papers/raft/'],
]);

function html(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function markdownFileCandidates(rootDir, noteRef) {
  return ['.md', '.mdx'].map((extension) => (
    path.join(rootDir, 'src', 'content', 'docs', `${noteRef}${extension}`)
  ));
}

function posixRelative(rootDir, filePath) {
  return path.relative(rootDir, filePath).split(path.sep).join('/');
}

function areaFromNoteRef(noteRef) {
  const [area] = String(noteRef).split('/');
  if (area !== 'projects' && area !== 'papers') return null;
  return area;
}

export function routeForNoteRef(noteRef) {
  const normalized = String(noteRef ?? '').replace(/^\/+|\/+$/g, '');
  const area = areaFromNoteRef(normalized);
  if (!area || normalized.split('/').length !== 2) {
    throw new Error(`invalid note_ref: ${noteRef}`);
  }
  return `/study/${normalized}/`;
}

export async function resolveNoteRef(rootDir, noteRef) {
  const normalized = String(noteRef ?? '').replace(/^\/+|\/+$/g, '');
  const area = areaFromNoteRef(normalized);
  const slug = normalized.split('/')[1];
  if (!area || !slug || normalized.split('/').length !== 2) {
    return { ok: false, reason: 'invalid-note-ref', noteRef: normalized };
  }
  for (const filePath of markdownFileCandidates(rootDir, normalized)) {
    try {
      const stats = await fs.stat(filePath);
      if (stats.isFile()) {
        return {
          ok: true,
          area,
          slug,
          noteRef: normalized,
          path: filePath,
          route: routeForNoteRef(normalized),
        };
      }
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  return { ok: false, area, slug, noteRef: normalized, reason: 'missing-note-file' };
}

export function topicRouteToFile(rootDir, topicRoute) {
  const route = String(topicRoute ?? '');
  const match = route.match(/^\/study\/topics\/([a-z0-9-]+)\/$/);
  if (!match) return null;
  return path.join(rootDir, 'src', 'content', 'docs', 'topics', `${match[1]}.md`);
}

function pathLabelForFooter(pathModel) {
  return pathModel.title.endsWith('路线') ? pathModel.title : `${pathModel.title}路线`;
}

function noteKindLabel(noteRef) {
  return areaFromNoteRef(noteRef) === 'projects' ? '项目' : '论文';
}

function requiredStepList(pathModel) {
  return pathModel.steps.filter((step) => step.required);
}

export async function loadLearningPaths(options = {}) {
  const rootDir = path.resolve(options.rootDir ?? ROOT);
  return readJson(options.path ?? path.join(rootDir, 'data', 'learning-paths.json'));
}

function validateShape(data, failures) {
  if (data?.schema_version !== LEARNING_PATHS_SCHEMA_VERSION) {
    failures.push(`data/learning-paths.json: schema_version must be ${LEARNING_PATHS_SCHEMA_VERSION}`);
  }
  if (!Array.isArray(data?.paths)) {
    failures.push('data/learning-paths.json: paths must be an array');
    return;
  }
  const pathIds = new Set();
  const stepIds = new Set();
  for (const pathModel of data.paths) {
    if (!ID_RE.test(pathModel?.id ?? '')) failures.push(`invalid path id: ${pathModel?.id ?? '<missing>'}`);
    if (pathIds.has(pathModel.id)) failures.push(`duplicate path id: ${pathModel.id}`);
    pathIds.add(pathModel.id);
    if (!MATURITY.has(pathModel.maturity)) failures.push(`${pathModel.id}: invalid maturity ${pathModel.maturity}`);
    for (const key of ['title', 'audience', 'outcome', 'topic_route', 'home_chip', 'home_summary', 'sequence_label', 'start_label']) {
      if (typeof pathModel[key] !== 'string' || !pathModel[key].trim()) {
        failures.push(`${pathModel.id}: ${key} must be a non-empty string`);
      }
    }
    if (!Array.isArray(pathModel.steps) || pathModel.steps.length < 3) {
      failures.push(`${pathModel.id}: must define at least 3 steps`);
      continue;
    }
    if (requiredStepList(pathModel).length < 3) failures.push(`${pathModel.id}: must define at least 3 required steps`);
    for (const step of pathModel.steps) {
      if (!ID_RE.test(step?.id ?? '')) failures.push(`${pathModel.id}: invalid step id ${step?.id ?? '<missing>'}`);
      if (stepIds.has(step.id)) failures.push(`duplicate step id: ${step.id}`);
      stepIds.add(step.id);
      if (!STEP_KIND.has(step.kind)) failures.push(`${pathModel.id}/${step.id}: invalid kind ${step.kind}`);
      if (typeof step.note_ref !== 'string' || !step.note_ref.trim()) {
        failures.push(`${pathModel.id}/${step.id}: note_ref must be a non-empty string`);
      }
      if (typeof step.required !== 'boolean') failures.push(`${pathModel.id}/${step.id}: required must be boolean`);
      for (const key of ['title', 'role', 'summary', 'why']) {
        if (typeof step[key] !== 'string' || !step[key].trim()) {
          failures.push(`${pathModel.id}/${step.id}: ${key} must be a non-empty string`);
        }
      }
    }
  }
}

async function validateCertifiedStep(rootDir, pathModel, step, resolved, failures) {
  const text = await fs.readFile(resolved.path, 'utf8');
  const frontmatter = parseFrontmatterLoose(text);
  const trust = validateTrust(frontmatter, resolved.area);
  if (trust.state !== 'v2') {
    failures.push(`${pathModel.id}/${step.id}: certified required note is not study-v2`);
    return;
  }

  const receiptsRoot = path.join(rootDir, 'data', 'review-receipts');
  const receipt = await readReceipt(receiptPath(receiptsRoot, resolved.area, resolved.slug)).catch((error) => {
    failures.push(`${pathModel.id}/${step.id}: review receipt missing or unreadable (${error.code ?? error.message})`);
    return null;
  });
  if (!receipt) return;

  const checked = await verifyReceiptAgainstNote(receipt, text, {
    area: resolved.area,
    slug: resolved.slug,
    sourceRevision: expectedSourceRevision(trust.trust),
    evidenceType: trust.trust.evidence_type,
    rootDir,
  });
  if (!checked.ok) {
    failures.push(`${pathModel.id}/${step.id}: review receipt is stale or invalid`);
  }

  const freshnessPolicy = await readJson(path.join(rootDir, 'data', 'freshness-policy.json'));
  const officialSourceRegistry = await readJson(path.join(rootDir, 'data', 'official-source-registry.json'));
  const asOf = resolveFreshnessAsOf({
    envAsOf: process.env.STUDY_FRESHNESS_AS_OF,
    policy: freshnessPolicy,
  });
  const freshness = classifyFreshness(frontmatter, {
    asOf: asOf.value,
    policy: freshnessPolicy,
    officialSourceRegistry,
  });
  if (freshness.status !== 'current') {
    failures.push(`${pathModel.id}/${step.id}: certified required note freshness is ${freshness.status}`);
  }
}

export async function validateLearningPaths(options = {}) {
  const rootDir = path.resolve(options.rootDir ?? ROOT);
  const data = options.data ?? await loadLearningPaths({ rootDir });
  const failures = [];
  validateShape(data, failures);
  if (failures.length) return { ok: false, failures, data };

  const contentContract = await auditContentContract({ rootDir });
  if (contentContract.summary.blocking > 0) {
    failures.push('content contract has blocking findings; certified rules cannot be trusted');
  }

  for (const pathModel of data.paths) {
    const topicFile = topicRouteToFile(rootDir, pathModel.topic_route);
    if (!topicFile) failures.push(`${pathModel.id}: invalid topic_route ${pathModel.topic_route}`);
    else {
      try {
        const stats = await fs.stat(topicFile);
        if (!stats.isFile()) failures.push(`${pathModel.id}: topic route file is not a file`);
      } catch {
        failures.push(`${pathModel.id}: topic route does not resolve to a page`);
      }
    }

    for (const step of pathModel.steps) {
      const resolved = await resolveNoteRef(rootDir, step.note_ref);
      if (!resolved.ok) {
        failures.push(`${pathModel.id}/${step.id}: ${resolved.reason} ${step.note_ref}`);
        continue;
      }
      const route = routeForNoteRef(step.note_ref);
      if (CANONICAL_ROUTES.has(step.note_ref) && CANONICAL_ROUTES.get(step.note_ref) !== route) {
        failures.push(`${pathModel.id}/${step.id}: canonical route drift for ${step.note_ref}`);
      }
      if (pathModel.maturity === 'certified' && step.required) {
        await validateCertifiedStep(rootDir, pathModel, step, resolved, failures);
      }
    }
  }

  return { ok: failures.length === 0, failures, data };
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

export function renderHomeLearningPaths(paths) {
  const cards = paths.map((pathModel) => `<a class="study-path-card" href="${pathModel.topic_route}">
<span class="study-chip">${html(pathModel.home_chip)}</span>
<h3>${html(pathModel.title)}</h3>
<p>${html(pathModel.home_summary)}</p>
<footer>先读：${html(pathModel.sequence_label)}</footer>
</a>`).join('\n');
  return `<div class="study-card-grid">${cards}
</div>`;
}

export function renderStartLearningPaths(paths) {
  const cards = paths.map((pathModel) => {
    const items = pathModel.steps.map((step) => (
      `<li><a href="${routeForNoteRef(step.note_ref)}">${html(step.title)}</a>：${html(step.summary)}</li>`
    )).join('\n');
    return `<article class="study-path-card">
<span class="study-chip">${html(pathModel.start_label)}</span>
<h3>${html(pathModel.title)}</h3>
<p><strong>适合谁：</strong>${html(pathModel.audience)}</p>
<div>
<strong>先读哪几篇：</strong>
<ol>
${items}
</ol>
</div>
<p><strong>读完能做什么：</strong>${html(pathModel.outcome)}</p>
<footer><a href="${pathModel.topic_route}">进入完整的${html(pathLabelForFooter(pathModel))}</a></footer>
</article>`;
  }).join('\n');
  return `<div class="study-card-grid">${cards}
</div>`;
}

export function renderTopicLearningPath(pathModel) {
  const cards = pathModel.steps.map((step) => `<a class="study-note-card" href="${routeForNoteRef(step.note_ref)}">
<div class="study-meta-row"><span>${noteKindLabel(step.note_ref)}</span><span>${step.required ? 'Pillar' : 'Optional'}</span><span>${html(step.role)}</span></div>
<h3>${html(step.title)}</h3>
<p>${html(step.summary)}</p>
<div class="study-why">${html(step.why)}</div>
</a>`).join('\n');
  return `<div class="study-card-grid">${cards}
</div>`;
}

export async function buildLearningPathArtifacts(options = {}) {
  const rootDir = path.resolve(options.rootDir ?? ROOT);
  const data = options.data ?? await loadLearningPaths({ rootDir });
  const files = new Map();
  const docsDir = path.join(rootDir, 'src', 'content', 'docs');
  const homePath = path.join(docsDir, 'index.md');
  const startPath = path.join(docsDir, 'start.md');

  files.set(
    homePath,
    replaceMarkerBlock(
      await fs.readFile(homePath, 'utf8'),
      LEARNING_PATH_MARKERS.home,
      renderHomeLearningPaths(data.paths),
    ),
  );
  files.set(
    startPath,
    replaceMarkerBlock(
      await fs.readFile(startPath, 'utf8'),
      LEARNING_PATH_MARKERS.start,
      renderStartLearningPaths(data.paths),
    ),
  );

  for (const pathModel of data.paths) {
    const relativePage = TOPIC_PAGE_BY_PATH[pathModel.id];
    const marker = LEARNING_PATH_MARKERS.topic[pathModel.id];
    if (!relativePage || !marker) continue;
    const filePath = path.join(docsDir, relativePage);
    files.set(
      filePath,
      replaceMarkerBlock(
        await fs.readFile(filePath, 'utf8'),
        marker,
        renderTopicLearningPath(pathModel),
      ),
    );
  }

  return { data, files };
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

function pageCanonicalFailures(rootDir, data, files) {
  const failures = [];
  const checked = [
    'src/content/docs/index.md',
    'src/content/docs/start.md',
    'src/content/docs/topics/frontend.md',
    'src/content/docs/topics/ai-agent.md',
    'src/content/docs/topics/distributed-systems.md',
  ];
  for (const [filePath, content] of files) {
    const rel = posixRelative(rootDir, filePath);
    if (!checked.includes(rel)) continue;
    if (content.includes('/study/papers/react-agent/')) failures.push(`${rel}: formal entry still links react-agent`);
    if (content.includes('/study/papers/raft-2014/')) failures.push(`${rel}: formal entry still links raft-2014`);
  }
  for (const pathModel of data.paths) {
    for (const step of pathModel.steps) {
      if (step.note_ref === 'papers/react' && routeForNoteRef(step.note_ref) !== '/study/papers/react/') {
        failures.push('ReAct canonical route drift');
      }
      if (step.note_ref === 'papers/raft' && routeForNoteRef(step.note_ref) !== '/study/papers/raft/') {
        failures.push('Raft canonical route drift');
      }
    }
  }
  return failures;
}

export async function runLearningPathSync(options = {}) {
  const rootDir = path.resolve(options.rootDir ?? ROOT);
  const validation = await validateLearningPaths({ rootDir });
  const artifacts = await buildLearningPathArtifacts({ rootDir, data: validation.data });
  const changed = [];
  const stale = [];
  const failures = [...validation.failures, ...pageCanonicalFailures(rootDir, validation.data, artifacts.files)];

  for (const [filePath, expected] of artifacts.files) {
    if (options.write) {
      if (await writeIfChanged(filePath, expected)) changed.push(posixRelative(rootDir, filePath));
    } else {
      const actual = await fs.readFile(filePath, 'utf8');
      if (actual !== expected) stale.push(posixRelative(rootDir, filePath));
    }
  }

  return {
    ok: failures.length === 0 && stale.length === 0,
    mode: options.write ? 'write' : 'check',
    changed: changed.sort(),
    stale: stale.sort(),
    failures: failures.sort(),
    paths: validation.data.paths,
  };
}

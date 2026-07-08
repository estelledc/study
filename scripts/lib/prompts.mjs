import fs from 'node:fs/promises';
import path from 'node:path';
import {
  DOCS_DIR,
  PROMPTS_DIR,
  ROOT,
  WRITTEN_PATH,
  docsAreaDir,
} from './paths.mjs';

export const DISPATCH_PROMPT_KINDS = ['new-paper', 'rewrite-paper', 'new-project', 'rewrite-project'];

export const PIPELINE_STAGES = [
  'researcher',
  'writer',
  'reviewer-zero-base',
  'reviewer-academic',
  'reviewer-engineer',
  'refiner',
];

const PROMPT_FILES = {
  'base-rules': 'base-rules.md',
  'new-paper': 'new-paper.md',
  'rewrite-paper': 'rewrite-paper.md',
  'new-project': 'new-project.md',
  'rewrite-project': 'rewrite-project.md',
  researcher: 'researcher.md',
  writer: 'writer.md',
  'reviewer-zero-base': 'reviewer-zero-base.md',
  'reviewer-academic': 'reviewer-academic.md',
  'reviewer-engineer': 'reviewer-engineer.md',
  refiner: 'refiner.md',
};

export const ALL_PROMPT_KEYS = Object.keys(PROMPT_FILES);

export function commonPromptVars({ area = null, worktree = null } = {}) {
  const docsArea = area ? (worktree ? path.join(worktree.path, 'src/content/docs', area) : docsAreaDir(area)) : DOCS_DIR;
  return {
    repo_root: ROOT,
    base_rules_path: path.join(PROMPTS_DIR, 'base-rules.md'),
    template_note_path: path.join(DOCS_DIR, 'papers', 'hindley-milner.md'),
    written_path: WRITTEN_PATH,
    quality_gate_path: path.join(ROOT, 'scripts', 'quality-gate.mjs'),
    paper_context_path: path.join(ROOT, 'scripts', 'paper-context.mjs'),
    docs_area_dir: docsArea,
  };
}

export function promptPath(key) {
  const file = PROMPT_FILES[key];
  if (!file) throw new Error(`Unknown prompt key: ${key}`);
  return path.join(PROMPTS_DIR, file);
}

export async function loadPromptTemplate(key) {
  return fs.readFile(promptPath(key), 'utf8');
}

export async function loadPromptTemplates(keys) {
  const templates = await Promise.all(keys.map((key) => loadPromptTemplate(key)));
  return Object.fromEntries(keys.map((key, index) => [key, templates[index]]));
}

export function renderTemplate(template, vars) {
  let out = template;
  for (const [key, value] of Object.entries(vars)) {
    out = out.split(`{{${key}}}`).join(String(value ?? ''));
  }
  return out;
}

import fs from 'node:fs/promises';
import path from 'node:path';
import { PROMPTS_DIR } from './paths.mjs';

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

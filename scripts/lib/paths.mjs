import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const SCRIPTS_DIR = path.join(ROOT, 'scripts');
export const DATA_DIR = path.join(ROOT, 'data');
export const DOCS_RELATIVE_DIR = 'src/content/docs';
export const DOCS_DIR = path.join(ROOT, DOCS_RELATIVE_DIR);
export const PAPERS_DIR = path.join(DOCS_DIR, 'papers');
export const PROJECTS_DIR = path.join(DOCS_DIR, 'projects');
export const PROMPTS_DIR = path.join(ROOT, 'prompts');
export const RESEARCH_DIR = path.join(ROOT, 'research');

export const CANDIDATES_PATH = path.join(DATA_DIR, 'candidates.jsonl');
export const REWRITE_POOL_PATH = path.join(DATA_DIR, 'rewrite-pool.jsonl');
export const PRIORITY_QUEUE_PATH = path.join(DATA_DIR, 'priority-queue.jsonl');
export const GRAVEYARD_PATH = path.join(DATA_DIR, 'graveyard.jsonl');
export const WRITTEN_PATH = path.join(DATA_DIR, 'written.txt');
export const STATUS_JSON_PATH = path.join(DATA_DIR, 'status.json');
export const STATUS_MD_PATH = path.join(DATA_DIR, 'STATUS.md');
export const PIPELINE_EVENTS_PATH = path.join(DATA_DIR, 'pipeline-events.jsonl');
export const ROUND_LOCK_PATH = path.join(DATA_DIR, 'round-lock.json');
export const CHECKPOINT_PATH = path.join(DATA_DIR, 'checkpoint.json');

export function docsAreaDir(area) {
  if (area === 'papers') return PAPERS_DIR;
  if (area === 'projects') return PROJECTS_DIR;
  throw new Error(`Unknown docs area: ${area}`);
}

export function docsEntryPath(area, slug) {
  return path.join(docsAreaDir(area), `${slug}.md`);
}

export function docsEntryRelativePath(area, slug) {
  if (area !== 'papers' && area !== 'projects') {
    throw new Error(`Unknown docs area: ${area}`);
  }
  return path.join(DOCS_RELATIVE_DIR, area, `${slug}.md`);
}

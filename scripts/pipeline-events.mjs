// Append-only pipeline 事件流 helper（O_APPEND 单行原子写）
// 所有 stage transition 一行 JSON 写入 data/pipeline-events.jsonl

import fs from 'node:fs';
import { PIPELINE_EVENTS_PATH } from './lib/paths.mjs';

const EVENTS_PATH = PIPELINE_EVENTS_PATH;

export function emit(event) {
  const enriched = {
    ts: new Date().toISOString(),
    ...event,
  };
  const line = JSON.stringify(enriched) + '\n';
  // O_APPEND ensures atomic single-line write across processes
  fs.appendFileSync(EVENTS_PATH, line, { flag: 'a' });
}

export function emitBatch(events) {
  for (const e of events) emit(e);
}

// 事件类型：
//   pipeline-start    { slug, kind, round_n, area, topic }
//   stage-start       { slug, stage }
//   stage-end         { slug, stage, status, payload }
//   pipeline-graveyard { slug, reason, reviews? }
//   pipeline-end      { slug, commit, lines, verdict }
//   round-finalize-start  { round_n, slugs_count }
//   round-finalize-end    { round_n, build_ok, push_ok, picked_count, dropped_count }

if (import.meta.url === `file://${process.argv[1]}`) {
  // CLI: node pipeline-events.mjs '<json>'
  const raw = process.argv[2];
  if (!raw) {
    console.error('usage: node pipeline-events.mjs \'{"event":"...", ...}\'');
    process.exit(2);
  }
  emit(JSON.parse(raw));
}

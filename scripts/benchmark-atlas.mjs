#!/usr/bin/env node

import { performance } from 'node:perf_hooks';

import { buildAtlasArtifacts } from './regen-atlas.mjs';
import { ROOT } from './lib/paths.mjs';

function countMatches(value, regex) {
  return [...String(value).matchAll(regex)].length;
}

export function summarizeAtlasBenchmark(model, elapsedMs) {
  const artifactEntries = [...model.artifacts.entries()];
  const outputBytes = artifactEntries.reduce((sum, [, content]) => sum + Buffer.byteLength(content), 0);
  const landings = artifactEntries.filter(([filePath]) => /(?:papers|projects)-atlas\.md$/.test(filePath));
  const landingBytes = landings.reduce((sum, [, content]) => sum + Buffer.byteLength(content), 0);
  const landingNoteLinks = landings.reduce(
    (sum, [, content]) => sum + countMatches(content, /\/study\/(?:papers|projects)\/[a-z0-9._-]+\//g),
    0,
  );
  const maxChunkEntries = Math.max(0, ...model.chunks.map((chunk) => chunk.note_ids.length));
  if (maxChunkEntries > model.taxonomy.chunk_size) {
    throw new Error(`Atlas chunk budget exceeded: ${maxChunkEntries} > ${model.taxonomy.chunk_size}`);
  }
  if (landingNoteLinks !== 0) {
    throw new Error(`Atlas landing embeds ${landingNoteLinks} direct note links; expected 0`);
  }
  return {
    schema_version: 'study-atlas-benchmark-v1',
    deterministic: {
      notes: model.noteIndex.stats.summary.total,
      classified: model.noteIndex.stats.summary.classified,
      unclassified: model.noteIndex.stats.summary.unclassified,
      chunks: model.chunks.length,
      chunk_size_budget: model.taxonomy.chunk_size,
      max_chunk_entries: maxChunkEntries,
      output_files: artifactEntries.length,
      output_bytes: outputBytes,
      landing_bytes: landingBytes,
      landing_direct_note_links: landingNoteLinks,
    },
    advisory: {
      model_generation_ms: Number(elapsedMs.toFixed(2)),
    },
  };
}

export async function benchmarkAtlas(options = {}) {
  const started = performance.now();
  const model = await buildAtlasArtifacts(options);
  return summarizeAtlasBenchmark(model, performance.now() - started);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const args = process.argv.slice(2);
    const unknown = args.filter((arg) => arg !== '--json');
    if (unknown.length) throw new Error(`unknown argument: ${unknown[0]}`);
    const report = await benchmarkAtlas({ rootDir: ROOT });
    if (args.includes('--json')) console.log(JSON.stringify(report, null, 2));
    else console.log(`atlas benchmark: ${report.deterministic.notes} notes, ${report.deterministic.chunks} chunks, max ${report.deterministic.max_chunk_entries}/${report.deterministic.chunk_size_budget}`);
  } catch (error) {
    console.error(`atlas benchmark failed: ${error.message}`);
    process.exitCode = 1;
  }
}

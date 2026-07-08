#!/usr/bin/env node
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

import { buildPaperContext } from './lib/paper-context.mjs';
import { ROOT, WRITTEN_PATH } from './lib/paths.mjs';
import { writeJson } from './lib/json-store.mjs';

const execFileAsync = promisify(execFile);

function parseArgs(argv) {
  const args = { slug: null, title: null, url: '', year: '', fullMd: null, out: null };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--slug') args.slug = argv[++index];
    else if (arg === '--title') args.title = argv[++index];
    else if (arg === '--url') args.url = argv[++index];
    else if (arg === '--year') args.year = argv[++index];
    else if (arg === '--full-md') args.fullMd = argv[++index];
    else if (arg === '--out') args.out = argv[++index];
    else throw new Error(`unknown arg: ${arg}`);
  }
  if (!args.slug) throw new Error('--slug is required');
  if (!args.title) throw new Error('--title is required');
  if (!args.fullMd) throw new Error('--full-md is required');
  if (!args.out) throw new Error('--out is required');
  return args;
}

async function loadDotenv() {
  const envPath = path.join(ROOT, '.env');
  let text = '';
  try {
    text = await fs.readFile(envPath, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return;
    throw error;
  }
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const index = line.indexOf('=');
    if (index < 0) continue;
    const key = line.slice(0, index).trim();
    let value = line.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

async function readOptional(filePath) {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return '';
    throw error;
  }
}

async function runCommand(command, args) {
  const { stdout } = await execFileAsync(command, args, {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    timeout: 5 * 60 * 1000,
  });
  return stdout;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  await loadDotenv();
  const fullMarkdown = await readOptional(args.fullMd);
  const writtenText = await readOptional(WRITTEN_PATH);
  const context = await buildPaperContext({
    slug: args.slug,
    title: args.title,
    url: args.url,
    year: args.year,
    fullMarkdown,
    writtenText,
    apiKey: process.env.OPENALEX_API_KEY,
  }, {
    runner: runCommand,
    fetchImpl: globalThis.fetch,
  });
  if (!fullMarkdown) context.warnings.push(`full-md-missing: ${args.fullMd}`);
  await writeJson(args.out, context, { finalNewline: true });
  console.log(JSON.stringify({
    slug: context.slug,
    out: args.out,
    openalex_id: context.paper.openalex_id,
    citations_in: context.citations_in.length,
    citations_out: context.citations_out.length,
    fallback_used: context.fallback_used,
    warnings: context.warnings,
  }));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(`[paper-context] ${error.message}`);
    process.exit(1);
  });
}

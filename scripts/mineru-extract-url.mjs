#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ROOT } from './lib/paths.mjs';

const API_BASE = 'https://mineru.net/api/v4';

function parseArgs(argv) {
  const args = {
    url: null,
    file: null,
    slug: null,
    out: null,
    model: 'vlm',
    pollMs: 5000,
    timeoutMs: 10 * 60 * 1000,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--url') args.url = argv[++i];
    else if (arg === '--file') args.file = argv[++i];
    else if (arg === '--slug') args.slug = argv[++i];
    else if (arg === '--out') args.out = argv[++i];
    else if (arg === '--model') args.model = argv[++i];
    else if (arg === '--poll-ms') args.pollMs = Number(argv[++i]);
    else if (arg === '--timeout-ms') args.timeoutMs = Number(argv[++i]);
    else throw new Error(`unknown arg: ${arg}`);
  }
  if (!args.slug) throw new Error('--slug is required');
  if (!args.out) throw new Error('--out is required');
  if (!args.url && !args.file) throw new Error('--url or --file is required');
  if (args.url && args.file) throw new Error('use only one of --url or --file');
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

function authHeaders(token, extra = {}) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: '*/*',
    ...extra,
  };
}

async function requestJson(url, options) {
  const response = await fetch(url, options);
  const text = await response.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`mineru returned non-json response (${response.status})`);
  }
  if (!response.ok || json.code !== 0) {
    throw new Error(`mineru request failed (${response.status}): ${json.msg || 'unknown'}`);
  }
  return json;
}

async function createUrlTask({ token, url, slug, model }) {
  const json = await requestJson(`${API_BASE}/extract/task`, {
    method: 'POST',
    headers: authHeaders(token, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      url,
      model_version: model,
      enable_formula: true,
      enable_table: true,
      language: 'en',
      data_id: slug,
    }),
  });
  return json.data.task_id;
}

async function createFileBatch({ token, file, slug, model }) {
  const name = path.basename(file);
  const applyJson = await requestJson(`${API_BASE}/file-urls/batch`, {
    method: 'POST',
    headers: authHeaders(token, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      files: [{ name, data_id: slug }],
      model_version: model,
      enable_formula: true,
      enable_table: true,
      language: 'en',
    }),
  });
  const uploadUrl = applyJson.data.file_urls?.[0];
  const batchId = applyJson.data.batch_id;
  if (!uploadUrl || !batchId) throw new Error('mineru did not return upload url');
  const fileBuffer = await fs.readFile(file);
  const uploadResponse = await fetch(uploadUrl, { method: 'PUT', body: fileBuffer });
  if (!uploadResponse.ok) {
    throw new Error(`mineru file upload failed (${uploadResponse.status})`);
  }
  return batchId;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForDone({ token, taskId, pollMs, timeoutMs }) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const json = await requestJson(`${API_BASE}/extract/task/${taskId}`, {
      method: 'GET',
      headers: authHeaders(token),
    });
    const data = json.data;
    if (data.state === 'done') {
      if (!data.full_zip_url) throw new Error('mineru task done without full_zip_url');
      return data.full_zip_url;
    }
    if (data.state === 'failed') {
      throw new Error(`mineru task failed: ${data.err_msg || 'unknown'}`);
    }
    await sleep(pollMs);
  }
  throw new Error(`mineru task timed out after ${timeoutMs}ms`);
}

async function waitForBatchDone({ token, batchId, pollMs, timeoutMs }) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const json = await requestJson(`${API_BASE}/extract-results/batch/${batchId}`, {
      method: 'GET',
      headers: authHeaders(token),
    });
    const rawResults = json.data.extract_result || [];
    const results = Array.isArray(rawResults) ? rawResults : [rawResults];
    const result = results[0];
    if (!result) throw new Error('mineru batch returned no extract_result');
    if (result.state === 'done') {
      if (!result.full_zip_url) throw new Error('mineru batch done without full_zip_url');
      return result.full_zip_url;
    }
    if (result.state === 'failed') {
      throw new Error(`mineru batch failed: ${result.err_msg || 'unknown'}`);
    }
    await sleep(pollMs);
  }
  throw new Error(`mineru batch timed out after ${timeoutMs}ms`);
}

async function downloadFile(url, outPath) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`download failed (${response.status})`);
  const buffer = Buffer.from(await response.arrayBuffer());
  await fs.writeFile(outPath, buffer);
}

function readFullMarkdown(zipPath) {
  const entries = execFileSync('unzip', ['-Z1', zipPath], { encoding: 'utf8' })
    .split('\n')
    .filter(Boolean);
  const fullMd = entries.find((entry) => entry.endsWith('/full.md') || entry === 'full.md');
  if (!fullMd) throw new Error('mineru zip does not contain full.md');
  return execFileSync('unzip', ['-p', zipPath, fullMd], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  await loadDotenv();
  const token = process.env.MINERU_API_KEY;
  if (!token) throw new Error('MINERU_API_KEY is required in environment or .env');
  const jobId = args.url
    ? await createUrlTask({ token, url: args.url, slug: args.slug, model: args.model })
    : await createFileBatch({ token, file: args.file, slug: args.slug, model: args.model });
  const zipUrl = args.url
    ? await waitForDone({
        token,
        taskId: jobId,
        pollMs: args.pollMs,
        timeoutMs: args.timeoutMs,
      })
    : await waitForBatchDone({
        token,
        batchId: jobId,
        pollMs: args.pollMs,
        timeoutMs: args.timeoutMs,
      });
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), `mineru-${args.slug}-`));
  const zipPath = path.join(tempDir, 'result.zip');
  await downloadFile(zipUrl, zipPath);
  const markdown = readFullMarkdown(zipPath);
  await fs.mkdir(path.dirname(args.out), { recursive: true });
  await fs.writeFile(args.out, markdown);
  console.log(JSON.stringify({ slug: args.slug, job_id: jobId, out: args.out, bytes: Buffer.byteLength(markdown) }));
}

main().catch((error) => {
  console.error(`[mineru] ${error.message}`);
  process.exit(1);
});

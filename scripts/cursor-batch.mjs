#!/usr/bin/env node
// cursor-batch.mjs — 用 cursor-agent 批量写笔记的安全循环
// 用法：node scripts/cursor-batch.mjs [批次数] [每批篇数]
// 默认跑 10 批，每批 4 篇 = 40 篇

import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const CANDIDATES_PATH = path.join(ROOT, 'data', 'candidates.jsonl');
const PROJECTS_DIR = path.join(ROOT, 'src', 'content', 'docs', 'projects');
const PAPERS_DIR = path.join(ROOT, 'src', 'content', 'docs', 'papers');
const CURSOR_BIN = '/Users/jason/.local/bin/cursor-agent';
const MODEL = 'composer-2.5';

const BATCHES = parseInt(process.argv[2] || '10', 10);
const COUNT = parseInt(process.argv[3] || '4', 10);

function readJsonl(p) {
  const raw = fs.readFileSync(p, 'utf8');
  return raw.split('\n').filter(Boolean).map(l => {
    try { return JSON.parse(l); } catch { return null; }
  }).filter(Boolean);
}

function writeJsonl(p, rows) {
  const body = rows.map(r => JSON.stringify(r)).join('\n') + (rows.length ? '\n' : '');
  fs.writeFileSync(p, body, 'utf8');
}

function fileExists(slug, area) {
  const dir = area === 'papers' ? PAPERS_DIR : PROJECTS_DIR;
  return fs.existsSync(path.join(dir, `${slug}.md`));
}

function claimSlug(slug) {
  // Atomic claim via tmpfile — prevents duplicate dispatch across parallel instances
  const claimPath = `/tmp/cursor-claim-${slug}`;
  if (fs.existsSync(claimPath)) return false;
  try {
    fs.writeFileSync(claimPath, String(process.pid), { flag: 'wx' });
    return true;
  } catch {
    return false;
  }
}

function releaseClaim(slug) {
  try { fs.unlinkSync(`/tmp/cursor-claim-${slug}`); } catch {}
}

function pickBatch() {
  try {
    const result = execSync(`node scripts/pick-batch.mjs --count ${COUNT} --rewrite 0 --new ${COUNT}`, { cwd: ROOT, encoding: 'utf8' });
    const json = JSON.parse(result);
    return json.items || [];
  } catch (e) {
    console.error('pick-batch failed:', e.message);
    return [];
  }
}

function dispatchCursorAgent(slug, area, title, url) {
  return new Promise((resolve) => {
    const dir = area === 'papers' ? 'papers' : 'projects';
    const prompt = `写一篇关于 ${title || slug} 的零基础学习笔记，保存到 src/content/docs/${dir}/${slug}.md。
格式：frontmatter 必须含 title、来源:${url||''}、日期:2026-06-13、分类、子分类、provenance:pipeline-v3（写完后运行 node scripts/classify-notes.mjs --apply --area=${area} 自动填入分类/子分类）。
正文从日常类比开始，必须含核心概念+至少2个代码示例，目标150+行。
用 web_search 研究后直接写完整笔记，不要只描述计划。`;

    const child = spawn(CURSOR_BIN, [
      '--print', '--model', MODEL,
      '--workspace', ROOT,
      '--trust', '--sandbox', 'disabled', '--yolo',
      prompt
    ], {
      env: { ...process.env, NODE_TLS_REJECT_UNAUTHORIZED: '0' },
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 300000, // 5 min timeout
    });

    let stdout = '';
    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', () => {}); // ignore stderr

    child.on('close', (code) => {
      resolve({ slug, area, exitCode: code, output: stdout.slice(-200) });
    });

    child.on('error', (err) => {
      resolve({ slug, area, exitCode: -1, error: err.message });
    });
  });
}

function updateCandidateStatus(slug, area, status) {
  const candidates = readJsonl(CANDIDATES_PATH);
  let updated = false;
  for (const c of candidates) {
    if (c.slug === slug && c.area === area && c.status === 'queued') {
      c.status = status;
      c.written_at = new Date().toISOString();
      updated = true;
    }
  }
  if (updated) {
    writeJsonl(CANDIDATES_PATH, candidates);
  }
  return updated;
}

function verifyQuality(slug, area) {
  const dir = area === 'papers' ? PAPERS_DIR : PROJECTS_DIR;
  const fpath = path.join(dir, `${slug}.md`);
  if (!fs.existsSync(fpath)) return { ok: false, reason: 'file not created' };

  const content = fs.readFileSync(fpath, 'utf8');
  const lines = content.split('\n').length;

  if (lines < 100) return { ok: false, reason: `too short: ${lines} lines` };
  if (!content.includes('---')) return { ok: false, reason: 'no frontmatter' };
  if (!content.includes('来源')) return { ok: false, reason: 'no source field' };
  if (!/^分类:\s*.+$/m.test(content)) return { ok: false, reason: 'missing 分类' };

  return { ok: true, lines };
}

function applyClassification(area) {
  try {
    execSync(`node scripts/classify-notes.mjs --apply --area=${area}`, { cwd: ROOT, stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

async function runBatch(batchNum, totalBatches) {
  console.log(`\n=== Batch ${batchNum}/${totalBatches} ===`);

  const items = pickBatch();
  if (items.length === 0) {
    console.log('  No candidates available.');
    return { new: 0, skipped: 0, failed: 0, done: true };
  }

  // Filter: skip already-existing files AND already-claimed slugs
  const toWrite = [];
  const skipped = [];
  for (const item of items) {
    if (fileExists(item.slug, item.area)) {
      const dir = item.area === 'papers' ? PAPERS_DIR : PROJECTS_DIR;
      const content = fs.readFileSync(path.join(dir, `${item.slug}.md`), 'utf8');
      if (!/^分类:\s*.+$/m.test(content)) {
        applyClassification(item.area);
      }
      skipped.push(item.slug);
      updateCandidateStatus(item.slug, item.area, 'written');
    } else if (!claimSlug(item.slug)) {
      skipped.push(item.slug + '(claimed)');
    } else {
      toWrite.push(item);
    }
  }
  if (skipped.length > 0) console.log(`  Skipped (already exist): ${skipped.join(', ')}`);
  if (toWrite.length === 0) {
    console.log('  All candidates already exist.');
    return { new: 0, skipped: skipped.length, failed: 0, done: false };
  }

  console.log(`  Dispatching ${toWrite.length} cursor-agents...`);

  // Parallel dispatch
  const promises = toWrite.map(item =>
    dispatchCursorAgent(item.slug, item.area, item.title || item.slug, item.url || '')
  );
  const results = await Promise.all(promises);

  let newCount = 0;
  let failCount = 0;
  for (const r of results) {
    applyClassification(r.area);
    const q = verifyQuality(r.slug, r.area);
    if (q.ok) {
      updateCandidateStatus(r.slug, r.area, 'written');
      console.log(`  OK: ${r.slug} (${q.lines} lines)`);
      newCount++;
    } else {
      console.log(`  FAIL: ${r.slug} — ${q.reason}`);
      failCount++;
    }
    releaseClaim(r.slug);
  }

  return { new: newCount, skipped: skipped.length, failed: failCount, done: false };
}

async function main() {
  console.log(`Cursor Batch Loop: ${BATCHES} batches x ${COUNT}/batch`);
  let totalNew = 0, totalSkipped = 0, totalFailed = 0;

  for (let b = 1; b <= BATCHES; b++) {
    const result = await runBatch(b, BATCHES);
    totalNew += result.new;
    totalSkipped += result.skipped;
    totalFailed += result.failed;

    if (result.done) {
      console.log('\nCandidate pool exhausted.');
      break;
    }

    // Small delay between batches
    if (b < BATCHES) await new Promise(r => setTimeout(r, 2000));
  }

  // Final stats
  const allProjects = fs.readdirSync(PROJECTS_DIR).filter(f => f.endsWith('.md')).length;
  const allPapers = fs.readdirSync(PAPERS_DIR).filter(f => f.endsWith('.md')).length;
  console.log(`\n=== Complete ===`);
  console.log(`New: ${totalNew} | Skipped: ${totalSkipped} | Failed: ${totalFailed}`);
  console.log(`Total notes: ${allProjects + allPapers} (projects: ${allProjects}, papers: ${allPapers})`);
}

main().catch(err => {
  console.error('Batch loop crashed:', err);
  process.exit(1);
});

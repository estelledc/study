#!/usr/bin/env node
// 全库 quality-gate 扫描
// 用法：
//   node scripts/quality-gate-all.mjs               # 扫全库
//   node scripts/quality-gate-all.mjs --changed-only # 仅扫本次 git diff 变更的 md
//   node scripts/quality-gate-all.mjs --json         # 输出完整 JSON 报告（附失败列表）
//   node scripts/quality-gate-all.mjs --self-test    # 对内置 fixture 跑 3 用例做自检

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { validate } from './quality-gate.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const ARGS = process.argv.slice(2);
const CHANGED_ONLY = ARGS.includes('--changed-only');
const JSON_OUTPUT = ARGS.includes('--json');
const SELF_TEST = ARGS.includes('--self-test');

// ─── self-test mode ───────────────────────────────────────────────────────────
async function runSelfTest() {
  const tmp = await fs.mkdtemp('/tmp/gate-self-test-');
  const good = path.join(tmp, 'good.md');
  const bad = path.join(tmp, 'bad.md');

  // Fixture paths must match VALID_PATH_RE: .../src/content/docs/(papers|projects)/slug.md
  const goodDir = path.join(tmp, 'src/content/docs/papers');
  const badDir = path.join(tmp, 'src/content/docs/papers');
  await fs.mkdir(goodDir, { recursive: true });

  const goodPath = path.join(goodDir, 'self-test-good.md');
  const badPath = path.join(badDir, 'self-test-bad.md');

  const frontmatter = `---
title: Self-test fixture — test fixture
来源: Test Author. "Test Paper". Venue 2024
日期: 2026-01-01
分类: 其他
子分类: 测试
难度: 初级
---`;
  const sections = [
    '## 是什么\n内容。',
    '## 为什么重要\n内容。',
    '## 核心要点\n内容。',
    '## 实践案例\n内容。',
    '## 踩过的坑\n内容。',
    '## 适用\n内容。',
    '## 历史小故事（可跳过）\n内容。',
    '## 学到什么\n内容。',
    '## 延伸阅读\n内容。',
    '## 关联\n内容。',
    '## 反向链接\n<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->',
  ];
  const body = sections.join('\n\n');
  let goodContent = frontmatter + '\n\n' + body;
  // Pad to 150+ lines (no upper limit)
  while (goodContent.split('\n').length < 150) goodContent += '\n';

  await fs.writeFile(goodPath, goodContent);

  const badContent = `---
日期: 2026-01-01
---\n## 是什么\n内容。\n`;
  await fs.writeFile(badPath, badContent);

  let passed = 0;
  let failed = 0;

  // Test 1: good fixture should pass
  const r1 = await validate(goodPath);
  if (r1.pass) {
    passed++;
  } else {
    console.error('SELF-TEST FAIL: good fixture failed gate:', r1.reasons);
    failed++;
  }

  // Test 2: bad fixture (no title) should fail frontmatter check
  const r2 = await validate(badPath);
  if (!r2.pass && r2.reasons.some(r => r.includes('frontmatter missing title') || r.includes('frontmatter'))) {
    passed++;
  } else {
    console.error('SELF-TEST FAIL: bad fixture (no title) should have failed:', r2);
    failed++;
  }

  // Test 3: bad fixture should fail overall
  const r3 = await validate(badPath);
  if (!r3.pass) {
    passed++;
  } else {
    console.error('SELF-TEST FAIL: bad fixture should not pass');
    failed++;
  }

  await fs.rm(tmp, { recursive: true });

  if (failed > 0) {
    console.error(`self-test: ${passed} passed, ${failed} FAILED`);
    process.exit(1);
  }
  console.log(`self-test: ${passed}/3 passed`);
  process.exit(0);
}

// ─── changed-only: get md files modified in current branch/working-tree ──────
function getChangedMdFiles() {
  try {
    const diffOutput = execSync('git diff --name-only HEAD', { cwd: ROOT, encoding: 'utf8' });
    const stagedOutput = execSync('git diff --cached --name-only', { cwd: ROOT, encoding: 'utf8' });
    const allChanged = [...diffOutput.split('\n'), ...stagedOutput.split('\n')]
      .map(f => f.trim())
      .filter(f => f.endsWith('.md') && (f.startsWith('src/content/docs/papers/') || f.startsWith('src/content/docs/projects/')));
    return [...new Set(allChanged)].map(f => path.resolve(ROOT, f));
  } catch {
    return [];
  }
}

// ─── main scan ────────────────────────────────────────────────────────────────
async function scanDir(dir) {
  const files = [];
  try {
    const entries = await fs.readdir(dir);
    for (const f of entries) {
      if (f.endsWith('.md') && !f.startsWith('_')) {
        files.push(path.resolve(dir, f));
      }
    }
  } catch {}
  return files;
}

async function main() {
  if (SELF_TEST) return runSelfTest();

  let files;
  if (CHANGED_ONLY) {
    files = getChangedMdFiles();
    if (files.length === 0) {
      console.log('quality-gate-all: no changed md files found, skipping');
      process.exit(0);
    }
  } else {
    const papersDir = path.join(ROOT, 'src/content/docs/papers');
    const projectsDir = path.join(ROOT, 'src/content/docs/projects');
    files = [
      ...(await scanDir(papersDir)),
      ...(await scanDir(projectsDir)),
    ];
  }

  let passed = 0;
  let failed = 0;
  const failures = [];

  for (const filePath of files) {
    const result = await validate(filePath);
    if (result.pass) {
      passed++;
    } else {
      failed++;
      failures.push({ file: path.relative(ROOT, filePath), reasons: result.reasons });
    }
  }

  const total = passed + failed;

  if (JSON_OUTPUT) {
    console.log(JSON.stringify({ total, passed, failed, failures }, null, 2));
  } else {
    if (failed > 0) {
      console.error(`quality-gate-all: ${failed}/${total} FAILED`);
      const preview = failures.slice(0, 50);
      for (const { file, reasons } of preview) {
        console.error(`  FAIL  ${file}`);
        for (const r of reasons) {
          console.error(`        ${r}`);
        }
      }
      if (failures.length > 50) {
        console.error(`  ... and ${failures.length - 50} more (use --json for full list)`);
      }
    } else {
      console.log(`quality-gate-all: ${passed}/${total} passed ✓`);
    }
  }

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('quality-gate-all error:', err);
  process.exit(1);
});

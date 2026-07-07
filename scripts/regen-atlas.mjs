#!/usr/bin/env node
// Regenerate papers-atlas.md and projects-atlas.md from frontmatter.
// Run: node scripts/regen-atlas.mjs (also runs as `prebuild` automatically)
//
// Notes are grouped by THEME (semantic clustering), not by Season (chronological).
// Themes are hardcoded slug→theme maps. New slugs default to "其他 / 待分类"
// until added below.

import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseFrontmatterLoose } from './lib/frontmatter.mjs';
import { DOCS_DIR } from './lib/paths.mjs';

// === Paper themes (order = display order) ===========================
const THEMES_PAPERS = {
  '智能体与 LLM 系统': [
    'cot', 'react', 'reflexion', 'toolformer', 'voyager',
    'autogen', 'metagpt', 'agentless', 'openhands', 'swe-agent',
    'swe-bench', 'instructgpt', 'rag-lewis-2020', 'retro', 'graphrag',
  ],
  'NLP 基础与 Scaling': [
    'word2vec', 'attention', 'bert', 'gpt-3', 't5',
    'chinchilla', 'scaling-laws', 'llama', 'mixture-of-experts',
    'deepseek-r1', 'mamba',
  ],
  '计算机视觉': [
    'resnet', 'vit', 'clip', 'sam', 'dino', 'mae', '3d-gaussian-splatting',
  ],
  '生成模型 / 扩散': [
    'dalle-2', 'ddpm', 'dit', 'stable-diffusion', 'llava',
  ],
  '强化学习': [
    'dqn', 'ppo', 'alphago', 'muzero', 'dpo', 'rlhf-christiano',
  ],
  'AI 安全与可解释性': [
    'constitutional-ai', 'sleeper-agents',
    'induction-heads', 'toy-models-superposition', 'sparse-autoencoders',
    'causal-abstraction', 'activation-patching', 'anthropic-circuits',
  ],
  '分布式系统': [
    'paxos', 'raft', 'spanner', 'chubby', 'lamport-1978',
  ],
  '数据库': [
    'selinger-1979', 'volcano', 'snowflake-2016', 'rocksdb-lsm', 'clickhouse',
    'kafka', 'calvin-2012', 'dynamo', 'aurora', 'bigtable-2006',
    'foundationdb-2021', 'tigerbeetle',
  ],
  '分布式训练 / GPU': [
    'megatron-lm', 'deepspeed-zero', 'vllm', 'flash-attention',
  ],
  '网络协议': [
    'tcp', 'tls-1.3', 'quic', 'http-2', 'dns',
  ],
  'OS / 集群管理 / 系统': [
    'gfs', 'mapreduce', 'ebpf', 'io-uring', 'borg',
  ],
  'GC / 内存管理': [
    'cheney-gc', 'generational-gc', 'zgc', 'boehm-gc', 'tofte-talpin-regions',
  ],
  '编译器 / 编程语言理论': [
    'llvm', 'ssa', 'self-pic', 'theorems-for-free', 'mccarthy-lisp',
    'smalltalk-80', 'simula-67', 'algol-60', 'standard-ml', 'erlang-otp',
    'bidirectional-typing', 'hindley-milner', 'linear-types',
    'effect-handlers', 'compiler-errors', 'ci-effects', 'push-pull-frp',
    'trees-that-grow', 'wadler-prettier', 'adapton', 'salsa-adapton',
    'self-adjusting', 'crdt-json', 'realm',
  ],
  '计算理论 / 数学基础': [
    'turing-1936', 'lambda-calculus', 'cook-levin', 'karp-21', 'godel-1931', 'knuth-taocp',
    'dijkstra-shortest-path',
  ],
  '信息论 / 编码理论': [
    'shannon-1948', 'huffman-1952', 'hamming-1950', 'reed-solomon-1960', 'polar-codes-2009',
  ],
  '密码学 / 安全': [
    'diffie-hellman', 'rsa', 'aes', 'bitcoin', 'zk-snark',
  ],
  'HCI / 软件工程研究': [
    'cognitive-load-theory', 'debugging-dichotomy', 'fsrs-spaced-repetition',
    'pair-programming', 'programmer-interruption', 'program-comprehension-fmri',
    'sillito-questions', 'copilot-rct', 'great-swe',
    'dijkstra-goto', 'hoare-logic', 'lampson-hints', 'no-silver-bullet', 'beck-tdd',
  ],
};

// === Project themes ================================================
const THEMES_PROJECTS = {
  '数据可视化': [
    'd3', 'echarts', 'visx', 'recharts', 'observable-plot',
  ],
  '动画': [
    'framer-motion', 'gsap', 'lottie', 'react-spring', 'motion-one', 'anime',
  ],
  '表单 / Schema 校验': [
    'zod', 'valibot', 'arktype', 'react-hook-form', 'tanstack-form',
  ],
  'HTTP 客户端': [
    'axios', 'ky', 'ofetch', 'wretch', 'got',
  ],
  '日期时间': [
    'date-fns', 'dayjs', 'luxon', 'temporal-polyfill', 'js-joda',
  ],
  'i18n 国际化': [
    'i18next', 'vue-i18n', 'react-intl', 'next-intl', 'lingui',
  ],
  '构建工具 / Bundler': [
    'vite', 'esbuild', 'rollup', 'swc', 'webpack',
    'rolldown', 'turbopack', 'rspack', 'lightningcss', 'oxc',
    'biome', 'bun',
  ],
  'ORM / DB 客户端': [
    'prisma', 'drizzle', 'kysely', 'typeorm', 'sequelize',
    'mikro-orm', 'postgres-js', 'duckdb-wasm',
  ],
  '数据库本体 / 存储引擎': [
    'postgresql', 'redis', 'sqlite', 'clickhouse', 'mongodb',
    'cockroachdb', 'tidb', 'cassandra', 'mariadb-server', 'mysql',
    'rocksdb', 'leveldb', 'valkey', 'duckdb',
    'elasticsearch', 'kafka', 'milvus',
    'neo4j', 'dgraph', 'arangodb',
    'meilisearch', 'typesense', 'qdrant', 'weaviate',
  ],
  'DevOps / 容器 / 运维': [
    'docker', 'kubernetes', 'nginx', 'caddy', 'traefik',
    'podman', 'containerd', 'helm', 'argocd', 'terraform',
    'ansible', 'minio', 'etcd',
  ],
  '监控 / 时序': [
    'prometheus', 'grafana', 'timescaledb', 'influxdb',
    'victoriametrics', 'loki', 'jaeger', 'opentelemetry',
  ],
  'Web 框架': [
    'hono', 'fastify', 'express', 'koa', 'nestjs', 'elysia',
  ],
  'UI 框架 / Frontend Framework': [
    'react', 'vue', 'svelte', 'solid', 'preact', 'qwik',
  ],
  'Meta 框架 / 全栈': [
    'next-js', 'nuxt', 'remix', 'astro', 'sveltekit',
  ],
  'Auth 认证': [
    'auth-js', 'better-auth', 'lucia', 'clerk', 'supertokens',
  ],
  'Monorepo / 包管理': [
    'turborepo', 'nx', 'changesets', 'pnpm', 'lerna',
  ],
  '状态管理': [
    'jotai', 'valtio', 'zustand', 'mobx', 'immer',
    'nanostores', 'xstate', 'effect',
  ],
  '测试 / 验证': [
    'vitest', 'msw', 'storybook', 'testing-library', 'jest', 'playwright',
  ],
  '编辑器 / 富文本': [
    'codemirror', 'prosemirror', 'lexical', 'monaco-editor', 'yjs',
  ],
  '文档站点': [
    'starlight', 'docusaurus', 'vitepress', 'nextra',
  ],
  '数据获取 / 路由': [
    'tanstack-query', 'swr', 'tanstack-router', 'trpc',
  ],
  'AI 应用 / Agent 平台': [
    'dify', 'langfuse', 'librechat', 'ollama', 'chroma',
    'claude-code', 'mcp-ts-sdk', 'vercel-ai', 'continue',
    'langchain', 'llamaindex', 'vllm',
  ],
  'AI 浏览器自动化': [
    'midscene', 'steel-browser', 'stagehand', 'patchright',
    'nanobrowser', 'browser-use',
  ],
  '可观测 / 性能': [
    'sentry', 'pino', 'web-vitals', 'prom-client', 'why-did-you-render',
  ],
  '数据应用 / SaaS': [
    'cal-com', 'immich', 'chatwoot', 'penpot', 'affine',
    'plane', 'supabase', 'excalidraw',
  ],
  '基础组件 / Headless UI': [
    'radix-ui', 'shadcn-ui',
  ],
  'Markdown / 解析': [
    'unified', 'markdown-it', 'marked', 'shiki', 'micromark',
  ],
  '图像处理 / Canvas': [
    'sharp', 'jimp', 'fabric-js', 'konva', 'pixi',
  ],
  'CSS / 样式': [
    'tailwind', 'emotion', 'styled-components', 'stylex', 'vanilla-extract',
  ],
  'CLI / 命令行工具': [
    'yargs', 'commander', 'ink', 'oclif', 'clack',
  ],
  'Terminal / 终端': [
    'chalk', 'ora', 'boxen', 'listr2', 'enquirer',
  ],
  'Drag & Drop / Interaction': [
    'dnd-kit', 'react-dnd', 'sortablejs',
  ],
  '其他基础设施': [
    'minisearch', 'unstorage', 'inngest',
  ],
};

// Build slug → theme reverse map
function buildReverseMap(themes) {
  const m = new Map();
  for (const [theme, slugs] of Object.entries(themes)) {
    for (const slug of slugs) {
      if (m.has(slug)) {
        console.warn(`[warn] slug "${slug}" appears in multiple themes`);
      }
      m.set(slug, theme);
    }
  }
  return m;
}
const PAPER_OF = buildReverseMap(THEMES_PAPERS);
const PROJECT_OF = buildReverseMap(THEMES_PROJECTS);

async function loadAll(dir) {
  const dirAbs = join(DOCS_DIR, dir);
  const files = (await readdir(dirAbs)).filter((f) => f.endsWith('.md'));
  const notes = [];
  for (const f of files) {
    const raw = await readFile(join(dirAbs, f), 'utf8');
    const fm = parseFrontmatterLoose(raw) ?? {};
    const slug = f.replace(/\.md$/, '');
    notes.push({
      slug,
      title: fm.title ?? slug,
      description: fm.description ?? '',
      sidebarOrder: fm.sidebar?.order ?? null,
      size: raw.length,
    });
  }
  return notes;
}

function escapeMd(s) {
  if (!s) return '';
  return String(s).replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

function firstSentence(desc, max = 110) {
  if (!desc) return '';
  const t = String(desc).split(/[。.；;]/)[0].trim();
  return t.length > max ? t.slice(0, max - 1) + '…' : t;
}

// === Atlas rendering ================================================
function renderAtlas(notes, kind) {
  const isPapers = kind === 'papers';
  const themes = isPapers ? THEMES_PAPERS : THEMES_PROJECTS;
  const slugOf = isPapers ? PAPER_OF : PROJECT_OF;

  // Bucket notes by theme
  const buckets = new Map();
  const unclassified = [];
  for (const n of notes) {
    const theme = slugOf.get(n.slug);
    if (theme) {
      if (!buckets.has(theme)) buckets.set(theme, []);
      buckets.get(theme).push(n);
    } else {
      unclassified.push(n);
    }
  }

  const total = notes.length;
  const lines = [];
  const titleZh = isPapers ? '论文' : '项目';
  const path = isPapers ? 'papers' : 'projects';

  lines.push('---');
  lines.push(`title: ${titleZh}全景索引`);
  lines.push(`description: ${total} ${isPapers ? '篇' : '个'}${titleZh} · 按主题分类 · 自动从 frontmatter 生成`);
  lines.push('sidebar:');
  lines.push('  order: 5');
  lines.push(`  label: ${titleZh}全景索引`);
  lines.push('---');
  lines.push('');
  lines.push('> 本页由 `scripts/regen-atlas.mjs` 自动生成（每次 build 前重跑）。');
  lines.push('> 调整分类：编辑脚本里的 `THEMES_' + (isPapers ? 'PAPERS' : 'PROJECTS') + '` 字典。');
  lines.push('');
  lines.push('## 总览');
  lines.push('');
  lines.push(`- **总数**：${total} ${isPapers ? '篇' : '个'}`);
  lines.push(`- **已分类**：${total - unclassified.length}`);
  if (unclassified.length) lines.push(`- **未分类**：${unclassified.length}（落入"其他 / 待分类"段）`);
  lines.push('');

  // Theme summary table
  lines.push('### 按主题分布');
  lines.push('');
  lines.push('| 主题 | 数量 |');
  lines.push('|---|---:|');
  for (const theme of Object.keys(themes)) {
    const items = buckets.get(theme);
    if (!items || !items.length) continue;
    lines.push(`| [${theme}](#${slugify(theme)}) | ${items.length} |`);
  }
  if (unclassified.length) {
    lines.push(`| [其他 / 待分类](#其他--待分类) | ${unclassified.length} |`);
  }
  lines.push('');
  lines.push('---');
  lines.push('');

  // Each theme section
  for (const theme of Object.keys(themes)) {
    const items = buckets.get(theme);
    if (!items || !items.length) continue;
    items.sort((a, b) => a.slug.localeCompare(b.slug));
    lines.push(`## ${theme}`);
    lines.push('');
    lines.push(`共 ${items.length} ${isPapers ? '篇' : '个'}。`);
    lines.push('');
    lines.push(`| ${isPapers ? '论文' : '项目'} | 描述 |`);
    lines.push('|---|---|');
    for (const it of items) {
      const desc = firstSentence(it.description);
      lines.push(`| [${escapeMd(it.title)}](/study/${path}/${it.slug}/) | ${escapeMd(desc)} |`);
    }
    lines.push('');
  }

  // Unclassified
  if (unclassified.length) {
    unclassified.sort((a, b) => a.slug.localeCompare(b.slug));
    lines.push('## 其他 / 待分类');
    lines.push('');
    lines.push(`共 ${unclassified.length} ${isPapers ? '篇' : '个'}。补到主题分类需要编辑 \`scripts/regen-atlas.mjs\`。`);
    lines.push('');
    lines.push(`| Slug | ${isPapers ? '论文' : '项目'} |`);
    lines.push('|---|---|');
    for (const it of unclassified) {
      lines.push(`| \`${it.slug}\` | [${escapeMd(it.title)}](/study/${path}/${it.slug}/) |`);
    }
    lines.push('');
  }

  // Full alphabetical fallback for keyboard browsing
  lines.push('---');
  lines.push('');
  lines.push(`## 全部 ${total} ${isPapers ? '篇' : '个'}（字母序）`);
  lines.push('');
  lines.push(`| Slug | ${isPapers ? '论文' : '项目'} | 主题 |`);
  lines.push('|---|---|---|');
  const sorted = [...notes].sort((a, b) => a.slug.localeCompare(b.slug));
  for (const it of sorted) {
    const theme = slugOf.get(it.slug) ?? '其他';
    lines.push(`| \`${it.slug}\` | [${escapeMd(it.title)}](/study/${path}/${it.slug}/) | ${theme} |`);
  }
  lines.push('');

  return lines.join('\n');
}

// Slugify Chinese / mixed text to URL anchor (Astro/Starlight compatible)
function slugify(s) {
  return s
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[\/]/g, '-')
    .replace(/[^\w一-龥\-]/g, '');
}

// === Main ============================================================
async function main() {
  const papers = await loadAll('papers');
  const projects = await loadAll('projects');

  // Validate: warn about themed-but-missing slugs (typo detection)
  const paperSlugs = new Set(papers.map((n) => n.slug));
  for (const slug of PAPER_OF.keys()) {
    if (!paperSlugs.has(slug)) console.warn(`[warn] paper theme references missing slug: ${slug}`);
  }
  const projectSlugs = new Set(projects.map((n) => n.slug));
  for (const slug of PROJECT_OF.keys()) {
    if (!projectSlugs.has(slug)) console.warn(`[warn] project theme references missing slug: ${slug}`);
  }

  const papersAtlas = renderAtlas(papers, 'papers');
  const projectsAtlas = renderAtlas(projects, 'projects');

  await writeFile(join(DOCS_DIR, 'papers-atlas.md'), papersAtlas, 'utf8');
  await writeFile(join(DOCS_DIR, 'projects-atlas.md'), projectsAtlas, 'utf8');

  const pUnclass = papers.filter((n) => !PAPER_OF.has(n.slug)).length;
  const prUnclass = projects.filter((n) => !PROJECT_OF.has(n.slug)).length;
  console.log(`papers-atlas.md   ${papers.length} 篇  (${papers.length - pUnclass} 已分类 / ${pUnclass} 待分类)`);
  console.log(`projects-atlas.md ${projects.length} 个  (${projects.length - prUnclass} 已分类 / ${prUnclass} 待分类)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

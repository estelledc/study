> **观察期**：theme/opendesign branch 跑满 3 天日更不挂再 merge main。
> tag: pre-opendesign-20260530（可随时 revert 旧主题）
> abort 信号：build 连续 2 天失败 / 段落行宽 < 60ch / Pagefind 失效

# Jason's Study — 仓库说明

> 这个 README 给操作者看。访问者请去 [https://estelledc.github.io/study/](https://estelledc.github.io/study/) 或本地启 dev server。

## 这是什么

围绕"AI 时代产品工程师"成长路径，深度研究 **GitHub 开源项目** + **学术论文** 并写笔记的站点。
Astro + Starlight 构建，已发布到 GitHub Pages；main 变更只有在共用 CI 门禁通过后才进入部署 job。

两条平行学习线（状态独立维护，避免 worktree 间冲突）：

| 线 | 当前状态 | 方法论 | 队列 |
|---|---|---|---|
| 项目研究 | [STATUS-PROJECTS](./STATUS-PROJECTS.md) | [7 层方法论](https://estelledc.github.io/study/method/) | [项目队列](https://estelledc.github.io/study/queue/) |
| 论文研究 | [STATUS-PAPERS](./STATUS-PAPERS.md) | [8 层方法论](https://estelledc.github.io/study/papers-method/) | [论文队列](https://estelledc.github.io/study/papers-queue/) |

## 目录

```
src/content/docs/
├── index.md             ← 主页
├── about.md             ← 立场宣言
├── career-plan.md       ← 培养路线
├── method.md            ← 项目消化方法论（7 层）
├── queue.md             ← 项目推荐队列
├── projects/            ← 项目研究笔记（由内容审计统计）
├── papers-method.md     ← 论文消化方法论（8 层）
├── papers-queue.md      ← 论文推荐队列（20 篇 / 4 季度）
└── papers/              ← 论文研究笔记（由内容审计统计）

public/papers/<paper-slug>/   ← 每篇论文的 figure（webp 格式）
```

## 本地开发

仓库工具链源真相是 `.nvmrc` 与 `package.json`。`engines` 表达允许升级的支持范围；
`.nvmrc` 与 `packageManager` 表达本地和 CI 共用的规范执行版本。

| 工具 | 规范执行版本 | 支持范围 | 官方依据 |
|---|---:|---:|---|
| Node.js | 22.23.1 | `>=22.23.1 <23` | [v22.23.1 LTS release](https://nodejs.org/en/blog/release/v22.23.1)（访问日期：2026-07-11） |
| npm | 11.17.0 | `>=11.17.0 <12` | [v11.17.0 changelog](https://github.com/npm/cli/blob/v11.17.0/CHANGELOG.md)（声明支持 Node `^22.22.2`；访问日期：2026-07-11） |

首次安装或版本升级后先运行：

```bash
nvm install
nvm use
npm install --global "$(node -p "require('./package.json').packageManager")"
npm run audit:toolchain
npm ci
npm run dev    # http://localhost:4321/study/
npm run build  # 输出到 dist/
```

`audit:toolchain` 会在 Node/npm、版本文件或 workflow 漂移时失败；不要只修改其中一处。

## 部署

已通过 GitHub Pages 部署在 <https://estelledc.github.io/study/>。

`.github/workflows/deploy.yml` 只监听 main；功能分支和草稿 PR 不部署。合并 main 与生产发布需要单独确认，并先通过共用 `verify:ci` 门禁。

## 项目研究方法论速记（7 层，~75 分钟一篇）

| Layer | 输出 |
|---|---|
| L0 身份扫描 | star / version / 维护方 / 主语言 |
| L1 存在理由 | "这东西如果不存在，世界会缺什么" 3-5 句 |
| L2 仓库地形 | 顶层目录注释表 + 心脏文件 |
| L3 心脏代码精读 | 30-100 行真实代码 + 旁注 + GitHub 永久链接 |
| L4 改一处 | 改一行跑测试，观察行为变化 |
| L5 横向对比 | 哲学不同的竞品对比表 |
| L6 与当前工作连接 | 今天 / 下月 / 不要的 三段 |
| L7 自检 + 延伸阅读 | 3-5 个具体怀疑问题 |

详见 [method.md](src/content/docs/method.md)。

## 论文研究方法论速记（8 层，~90 分钟一篇）

| Layer | 输出 |
|---|---|
| L0 身份扫描 | venue / 一作 / 引用数 / repo / arXiv 版本 |
| L1 存在理由 | "这篇出现前，做 X 的人卡在哪" |
| L2 论文地形 | 章节角色注释表 |
| L3 figure / 算法精读 | 心脏 figure 嵌入 + 旁注 + 怀疑 |
| **L4 复现一处** | **硬底线**：跑 repo / 手算 toy / 跑完整 trajectory |
| L5 谱系对比 | 前作 + 后作（2026 视角） |
| L6 与当前工作连接 | 三段 |
| L7 怀疑 + 延伸 | 3 件最不信的事 |

L4 LLM 类降级路径：用 Claude API 跑 1 个完整 trajectory 即可（不一定对齐论文 score）。

详见 [papers-method.md](src/content/docs/papers-method.md)。

## 工具集（论文研究用）

| 工具 | 类型 | 安装 | 用途 |
|---|---|---|---|
| [`lr`](https://lightingread.cn) | CLI | `bun add -g lightread-cli` | 只作为 `scripts/paper-context.mjs` 内部的 search / graph / cite 辅助能力；不要用 `lr pdf` 解析全文 |
| [MinerU](https://mineru.net/apiManage/docs) | API | `.env` 配 `MINERU_API_KEY` | papers 全文 PDF 解析：URL / 本地 PDF → Markdown |
| [OpenAlex](https://developers.openalex.org/api-reference/works) | API | `.env` 可选配 `OPENALEX_API_KEY` | papers 引用元数据补充；无 key 时 `paper-context` 继续走 lr graph / References fallback |
| [arxiv-mcp-server](https://github.com/blazickjp/arxiv-mcp-server) | MCP | `uv tool install arxiv-mcp-server` | 只作摘要 / 元数据补充，不做 PDF download/read |
| [phd-skills](https://github.com/fcakyon/phd-skills) | Claude plugin | `claude plugin install phd-skills@phd-skills` | 12 个 auto-trigger skill：reproduce / paper-verification 等 |
| [DeepPaperNote](https://github.com/917Dhj/DeepPaperNote) | user skill | clone 后 cp 到 `~/.claude/skills/deep-paper-note/` | 15 步深读流程 |
| [paper-comic](https://github.com/zsyggg/paper-craft-skills) | user skill | clone 后 cp 到 `~/.claude/skills/paper-comic/` | 论文方法图解（sketchnote / paper-figure 风） |
| `codex exec` + `imagegen` | Codex CLI | `brew install codex` | 真出图——给 paper-comic 当 backend |

MinerU key 只放本机环境变量或 gitignored `.env`，不要写进 prompt / 笔记 / commit：

```bash
MINERU_API_KEY=...
```

papers 的引用链路源真相是 `scripts/paper-context.mjs`：

```bash
node scripts/paper-context.mjs --slug <slug> --title "<title>" --url "<url>" --year <year> --full-md /tmp/<slug>-mineru/full.md --out /tmp/<slug>-paper-context.json
```

它会按 `lr search → OpenAlex → lr graph search/build → MinerU References → 手工最小引用` 逐层兜底，并把 `fallback_used` / `warnings` 写进结构化 JSON。

## Figure 工作流（论文笔记加图）

```
 paper-comic 写 prompt           codex 生成 PNG       cwebp 压缩 13-15×
        ↓                              ↓                       ↓
  prompt 描述每页内容    →    ~/.codex/generated_images/    →    public/papers/<slug>/*.webp
                                                                       ↓
                                                            笔记 ![alt](/study/papers/<slug>/01.webp)
```

每篇论文笔记的 figure 放在 `public/papers/<paper-slug>/`，用 webp 格式（PNG 转 webp 压缩 13-15×，每张 60-130KB）。

## 公开站红线（项目级 hard rule）

- 正文 + commit message 都不得出现私域内部上下文（项目代号 / 内部域名 / 团队关系等）
- 发现疑似敏感内容立即停止发布，运行 tracked-file 红线审计并按泄漏类型处理；不要在日志或 fixture 中复述命中原文。
- 已发布历史是否需要轮换凭证或重写必须单独评估和授权，不能用默认 force push 处理。

## 发布历史

- 2026-05-27 — 项目研究 20 篇全部完成（5 个 Season），首次部署
- 2026-05-28 — 启动论文研究线，建立 8 层方法论 + 20 篇队列
- 2026-05-28 — 安装 4 件工具集（lr 已有 / arxiv-mcp / phd-skills / DeepPaperNote / paper-comic）
- 2026-05-28 — ReAct 重构为"状元篇"模板（含 3 张 sketchnote 图，约 1100 行）

## 延伸阅读

并行维护的几个独立学习站，按主题分仓：

- [embodied-ai-reading-station](https://github.com/estelledc/embodied-ai-reading-station) — 13 篇 embodied AI 阅读站，atelier-zero 编辑风格
- [hust-eic-os-review](https://github.com/estelledc/hust-eic-os-review) — 华中 OS 课程复习，71 套主题静态站
- [hust-eic-microwave-from-scratch](https://github.com/estelledc/hust-eic-microwave-from-scratch) — 华中微波从零讲起

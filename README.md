> **观察期**：theme/opendesign branch 跑满 3 天日更不挂再 merge main。
> tag: pre-opendesign-20260530（可随时 revert 旧主题）
> abort 信号：build 连续 2 天失败 / 段落行宽 < 60ch / Pagefind 失效

# Jason's Study — 仓库说明

> 这个 README 给操作者看。访问者请去 [https://estelledc.github.io/study/](https://estelledc.github.io/study/) 或本地启 dev server。

## 这是什么

围绕"AI 时代产品工程师"成长路径，深度研究 **GitHub 开源项目** + **学术论文** 并写笔记的站点。
Astro + Starlight 构建，已发布到 GitHub Pages，每次推 main 自动 redeploy。

## 当前规模（2026-06-06）

| 维度 | 已写 | 双千目标 | 完成率 |
|---|---:|---:|---:|
| 论文 papers | **908** | 10,000 | 9.08% |
| 项目 projects | **796** | 10,000 | 7.96% |
| **合计** | **1,704** | 20,000 | 8.52% |

- **专题闭环**：视频论文 65/65 · 媒体项目 50/50 · [阅读站 3 hub](https://estelledc.github.io/study/reading-stations/)
- **项目现状快照**：[`research/project-status-2026-06.md`](./research/project-status-2026-06.md)
- **流水线**：治理期 `data/STOP_SIGNAL` 存在，auto-push 暂停；续跑见 project-status §已知问题

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
├── projects/            ← 项目研究笔记（796 篇）
├── projects-atlas.md    ← 项目全景索引（按 分类/子分类 自动生成）
├── papers-method.md     ← 论文消化方法论（8 层）
├── papers-queue.md      ← 论文推荐队列
├── papers/              ← 论文研究笔记（908 篇）
├── papers-atlas.md      ← 论文全景索引（按 分类/子分类 自动生成）
├── reading-stations.md  ← 专题阅读站入口（3 hub 已上线）
└── stations/            ← 各专题 hub（video-understanding / mllm / distributed-systems）

data/taxonomy.json       ← 分类 SSOT（一级主题 + topic 映射）
scripts/classify-notes.mjs  ← 批量归一化 分类/子分类
scripts/regen-atlas.mjs     ← build 前重生成 atlas

public/papers/<paper-slug>/   ← 每篇论文的 figure（webp 格式）
```

## 本地开发

```bash
npm install
npm run dev    # http://localhost:4321/study/
npm run build  # prebuild 会跑 regen-atlas，输出到 dist/

# 批量更新全库分类（改 taxonomy 后）
node scripts/classify-notes.mjs --apply
node scripts/regen-atlas.mjs
```

## 部署

已通过 GitHub Pages 部署在 <https://estelledc.github.io/study/>。

`.github/workflows/deploy.yml` 监听 main 分支，每次 push 自动 build + deploy（需通过 `verify` job：quality-gate 全绿 + test:ci + 链接检查）。

## 搜索说明（Pagefind 局限）

站点使用 **Pagefind** 做全文搜索（Cmd-K）。注意：**Pagefind 不支持中文 stemming**（词干归并），搜「分布式」不会自动命中「分布式的」。使用建议：

- 搜英文关键词（如 `raft`、`attention`）效果最好
- 搜中文时用完整词语而非缩写
- 用 [论文全景索引](/study/papers-atlas/) / [项目全景索引](/study/projects-atlas/) 按分类浏览

## 笔记质量标记

atlas 索引表有「质量」列，含义：

| 标记 | 说明 |
|------|------|
| ⭐ Season | 人工深度研读，8 层完整流程，含 L4 复现 |
| ✅ v3 | 零基础流水线 12 段模板，150–200 行，L4 待填充 |
| 🗄 存量 | 早期长文迁移，结构完整但 L4 不保证 |

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
| [`lr`](https://lightingread.cn) | CLI | `bun add -g lightread-cli` | 搜 arxiv / scholar，每日推荐 |
| [arxiv-mcp-server](https://github.com/blazickjp/arxiv-mcp-server) | MCP | `uv tool install arxiv-mcp-server` | search → download → read 一站式 |
| [phd-skills](https://github.com/fcakyon/phd-skills) | Claude plugin | `claude plugin install phd-skills@phd-skills` | 12 个 auto-trigger skill：reproduce / paper-verification 等 |
| [DeepPaperNote](https://github.com/917Dhj/DeepPaperNote) | user skill | clone 后 cp 到 `~/.claude/skills/deep-paper-note/` | 15 步深读流程 |
| [paper-comic](https://github.com/zsyggg/paper-craft-skills) | user skill | clone 后 cp 到 `~/.claude/skills/paper-comic/` | 论文方法图解（sketchnote / paper-figure 风） |
| `codex exec` + `imagegen` | Codex CLI | `brew install codex` | 真出图——给 paper-comic 当 backend |

## Figure 工作流（论文笔记加图）

```
 paper-comic 写 prompt           codex 生成 PNG       cwebp 压缩 13-15×
        ↓                              ↓                       ↓
  prompt 描述每页内容    →    ~/.codex/generated_images/    →    public/papers/<slug>/*.webp
                                                                       ↓
                                                            笔记 ![alt](/papers/<slug>/01.webp)
```

每篇论文笔记的 figure 放在 `public/papers/<paper-slug>/`，用 webp 格式（PNG 转 webp 压缩 13-15×，每张 60-130KB）。

## 公开站红线（项目级 hard rule）

- 正文 + commit message 都不得出现私域内部上下文（项目代号 / 内部域名 / 团队关系等）
- 凡出现一律 `git reset --soft` + 重写 commit + force push
- 红线条目存在 Claude Code 全局 memory，下次违反会自动加载提醒

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

---
title: Turborepo — 用任务图和缓存决定哪些活不用再干
description: 固定版本把 turbo 任务合同编成图，再用本地/远程缓存决定是否真跑
来源: https://github.com/vercel/turborepo
日期: 2026-08-27
分类: 前端工程化
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: project
  note_type: tool
  canonical_source: https://github.com/vercel/turborepo
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 53752d452049bdda47698354b16a83d7ce92ced0
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 2.10.12
---

## 是什么

Turborepo 是一个 JS/TS monorepo 任务编排器。日常类比：它不自己炒菜，但会按菜单画出“先做哪道、哪些可以并行”，并记住上次同一份配料做过的结果。

固定 2.10.12 的 npm 包名是 `turbo`，二进制 `turbo`，实现在 Rust crate。你写一份 `turbo.json`，再跑：

```bash
npx turbo run build
```

它会把 workspace 包和任务定义编成 DAG，按就绪节点调度，并用 hash 决定复用缓存还是真跑子进程。

## 为什么重要

不看固定源码，容易把 Turborepo 说成“更快的 npm scripts”：

- 为什么 `dependsOn: ["^build"]` 不是“先跑自己的 build”，而是先跑**其他包**的同名任务
- 为什么 package 依赖成环不一定失败，任务图成环才会拒绝执行
- 为什么本地和远程缓存都能关，关掉之后构建仍继续
- 为什么 `outputs` 写空会出现“cache hit 但产物不在”

一句话：Turborepo 的产品判断是**一份任务合同 + 可开关的双层缓存**，不是万能 hermetic build。

## 核心要点

固定版本可以把主链拆成四步：

1. **构图**：`EngineBuilder` 读取 `turbo.json`（含 extends），结合 package graph 生成 task graph。`^task` 匹配其他包的同名任务，`pkg#task` 是精确任务，无前缀只看当前包。
2. **调度**：`Engine::execute` 用 Walker 弹出就绪节点。默认用 semaphore 限制并发；`parallel=true` 才不抢许可。
3. **算 hash**：任务 hash 委托 `turborepo-task-hash`。`Run` 会收集 global file hash、external deps hash 和 internal deps hash；上游任务 hash 会进入下游输入。
4. **查缓存再执行**：`CacheMultiplexer` 先读本地 FS，再读远程 HTTP。产物是 gzipped tarball。visitor 命中后 replay 日志并按 `outputs` 还原文件；未命中才 spawn 命令。

默认 cache 目录解析落到 `.turbo/cache`。restore 拒绝经 symlink 写回、Windows 不安全文件名，以及越出目录的 link。

## 实践示例

### 案例 1：声明拓扑依赖

```json
{
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"]
    }
  }
}
```

**逐部分解释**：

1. `^build` 的 `^` 表示“其他包的 build”，不是当前包再跑一次 build。
2. package graph 允许环；若 `^` 穿过环把任务图绕死，执行前会报 `CyclicTaskGraph`。
3. `outputs` 同时决定打进 tarball 和 hit 时还原什么。

### 案例 2：缓存可以两边都关

```bash
npx turbo run build --cache-dir .turbo/cache
```

固定源码里，本地和远程缓存是两套独立开关。两边都 `should_use() == false` 时只警告 `no caches are enabled`，不会因此失败。远程 write 关掉时，put 会跳过上传并提示 read-only。

### 案例 3：空 outputs 只 replay 日志

```json
{ "tasks": { "build": { "outputs": [] } } }
```

`outputs` 的 inclusions 为空时，tarball 里没有产物文件。下一次 hash 相同仍可 cache hit，但工作树不会被还原 `dist/` 或 `.next/`。这不是“更快”，是还原清单为空。

## 踩过的坑

1. **把 `^build` 理解成当前包自己的前置任务**：无前缀才是当前包；`^` 明确要求 `candidate.package() != current`。
2. **以为关掉缓存等于命令失败**：固定实现只警告，调度和执行继续。
3. **把默认缓存路径写成 `node_modules/.cache/turbo`**：本版本解析默认是 `.turbo/cache`。
4. **把 README 的 FULL TURBO 耗时当成本轮测量**：本文没有跑 CLI 或远程 cache。

## 适用 vs 不适用场景

**适用**：

- 纯 JS/TS workspace，愿意用一份 `turbo.json` 声明任务依赖和 outputs
- 需要本地优先、远程可选的缓存，并能接受“声明错 inputs/outputs 就错命中”
- 想先跑任务图，而不是上完整 plugin / generator 平台

**不适用**：

- 需要 hermetic sandbox 强制正确性 → 看 Bazel，不看本页的信任声明模型
- 需要把静态阅读写成已验证的 CI 加速比例
- 需要审查 [[turbopack]] bundler 或 Nx Cloud DTE —— 那些不在本页固定范围

## 固定版本边界

- 本文绑定 `vercel/turborepo@53752d45...`，npm 包 `turbo@2.10.12`。
- npm registry 未提供 `gitHead`；版本对齐依据是 Git tag `v2.10.12` 与 `packages/turbo/package.json`。
- CLI 是按平台分发的原生二进制；JS 包只提供 bin 包装和 `schema.json`。
- 本文只做源码静态审查，没有安装依赖或运行 `turbo`，状态保持 `UNVERIFIED`。

## 学到什么

1. **任务图环和 package 环不是一回事**——后者可以存在，前者会挡住执行
2. **`^` 是跨包选择器**，不是“先跑同名任务”的口语缩写
3. **缓存开关失败不会变成构建失败**，但空 outputs 会变成“绿色 hit、文件不在”
4. **hash 链式失效**依赖你声明的 inputs/outputs，不是 git diff 表面文件

## 应用型自测

1. `dependsOn: ["^build"]` 会先跑当前包的 `build` 吗？
2. 本地和远程缓存都关掉时，`turbo run build` 会因为“没有缓存”直接失败吗？
3. `outputs: []` 后第二次跑得到 cache hit，`dist/` 一定还在吗？

检查点：

1. 不会。`^` 只匹配其他包的同名任务。
2. 不会。固定实现只警告 `no caches are enabled`。
3. 不一定。空 inclusions 不会还原产物文件。

## 延伸阅读

- 官方文档：[turborepo.dev](https://turborepo.dev)
- 固定源码：[vercel/turborepo](https://github.com/vercel/turborepo) —— 本文绑定提交 `53752d452049bdda47698354b16a83d7ce92ced0`
- [[nx]] —— 同赛道、带 project graph / plugin / native hasher 的对手
- [[pnpm]] —— 常见的 workspace 安装层，不负责任务调度
- [[lerna]] —— 更早的包发布循环，不是本页的 hash cache

## 关联

- [[nx]] —— project graph + native hasher + plugin/generator
- [[pnpm]] —— workspace 依赖安装，常和 turbo 叠用
- [[lerna]] —— 发布/版本循环的前辈
- [[turbopack]] —— 同公司 bundler，不是本页审查对象
- [[vite]] —— 常见被调度的底层 bundler
- [[next-js]] —— monorepo 里常见的应用宿主

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[biome]] —— Biome — JS/TS 工具链一体化（Rust 写的 linter+formatter）
- [[changesets]] —— changesets — 让每个 PR 自带版本号 bump 声明
- [[dayjs]] —— Day.js — 用 2 KB 复刻 Moment 的极简日期库
- [[jest]] —— Jest — 一个包就能跑 JS 测试的全家桶
- [[just]] —— just — 把 make 拆成两半，只留 ‘命令编排’ 那一半
- [[lerna]] —— lerna — 一个仓库发几十个 npm 包的祖宗工具
- [[lingui]] —— Lingui — 写自然字符串，编译期自动提取 i18n msgid
- [[mise]] —— mise — 一条命令切换项目用的 Node/Python/Go 版本
- [[nextra]] —— Nextra — 在 Next.js 上盖一层文档站脚手架
- [[nx]] —— Nx — 用 project graph 和 native hasher 决定哪些任务要跑
- [[plane]] —— Plane — 开源版 Linear/Jira，把任务、冲刺和协同文档放进自己的机器
- [[pnpm]] —— pnpm — 全机器只存一份的 Node 包管理器
- [[task]] —— Task — 用 YAML 写一份跨平台的 ‘项目命令清单’

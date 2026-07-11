---
title: Turborepo — 让 monorepo 学会"哪些活已经干过了不要再干"
来源: 'https://github.com/vercel/turborepo'
日期: 2026-05-30
分类: 前端工程化
难度: 中级
---

## 是什么

**Turborepo** 是一个 JS/TS monorepo 的任务编排器：你声明"哪些任务依赖哪些任务"，它就会算出一张图，按顺序并行跑，跑过的结果记下来，下次相同输入直接复用。日常类比：像一家**中央厨房的领班**——他不自己做菜，但他记住"番茄炒蛋"上次做过、料没换，再有人点就直接端上次那盘出去；只有真有人改了配料，才让厨师重新下锅。

你写一份 `turbo.json`：

```jsonc
{
  "tasks": {
    "build": {
      "dependsOn": ["^build"],          // ^ 表示先 build 依赖包
      "inputs": ["src/**", "tsconfig.json"],
      "outputs": ["dist/**"]
    }
  }
}
```

跑 `turbo run build`，它会按包的依赖关系拓扑排序、并行执行、把每个任务的输入算成 hash，命中过就直接 replay 日志+解压产物。这是 Vercel 收购 Jared Palmer 原作后用 Rust 重写的版本，和 [[turbopack]] 共享 crate。

## 为什么重要

不理解 Turborepo 的思路，下面这些事都没法解释：

- 为什么一个 50 包的 monorepo CI 能从 8 分钟降到 1 分钟——hash 没变就跳过执行，不是变快
- 为什么"远程缓存"是它的真正杀手锏——你的本地 build 产物可以让 CI 直接拿，反过来也行
- 为什么 `outputs: []` 会得到"绿色 cache hit 但应用启动失败"——cache 不只是日志
- 为什么大公司选 Bazel、中小团队选 Turborepo——前者偏执正确性，后者偏执速度和易用

## 核心要点

可以把 Turborepo 拆成 **三件事**：

1. **任务图**：把 `package.json` + `turbo.json` 解析成一张 DAG（有向无环图），节点是"包#任务"（如 `web#build`），边是 `dependsOn`。类比：地铁线路图——你不用规划路径，按图走就行。

2. **Hash 决定跑不跑**：每个任务的 hash = 输入文件内容 + 环境变量 + 全局依赖 + 上游任务的 hash。算出来一对，去 cache 找。命中就 replay；没中才真的 spawn 子进程跑。类比：考试前先看答题卡有没有这道题的答案——有就抄，没有才动脑。

3. **双层缓存**：本地一层（`node_modules/.cache/turbo/{hash}.tar.zst`），远程一层（HTTP）。fetch 时先查本地，几百微秒；本地没有再打远程，命中就回填本地下次省事。类比：书柜 + 图书馆——自己书柜没有再去图书馆借，借回来顺手抄一份放书柜。

## 实践案例

### 案例 1：30 分钟跑通 + 看 FULL TURBO

```bash
mkdir -p ~/lab/turbo && cd ~/lab/turbo
npx create-turbo@latest demo --package-manager pnpm
cd demo && pnpm install

pnpm turbo run build
# Tasks: 7 successful, 7 total
# Cached: 0 cached, 7 total          ← 第一次全真跑
# Time:   8.234s

pnpm turbo run build
# Cached: 7 cached, 7 total          ← 什么都没改，全 hit
# Time:   312ms  >>> FULL TURBO
```

**逐部分解释**：第一次没有 cache，所有任务真跑；第二次 hash 和上次完全一样，直接 replay 日志、解压产物到原位置，所以从 8 秒降到 300 毫秒。`FULL TURBO` 是 Turborepo 在"全 hit"时打印的彩蛋字样。

### 案例 2：改一行只重跑受影响的任务

```bash
echo "// touched" >> packages/ui/src/button.tsx
pnpm turbo run build
# Cached: 5 cached, 7 total          ← ui 和 web 重 build；其余 cache hit
# Time:   2.1s
```

`packages/ui` 的内容变了 → ui 自己 hash 变 → 它的 dependent `web` 上游 hash 也变（因为 dependsOn 上游 hash 是输入的一部分）→ 这两个真跑；其他 5 个包的输入没变，hash 不变，cache hit。这就是"affected"的本质：**hash 链式失效**，不是 git diff 表面文件。

### 案例 3：outputs 写空就翻车

```jsonc
// 改之前
{ "tasks": { "build": { "outputs": ["dist/**", ".next/**", "!.next/cache/**"] } } }
// 改之后
{ "tasks": { "build": { "outputs": [] } } }
```

跑两次 `turbo run build` 后启动 `pnpm --filter web start`：

| 行为 | outputs 列对 | outputs: [] |
|---|---|---|
| 第二次 build cache hit | 7/7 | 7/7（逻辑 hit） |
| `apps/web/.next/` 状态 | 仍然存在 | **被删了**（cache restore 不还原任何文件） |
| 启动 web | 成功 | 失败：`.next/BUILD_ID` not found |

**outputs 同时决定"打什么进 cache"和"hit 时还原什么"**——空 outputs = cache 只剩日志，下次"hit"啥也不还原。

## 踩过的坑

1. **outputs 写漏 / 写空**：会得到"绿色 cache hit 但启动失败"——cache 只 replay 日志和退出码，不还原文件，下次启动直接 BUILD_ID not found。把所有产物 dir 都列上才安全。
2. **inputs glob 写漏文件**：cache 会错命中拿到陈旧产物。Turborepo 不像 Bazel 有 sandbox 强制，全靠你声明对。新增源文件后第一时间审视 `inputs` 是不是覆盖到了。
3. **tsconfig.base.json 不在 task 的 inputs 里**：跨包共享配置 base 改了 cache 不失效。要么加进每个 task 的 `inputs`，要么塞进 `globalDependencies`——后者更省事。
4. **globalDependencies 滥用变 nuclear**：列 `*.md` 这种全仓文件，任何文档改动都让所有任务 cache miss。只列**真正影响所有任务输出的全局文件**（`.env`、`tsconfig.base.json`、`pnpm-lock.yaml`）。

## 适用 vs 不适用场景

**适用**：

- 纯 JS/TS monorepo + 想要"开箱 cache + 远程 cache + 半小时上手"——90% 场景的合理默认
- CI 里 build/test 慢的项目：开远程 cache 后 30-70% 时间省下来
- 多人协作 monorepo（SDK + CLI + 文档站组合）：用 `--filter=` 跑 affected 子集
- 想可视化依赖关系：`turbo run build --graph=graph.svg` 直接 dump 出图

**不适用**：

- 单包项目：跨包调度是 Turborepo 的价值，单包用 `npm run build` 更直接
- 需要 hermetic / sandbox 严格正确性 → 用 Bazel
- 多语言（Java + Python + TS）heavy 场景 + 需要 plugin 生态 → Nx 或 Bazel
- 想插自定义 hook 在 task 跑前/跑后 → Turborepo 没 plugin 系统，这条路堵死

## 历史小故事（可跳过）

- **2014**：Lerna 出现，只能串行循环跑 `npm run`，没 graph 没 cache
- **2017**：Bazel 把 Google 内部"hermetic build + 远程 cache"思想外溢，但学习曲线极陡
- **2020**：Nx 把 task graph + cache 引入 JS 世界，plugin 模型很重
- **2021**：Jared Palmer 一个人写了精简版 Turborepo（TS），目标"只做 graph + cache，turbo.json 一文件搞定"
- **2021-12**：Vercel 收购，2022 年起用 Rust 重写，逐步和 [[turbopack]] 共享 crate

理念变化：从"工程师手动列每条依赖"（Bazel）到"按 package.json 自动构图 + 一份 turbo.json 描意图"（Turborepo）——把心智负担从声明每条边降到声明 task 类型。

## 学到什么

1. **Hash-based incremental computation 是核心心智模型**——把"跳过没变的活"变成第一公民，远程 cache、affected filter、watch mode 都是它的副作用
2. **配置一元化 vs 组合化**：Turborepo 一份 turbo.json 管全部，Nx 每包一份 + 全局一份 + plugin 链——前者上手快，后者天花板高
3. **速度 vs 正确性的工程取舍**：Turborepo 信任你声明对了 inputs/outputs；Bazel 不信任，sandbox 强制——明确知道自己在选哪边
4. **outputs 是 cache 的"还原清单"不是"打包清单"**——这条理解错就会被空 outputs 坑

## 延伸阅读

- 官方文档：[Turborepo Handbook](https://turborepo.com/docs)（Tasks / Caching / Remote Caching 三章必读）
- Vercel 博客：[Why we wrote Turborepo in Rust](https://vercel.com/blog/turborepo-1-7)（重写动机第一手解释）
- 视频：[Theo - Turborepo in 100 Seconds](https://www.youtube.com/watch?v=ngU4uK2yzWI)（看完就够上手）
- 自托管 cache：[ducktors/turborepo-remote-cache](https://github.com/ducktors/turborepo-remote-cache)（社区实现 `/v8/artifacts` 协议）
- [[turbopack]] —— 同公司同语言的 bundler 内部增量计算
- [[nx]] —— 路线非常像但 plugin 模型更重的对手

## 关联

- [[turbopack]] —— 同 crate 共享，把 task graph 思路从 monorepo 尺度收到 bundler 内部
- [[nx]] —— 最直接的对手，plugin 化 + 多语言，天花板高但学习曲线陡
- [[lerna]] —— Turborepo 的精神前辈，串行循环跑 npm script 的老世界
- [[pnpm]] —— Turborepo 最佳搭档，pnpm workspaces 管 install + Turborepo 管 build
- [[vite]] —— Turborepo 不替代它，是它的调度者；vite 跑 dev server，turbo 串多包
- [[webpack]] —— 同样不替代，turbo run build 内部仍然 spawn webpack 跑
- [[next-js]] —— 最常见的"宿主"，monorepo 里 next.js 应用 + 共享 ui 包是经典组合

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
- [[nx]] —— Nx — 一个仓库装几十个项目时帮你少跑活的工具
- [[plane]] —— Plane — 开源版 Linear/Jira，把任务、冲刺和协同文档放进自己的机器
- [[pnpm]] —— pnpm — 全机器只存一份的 Node 包管理器
- [[task]] —— Task — 用 YAML 写一份跨平台的 ‘项目命令清单’

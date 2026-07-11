---
title: Turbopack — 把 bundler 重做成增量计算应用
来源: 'https://github.com/vercel/next.js/tree/main/turbopack'
日期: 2026-05-30
分类: 前端工具
难度: 中级
---

## 是什么

Turbopack 是 Webpack 作者 Tobias Koppers 在 Vercel 做的**第二代 bundler**，核心特点是底层有一个叫 **Turbo Tasks** 的增量计算引擎。日常类比：像一个**带记账本的厨师**——做过的菜如果食材一模一样，他就把上次的端出来；只有真正变了的那道才会重新烧。

普通 Webpack 每次改一个文件，都要重新解析、重新打包一大圈；Turbopack 把每个步骤（resolve、parse、收集依赖、切 chunk）都包成一个可缓存的**任务节点**，输入哈希命中就跳过执行。

```bash
# Next.js 16+ 默认就是 Turbopack，直接跑即可
next dev
# 改一行 .tsx，浏览器 100-300 ms 就刷新；旧版 webpack 通常 1-3 秒
```

它定位是 **Next.js 的自家 bundler**（dev + production），而不是 webpack 的通用替代——这点和路线相反的 [[rspack]] 形成对照。

## 为什么重要

不理解 Turbopack 的设计选择，下面这些事都没法解释：

- 为什么同一作者 **8 年内做了两遍 bundler**——不是 webpack 不够好，是物理上改不快了
- 为什么它**故意不兼容 webpack plugin**——这是设计选择，不是工期没到
- 为什么 Next.js 16 能把 Turbopack 设成默认 bundler，却仍要留 `--webpack` 逃生口
- 为什么 2024 年仓库从 `turborepo` 搬进 `next.js`——本质是定位收敛，不再装作通用工具

## 核心要点

Turbopack 的设计可以拆成 **三件事**：

1. **bundler 是一个增量计算应用**：每次文件改动只重做受影响的子图，这不是优化，是**第一性原理**。学术界 [[adapton]] / [[salsa-adapton]] 早就给过这种 query-based 增量计算的现成模型。

2. **任务节点 = 函数 + 输入哈希**：在 Rust 函数上加一个 `#[turbo_tasks::function]` 宏，函数体被搬到调度器里执行。调用时把参数打包算哈希，命中缓存就直接拿旧结果，**根本不调用函数**。所以函数体里**不能有副作用**——任何 IO 都得再包一层。

3. **可序列化输入还能落盘**：能 bincode 编码的输入，引擎会把整张任务图持久化到 `.next/cache/turbopack/`。重启 dev server 还能命中昨天的缓存——这是它在大型 monorepo 上能"秒启动"的根因。

类比：每个任务节点像一张写着"输入 → 输出"的便利贴，整个项目就是一面贴满便利贴的墙。改一个文件，就把指向它的那些便利贴撕掉重写；其他不动的便利贴继续用，**绝大多数情况下"改一行只重算几张便利贴"**。

这套设计里最反直觉的一条：函数体里**不能有任何副作用**——写文件、改全局变量都不行，否则缓存命中就漏掉了这些动作。所有真实 IO 都得再被包成一个独立任务节点，由引擎统一调度。

## 实践案例

### 案例 1：Next.js 项目里直接体验 dev 速度

```bash
npx create-next-app@latest tp-test
cd tp-test
npm run dev
# Next 16+ 默认 Turbopack；旧版可加 --turbopack
# 改 app/page.tsx 任意一行，看终端 "Compiled in 120ms"
```

第一次启动相对慢（任务图要建起来），但**第二次启动**会从 `.next/cache/turbopack/` 直接 hydrate——这就是持久化缓存在生效。同一个项目下，删掉这个目录再跑一次，体感会回到"几秒才能就绪"的速度，对比非常直观。

### 案例 2：用 trace 看缓存命中

```bash
NEXT_TURBOPACK_TRACING=1 next dev
# 改完文件后停掉；trace 落在 .next/ 下
# 用官方 trace 查看器打开，看任务图、命中率、耗时分布
```

trace UI 会列出每个任务节点是 **cold（首次执行）/ hit（缓存命中）/ recompute（输入变了）**，能直观看出哪些步骤拖慢了开发。

比如改一个 CSS 文件，绝大部分 ecmascript 任务应该是 hit；如果发现一片红色 recompute，说明依赖图设计上有不该有的连边——通常是 layout / barrel file 之类把所有 page 串起来的"全局节点"在作怪。

### 案例 3：把任务图思路用在自己的小 builder 上

不需要真用 Turbopack，也可以借鉴它的设计：

```js
// build.mjs —— 一个迷你静态站点 builder
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
const cache = new Map();
function memo(fn) {
  return (...args) => {
    const key = createHash('sha1').update(JSON.stringify(args)).digest('hex');
    if (cache.has(key)) return cache.get(key);
    const v = fn(...args);
    cache.set(key, v);
    return v;
  };
}
// 把 mtime 放进 key：文件改了哈希自然变，才会重跑
const renderPage = memo((mdPath, mtime) => readFileSync(mdPath, 'utf8').toUpperCase());
```

核心收获不是 Turbopack 本身，是**把每一步包成纯函数 + 输入哈希做缓存**这套范式——一旦每一步都是纯函数，整个 build 就自然变成"只重算受影响子图"。

## 踩过的坑

1. **Webpack plugin 完全不兼容**：要扩展只能写 SWC plugin（Wasm 沙盒）或 ecmascript-plugin（Rust 静态链接）；社区可用 plugin 数量目前是 webpack 的 1% 量级，老项目里大量 webpack-specific plugin 不要硬上，先评估迁移成本。

2. **深度 webpack 配置会逼你回退**：Next.js 16 默认 Turbopack；若 `next.config` 里有自定义 webpack 钩子且无 turbopack 等价配置，`next build` 可能直接报错——只能显式 `next build --webpack` 逃生，或重写配置。

3. **持久化缓存目录会膨胀**：`.next/cache/turbopack/` 在中型项目能涨到 1-3 GB；CI 节点 cache 策略要重新设计，不能简单复用 webpack 的 cache key，否则缓存命中率会非常糟糕。

4. **不适合做库打包**：架构假设 entry 是应用 + chunk graph 输出；做需要 single-file ESM/CJS 双产物的库时输出不可控，应该用 [[rolldown]] 或 [[esbuild]]。

## 适用 vs 不适用场景

**适用**：

- Next.js 15+ 项目（15 起 dev 稳定；16+ 默认 bundler，零配置）
- 大型 monorepo / 长期 dev server——持久化缓存优势最明显
- 想把"增量计算"心智用到自己工具链里——Turbopack 是一个活的参考实现
- 团队对 HMR / cold start 敏感，且没有硬依赖 webpack plugin

**不适用**：

- 已经深度依赖 webpack plugin 生态——选 [[rspack]]，或 Next 里显式 `--webpack`
- 写库 / 工具——选 [[rolldown]] 或 [[esbuild]]，输出更可控
- 需要自定义 webpack 钩子又不愿改写——先别切默认路径，用 `--webpack` 过渡
- 完全脱离 Next.js 的通用 bundler 需求——standalone CLI 仍 experimental，不是给生产用的

## 历史小故事（可跳过）

- **2014 年**：Tobias Koppers 发布 [[webpack]] 1.0——一份 JS 写的、靠 plugin 串起来的 bundler，奠定了"loader + plugin + chunk"的心智模型。
- **2020 年**：Webpack 5 发布，加了 filesystem cache。Tobias 自己最清楚——JS 单线程、没 first-class 缓存抽象，cold build 物理上改不快了。
- **2022-10**：Tobias 加入 Vercel 后，在 Next.js 13 发布会推出 Turbopack，宣称"比 [[vite]] 快 700×"——后来这个数字被各种场景测试打脸，Vercel 也下调了说法。
- **2024-08**：仓库从独立的 `vercel/turborepo` 搬进 `vercel/next.js`，标志定位收敛——它就是 Next.js 自家 bundler。
- **2025**：Next.js 15 起 `next dev` 的 Turbopack 标为 stable；15.3–15.5 给 `next build` 开实验/beta；16（2025-10）起默认 bundler（可用 `--webpack` 回退）。
- **2026-05**：社区把它和 [[rspack]] / [[rolldown]] 放在一起讨论 Rust bundler 三大流派；standalone 通用 CLI 仍未成为主线。

## 学到什么

1. **同一个人愿意做两遍 bundler，第一性原理换了**：webpack 的心智不动只是实现慢——这是 [[rspack]]；bundler 应该是增量计算应用——这是 Turbopack。
2. **不兼容是设计选择**：Tobias 主动放弃自己创造的 webpack plugin API，是因为它已经成了历史负担——重做就重做彻底，长痛不如短痛。
3. **学术理论 → 工业落地需要十年**：[[adapton]] (2014) → [[salsa-adapton]] (2018) → Turbo Tasks (2022)，增量计算从论文走到 bundler 心脏花了八年。
4. **定位收敛胜于强行通用**：从"webpack 接班人"到"Next.js 默认 bundler"，承认边界反而让产品交付质量更高，营销话术更克制。

## 延伸阅读

- 官方站点：[turbo.build/pack](https://turbo.build/pack)（架构图 + benchmark 数据 + 路线图）
- 引擎源码起点：[`turbopack/crates/turbo-tasks`](https://github.com/vercel/next.js/tree/main/turbopack/crates/turbo-tasks)（看 `manager.rs` 怎么调度任务节点）
- Next.js 官方博客 turbopack 标签下的几篇 launch / progress 文章——非技术细节但讲清楚定位演变
- Tobias 演讲：搜 "Turbopack: An Incremental Bundler" YouTube，讲为什么 bundler 是 incremental computation
- [[salsa-adapton]] —— Turbo Tasks 思想直接借鉴的论文系
- [[adapton]] —— 增量计算的更老的根
- [[rspack]] —— 路线相反的 webpack 兼容版 Rust bundler，做最强对照

## 关联

- [[salsa-adapton]] —— Turbo Tasks 引擎是 Salsa 思路的工业落地
- [[adapton]] —— 更早的增量计算论文，给了"自适应计算"原型
- [[rspack]] —— 同样 Rust 写的 bundler，但走 webpack 兼容路线（强对照组）
- [[rolldown]] —— Vite 团队的 Rust bundler，更适合做库
- [[vite]] —— dev 极致快但 build 走 rollup 的两段式方案
- [[esbuild]] —— Go 写的 bundler，奠定"原生语言重写"先例
- [[swc]] —— Turbopack 的 ecmascript 后端用的解析器（同源 Vercel 团队）
- [[next-js]] —— Turbopack 的最大宿主，定位收敛后两者深度耦合

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[next-js]] —— Next.js — React 全栈框架
- [[rolldown]] —— rolldown — 用 Rust 给 Vite 当统一引擎的打包器
- [[rspack]] —— rspack — 用 Rust 重写 webpack 的内核，但留下整个 plugin 生态
- [[swc]] —— SWC — Rust 写的 TS/JS 编译器
- [[turborepo]] —— Turborepo — 让 monorepo 学会"哪些活已经干过了不要再干"
- [[vite]] —— Vite — 浏览器自己加载源码的构建工具
- [[webpack]] —— webpack 模块打包
- [[why-did-you-render]] —— why-did-you-render — 让 React 告诉你这次渲染到底为什么

---
title: rolldown — 用 Rust 给 Vite 当统一引擎的打包器
来源: 'https://github.com/rolldown/rolldown'
日期: 2026-05-30
分类: 构建工具
难度: 中级
---

## 是什么

rolldown 是一个**用 Rust 写的 JavaScript 打包器**（bundler，把多个 JS/TS 源文件合并成少数几个产物文件），目标是当 Vite 项目的唯一引擎。日常类比：像一家原本中午用快餐车、晚上用大厨房做饭的餐馆，现在改成一个统一的厨房，不管午餐晚餐都一套人一套灶台。

具体讲，过去 Vite 在开发模式（dev）用 esbuild 求快，在打包发布（build）用 Rollup 求功能完整。两套打包器各有 AST（编译器内部表示代码的树形结构）、各有 plugin 协议，行为有时不一致，让用户报"开发能跑、build 出错"的 bug。rolldown 想解决这个事——一份引擎同时干两件事。

```bash
npm i -D rolldown
npx rolldown --input src/index.ts --dir dist
```

它对外保留 Rollup 的 plugin 写法（你过去的 Rollup 插件改一下名字就能跑），内部用 oxc（同公司出的 Rust 写的 JS 解析器）做 AST，napi-rs 这个胶水库把 Rust 函数暴露给 Node 调用。维护方是 VoidZero Inc.，也就是 Vite 作者尤雨溪 2024 年成立的工具链公司。

## 为什么重要

不理解 rolldown，下面这些事说不清楚：

- 为什么 Vite 8 起默认打包器换成了 Rolldown，和 Vite 7 的 esbuild+Rollup 双引擎有什么不一样
- 为什么"用 Rust 重写 JS 工具链"这件事 esbuild、swc、Rspack、turbopack 都在做，rolldown 又凭什么挤进去
- 为什么 Rollup 已经够好了还要重写，难道不是炫技——双引擎一致性问题就是答案
- 为什么"plugin 兼容"是这种重写项目的命门——丢了生态等于重启战争，绝大多数 Rust 重写项目卡在这一关

## 核心要点

1. **统一引擎的赌注**：dev 和 build 一份代码、一种 AST、一套 plugin。类比：双语翻译软件改成单引擎，不必为两种语法维护两套规则。代价是一开始要把 esbuild 和 Rollup 的功能都覆盖，开发周期长、要承诺 v1 之前生态会有破坏性变更。

2. **Rollup plugin 协议是宪法**：保留 `resolveId` / `load` / `transform` / `generateBundle` 这些钩子的签名和顺序。类比：换了发动机但保留方向盘，开车的人不用重新学。意义在于继承 Rollup 十年的插件生态——不用从零说服 plugin 作者迁移。

3. **底层全栈 Rust**：parser 用 oxc、resolver 用 oxc-resolver、sourcemap 用 oxc-sourcemap。类比：一家公司全用自己仓库里的零件，想改哪一处都不用看别人脸色。napi-rs 负责把 Rust 函数包装成 Node 模块，对外是普通 npm 包，安装时按平台拉对应预编译二进制。

4. **流水线四阶段**：scan（扫模块图）→ link（连依赖）→ generate（生成 chunk）→ emit（写文件）。类比：报纸印刷分组稿、排版、印刷、装订四步，每步只能等上一步完成。这种 phase 划分让性能瓶颈定位变得直观。

## 实践案例

### 案例 1：直接当 CLI 打包一个小项目

最朴素的用法，绕开 Vite 直接调 rolldown：

```bash
npx rolldown --input src/index.ts --dir dist --format esm
```

`--input` 是入口文件，`--dir` 是输出目录，`--format esm` 让产物是 ES Module（也可选 `cjs`/`iife`）。rolldown 会从入口出发扫所有 import、做 tree-shaking（剪掉用不到的代码）、把多个文件合成几个 chunk 输出。零配置就能跑，适合快速验证一个文件能不能正确打包。

### 案例 2：写一个最小的 plugin 改 import 路径

用 Rollup 老语法的写法，rolldown 直接吃：

```js
// rolldown.config.js
export default {
  input: 'src/index.ts',
  plugins: [{
    name: 'replace-foo',
    resolveId(source) {
      if (source === 'foo') return 'src/foo-replacement.ts'
      return null
    }
  }]
}
```

这个 plugin 拦截 `import x from 'foo'`，把 `foo` 改成本地文件。`resolveId` 钩子是 Rollup 协议里第一个被调用的钩子（每个模块解析时触发）。返回字符串表示重定向到那个路径，返回 `null` 表示这个 plugin 不处理、交给下一个。把上面的 config 文件放进项目根，跑 `npx rolldown -c` 就生效。

### 案例 3：在 Vite 8+ 里用上默认的 Rolldown

Vite 8（2026-03）起 Rolldown 已是默认打包器，升级即可，不必再装临时包 `rolldown-vite`（那是 2025 技术预览）：

```bash
npm install vite@^8
```

需要 Rolldown 专有选项时，在 `vite.config.ts` 里写 `build.rolldownOptions`（例如自定义 chunk 分组）。跑 `npm run dev` / `npm run build` 命令不变，底下已是同一套引擎。仍停在 Vite 7 的项目若只想先试，历史上曾用 `rolldown-vite` 别名替换 `vite`，但新项目应直接上 Vite 8。

## 踩过的坑

1. **Rollup 老 plugin 不保证开箱即用**：签名一样但钩子调用顺序在某些边角场景细微不同，迁移时要跑完整端到端测试才放心，别只看构建命令不报错就过。
2. **写自定义 Rust plugin 门槛陡**：大多数人只能写 JS plugin，跨语言桥每次调用都有序列化开销，热路径上每模块都触发的钩子（比如 `transform`）要避免做重活。
3. **小项目看不出快**：模块数 1000 以下，rolldown 和 esbuild 几乎打平；要 10k+ 模块的大型 monorepo 才显著拉开差距，别用小 demo 跑分得出结论。瓶颈通常在磁盘 IO 不在 parse 速度。
4. **1.0 后 API 锁定、产物行为仍可能变**：公开选项与 plugin 钩子按 semver 兼容；但 DCE/chunk 启发式会继续调优，升小版本仍要看 changelog 与产物 diff。

## 适用 vs 不适用场景

适用：

- Vite 8+ 项目（Rolldown 已是默认引擎），要统一的 dev/build 行为
- 中大型 monorepo（10k+ 模块）打包慢，又需要 Rollup 级 chunk 控制
- 独立 CLI 打包库/应用，要 Rollup 兼容 plugin + Rust 性能
- 组件库作者想输出 ESM/CJS 双格式 + sourcemap + tree-shake 友好的产物

不适用：

- 已经有稳定的 webpack/[[rspack]] 配置且没痛点，没必要折腾迁移
- 项目重度依赖某个非常冷门的 Rollup plugin，未验证兼容性前不要切
- 需要极致 dev server 启动速度且不在乎 build 一致性，[[esbuild]] 单独用反而更快
- 团队没人能在出 bug 时读 Rust 源码定位问题，且依赖过深时很被动
- 静态站点 + 少量 JS 的极简项目，rollup 或 esbuild 单独用就够，rolldown 没必要

## 历史小故事（可跳过）

- 2020 — Evan You（尤雨溪）发布 Vite，用 esbuild 加速 dev、Rollup 负责 build，奠定双引擎模式
- 2023 — ViteConf 公开承认双引擎妥协带来一致性问题，预告统一引擎计划
- 2024-04 — rolldown 首个公开版 `0.10.1`；同年 VoidZero 成立（oxc / rolldown / vitest）
- 2025-05 — 临时包 `rolldown-vite` 技术预览；同年末 Vite 8 beta 默认改用 Rolldown
- 2026-03 / 05 — Vite 8 稳定（Rolldown 成默认引擎）；Rolldown 1.0 稳定，公开 API 按 semver 锁定

## 学到什么

- "兼容老协议 + 重写底层"是工具链升级的常见路线，比"全新 API 推倒重来"更容易被生态接受
- 双引擎模式短期跑得通，长期一致性问题会反咬，统一引擎是值得偿还的技术债
- Rust 重写 JS 工具链的真正瓶颈不是性能，是 plugin 生态——谁先解决兼容谁赢
- VoidZero 这种"公司 + 多个旗舰项目（Vite/oxc/rolldown）"的组织方式给开源工具链长期维护提供了新参考
- 看一个新项目要不要押注，先看它解决的痛点是不是上一代妥协的副作用——是的话往往值得跟

## 延伸阅读

- 官方文档：rolldown.rs（含 migration guide 和 API 参考）
- GitHub 仓库：github.com/rolldown/rolldown（Issue tracker 看真实痛点）
- ViteConf 2023 keynote — Evan You 讲为什么要统一引擎
- VoidZero 公司博客：voidzero.dev（看商业化和路线图视角）
- [[oxc]] — rolldown 的 parser/resolver/sourcemap 全栈底座
- [[vite]] — rolldown 的最大消费者也是设计目标
- [[rollup]] — rolldown 兼容它的 plugin 协议

## 关联

- [[vite]] —— rolldown 的设计目标，统一其 dev/build 引擎
- [[rollup]] —— rolldown 兼容它的 plugin API，是协议层基准
- [[esbuild]] —— rolldown 想替代的 dev 端引擎，性能对手
- [[oxc]] —— rolldown 的底层 parser/resolver，同公司项目
- [[swc]] —— 同样 Rust 写的 JS 工具链，路线不同但解决类似问题
- [[rspack]] —— Rust 写的 webpack 兼容打包器，对照组
- [[turbopack]] —— Vercel 的 Rust 打包器，竞争路线
- [[lightningcss]] —— Rust 写的 CSS 处理器，常和 rolldown 搭配用
- [[pnpm]] —— rolldown monorepo 测试场景常用的包管理器

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[dayjs]] —— Day.js — 用 2 KB 复刻 Moment 的极简日期库
- [[oxc]] —— oxc — Rust 写一整套 JS/TS 工具链的勇气
- [[rspack]] —— rspack — 用 Rust 重写 webpack 的内核，但留下整个 plugin 生态
- [[turbopack]] —— Turbopack — 把 bundler 重做成增量计算应用
- [[vite]] —— Vite — 浏览器自己加载源码的构建工具
- [[vitepress]] —— VitePress — Vue 团队用 Vite 写的静态文档站点生成器

---
title: XO — 把 ESLint 收成一份意见，而不是再发明一个 lint 引擎
description: 面向 ESM 的 ESLint 10 wrapper，默认给出强硬意见，并把格式化交给外部工具。
来源: https://github.com/xojs/xo
日期: 2026-08-27
分类: 前端工具链
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: project
  note_type: tool
  canonical_source: https://github.com/xojs/xo
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 2775f7fae9f1f7edd253f26298aa0e3f63e7deb6
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 4.0.0
---

## 是什么

XO 是 Sindre Sorhus 维护的 **ESLint wrapper**。日常类比：它不是新开一家质检厂，而是把 ESLint 10 的流水线接好，再附带一份强硬的出厂设置。

```js
import xo from 'xo';
const {results} = await xo.lintFiles();
```

或在命令行：

```bash
npx xo
npx xo --fix
```

固定 `xo@4.0.0` 要求 Node `>=22`，并且项目必须是 ESM。真正跑规则的还是 `eslint`；XO 负责发现文件、转 flat config、处理 TypeScript 漏网文件，以及可选的 Prettier 兼容层。

## 为什么重要

不看 XO 的包装边界，下面这些判断会偏：

- 为什么“零配置”仍然能改缩进和分号，却不必手写一整份 `eslint.config.js`
- 为什么它依赖 `prettier` 包，默认却**不会**帮你格式化
- 为什么和 [[dprint]] 可以组成 lint/format 对：XO 管规则，dprint 管版式
- 为什么编辑器里用 `xo/eslint-adapter` 时，后加的文件不一定马上出现在 lint 集合里

## 核心要点

固定 `2775f7fa...` 的主链是：

1. **读 XO 配置，再翻译成 ESLint flat config**：`resolveXoConfig` 用 cosmiconfig + jiti 找 `package.json` 的 `xo` 字段，或 `xo.config.{js,mjs,ts,mts}`。`xoToEslintConfig` 把结果铺到 `eslint-config-xo` 的底座上。

2. **意见落在少数开关，而不是另一套规则语言**：`space` 改 `@stylistic/indent`；`semicolon: false` 改 `@stylistic/semi` 等。默认风格在 readme 里写死为 tab、分号、单引号、多行 trailing comma。

3. **`prettier` 是三态，不是默认开**：`false` 关闭；`true` 把 Prettier 规则接进 ESLint；`'compat'` 关掉冲突的风格规则，让外部 formatter 接管。类型注释写明：`compat` **不会**用 Prettier 格式化。

4. **文件发现和 ESLint 是两段**：`lintFiles` 先用 globby 按扩展名收文件，再 `ESLint.lintFiles`。没给 glob 时默认 `**/*.{js,cjs,mjs,jsx,ts,...}`。显式文件路径一个都找不到会抛错；动态 glob 为空则可以安静通过。

5. **漏出 tsconfig 的 TS 文件会得到一份生成配置**：`handleUnincludedTsFiles` 把未收录文件写进 `tsconfig.generated.<hash>.json`，hash 来自文件列表。ESLint 实例开了 `cache: true` 且 `cacheStrategy: 'content'`，缓存目录名是 `xo-linter`。

## 实践示例

### 案例 1：零配置跑一遍

```bash
npm install xo --save-dev
npx xo
```

**逐部分解释**：

1. 必须装在项目本地；全局 XO 不是这条合同
2. 不传路径时，XO 自己收 JS/TS 和常见框架扩展名，并叠上默认 ignore / `.gitignore`
3. 规则来自 `eslint-config-xo` 以及 wrapper 里打开的 plugin，不是 XO 自己解释源码

### 案例 2：只改意见，不重写 ESLint 规则表

```js
/** @type {import('xo').FlatXoConfig} */
export default [
  {
    space: 2,
    semicolon: false,
    prettier: false,
  },
];
```

`space` / `semicolon` 只改 stylistic 规则。`prettier: false` 是给 [[dprint]] 留出门：版式由 dprint 的 TypeScript plugin 处理，XO 不再次执行 Prettier。

### 案例 3：编辑器走同一条 pipeline

```js
// eslint.config.js
export {default} from 'xo/eslint-adapter';
```

adapter 在模块加载时调用 `getProjectEslintConfig()`，`ts: true` 保持和 CLI 一样的 TypeScript fallback。注释写明：之后新加的文件要等 ESLint 重载配置，不会在 import 之后自动发现。

## 踩过的坑

1. **把 XO 当成“不用 ESLint 的 linter”**：issue 里的规则行为仍应回到 ESLint / `eslint-config-xo`。XO 只包装。
2. **看见 `prettier` 依赖就以为默认会 format**：依赖在 `package.json` 里，但选项默认是关的。
3. **CJS 项目直接上 v4**：readme 写明必须是 ESM；`engines` 还要求 Node 22+。
4. **以为 adapter 会持续监视文件集合**：它在 import 时拍一次项目文件。

## 适用 vs 不适用场景

**适用**：

- ESM + Node 22 的 JS/TS 项目，想少维护一份 ESLint 配置
- 已决定用 [[dprint]]（或另一个外部 formatter）管版式，XO 只保留 `prettier: false` 或 `'compat'`
- 需要 `lintText` / `outputFixes` 给编辑器或脚本复用同一套意见

**不适用**：

- 必须保留大量自定义 ESLint plugin 与历史 override → 直接维护 ESLint 可能更省事
- 想要一个二进制同时 lint + format，并且接受该工具的规则集 → [[biome]] / oxlint
- 非 ESM，或还停在 Node 20 以下 → 固定 v4 的 engines 对不上

## 固定版本边界

- 本文绑定 `xojs/xo@2775f7fae9f1f7edd253f26298aa0e3f63e7deb6`，npm 版本为 `4.0.0`。
- 该提交与 GitHub tag `v4.0.0`、npm `gitHead` 一致。
- 直接依赖包含 `eslint@^10.6.0`、`eslint-config-xo@^0.57.0`、`prettier@^3.9.4`、`typescript@^6.0.3`。
- 本文只做源码/类型静态审查，没有安装依赖、运行 `xo` 或对照 Prettier 输出，状态保持 `UNVERIFIED`。

## 学到什么

1. **wrapper 的价值在合同，不在新 parser**——XO 卖的是默认意见、文件发现和 TS 漏网处理
2. **依赖出现 ≠ 默认启用**——`prettier` 在 lock 里，开关仍是三态
3. **lint 引擎和 formatter 可以拆开**——默认关 Prettier，正好接 [[dprint]]
4. **编辑器适配器也有时间边界**——config 在 import 时凝固

## 应用型自测

1. 新建 `xo.config.js` 只写 `{prettier: 'compat'}`。XO 会用 Prettier 改写文件吗？
2. `lintFiles('src/missing.js')` 而文件不存在，会像空 glob 一样静默成功吗？
3. 一个 `.ts` 文件没进任何 tsconfig。XO 还能否对它做需要类型信息的检查？

检查点：

1. 不会。`'compat'` 只关掉冲突规则，不调用 Prettier 格式化。
2. 不会。显式非动态路径找不到文件会抛 `No files matching the pattern were found.`
3. 可以走生成的 `tsconfig.generated.<hash>.json`；这是 wrapper 补的 fallback，不是 ESLint 默认行为。

## 延伸阅读

- 官方说明：[github.com/xojs/xo](https://github.com/xojs/xo)
- 固定源码：[xojs/xo](https://github.com/xojs/xo) —— 本文绑定提交 `2775f7fae9f1f7edd253f26298aa0e3f63e7deb6`
- 共享审查记录：仓库内 `docs/lint-format-source-review-20260827-dk.md`
- [[dprint]] —— 本批配对的格式化宿主；XO 默认把版式让出去
- [[biome]] —— 对照：lint 与 format 放进同一个 Rust 二进制
- [[oxc]] —— 对照：另一条不走 ESLint wrapper 的 lint 路径

## 关联

- [[dprint]] —— format 侧搭档；XO 保持 `prettier: false` 时二者不抢风格规则
- [[biome]] —— 一体化对照，本批不选用
- [[oxc]] —— 非 ESLint wrapper 的 lint 对照
- [[vite]] —— 常见前端仓库里，XO 只进 lint script，构建仍走 bundler

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[dprint]] —— dprint — 把格式化做成可插拔宿主，而不是又一个语言 formatter

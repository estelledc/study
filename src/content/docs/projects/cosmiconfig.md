---
title: cosmiconfig — 按约定文件名找一份配置
description: 默认只搜当前目录，searchStrategy 才决定要不要往上走
来源: https://github.com/cosmiconfig/cosmiconfig
日期: 2026-08-27
分类: 开发工具
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/cosmiconfig/cosmiconfig
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 014687e689b04c34d72fa89997f8c6c3bdcf5756
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 10.0.0
---

## 是什么

cosmiconfig 是给工具作者用的 **配置发现器**：你给一个模块名，它按约定文件名找第一份能解析的配置。日常类比：像前台只问“这层有没有登记表”，不会默认爬整栋楼——除非你明确说要往上问。

```js
import { cosmiconfig } from 'cosmiconfig'

const explorer = cosmiconfig('myapp')
const result = await explorer.search()
```

固定 `10.0.0` 的 `search()` 从 `cwd`（或你传入的起点）列出 searchPlaces。命中则返回 `{ config, filepath, isEmpty? }`，否则 `null`。

## 为什么重要

不看固定入口，很容易把旧 README 的“沿目录树上行”写成今天的默认合同：

- 为什么 `cosmiconfig('prettier')` 找不到上一级的 `.prettierrc`——默认 `searchStrategy` 是 `'none'`
- 为什么同步 API 不认 `.mjs`——`defaultLoadersSync` 根本没挂这条
- 为什么 `package.json` 里没有同名字段时搜索还继续——缺属性被收成 `null`，不是空对象
- 为什么 `.ts` 配置在 Node 22 能跑、却不能写 `enum`——10.0.0 改走 Node type stripping，不再内置 TypeScript 编译器

一句话：它是 **按扩展名选 loader 的单文件发现器**，不是分层合并器。分层合并请看 [[c12]]。

## 核心要点

固定 10.0.0 的主链可以拆成五步：

1. **先归一化选项**：`mergeOptions` 默认 `ignoreEmptySearchPlaces: true`、`cache: true`、`mergeImportArrays: true`。没传 `stopDir` 时 `searchStrategy: 'none'`；传了才默认 `'global'`。
2. **按策略列出目录**：`'none'` 只产起点；`'project'` 往上走到 `package.json` / `package.yaml`；`'global'` 走到 `stopDir` 或家目录，再查 `env-paths(moduleName).config`。
3. **每层按 searchPlaces 试文件**：异步默认从 `package.json`、`.${name}rc*`、`.config/` 下的 rc、到 `${name}.config.js|ts|cjs|mjs`。空文件在默认选项下被跳过。
4. **按扩展名加载**：`.json` 走 `JSON.parse`；无扩展名和 yaml 走懒加载的 `js-yaml`；JS/TS 先 `import(realpath).default`，再回退 `require`。
5. **可选 `$import`**：被引入文件当基底，当前文件覆盖；数组默认拼接；`__proto__` / `constructor` 键被丢掉。

元配置只在 cwd 读 cosmiconfig 自己的 `package.json` / `.config/config.*`，不能在那里改 `loaders` 或 `searchStrategy`。

## 实践示例

### 案例 1：只在当前目录找

```js
const explorer = cosmiconfig('myapp')
const found = await explorer.search()
```

`search()` 的默认起点是 `path.resolve('')`，也就是 cwd。父目录里的 `.myapprc` 不会被看到。

### 案例 2：停在最近的 package 边界

```js
const explorer = cosmiconfig('myapp', { searchStrategy: 'project' })
const found = await explorer.search(process.cwd())
```

从起点往上，每层试同一组文件名，直到出现 `package.json` 或 `package.yaml`。这不是 XDG 全局目录。

### 案例 3：已知路径直接 load

```js
const explorer = cosmiconfig('myapp')
const loaded = await explorer.load('./myapp.config.mjs')
```

`load` 不走 searchPlaces，只解析这一份文件；仍会处理 `$import` 和 `transform`。

## 踩过的坑

1. **把 README 上半段的“往上搜”当成默认**：changelog 写明 v9 起无 `stopDir` 时默认 `'none'`。要旧行为需显式 `'global'` 或给 `stopDir`。
2. **同步 API 加载 ESM**：`cosmiconfigSync` 的默认 searchPlaces 没有 `.mjs`，`loadJsSync` 只有 `require`。
3. **把 `package.json` 整文件当成配置**：只有 `packageProp ?? moduleName` 那一支被取出。
4. **在元配置里改 loaders**：构造期会抛 `Can not specify loaders in meta config file`。
5. **把 `engines` 仍写成 Node 14**：仓内 README 还留着旧句，`package.json` 已是 `^22.18 || >= 24`。

## 适用 vs 不适用场景

**适用**：

- 工具要兼容 `package.json` 字段、rc 文件和 `*.config.js` 这一套前端约定
- 调用方自己决定要不要上行，以及命中后如何合并
- 能接受“找到第一份就停”，不要多层 defu

**不适用**：

- 需要把 rc、package.json、环境变量和远程 extends 合成一份——那是 [[c12]]
- 要在 Node 20 或更早运行 10.0.0
- 配置 TypeScript 依赖 `enum` / `namespace` 等不可擦语法
- 想把未测的解析耗时写成选型结论

## 固定版本边界

- 本文绑定 `cosmiconfig/cosmiconfig@014687e689b04c34d72fa89997f8c6c3bdcf5756`，包版本 `10.0.0`。
- npm latest 同号，`gitHead` 与 annotated tag `v10.0.0` 剥出提交一致。
- GitHub 最新 Release 对象仍是 `v9.0.1`；存在 v10 tag，但没有同名 Release。
- 未安装依赖、未跑上游测试、未测 bundle，状态保持 `UNVERIFIED`。

## 学到什么

1. **默认不再爬树**——上行是 `searchStrategy`，不是隐藏行为。
2. **同步与异步不是同一张地图**——`.mjs` 只挂在异步默认值上。
3. **加载器按扩展名分发**——TS 现在借 Node 自己剥类型，不是再请 TypeScript。
4. **发现不等于合并**——`$import` 只拼被引入的文件，不会自动叠 rc 和 package.json。

## 应用型自测

1. 不传 options 时，`cosmiconfig('myapp').search()` 会不会走到父目录？
2. `cosmiconfigSync` 的默认 searchPlaces 里有没有 `.mjs`？
3. `package.json` 没有 `myapp` 字段时，这次命中是空配置还是继续搜？

检查点：

1. 不会。默认 `searchStrategy` 是 `'none'`。
2. 没有。同步默认值和 `defaultLoadersSync` 都不含 `.mjs`。
3. 继续搜。缺属性被收成 `null`，`search` 会试下一个 searchPlace。

## 延伸阅读

- 固定源码：[cosmiconfig/cosmiconfig](https://github.com/cosmiconfig/cosmiconfig) —— 本文绑定提交 `014687e689b04c34d72fa89997f8c6c3bdcf5756`
- changelog：v9 引入 `searchStrategy`，v10 收紧 Node 并去掉 TypeScript 编译依赖
- [[c12]] —— 同主题的分层合并 / dotenv / extends 对照
- [[vite]] —— 自己的配置入口，不经过 cosmiconfig

## 关联

- [[c12]] —— 多源 defu 合并；cosmiconfig 停在第一份命中
- [[vite]] —— 构建工具自己的 config 解析，不是这套 rc 搜索

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[c12]] —— c12 — 把多层配置 defu 成一份

- [[c12]] —— c12 — 把多层配置 defu 成一份

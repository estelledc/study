---
title: dotenv-expand — 先展开、再求值、必要时才解密
description: 固定 1000.0.0 不再自己实现展开算法，而是编排已存在环境变量、primitives 与写回目标。
来源: https://github.com/dotenvx/dotenv-expand
日期: 2026-08-27
分类: 基础设施
难度: 入门
difficulty: beginner
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/dotenvx/dotenv-expand
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 0d8c9260deaa14bdff175c5da13ac6cc197c4ac2
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 1000.0.0
---

## 是什么

dotenv-expand 给已经 parse 好的 `.env` 结果做第二遍处理。日常类比：[[rc9]] 负责把配置文件折成对象；它负责把对象里的 `$VAR`、`$(command)` 和 `encrypted:` 变成最终字符串。

固定 1000.0.0 的入口是 `expand()`，不是读磁盘：

```js
const dotenv = require("dotenv")
const dotenvExpand = require("dotenv-expand")

dotenvExpand.expand(dotenv.config())
```

canonical 仓库已经是 `dotenvx/dotenv-expand`。版本号从 13 跳到 1000 是上游自己写进 changelog 的选择，不是 npm 写错。

## 为什么重要

不看 `lib/main.js`，容易继续用 2016 年的印象描述今天的包：

- 为什么它“零依赖”，源码却 `require('@dotenvx/primitives')`
- 为什么机器上已有的 `PASSWORD=pas$word` 不会被二次展开
- 为什么 `.env` 里后定义的 `PORT` 救不了前面的 `${PORT}`
- 为什么 `node -r dotenv-expand/config` 不必再装一份 dotenv

一句话：1000.0.0 的合同是 **编排已有 env、再交给 bundled primitives**，不是自己实现一套 bash。

## 核心要点

固定源码把每个 key 写成一条短链：

1. **选定目标 env**：默认 `process.env`；传入 `processEnv` 就只读写那个对象。
2. **短路已存在的值**：目标 env 里已有同名、且与文件字面值不同的项，直接采用，不再 expand / evaluate / decrypt。
3. **可选解密**：`DOTENV_PRIVATE_KEY` 存在且 `encrypted(value)` 为真时先 `decrypt`。
4. **展开再求值**：`expand(value, { processEnv, runningParsed })` 之后 `evaluate(...)`。测试把 `$(printf evaluated)` 写成命令替换。
5. **还原转义**：最后把 `\$` 变回 `$`，写回 `parsed` 和目标 env。

`runningParsed` 让同一轮前面已经展开的 key 能被后面引用。反向依赖则得不到值：测试把 `HOST` 写在 `PORT` 后面时，期望 `HOST` 变成 `http://localhost:`。

发布包用 esbuild 把 `lib/main.js` 和 `config.js` 打进 `dist/`。`@dotenvx/primitives@2.1.1` 与 `dotenv` 都只在 devDependencies；本轮没有打开 primitives 源码。

## 实践示例

### 案例 1：先 config，再 expand

```js
const dotenv = require("dotenv")
const dotenvExpand = require("dotenv-expand")

const result = dotenvExpand.expand(dotenv.config())
console.log(result.parsed.DATABASE_URL)
```

`expand` 假定 `parsed` 已经在。它不会替你找 `.env` 文件。`BASIC_EXPAND=${BASIC}` 这种写法走 primitives 的 braced 展开。

### 案例 2：已存在的 process.env 赢，而且不再展开

```js
process.env.PASSWORD = "pas$word"
dotenvExpand.expand(dotenv.config())
```

测试把这写成合同：文件里的 `PASSWORD=password` 不会覆盖机器值，`${PASSWORD}` 也不会把 `pas$word` 再当变量切一刀。v12 起就不再尝试展开 `process.env` 本身。

### 案例 3：预加载入口自己带 dotenv

```sh
node -r dotenv-expand/config app.js dotenv_config_path=/custom/.env
```

源码 `config.js` 会 `require('dotenv').config(...)`。README 写明发布后的 preload **不必再单独安装 dotenv**。命令行参数优先于 `DOTENV_CONFIG_*` 环境变量——这是 dotenv 自己的 CLI options，dotenv-expand 只是把结果送进 `expand`。

## 踩过的坑

1. **把 motdotla/dotenv-expand 当当前 canonical**：npm `repository` 与 GitHub remote 都是 `dotenvx/dotenv-expand`。
2. **把“零依赖”理解成源码自包含**：展开 / 求值 / 解密在 `@dotenvx/primitives`，发布时 bundle。
3. **依赖反向引用**：`URL=${HOST}/x` 写在 `HOST=` 前面时，这一轮拿不到后面才出现的值。
4. **以为空字符串和未设置是一回事**：1000.0.0 changelog 与测试区分 `${VAR-default}` 和 `${VAR:-default}`。
5. **在不信任的 `.env` 里写 `$(...)`**：测试展示命令替换存在；本轮未执行这些命令。

## 适用 vs 不适用场景

**适用**：

- 已经用 dotenv（或等价 parse）得到 `parsed`，只差展开
- 能接受“机器环境变量优先、且不再二次展开”
- 需要 preload，并且可以接受发布产物里打进 dotenv

**不适用**：

- 要把 RC / `key=value` 文件读成嵌套对象——那是 [[rc9]]
- 必须覆盖已经存在的 `process.env`
- 需要本轮未核验的命令替换安全性或解密算法细节

## 固定版本边界

- 本文绑定 `dotenvx/dotenv-expand@0d8c9260...`，annotated tag `v1000.0.0` 与 npm `gitHead` 指向同一提交。
- `engines.node` 声明 `>=16`；许可证改为 BSD-3-Clause。
- 展开、命令替换、解密的实现细节以 `@dotenvx/primitives@2.1.1` 为准，本页未绑定那个包的 revision。
- 本文未安装依赖、未跑 `node tests/main.js`，状态保持 `UNVERIFIED`。

## 学到什么

1. **加载器和展开器是两个对象**——`expand()` 不打开文件
2. **已存在的 env 是写保护**——短路发生在 decrypt / expand 之前
3. **顺序是可观察合同**——`runningParsed` 只帮“前面已经处理过的 key”
4. **1000 不是笔误**——changelog 把命令替换和自动解密写成这次 breaking 的理由

## 应用型自测

1. `expand()` 会不会自己读取 `.env`？
2. 机器上已有 `PASSWORD=pas$word` 时，文件里的 `PASSWORD=password` 会不会生效？
3. `HOST` 写在 `PORT` 前面、值是 `http://localhost:${PORT}`，而 `PORT=8090` 在后面时，测试期望 `HOST` 是什么？

检查点：

1. 不会。它只处理传入的 `parsed`。
2. 不会。已存在且与文件字面值不同的项直接采用。
3. `http://localhost:`。后面的 `PORT` 来不及进入这一轮引用。

## 延伸阅读

- 固定源码：[dotenvx/dotenv-expand](https://github.com/dotenvx/dotenv-expand) —— 本文绑定提交 `0d8c9260deaa14bdff175c5da13ac6cc197c4ac2`
- 对照入口：`lib/main.js`、`config.js`、`tests/main.js`
- 插值规则文档：[dotenvx env-file interpolation](https://dotenvx.com/docs/env-file#interpolation)（本轮未把它当运行证据）
- [[rc9]] —— 文件型 RC，不展开 `$VAR`

## 关联

- [[rc9]] —— 嵌套 `key=value` 文件，不处理环境变量展开
- [[yargs]] —— CLI 层映射环境变量，不是 `.env` 展开器
- [[sops]] —— 字段级加密进 Git，流程与 `encrypted:` + `DOTENV_PRIVATE_KEY` 不同
- [[vault]] —— 远程密钥生命周期，不是本地 `.env` 后处理

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

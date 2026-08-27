---
title: dotenv-flow — 按 NODE_ENV 叠多层 .env* 的环境文件加载器
description: 介绍 dotenv-flow 4.1.0 如何用环境 cascade、不覆盖已有 process.env，以及 options.files 显式清单。
来源: https://github.com/kerimdzhanov/dotenv-flow
日期: 2026-08-27
分类: 工具库
难度: 入门
difficulty: beginner
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/kerimdzhanov/dotenv-flow
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 7f07cf32cc28277f04e801982cc2fbddb6b220fa
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 4.1.0
---

## 是什么

dotenv-flow 是一个按当前 Node 环境叠多层 `.env*` 文件的加载器。日常类比：衣柜里先放公共衣服（`.env`），再按天气换一套（`.env.development`），最后才允许你在本地塞一张不入库的便条（`.env*.local`）。

你写：

```js
const dotenvFlow = require('dotenv-flow');

dotenvFlow.config();
```

它用 `dotenv.parse` 读文件，再按 cascade 合并。固定 4.1.0 的默认 pattern 是 `.env[.node_env][.local]`，主入口是 `lib/dotenv-flow.js`，预加载走 `dotenv-flow/config`。

## 为什么重要

不理解 cascade 和“谁不能覆盖谁”，就解释不了下面几件事：

- 为什么 `NODE_ENV=test` 时 `.env.local` 会被跳过
- 为什么文件里后写的键能盖住先写的，但已经在 `process.env` 里的键纹丝不动
- 为什么另一个包先调了 `dotenv.config()`，本库的优先级会看起来“反了”
- 为什么 `options.files` 一出现，`node_env` 和 `pattern` 就不再参与选文件

## 核心要点

固定 4.1.0 的主链可以拆成五步：

1. **定环境**：`getEffectiveNodeEnv` 的顺序是 `options.node_env` → `process.env.NODE_ENV` → `options.default_node_env` → `undefined`（无环境模式，只叠公共文件）。

2. **列文件**：默认 pattern 下，parse 合并从低到高是 `.env.defaults` → `.env` → `.env.local` → `.env.${node_env}` → `.env.${node_env}.local`。`.env.defaults` 只在默认 pattern 时加入；`node_env === 'test'` 时不加 `.env.local`。

3. **显式清单**：`options.files` 给出相对 `path` 的文件名数组，忽略 `node_env` / `pattern`。缺文件跳过；全部缺失时返回空 `parsed`，不走 “no `.env*` files” 错误。

4. **合并与赋值是两层合同**：`parse` 对后出现的同名键做覆盖合并；`load` 只给 `process.env` 里还不存在的键赋值。shell 和先到的环境变量永远优先。

5. **预加载与纠偏**：`node -r dotenv-flow/config` 先读 `DOTENV_FLOW_*` / `NODE_ENV`，再用 `--dotenv-flow-*` CLI 覆盖。`purge_dotenv` 只 unload 工作目录下的 `.env`，且仅当现值仍等于该文件解析值时才删除。

## 实践示例

### 案例 1：development 叠公共文件、本地覆盖和环境文件

```js
process.env.NODE_ENV = 'development';
require('dotenv-flow').config();
```

`.env` 提供 `DATABASE_HOST`，`.env.local` 覆盖账号，`.env.development` 改库名。后写文件在 `parsed` 里赢，但若你启动前已经 `export DATABASE_HOST=...`，文件值进不了 `process.env`。

### 案例 2：test 跳过 `.env.local`

```js
require('dotenv-flow').config({ node_env: 'test' });
```

`listFiles` 见到 `node_env === 'test'` 不会把 `.env.local` 放进清单，避免每人本地便条把测试结果拧歪。`.env.test` 和 `.env.test.local` 仍在 cascade 里。

### 案例 3：`options.files` 自己排顺序

```js
require('dotenv-flow').config({
  path: process.cwd(),
  files: ['.env', '.env.ci']
});
```

此时不再按 `NODE_ENV` 拼文件名。列表顺序就是 parse 覆盖顺序；不存在的名字被跳过。

## 踩过的坑

1. **把 cascade 理解成“后写的文件一定能改 process.env”**：`load` 明确不覆盖已有键。另一个依赖若先跑了 `dotenv.config()`，公共 `.env` 会被当成“壳层变量”。这时才需要 `purge_dotenv`。

2. **以为 test 会跳过所有 `*.local`**：它只跳过 `.env.local`，不跳过 `.env.test.local`。

3. **给了 `files` 还指望 `default_node_env` 生效**：`files` 分支不调用 `listFiles`，环境名和 pattern 都被忽略。

4. **把 npm 包的 `gitHead` 当成本页 revision**：`dotenv-flow@4.1.0` 未暴露 `gitHead`。本页绑定的是源码 tag `v4.1.0`。

5. **把 README 的下载量或体积当成本轮测量**：本轮未安装依赖、未跑上游测试、未测 bundle。

## 适用 vs 不适用场景

**适用**：

- 同一套代码要按 development / test / production 叠不同 `.env*`，并接受“已有环境变量不覆盖”
- 本地秘密放 `*.local` 且能把它们从版本库排除
- 打包器或启动脚本能 `require('dotenv-flow')` 或 `-r dotenv-flow/config`

**不适用**：

- 需要启动时核对 `.env.example` 里每一项都在环境中——看 [[dotenv-safe]]
- 只要单文件 `.env`、不要 cascade——应直接看 dotenv 本体，而不是只改 import 名
- 需要展开 `$VAR` 插值——那是 dotenv-expand 的合同，本页不覆盖
- 不能接受 `engines.node >= 12` 与运行时依赖 `dotenv@^16`

## 固定版本边界

- 本文绑定 `kerimdzhanov/dotenv-flow@7f07cf32cc28277f04e801982cc2fbddb6b220fa`，源码 tag `v4.1.0`，`package.json` version 同为 `4.1.0`。
- npm `dotenv-flow@4.1.0` 未暴露 `gitHead`；本页不猜测 registry 与 tag 是否另有发布树。
- `exports` 区分 `"."` → `./lib/dotenv-flow.js` 与 `"./config"` → `./config.js`。
- `options.files` 自 4.1.0 加入；缺文件跳过，空清单不报 “no `.env*` files”。
- 本文未安装依赖、运行上游测试或测量 bundle，状态保持 `UNVERIFIED`。

## 学到什么

1. **选文件和写 `process.env` 是两层合同**——cascade 只决定 `parsed` 里谁覆盖谁；已有环境变量另算。
2. **test 的本地隔离是写死的**——`.env.local` 被跳过，不是配置开关。
3. **显式 `files` 会关掉命名 convention**——要自己对顺序和缺失负责。
4. **预加载的 CLI 覆盖环境变量选项**——`--dotenv-flow-path` 能盖过 `DOTENV_FLOW_PATH`。

## 应用型自测

1. `NODE_ENV=test` 时，`.env.local` 会不会进入 `listFiles` 的结果？
2. `.env.local` 写了 `PORT=3001`，但启动前已经 `export PORT=8080`，`config()` 之后 `process.env.PORT` 是多少？
3. 传入 `files: ['.env.missing']` 且该文件不存在时，会不会抛 “no `.env*` files matching pattern”？

检查点：

1. 不会。`node_env === 'test'` 时不加 `.env.local`。
2. `8080`。`load` 不覆盖已有 `process.env` 键。
3. 不会。`files` 分支跳过缺失文件，空清单返回 `{ parsed: {} }`。

## 延伸阅读

- 文档：[kerimdzhanov/dotenv-flow README](https://github.com/kerimdzhanov/dotenv-flow#readme)
- 固定源码：[kerimdzhanov/dotenv-flow](https://github.com/kerimdzhanov/dotenv-flow) —— 本文绑定提交 `7f07cf32cc28277f04e801982cc2fbddb6b220fa`
- [[dotenv-safe]] —— 对照：不叠多层文件，而是核对 example 键是否都在环境里
- [[express]] —— 常见“启动最早处”调用 `config()` 的宿主

## 关联

- [[dotenv-safe]] —— 缺键 fail-closed 的对照，不是 cascade
- [[express]] —— 请求进来之前就要把 `process.env` 备好
- [[nestjs]] —— 配置模块常和 `.env*` 叠加一起出现
- [[vite]] —— 前端构建另有 `envPrefix` / `.env.[mode]` 合同，不要和本库混为一谈

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[dotenv-safe]] —— dotenv-safe — 用 .env.example 核对缺键的 dotenv 包装

- [[dotenv-safe]] —— dotenv-safe — 用 .env.example 核对缺键的 dotenv 包装

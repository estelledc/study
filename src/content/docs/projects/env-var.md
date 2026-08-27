---
title: Env-var — 从容器里读环境变量并在启动时做类型检查
description: 介绍 env-var 7.5.0 如何用 get → accessor 把 process.env 字符串转成类型，并在缺失或非法时抛 EnvVarError。
来源: https://github.com/evanshortiss/env-var
日期: 2026-08-27
分类: 工具库
难度: 入门
difficulty: beginner
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/evanshortiss/env-var
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 56fe6cb47e1e79e0a4ec5474daab9dc3cae73947
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 7.5.0
---

## 是什么

Env-var 是一个零依赖的环境变量读取库：它不加载 `.env` 文件，只从你交给它的容器（默认 `process.env`）取值，再按你点名的 accessor 做校验和类型转换。日常类比：海关柜台只检查已经放在托盘上的护照，不会替你去家里找证件。

你写：

```js
const env = require('env-var');

const PORT = env.get('PORT').default('5432').asPortNumber();
const PASSWORD = env.get('DB_PASSWORD').required().asString();
```

`get('PORT')` 先返回一组链式方法；真正读值发生在 `asPortNumber()` / `asString()`。固定 7.5.0 的入口是 `env-var.js` 的 `from(getProcessEnv())`，`package.json` 声明 `engines.node >= 10`。

## 为什么重要

不理解“先标记、后取值”和“accessor 只吃字符串”，就解释不了下面几件事：

- 为什么 `env.get('PORT', 5432)` 会直接抛错，必须改成 `.default('5432')`
- 为什么没设的可选变量调用 `asInt()` 会得到 `undefined`，而不是 `NaN`
- 为什么 `PORT=1.2` 过不了 `asInt`，即使 `parseInt` 看起来能读
- 为什么 Vite / 浏览器里不能直接 `require('env-var')` 读 `import.meta.env`，要先 `from({...})`

## 核心要点

固定 7.5.0 的主链可以拆成五步：

1. **选容器**：默认实例读 `process.env`。`getProcessEnv()` 用 try/catch 包住，拿不到就退成 `{}`。测试或前端用 `from(values, extraAccessors, logger)` 换容器。
2. **取变量对象**：`get(name)` 只构造 accessor 集合，不立刻解析。不传名字时返回整个容器。传两个参数会抛 `EnvVarError`，提示改用 `.default()`。
3. **先打标记**：`.required()`、`.default(value)`、`.example(str)`、`.convertFromBase64()` 只改内部旗标。`default()` 会把 number / array / object 先 `toString` / `JSON.stringify` 成字符串再交给 accessor。
4. **accessor 取值**：`asString` / `asInt` / `asBool` / `asPortNumber` / `asJson` / `asEnum` 等由 `generateAccessor` 包一层。缺值且未 required、也无 default 时返回 `undefined`。required 还会拒绝 trim 后为空的字符串。
5. **失败统一成 `EnvVarError`**：accessor 抛出的 `Error.message` 被改写成 `env-var: "<NAME>" ...`；设过 `example()` 时会附带合法样例。

## 实践示例

### 案例 1：默认值必须走 `.default()`，再交给 accessor

```js
const PORT = env.get('PORT').default(5432).asPortNumber();
```

`default(5432)` 先变成字符串 `"5432"`，`asPortNumber` 再走 `asIntPositive`，并拒绝大于 65535 的值。`0` 会被放行，因为正整数检查是 `ret < 0`。

### 案例 2：布尔有宽、严两套

```js
env.get('DEBUG').asBool();        // 接受 true/false/1/0（大小写不敏感）
env.get('DEBUG').asBoolStrict();  // 只接受 true/false
```

`asBool` 先 `toLowerCase()`，白名单是 `true` / `false` / `1` / `0`。`asInt` 则要求 `parseInt(value, 10).toString(10) === value`，所以 `"01"`、`"1.2"` 都会失败。

### 案例 3：前端或测试换容器，并可挂自定义 accessor

```js
const { from } = require('env-var');

const env = from(
  { BASE_URL: import.meta.env.BASE_URL },
  { asTrimmed: (value) => String(value).trim() }
);

env.get('BASE_URL').asTrimmed();
```

`extraAccessors` 在内置表之后展开，同名会盖掉内置实现。日志默认是空函数；只有 `from(container, extra, logger)` 传入 logger 才会打印。自带 `logger` 在 `NODE_ENV` 匹配 `prod|production` 时闭嘴。

## 踩过的坑

1. **把它当成 `.env` 加载器**：7.5.0 不读文件、不展开插值。容器里没有的键就是 `undefined`。
2. **沿用 v5 的双参数 `get(name, default)`**：v6 起第二个参数直接抛错。
3. **required 却写成空格**：`value.trim().length === 0` 会当成未设置。
4. **`asUrlString` 会改写 URL**：内部 `new URL(value).toString()`，没有 path 的地址常被补上尾部 `/`。
5. **`convertFromBase64` 依赖 `Buffer`**：这是 Node API；纯浏览器容器需要自己换实现。
6. **README 写过约 4.7kB minified**：本轮未安装依赖、未打包、未测体积。

## 适用 vs 不适用场景

**适用**：

- Node 服务启动时要把 `process.env` 收成一份类型明确的配置
- 测试里用 `from({...})` 注入假环境，而不是改全局 `process.env`
- 需要端口、枚举、JSON、email 等现成 accessor，或用 `extraAccessors` 补一种

**不适用**：

- 要从磁盘合并多层 `.env*`——env-var 不负责加载
- 要生成“本机装了哪些工具”的诊断报告——应看 [[envinfo]]
- 不能接受 `engines.node >= 10`，或必须在无 `Buffer` 的运行时做 base64 解码

## 固定版本边界

- 本文绑定 `evanshortiss/env-var@56fe6cb47e1e79e0a4ec5474daab9dc3cae73947`，源码 tag `7.5.0` 与 npm `env-var@7.5.0` 的 `gitHead` 是同一提交。
- 发布文件只有 `env-var.js`、`env-var.d.ts` 和 `lib/`；生产依赖为空。
- TypeScript 把未 `required()` / `default()` 的变量标成可 `undefined`；加上其中之一后 accessor 返回值不再带 `undefined`。
- 本文未安装依赖、运行上游测试或测量 bundle，状态保持 `UNVERIFIED`。

## 学到什么

1. **读取和校验是两次动作**——`get` 只建对象，accessor 才碰容器。
2. **默认值先被压成字符串**——number / JSON 默认值最终仍走同一套 accessor。
3. **失败形态统一**——业务代码按 `EnvVarError` 识别配置错误，而不是各种 `TypeError`。
4. **容器可替换**——同一套 accessor 能读 `process.env`、测试夹具或 `import.meta.env` 映射。

## 应用型自测

1. `env.get('PORT', '5432').asPortNumber()` 在 7.5.0 会成功吗？
2. `PORT=1.2` 时 `asInt()` 会得到 `1` 吗？
3. 未设置且未 `required()` 的变量调用 `asString()`，返回值是什么？

检查点：

1. 不会。多参数 `get()` 抛 `EnvVarError`，要写成 `.default('5432')`。
2. 不会。`asInt` 要求十进制字符串与解析结果互逆。
3. `undefined`。缺值且无 default、非 required 时 accessor 直接返回。

## 延伸阅读

- 文档：[API.md](https://github.com/evanshortiss/env-var/blob/7.5.0/API.md)
- 固定源码：[evanshortiss/env-var](https://github.com/evanshortiss/env-var) —— 本文绑定提交 `56fe6cb47e1e79e0a4ec5474daab9dc3cae73947`
- [[envinfo]] —— 报告本机环境，不负责读取应用配置
- [[vite]] —— 前端要用 `from(import.meta.env)` 这类映射，而不是默认 `process.env`

## 关联

- [[envinfo]] —— 诊断“机器上有什么”，对照“应用配置是什么”
- [[vite]] —— `import.meta.env` 需要 `from()` 才能套同一套 accessor
- [[bun]] —— 另一套 `process.env` 宿主，env-var 只读容器、不解释运行时

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

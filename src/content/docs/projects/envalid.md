---
title: envalid — 校验并冻结环境变量
description: 环境变量清洗器：白名单、类型转换、默认分层，失败时退出进程
来源: https://github.com/af/envalid
日期: 2026-08-27
分类: 开发工具
难度: 初级
difficulty: beginner
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/af/envalid
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 784385fcf209ed6f9afde068689afc90773636a3
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 8.2.0
---

## 是什么

envalid 是一个**环境变量清洗器**。日常类比：像安检门——你递上一整袋钥匙（`process.env`），它只放行你登记过的那几把，还把数字、布尔和 URL 验成对应类型，然后把袋子锁死。

```ts
import { cleanEnv, str, port, bool } from 'envalid'

const env = cleanEnv(process.env, {
  DATABASE_URL: str(),
  PORT: port({ default: 3000 }),
  DEBUG: bool({ default: false }),
})
```

它**不读 `.env` 文件**。文件加载是 [[dotenv]] 的工作；envalid 假定输入已经是一份普通对象。返回值只暴露声明过的键，并且被 `Object.freeze` 包在 proxy 外面。

## 为什么重要

不理解 envalid 的清洗合同，下面这些事会对不上：

- 为什么 `env.SECRET` 在 `process.env` 里明明有值，一读却抛 `ReferenceError`
- 为什么开发机能跑、生产却因为缺 `devDefault` 直接 `process.exit(1)`
- 为什么 `default: '3000'` 不会再走 `port()` 的数字解析
- 为什么没写 `NODE_ENV` 时 `env.isProduction` 仍是 `true`

一句话：envalid 把「环境依赖」收成一份可执行清单，缺了或读错就失败，而不是悄悄给 `undefined`。

## 核心要点

固定源码的主链是 `cleanEnv` → `getSanitizedEnv` → 默认中间件 → `Object.freeze`：

1. **只清洗声明过的键**：`specs` 里没有的变量不会出现在输出上。访问未声明键时，若原始环境里有这个键，proxy 会提示「已设置但未校验」；完全不存在则报 `Env var not found`。

2. **缺省值不经过 `_parse`**：`rawValue === undefined` 时，按 `testDefault`（仅 `NODE_ENV === 'test'`）→ `devDefault`（`NODE_ENV` 已设置且不是 `'production'`）→ `default` 取值，然后 `continue`。这意味着 `port({ default: 3000 })` 的 `3000` 是你自己给的 number，不会再被 `+input` 转一遍。

3. **`requiredWhen` 是第二遍扫描**：第一遍结束后，若某键仍是 `undefined` 且谓词为真，补一个 `EnvMissingError`。适合「关了自动提取就必须手填 id」这种条件必填。

4. **失败默认退出进程**：收集完错误后走 `reporter`。默认实现在 Node 里打印分色清单并 `process.exit(1)`；`reporter: null` 则第一个错误立刻 throw。浏览器没有 `process.versions.node` 时改为抛 `TypeError`。

5. **中间件补环境别名并禁止改写**：`accessorMiddleware` 挂上 `isDev` / `isDevelopment` / `isProd` / `isProduction` / `isTest`。`NODE_ENV` 未设置时按生产处理。`strictProxyMiddleware` 拦截 `set`。

## 实践示例

### 案例 1：启动时清洗，缺了就退出

```ts
import { cleanEnv, str, email, json } from 'envalid'

export const env = cleanEnv(process.env, {
  API_KEY: str(),
  ADMIN_EMAIL: email({ default: 'ops@example.com' }),
  FLAGS: json<{ beta?: boolean }>({ default: {} }),
  NODE_ENV: str({ choices: ['development', 'test', 'production'] }),
})
```

`str({ choices })` 会把输出收成字面量联合。`bool` 用的是 exact validator，`choices` 不会收窄成 `true | false` 以外的更细类型。

### 案例 2：开发可缺省，生产必填

```ts
const env = cleanEnv(process.env, {
  STRIPE_SECRET: str({ devDefault: 'sk_test_dummy' }),
})
```

`NODE_ENV=development` 或 `test` 时可以用假值启动；`production` 或缺 `NODE_ENV` 时必须真的提供。源码测试把「未设置 NODE_ENV 不用 devDefault」写成回归。

### 案例 3：条件必填

```ts
cleanEnv(process.env, {
  AUTO_ID: bool(),
  USER_ID: num({
    default: undefined,
    requiredWhen: (cleaned) => cleaned.AUTO_ID === false,
  }),
})
```

`AUTO_ID` 为 false 且没给 `USER_ID` 时，第二遍会记 `EnvMissingError`。`default: undefined` 让这个键在类型上可缺。

### 案例 4：测试里不要真的 exit

```ts
import { cleanEnv, str } from 'envalid'

expect(() => cleanEnv({}, { DATABASE_URL: str() }, { reporter: null })).toThrow()
```

默认 reporter 会 `process.exit(1)`。单测和自定义宿主应传入 `reporter: null` 或自己的 logger。`testOnly('x')` 只在 `process.env.NODE_ENV === 'test'` 时展开为默认值。

## 踩过的坑

1. **以为它会读 `.env`**：`cleanEnv` 的第一个参数是普通对象。没先跑 [[dotenv]]（或容器注入），本地文件里的键对它不存在。
2. **直接读 `env.UNDECLARED`**：即使 `process.env` 有这个键，proxy 也拒绝。这是故意的，避免「声明一套、使用另一套」。
3. **给 `port` / `num` 一个数字 default 再期待二次解析**：缺省路径不调用 `_parse`。default 的类型就是输出类型。
4. **在测试里忘记改 reporter**：缺变量会干掉整个 Node 进程，看起来像 runner 崩溃。

## 适用 vs 不适用场景

**适用**：
- Node / Bun 服务启动时把环境依赖写成一份清单
- 需要 `PORT` 是 1–65535 的整数、`DEBUG` 是真布尔、输出不可变
- 希望未声明键在运行时被发现，而不是 silently `undefined`

**不适用**：
- 还没有加载器、只想把 `.env` 灌进 `process.env` → [[dotenv]]
- 要校验任意 JSON / 表单 / RPC 载荷 → [[zod]] 更合适
- 目标运行时低于 Node 18：`engines` 写 `>=18` 且 `engineStrict: true`

## 固定版本边界

- 本文绑定 `af/envalid@784385fc...`，包版本 `8.2.0`。
- `package.json` 声明 `sideEffects: false`，运行时依赖只有 `tslib`。
- host / email 校验是「尽力」正则，不是完整 RFC 实现；复杂地址应自写 `makeValidator`。
- 本文只做源码/测试静态审查，没有安装依赖、跑 vitest 或在真实进程里观察 `process.exit`，状态保持 `UNVERIFIED`。

## 学到什么

1. **环境变量也需要白名单**：输出对象不是 `process.env` 的别名，而是一份声明过的视图。
2. **默认值的环境分层是显式的**：`testDefault` / `devDefault` / `default` 的启用条件写在 `core.ts`，不能靠「开发机比较松」口头约定。
3. **失败策略属于 reporter**：校验逻辑只收集错误；退出、抛错还是记录，由 reporter 决定。
4. **加载器与清洗器互补**：[[dotenv]] 解决文件进进程，envalid 解决进程里的值能不能用。

## 应用型自测

1. `process.env.SECRET` 有值，但 `cleanEnv` 的 specs 没写 `SECRET`。`env.SECRET` 会返回这个值吗？
2. `NODE_ENV` 未设置，spec 是 `str({ devDefault: 'local' })`，原始对象没有该键。结果是什么？
3. 测试里调用 `cleanEnv({}, { FOO: str() })` 且不传 options，默认会发生什么？

检查点：

1. 不会。proxy 抛 ReferenceError，提示变量已在环境中但未校验。
2. 失败。`devDefault` 要求 `NODE_ENV` 已设置且不是 production。
3. 默认 reporter 在 Node 里打印错误并 `process.exit(1)`。测试应传 `{ reporter: null }`。

## 延伸阅读

- 仓库：[github.com/af/envalid](https://github.com/af/envalid)
- 固定源码：[af/envalid](https://github.com/af/envalid) —— 本文绑定提交 `784385fcf209ed6f9afde068689afc90773636a3`
- 主链文件：[`src/core.ts`](https://github.com/af/envalid/blob/784385fcf209ed6f9afde068689afc90773636a3/src/core.ts)
- [[dotenv]] —— 把 `.env` 灌进 `process.env` 的加载器
- [[zod]] —— 通用 schema；env 场景缺少 proxy 白名单和 `process.exit` 默认

## 关联

- [[dotenv]] —— 常见前置：先加载文件，再交给 `cleanEnv`
- [[zod]] —— 对照：通用校验 vs env 专用清洗
- [[express]] —— 启动阶段读清洗后的 `env.PORT`
- [[fastify]] —— 同样把 boot 配置收成 typed env

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

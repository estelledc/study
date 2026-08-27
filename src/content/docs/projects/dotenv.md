---
title: dotenv — 把 .env 文件灌进 process.env
description: 零依赖 env 文件加载器：parse/populate，默认不覆盖已有环境变量
来源: https://github.com/motdotla/dotenv
日期: 2026-08-27
分类: 开发工具
难度: 初级
difficulty: beginner
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/motdotla/dotenv
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: f116f70310abab44fbfddbaeb833698b5bf84a9b
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 17.4.2
---

## 是什么

dotenv 是一个**零依赖的 .env 加载器**。日常类比：像把冰箱门上的便利贴抄进值班表——文件里的 `KEY=value` 被抄到 `process.env`，值班表上已经有的名字默认不改。

```js
require('dotenv').config()
console.log(process.env.DATABASE_URL)
```

它只做三件事：读文件、按 .env 语法拆成字符串对象、把缺的键写进目标对象。它不校验类型、不拒绝未知键，也不保证值是 URL 还是数字。需要「值必须合法」时，应再接 [[envalid]] 或 [[zod]]。

## 为什么重要

不理解 dotenv 的写入合同，下面这些事会反复踩坑：

- 为什么本机 `.env` 改了，CI 里已经 export 的同名变量却纹丝不动
- 为什么 v17 一启动就打印 `injected env (N) from .env`
- 为什么 `DOTENV_KEY` 一出现，加载路径会从明文 `.env` 切到 `.env.vault`
- 为什么 preload `node -r dotenv/config` 和代码里的 `config()` 对 `quiet` 默认值不一样

一句话：dotenv 解决的是「文件怎么变成环境变量」，不是「环境变量该不该存在」。

## 核心要点

固定源码把主链拆成四步：

1. **`parse(src)` 只认字符串**：一行可选 `export`，键用 `=` 或 `:`，值可以是单引号、双引号或反引号。只有双引号里的 `\\n` / `\\r` 会展开成真正换行。

2. **`populate(target, parsed, { override })` 决定谁赢**：目标对象里已经有的键默认留下；`override: true` 才覆盖。返回值只包含**这次真正写进去的键**。

3. **`config()` 先看钥匙再看文件**：`options.DOTENV_KEY` 或 `process.env.DOTENV_KEY` 非空，并且找得到 `.env.vault` 时，走 AES-256-GCM 解密；否则退回明文 `.env`。缺文件不抛，返回 `{ parsed, error }`。

4. **日志和 preload 是两条入口**：程序里调用 `config()` 时，v17 默认 `quiet` 为假，会打印注入条数。`dotenv/config` 预加载会读 `DOTENV_CONFIG_*` 环境变量和 `dotenv_config_*` 命令行参数，且 CLI 匹配器在没写 `quiet` 时默认 `'true'`。

## 实践示例

### 案例 1：最早加载，默认不覆盖

```js
const dotenv = require('dotenv')
const result = dotenv.config({ path: '.env' })
if (result.error) {
  console.error(result.error.code, result.error.message)
}
```

`config()` 缺文件不会 throw。已经在 shell 里 `export DATABASE_URL=...` 的值会留下，`.env` 同名行被忽略。

### 案例 2：多文件按数组顺序叠

```js
dotenv.config({
  path: ['.env', `.env.${process.env.NODE_ENV}`],
  override: false,
  quiet: true,
})
```

数组会清空默认的单独 `.env`，再按顺序 `parse` + `populate` 到临时对象，最后一次性写入 `process.env`。后文件只有在 `override: true` 时才会盖住前文件。

### 案例 3：隔离写入，避免污染全局

```js
const isolated = {}
dotenv.config({ path: '.env.test', processEnv: isolated, quiet: true })
// process.env.SECRET 仍是原值；isolated.SECRET 才是文件里的字符串
```

`processEnv` 让测试或脚本把解析结果写到自己的对象。类型声明里值仍是 `string`。

### 案例 4：vault 只在钥匙齐套时启用

```js
dotenv.config({
  DOTENV_KEY: 'dotenv://:key_…@dotenvx.com/vault/.env.vault?environment=production',
})
```

钥匙必须是 URI：password 是 64 位 hex 密钥，`environment` 查询项决定读取 `DOTENV_VAULT_PRODUCTION` 这类密文。缺 `.env.vault` 时源码会警告并退回明文 `configDotenv()`。

## 踩过的坑

1. **把 dotenv 当成校验器**：所有值都是字符串。`PORT=3000` 进 `process.env` 后仍是 `"3000"`，不会变成 number。
2. **以为改 `.env` 一定覆盖本机环境**：默认合同是「环境变量优先」。要文件赢，必须显式 `override: true`。
3. **被 v17 的默认日志吓到**：17.0.0 把 programmatic `quiet` 默认改成 false。生产启动不想刷 tip，应写 `{ quiet: true }`。
4. **误把 `DOTENV_KEY` 留在 CI**：钥匙一出现，加载目标变成 vault。明文 `.env` 测试夹具会被这条分支绕开。

## 适用 vs 不适用场景

**适用**：
- Node 进程启动时把本地 `.env` 灌进 `process.env`
- 测试里用 `processEnv` 隔离一份字符串表
- 只要「文件 → 字符串字典」，类型检查交给下游

**不适用**：
- 需要失败即退出、类型收窄、禁止读未声明键 → 用 [[envalid]]
- 需要变量展开 `${OTHER}` → 这份 dotenv 源码不做 expand，那是另一个包
- 浏览器运行时 → `package.json` 的 `browser.fs` 为 `false`，没有文件系统可读

## 固定版本边界

- 本文绑定 `motdotla/dotenv@f116f703...`，包版本 `17.4.2`。
- `engines.node` 写的是 `>=12`；未在本机跑测试矩阵。
- 仓库 README 同时推广 dotenvx；本文只审查这个零依赖加载器，不把 dotenvx CLI 写成 dotenv 的默认行为。
- 本文只做源码/测试静态审查，没有安装依赖、解密真实 vault 或跑上游 tap，状态保持 `UNVERIFIED`。

## 学到什么

1. **加载和校验是两层**：dotenv 负责把文件变成字符串表；合法与否是另一份合同。
2. **默认不覆盖是生产安全阀**：本机/CI 已注入的密钥不应被仓库里的示例 `.env` 悄悄换掉。
3. **入口默认值会分叉**：同一仓库的 `config()` 和 `-r dotenv/config` 对 `quiet` 的默认并不相同。
4. **加密路径是可选支线**：`DOTENV_KEY` + `.env.vault` 才会离开明文解析，不能当成「装了 dotenv 就加密」。

## 应用型自测

1. shell 里已经有 `PORT=8080`，`.env` 写着 `PORT=3000`，`config()` 之后 `process.env.PORT` 是什么？
2. `.env` 写着 `NOTE="hello\\nworld"`（双引号），`parse` 后的值有换行吗？单引号呢？
3. 只设置了 `DOTENV_KEY`、当前目录没有 `.env.vault`，`config()` 会解密失败退出吗？

检查点：

1. `"8080"`。默认不覆盖已存在的键。
2. 双引号会展开成换行；单引号保留字面 `\\n`。
3. 不会。找不到 vault 时警告并退回明文 `configDotenv()`。

## 延伸阅读

- 仓库：[github.com/motdotla/dotenv](https://github.com/motdotla/dotenv)
- 固定源码：[motdotla/dotenv](https://github.com/motdotla/dotenv) —— 本文绑定提交 `f116f70310abab44fbfddbaeb833698b5bf84a9b`
- 主链文件：[`lib/main.js`](https://github.com/motdotla/dotenv/blob/f116f70310abab44fbfddbaeb833698b5bf84a9b/lib/main.js)
- [[envalid]] —— 校验并冻结已经加载的环境变量
- [[zod]] —— 通用 schema，不是 env 专用，但常接在 dotenv 之后

## 关联

- [[envalid]] —— 加载之后的 fail-closed 校验层
- [[zod]] —— 同一「字符串变 typed 值」问题的通用解
- [[express]] —— 常见宿主：启动时先 `config()` 再读 `process.env`
- [[fastify]] —— 另一类在 boot 插件里读环境变量的 Node 服务

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

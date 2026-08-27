---
title: dotenv-safe — 用 .env.example 核对缺键的 dotenv 包装
description: 介绍 dotenv-safe 9.1.0 如何在 dotenv.config 之后对照 example 键，以及预加载默认允许空值。
来源: https://github.com/rolodato/dotenv-safe
日期: 2026-08-27
分类: 工具库
难度: 入门
difficulty: beginner
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/rolodato/dotenv-safe
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 6c314f973e2213122bfa2eb3a5f0e386390281ff
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 9.1.0
---

## 是什么

dotenv-safe 是一个在 dotenv 读完 `.env` 之后，再拿 `.env.example` 对键名点名的包装。日常类比：仓库收货单一式两份——正本可以锁在柜子里，副本（example）公开贴在墙上；少了哪一栏，门就不让进，但并不检查栏里写的是不是真货。

你写：

```js
require('dotenv-safe').config();
```

固定 9.1.0 先调用 `dotenv.config(options)`，再同步读 example 文件。缺键抛 `MissingEnvVarsError`。dotenv 从 9.0.0 起是 peer，本页不绑定具体 peer 版本。

## 为什么重要

不理解“只对键、不对值”和预加载的默认值，就解释不了下面几件事：

- 为什么 `.env` 里写了 `TOKEN=` 仍然会炸
- 为什么缺的键可以靠 shell `TOKEN=abc KEY=xyz node app.js` 补齐
- 为什么 `node -r dotenv-safe/config` 默认允许空字符串
- 为什么 example 里没有的键，即使 `.env` 多写了也不会报错

## 核心要点

固定 9.1.0 的主链可以拆成五步：

1. **先交给 dotenv**：`config` 把同一份 `options` 传给 `dotenv.config`。已有 `process.env` 键不被覆盖，这是 peer dotenv 的合同，不是本库重写的。

2. **读 example**：路径取 `options.example || options.sample || '.env.example'`，再用 `dotenv.parse(fs.readFileSync(example))` 取出键名。

3. **决定空值算不算在**：默认 `allowEmptyValues === false`，先用 `compact(process.env)` 丢掉假值（对字符串环境变量就是空串）。为 `true` 时用完整 `process.env`。

4. **差集即缺键**：`difference(Object.keys(exampleVars), Object.keys(processEnv))`。有缺就 `throw new MissingEnvVarsError(...)`，错误对象带 `missing`、`example` / `sample`，并可附上 dotenv 读文件失败的原因。

5. **返回值**：`parsed` 是 dotenv 读到的对象（dotenv 自己出错则为 `{}`）；`required` 是 example 里每个键在最终 `process.env` 上的现值。多出来的 `.env` 键不进入 `required`，也不报错。

## 实践示例

### 案例 1：example 多出来的键会让启动失败

```js
// .env.example: SECRET= TOKEN= KEY=
// .env: SECRET=topsecret TOKEN=
require('dotenv-safe').config();
```

`TOKEN` 是空串，默认会被 `compact` 丢掉；`KEY` 根本不在环境里。两者都进入 `missing`，抛 `MissingEnvVarsError`。

### 案例 2：壳层补齐也算到齐

```bash
TOKEN=abc KEY=xyz node index.js
```

`.env` 不必写全。核对的是 `dotenv.config` 之后的 `process.env`，不是“文件里有没有这一行”。

### 案例 3：预加载默认允许空值

```bash
node -r dotenv-safe/config index.js
```

`config.js` 只在 `DOTENV_CONFIG_ALLOW_EMPTY_VALUES === 'false'` 时不设 `allowEmptyValues`。其余情况（未设或设成别的字符串）都会 `allowEmptyValues: true`，和编程接口默认相反。`DOTENV_CONFIG_EXAMPLE` 可改 example 路径。

## 踩过的坑

1. **把 dotenv-safe 当成 schema 校验**：它不看格式、长度或是否像 URL。空串以外的任何字符串都算“在”。

2. **以为 `-r dotenv-safe/config` 和 `require().config()` 默认一样**：预加载默认放行空值；编程默认不放行。

3. **把 `sample` 和 `example` 当成两个文件**：它们是同一选项的别名，最终只读一个路径。

4. **把 `master` 头当 9.1.0**：远端没有 `v9.1.0` tag。npm `gitHead` 指向 `6c314f97...`（提交说明 `9.1.0`）；其后还有只改 devDependency `braces` 的合并，本页不绑定。

5. **把 README 的 CI 建议写成库内置行为**：`CI` 换 example 文件是调用方自己写的 `options.example`，源码没有读 `process.env.CI`。

## 适用 vs 不适用场景

**适用**：

- 希望公开一份 `.env.example` 当清单，缺键就让进程起不来
- 秘密可以来自 `.env`、CI 变量或 shell，只要键到齐
- 能接受“只点名、不验值”，并把 dotenv 当作 peer 自己钉版本

**不适用**：

- 需要按 development / test / production 叠多层 `.env*`——看 [[dotenv-flow]]
- 需要校验值的形状——应看 schema 库，而不是给 example 填假值
- 需要 `$VAR` 插值——那是 dotenv-expand 的合同
- 不能接受“预加载与编程默认是否允许空值不一致”

## 固定版本边界

- 本文绑定 `rolodato/dotenv-safe@6c314f973e2213122bfa2eb3a5f0e386390281ff`。npm `dotenv-safe@9.1.0` 的 `gitHead` 与该提交一致；仓库没有对应 tag。
- `package.json` 声明 `peerDependencies.dotenv >= 8.2.0`；本页未安装、未固定 peer 的具体版本。
- 导出 `config`、`parse`（转给 dotenv）和 `MissingEnvVarsError`。
- 预加载认 `DOTENV_CONFIG_EXAMPLE`、`DOTENV_CONFIG_ALLOW_EMPTY_VALUES` 以及 argv 上的 `dotenv_config_*=`。
- 本文未安装依赖、运行上游测试或测量 bundle，状态保持 `UNVERIFIED`。

## 学到什么

1. **example 是键清单，不是值合同**——缺名才炸，空串在默认编程路径里也算缺。
2. **核对发生在 dotenv 赋值之后**——壳层变量可以补齐文件缺口。
3. **预加载把“允许空值”翻成默认开**——同一库两条入口的默认值不同。
4. **无 tag 时要拿 npm `gitHead` 对源码提交**——不要把后来的 dependabot 合并写进 9.1.0。

## 应用型自测

1. 编程调用 `config()` 且不传 `allowEmptyValues` 时，`.env` 里的 `TOKEN=` 算不算缺失？
2. `node -r dotenv-safe/config` 未设置 `DOTENV_CONFIG_ALLOW_EMPTY_VALUES` 时，空串键会不会让它抛错？
3. `.env` 多写了一个 example 里没有的 `DEBUG=1`，会不会因此抛 `MissingEnvVarsError`？

检查点：

1. 算。默认 `compact` 会丢掉空串。
2. 不会。预加载默认 `allowEmptyValues: true`。
3. 不会。差集只检查 example 有、环境没有的键。

## 延伸阅读

- 文档：[rolodato/dotenv-safe README](https://github.com/rolodato/dotenv-safe#readme)
- 固定源码：[rolodato/dotenv-safe](https://github.com/rolodato/dotenv-safe) —— 本文绑定提交 `6c314f973e2213122bfa2eb3a5f0e386390281ff`
- [[dotenv-flow]] —— 对照：按环境叠文件，不核对 example 键
- [[express]] —— 常见在监听端口前调用 `config()` 的宿主

## 关联

- [[dotenv-flow]] —— cascade 对照组；本库不做 `NODE_ENV` 选文件
- [[express]] —— 缺键时希望进程在绑端口前就失败
- [[nestjs]] —— 配置模块常和 example 清单一起出现
- [[zod]] —— 若还要验值的形状，应另走 schema，而不是加大 example 注释

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[dotenv-flow]] —— dotenv-flow — 按 NODE_ENV 叠多层 .env* 的环境文件加载器

- [[dotenv-flow]] —— dotenv-flow — 按 NODE_ENV 叠多层 .env* 的环境文件加载器

---
title: rc9 — 用 key=value 读写点号嵌套的 RC 文件
description: 固定 3.0.1 把 .conf 解析成嵌套对象，并区分弃用的家目录 API 与 XDG ~/.config。
来源: https://github.com/unjs/rc9
日期: 2026-08-27
分类: 基础设施
难度: 入门
difficulty: beginner
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/unjs/rc9
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 3df7dc63d21034f739fb13066546d4a6c44950c7
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 3.0.1
---

## 是什么

rc9 是一个读写 RC 风格配置文件的小库。日常类比：它不像 shell 的 `export`，也不像 [[dotenv-expand]] 去展开 `$VAR`；它把一行 `db.password=secret` 折成嵌套对象，再按同样规则摊平写回去。

固定 3.0.1 是 ESM-only。默认文件名是当前工作目录下的 `.conf`：

```js
import { read, update } from "rc9"

const config = read()
update({ "db.enabled": false })
```

`read()` 没有文件时返回 `{}`，不会抛错。

## 为什么重要

不看固定源码，容易把 rc9 说成“又一个 dotenv”或“把配置丢进 `~`”：

- 为什么默认文件叫 `.conf`，而不是 `.rc` / `.env`
- 为什么 `db.enabled=true` 读出来是布尔值
- 为什么旧的 `readUser` 和新的 `readUserConfig` 目录不一样
- 为什么 `update()` 是合并写回，而不是只改传入的那几个键就丢掉其余内容

一句话：rc9 的合同是 **key=value 文本 ↔ 嵌套对象**，外加一条明确的用户目录规则。

## 核心要点

固定 3.0.1 的主链可以拆成五步：

1. **补默认值**：`withDefaults` 把字符串参数当成 `{ name }`。默认 `name=".conf"`、`dir=process.cwd()`、`flat=false`。
2. **按行解析**：`parse` 用 `key=value` 正则扫每一行。注释、空行、`__proto__`、`constructor` 直接跳过。
3. **本地类型与数组**：值走 `destr`；`modules[]=x` 向同名数组 `concat`。
4. **摊平或保持扁平**：默认 `unflatten`，点号变成嵌套；`flat: true` 时 key 原样留下。
5. **写回**：`serialize` 先 `flatten`，再 `JSON.stringify` 每个值。`update` 用 `defu(新值, 文件旧值)`，新值赢。

用户目录有两套。弃用的 `readUser` / `writeUser` / `updateUser` 写到 `$XDG_CONFIG_HOME` 或家目录本身；`readUserConfig` 一族写到 `$XDG_CONFIG_HOME` 或 `~/.config`。

## 实践示例

### 案例 1：默认 `.conf` 读写嵌套对象

```js
import { write, read } from "rc9"

write({
  db: { username: "ada", enabled: true },
})

const config = read()
```

磁盘上会变成 `db.username=...` 与 `db.enabled=true` 这种行。再 `read()` 会 unflatten 回 `{ db: { ... } }`。`enabled` 经 `destr` 变成布尔，不是字符串 `"true"`。

### 案例 2：update 合并，而不是整文件替换错觉

```js
import { update, read } from "rc9"

update({ "db.enabled": false })
```

`update` 先把入参 unflatten，再 `defu` 到当前文件。只改 `db.enabled` 时，文件里其它键还在。`flat: true` 才能让 `x` 和 `x.y` 同时作为并列 key 活下来。

### 案例 3：用户配置要走 XDG，不要再用 readUser

```js
import { writeUserConfig, readUserConfig } from "rc9"

writeUserConfig({ token: 123 }, ".zoorc")
const conf = readUserConfig(".zoorc")
```

没有 `XDG_CONFIG_HOME` 时，路径是 `~/.config/.zoorc`。旧 API `writeUser` 会落到家目录根下的 `.zoorc`。3.0.0 起文档把后者标成 deprecated。

## 踩过的坑

1. **把 rc9 当成环境变量加载器**：它不读 `.env`，也不做 `$VAR` 展开。那是 [[dotenv-expand]] 的范围。
2. **把 `readUser` 当成 XDG**：弃用 API 的回退是 `homedir()`，不是 `~/.config`。
3. **以为缺文件会抛错**：`parseFile` 对不存在的路径返回 `{}`。
4. **把 `flat` 包当成运行时依赖**：源码 `import` 了 `flat`，但 `package.json` 只把它放在 devDependencies，构建打进 dist。
5. **用 CommonJS `require('rc9')`**：3.0.0 起 dist 只有 ESM。

## 适用 vs 不适用场景

**适用**：

- 需要一份人类可读的 `key=value` 文件，并接受点号嵌套
- 工具想把用户级配置放到 XDG `~/.config`
- 调用方已经是 ESM，能接受 `defu` + `destr` 这两条运行时依赖

**不适用**：

- 需要展开 `${HOST}`、跑 `$(command)` 或解密 `encrypted:`——看 [[dotenv-expand]]
- 必须保留值的原始字符串形态，又不能接受 `destr` 的类型转换
- 还在 CJS-only 项目里，又不想加 ESM 互操作层

## 固定版本边界

- 本文绑定 `unjs/rc9@3df7dc63...`，annotated tag `v3.0.1` 与 npm `gitHead` 指向同一提交。
- 发布包是 ESM-only，`exports` 只有 `./dist/index.mjs`。
- 运行时依赖声明为 `defu@^6.1.6` 与 `destr@^2.0.5`。
- 本文未安装依赖、未跑 vitest，状态保持 `UNVERIFIED`。

## 学到什么

1. **RC 文件的默认名以源码为准**——这里是 `.conf`，不是历史传说里的 `.projectrc`
2. **用户目录 API 分成两代**——家目录根和 `~/.config` 不是同一条路径
3. **update 的合并方向是 defu**——传入对象覆盖文件，而不是文件覆盖传入对象
4. **解析期就丢掉危险 key**——`__proto__` / `constructor` 不会进对象

## 应用型自测

1. 不传 options 时，`read()` 读的是哪个目录下的哪个文件名？
2. `readUser('.zoorc')` 和 `readUserConfig('.zoorc')` 在没有 `XDG_CONFIG_HOME` 时差在哪？
3. 文件不存在时，`read({ name: '.404' })` 会抛错还是返回空对象？

检查点：

1. `process.cwd()` 下的 `.conf`。
2. 前者回退到家目录，后者回退到 `~/.config`。
3. 返回 `{}`，不抛错。

## 延伸阅读

- 固定源码：[unjs/rc9](https://github.com/unjs/rc9) —— 本文绑定提交 `3df7dc63d21034f739fb13066546d4a6c44950c7`
- 对照入口：`src/index.ts`、`test/index.test.ts`
- [[dotenv-expand]] —— 另一侧：不读 RC 文件，只展开已经 parse 好的环境变量
- [[yargs]] —— CLI 声明里也能映射环境变量，但不是 RC 文件库

## 关联

- [[dotenv-expand]] —— `.env` 展开 / 命令替换 / 解密，不负责 `key=value` 嵌套对象
- [[yargs]] —— 命令行参数、配置文件与环境变量的另一套声明
- [[sops]] —— 把敏感字段加密进 Git，不是 RC 读写器
- [[volta]] —— 工具链版本，不是应用配置文件

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

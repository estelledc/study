---
title: Envinfo — 把本机开发环境扫成一份可粘贴报告
description: 介绍 envinfo 7.21.0 如何用 helper 探测二进制与 SDK，再格式化成 YAML / JSON / Markdown 诊断报告。
来源: https://github.com/tabrindle/envinfo
日期: 2026-08-27
分类: 工具库
难度: 入门
difficulty: beginner
trust:
  version: study-v2
  source_kind: project
  note_type: tool
  canonical_source: https://github.com/tabrindle/envinfo
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: a4894fb49deec8d467f07a30a02d0968b57f2e3e
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 7.21.0
---

## 是什么

Envinfo 是一个开发环境诊断工具：它去本机找 Node、包管理器、浏览器、SDK 和 IDE，然后打出一份给 issue 模板用的报告。日常类比：医院分诊单——护士按清单问“带了什么”，而不是改你的处方。

命令行：

```bash
npx envinfo
npx envinfo --system --binaries --json
```

程序里：

```js
const envinfo = require('envinfo');

envinfo.run(
  { System: ['OS', 'CPU'], Binaries: ['Node', 'npm'] },
  { json: true }
);
```

固定 7.21.0 的 npm 包只发布 `dist/`，由 webpack 把 `src/cli.js` 与 `src/envinfo.js` 打成 CommonJS。源码仓 `dependencies` 为空，运行时依赖被打进 bundle。

## 为什么重要

不理解“分类 → helper → 格式化”这条链，就解释不了下面几件事：

- 为什么裸跑 `envinfo` 会打出一大份默认报告，而不是空输出
- 为什么 `Not Found` 默认被丢掉，issue 里看不见“没装 Yarn”
- 为什么 `--clipboard` 不再复制，只打印一句改用 clipboardy
- 为什么 GitHub 上已有 `v7.22.0`，npm latest 却仍是 `7.21.0`

## 核心要点

固定 7.21.0 的主链可以拆成五步：

1. **CLI 先用 minimist 读参数**，并强制 `argv.console = true`。`--help` / `--version` 在进 `cli()` 前就返回。`global.__VERSION__` 由 webpack `DefinePlugin` 写入。
2. **选要跑的分类**：`cli()` 把参数名对到 `presets.defaults` 的键（`System`、`Binaries`、`Browsers` 等）。一个分类都没点到时，`main()` 见到空对象就改用整份 `presets.defaults`。`--all` 会再打开 npm / pnpm 全局包。`--preset` 合并 jest、webpack、`react-native`、playwright 等命名清单。
3. **按名字找 helper**：分类级函数叫 `get${category}`；条目级叫 `get${Name}Info`。例如 `Node` → `getNodeInfo`：`which('node')` 再跑 `node -v`，最后 `determineFound`。
4. **收成报告对象**：`Promise.all` 之后按 `presets.defaults` 的形状填回去。没有版本的条目标成 `Not Found`。
5. **格式化**：默认 YAML（`yamlify-object`）；`--json` / `--markdown` 换格式。`clean()` 丢掉 `Not Found`、`N/A` 和空对象，除非 `--showNotFound`。

## 实践示例

### 案例 1：裸命令走默认清单，但不扫本地 npm 包

`presets.defaults` 里 `npmPackages` / `npmGlobalPackages` / `pnpmGlobalPackages` 是 `null`。`main()` 对假值分类直接跳过，所以默认报告有 System / Binaries / IDEs，没有当前项目的依赖树。

### 案例 2：程序接口是 `run(args, options)`，不是 `cli()`

```js
await envinfo.run(
  { preset: 'playwright' },
  { markdown: true, console: false }
);
```

`run()` 见到 `args.preset` 就取 `presets.playwright`：System、Binaries、Bash、以及 VS Code / Cursor 等 IDE，外加 `{playwright*,@playwright/*}` 包 glob。CLI 的 `--preset` 还会再和命令行分类合并。

### 案例 3：探测失败写成 `Not Found`，默认再被滤掉

```js
// helpers/binaries.js 的 Node 探测
utils.which('node').then((nodePath) => (
  nodePath ? utils.run(nodePath + ' -v') : Promise.resolve('')
));
```

`determineFound(name, version, path)`：没有 version 就返回 `[name, 'Not Found']`。Linux 容器探测看 `/.dockerenv` 或 `/proc/self/cgroup`，对不上则记 `N/A`，同样会被 `clean()` 去掉。

## 踩过的坑

1. **以为它会读应用的 `process.env`**：除 `SHELL`、`ENVINFO_DEBUG`、Windows `ProgramFiles` 外，它不解释你的业务环境变量。读配置应看 [[env-var]]。
2. **把源码 `src/` 当 npm 入口**：安装到的是 webpack 产物 `dist/envinfo.js` 与 `dist/cli.js`。
3. **`--clipboard` 还在帮助里**：实现只打印“已移除”，要自己接 clipboardy。
4. **默认报告不等于 `--all`**：本地 / 全局 npm 包要显式打开，或用 preset。
5. **GitHub `v7.22.0` 还没上 npm**：registry 对 `7.22.0` 返回 404；本页绑定可发布的 `v7.21.0`。
6. **本轮未执行 `envinfo`、未跑 webpack、未测各 OS 探测路径**。

## 适用 vs 不适用场景

**适用**：

- issue 模板需要一份可粘贴的本机工具清单
- 程序里按 preset 或自选分类生成 YAML / JSON / Markdown
- 接受它用 `which` + `--version` 做 best-effort 探测

**不适用**：

- 启动时校验 `PORT` / `DATABASE_URL` 是否合法——那是 [[env-var]] 的合同
- 需要完整、权威的软件资产清单——helper 漏检或命令失败都会变成 `Not Found`
- 必须绑定尚未发布到 npm 的 GitHub `v7.22.0`

## 固定版本边界

- 本文绑定 `tabrindle/envinfo@a4894fb49deec8d467f07a30a02d0968b57f2e3e`，tag `v7.21.0` 与 npm `envinfo@7.21.0` 的 `gitHead` 是同一提交。
- GitHub 另有可达 tag `v7.22.0`（`a802f702bcb343e927e632fd315f8c57336bb820`），npm 无此版本；本页不绑定未发布树。
- `package.json` 标记 `engines.node >= 4`，`bin.envinfo` 指向 `dist/cli.js`。
- `src/cli.js` 依赖 `minimist`；helper 依赖 `which`、`os-name`、`glob`、`yamlify-object`。这些在源码里是 devDependency，发布物靠 webpack 打进 `dist/`。
- 本文未安装依赖、运行上游测试或执行 CLI，状态保持 `UNVERIFIED`。

## 学到什么

1. **默认报告来自空 props，不是隐藏的全选旗标**——`Object.keys(props).length === 0` 时改用 `presets.defaults`。
2. **探测和展示是两层**——helper 可以写下 `Not Found`，formatter 再决定是否给人看。
3. **CLI 与库入口分开**——`cli()` 解析 argv；`run()` 直接收分类对象。
4. **发布树是 bundle**——读源码看 `src/`，安装用的是 `dist/`。

## 应用型自测

1. 不带任何分类旗标运行 CLI，`main()` 会用空对象还是 `presets.defaults`？
2. 某 helper 返回 `Not Found` 且未传 `showNotFound`，YAML 里还能看到这一项吗？
3. `envinfo.run({ System: ['OS'] })` 会不会走 minimist？

检查点：

1. 用 `presets.defaults`。空 props 被当成“走默认清单”。
2. 不能。`clean()` 会丢掉 `Not Found`，除非 `showNotFound`。
3. 不会。`run()` 直接进 `main()`；minimist 只出现在 `src/cli.js`。

## 延伸阅读

- 文档：[README](https://github.com/tabrindle/envinfo/blob/v7.21.0/README.md)
- 固定源码：[tabrindle/envinfo](https://github.com/tabrindle/envinfo) —— 本文绑定提交 `a4894fb49deec8d467f07a30a02d0968b57f2e3e`
- [[env-var]] —— 读取并校验应用环境变量
- [[playwright]] —— 自带 `playwright` preset，用来收集浏览器相关诊断

## 关联

- [[env-var]] —— 配置读取对照：一个问“值合法吗”，一个问“机器上有什么”
- [[bun]] / [[deno]] —— 出现在默认 Binaries helper 里，本页未运行它们
- [[playwright]] —— `presets.playwright` 的包 glob 与 IDE 清单

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

---
title: rimraf — 跨平台的 Node `rm -rf`
description: 固定 6.1.3 按平台挑选 native / POSIX / Windows / move-remove，默认拒绝删根
来源: https://github.com/isaacs/rimraf
日期: 2026-08-27
分类: 工具库
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/isaacs/rimraf
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: f738c781d14fa7bc06f8e39e062d78f701fde3f1
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 6.1.3
---

## 是什么

rimraf 是 Isaac Schlueter 维护的 Node 递归删除库，语义对齐 Unix `rm -rf`。日常类比：它不是一把固定刀法的铲子，而是按操作系统和选项换刀——能走 Node 自带 `fs.rm` 就走，Windows 上则改用自己的两遍清扫。

固定 `6.1.3` 没有 default export，主入口是 named export：

```js
import { rimraf, rimrafSync } from "rimraf"

await rimraf("dist")
rimrafSync(["coverage", "tmp"])
```

同一对象上还挂着 `native`、`manual`、`posix`、`windows`、`moveRemove`。包声明 `node: "20 || >=22"`，用 tshy 同时出 ESM / CJS。

## 为什么重要

不看选择器，很容易把 rimraf 说成“包一层 `fs.rm`”：

- 为什么 Windows 默认不走 Node 原生实现
- 为什么传 `signal` 或 `filter` 会换实现
- 为什么 glob 默认关着，CLI 还把 `-rf` 当成空操作
- 为什么删 `/` 会抛 `ERR_PRESERVE_ROOT`，而不是“更彻底”

一句话：固定版本的产品判断是**先选实现，再删**，并且默认保住根目录。

## 核心要点

固定提交可以把主链拆成四步：

1. **规范化路径**：`pathArg` 要求字符串、拒绝 `\0`，然后 `resolve`。路径等于盘符根且 `preserveRoot !== false` 时抛 `ERR_PRESERVE_ROOT`。
2. **可选 glob**：只有 `glob: true` 或传入 glob 选项对象才会调用 `glob` / `globSync`，并且强制 `absolute: true`。
3. **挑选实现**：`useNative` 在 Node `<14.14`、`process.platform === 'win32'`、或存在 `signal`/`filter` 时为 false；否则 `rimrafNative` 调用 `fs.rm({ force: true, recursive: true })`。
4. **返回布尔**：全部条目删掉为 `true`；`filter` 跳过某项时为 `false`。ENOENT 被当成已经不在。

Windows 的 `manual` 实现先删非目录，再扫目录；第二遍遇到 `ENOTEMPTY` 才回退 `moveRemove`（先 `rename` 到临时名再删）。`EBUSY` / `EMFILE` / `ENFILE` 走指数退避，默认 `backoff=1.2`、`maxBackoff=200`、`maxRetries=10`。

## 实践示例

### 案例 1：默认入口清构建产物

```js
import { rimraf } from "rimraf"

const ok = await rimraf(["dist", "coverage"])
```

**逐部分解释**：数组会逐项 `pathArg` 再并行交给选定实现。没有 `glob` 时，`dist*` 只是字面目录名，不会展开。

### 案例 2：显式打开 glob

```js
await rimraf("tmp/**/*.log", { glob: true })
```

`optArg` 会把 `glob: true` 收成对象，并加上 `absolute: true`。CLI 对应 `-g` / `--glob`；默认是 `-G` / `--no-glob`。

### 案例 3：CLI 换实现并保住根

```bash
npx rimraf dist --impl=windows -v
```

`--impl` 可选 `rimraf` / `native` / `manual` / `posix` / `windows` / `move-remove`。`-v` 用 `filter` 打印相对路径，因此和 `--impl=native` 互斥。CLI 在 `preserveRoot !== false` 时还会再检查 `resolve(path) === parse(path).root`。

## 踩过的坑

1. **继续写 `import rimraf from 'rimraf'`**：v4 起取消 default export，v5/v6 仍是 named export。
2. **以为 Windows 也默认 `fs.rm`**：`use-native.ts` 在 `win32` 上直接返回 false，注释写明 Node 原生实现更弱。
3. **把 `-rf` 当成必写开关**：`bin.mts` 对 `-rf` / `-fr` 直接 `continue`，真正的递归来自实现本身。
4. **把源码注释里的 2–10x 慢写成实测结论**：那是 `move-remove.ts` 对自己策略的注释，本页没有跑 benchmark。
5. **把未信任输入交给 CLI `--tmp`**：README 明确拒绝此类安全报告；`--impl=move-remove` 可以把文件挪到任意 `--tmp`。

## 适用 vs 不适用场景

**适用**：

- 需要跨平台递归删除，并且想在 Windows 上保留重试 / move-remove 回退
- 构建脚本要删字面路径，而不是默认当 glob
- 能接受“目标不存在也算成功”

**不适用**：

- 需要先按 glob 选出文件、再给一份将删清单——那是 [[del]] 的合同
- 必须在 Windows 上强制走 Node `fs.rm`，却仍按默认 `rimraf()` 推理
- 要把未测量的删除速度写成选型依据

## 固定版本边界

- 本文绑定 `isaacs/rimraf@f738c781...`，npm `rimraf@6.1.3`，`gitHead` 与 tag `v6.1.3` 一致。
- 引擎是 `20 || >=22`；许可证是 BlueOak-1.0.0。
- 运行时依赖是 `glob@^13.0.3` 与 `package-json-from-dist`。
- 本文未安装依赖、未执行删除、未跑 tap，状态保持 `UNVERIFIED`。

## 学到什么

1. **默认实现是条件选择**，不是永远 `fs.rm`
2. **glob 是开关，不是路径语法的默认含义**
3. **根目录保护同时存在于库 API 和 CLI**
4. **Windows 的可靠删除是两遍清扫加回退**，不是单次 `unlink`

## 应用型自测

1. 在 Windows 上调用 `rimraf("dist")`，一定会走 Node `fs.rm` 吗？
2. `rimraf("build-*")` 不传选项时会展开通配符吗？
3. `rimraf("/")` 默认会删掉根目录吗？

检查点：

1. 不会。`useNative` 在 `win32` 上恒为 false。
2. 不会。必须 `glob: true` 或传入 glob 选项对象。
3. 不会。`pathArg` 默认抛 `ERR_PRESERVE_ROOT`。

## 延伸阅读

- 固定源码：[isaacs/rimraf](https://github.com/isaacs/rimraf) —— 本文绑定提交 `f738c781d14fa7bc06f8e39e062d78f701fde3f1`
- [[del]] —— glob 优先、cwd 沙箱、返回路径列表的对照路线
- [[node-js]] —— native 实现依赖的 `fs.rm`
- [[pnpm]] —— 常见的调用方，用来清 `node_modules` 或产物目录

## 关联

- [[del]] —— 先匹配再删，默认拒绝 cwd / cwd 外
- [[node-js]] —— POSIX / Windows 实现最终仍落到 Node fs
- [[vite]] —— 典型的 `dist` 清理场景
- [[pnpm]] —— 包管理脚本里最常见的调用位置

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[del]] —— del — 先 glob 再删的 Node 清理库

---
title: find-up — 沿目录树上行或下行找文件
description: 固定 v8：findUp 是 limit=1 的上行搜索，findDown 默认只往下看一层
来源: https://github.com/sindresorhus/find-up
日期: 2026-08-27
分类: 包管理
难度: 初级
difficulty: beginner
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/sindresorhus/find-up
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 5a009c227a484e503b78566412b1c0fd3dab3c27
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 8.0.0
---

## 是什么

find-up 是一个 **沿目录树找文件或目录** 的 ESM 小库。日常类比：你站在当前房间，先一层层问楼上有没有这张名片；v8 另外给了一部下行电梯，但默认只往下看一层。

```js
import {findUp} from 'find-up'
const pkg = await findUp('package.json')
```

固定 `8.0.0` 从 `cwd`（默认 `process.cwd()`）往父目录走，每层用 `locate-path` 检查名字是否存在。命中则返回绝对路径，否则 `undefined`。

## 为什么重要

不看固定入口，容易把“往上找 package.json”写成整份合同：

- 为什么默认找不到名为 `src` 的目录——`type` 默认是 `'file'`
- 为什么 `findUp` 和 `findUpMultiple` 几乎是同一条循环
- 为什么 matcher 返回字符串后还要再过一遍磁盘检查
- 为什么 v8 多了 `findDown`，却不能当成无限递归扫整棵树

一句话：它是 **上行收集 + 可选下行一层** 的路径发现器，不是包管理器。

## 核心要点

固定 8.0.0 的主链可以拆成五步：

1. **归一化起点**：`toPath(options.cwd)` 后 `path.resolve`；`stopAt` 默认是文件系统 root。
2. **每层询问**：名字数组交给 `locatePath` / `locatePathSync`；函数 matcher 先跑，返回字符串再交给 `locatePath`。
3. **记录或停下**：命中就 `path.resolve` 推进结果；matcher 返回 `findUpStop` 立刻结束。
4. **继续或收工**：到达 `stopAt`，或 `matches.length >= limit`，否则 `path.dirname` 再上一层。
5. **单次入口是限幅**：`findUp` / `findUpSync` 只是把 `limit` 设成 `1`，取 `matches[0]`。

`findDown` 是另一条链：默认 `depth: 1`、`strategy: 'breadth'`，只接受名字不接受 matcher；读目录失败被空 `catch` 吞掉。

## 实践示例

### 案例 1：找最近的 package.json

```js
import {findUp} from 'find-up'
const file = await findUp('package.json')
```

从当前工作目录往上，第一份存在的 `package.json` 文件路径。目录本身请看 [[pkg-dir]]。

### 案例 2：matcher + 提前停止

```js
import path from 'node:path'
import {findUp, findUpStop} from 'find-up'

await findUp(directory => {
  if (path.basename(directory) === 'work') return findUpStop
  return 'package.json'
})
```

`findUpStop` 是 Symbol。返回它时函数立刻结束并得到 `undefined`，不会再往上走。

### 案例 3：下行默认只看一层

```js
import {findDown} from 'find-up'
const nested = await findDown('example.js', {depth: 1})
```

`depth` 默认就是 `1`。要更深必须显式加大；`strategy: 'depth'` 才改成 DFS。

## 踩过的坑

1. **默认 `type: 'file'`**：找目录要写 `{type: 'directory'}`；`.git` 在 submodule 里可能是文件，才需要 `'both'`。
2. **matcher 返回的字符串不是“直接当结果”**：还会再走 `locatePath`，不存在就当本层未命中。
3. **`findDown` 没有 matcher 重载**，也不能用 `findUpStop`。
4. **把 v7 文档当成 v8**：`findDown` 是 8.0.0 才进 `index.js` 的；引擎是 `node >= 20`。
5. **把未测的速度或下载量写成结论**：本轮没有跑 test 或 benchmark。

## 适用 vs 不适用场景

**适用**：

- CLI / 配置发现需要从 cwd 向上找文件
- 只要第一处命中，或用 `findUpMultiple` + `limit` 收集祖先
- 需要 matcher 在某一层主动停掉

**不适用**：

- 只要最近的包根目录——那是 [[pkg-dir]] 对 `package.json` 再 `dirname` 的合同
- 需要无 Node 的纯二进制 walker
- 想用 `findDown` 扫整棵 monorepo 却不设 `depth`

## 固定版本边界

- 本文绑定 `sindresorhus/find-up@5a009c22...`，即 annotated tag `v8.0.0` 的解引用提交；npm `find-up@8.0.0` 的 `gitHead` 相同。
- 运行时依赖是 `locate-path@^8.0.0` 与 `unicorn-magic@^0.3.0`；引擎 `node >= 20`，`"type": "module"`。
- 本文未安装依赖、未跑 `xo` / `ava` / `tsd`，状态保持 `UNVERIFIED`。

## 学到什么

1. **单次查找只是 `limit: 1`**——主循环在 `findUpMultiple`
2. **类型默认值会改语义**——不写 `type` 就只认文件
3. **停止是一等信号**——`findUpStop` 不是“没找到再继续”
4. **下行不是镜像上行**——默认一层、无 matcher

## 应用型自测

1. `await findUp('src')` 在只有 `src/` 目录时会返回路径吗？
2. `findUp` 和 `findUpMultiple` 是否两套独立实现？
3. `findDown('x')` 不传 `depth` 会递归到磁盘尽头吗？

检查点：

1. 不会。默认 `type: 'file'`，目录要显式声明。
2. 不是。`findUp` 调用 `findUpMultiple(..., {limit: 1})`。
3. 不会。默认 `depth` 为 `1`。

## 延伸阅读

- 固定源码：[sindresorhus/find-up](https://github.com/sindresorhus/find-up) —— 本文绑定提交 `5a009c227a484e503b78566412b1c0fd3dab3c27`
- [[pkg-dir]] —— 在最近 `package.json` 上取目录名
- [[volta]] —— 运行时自己往上找带 `volta` 字段的 manifest

## 关联

- [[pkg-dir]] —— 包根目录，不暴露通用 walker
- [[pnpm]] —— workspace 协议另一层，不是本库
- [[volta]] —— 工具链版本嵌入 `package.json`

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[pkg-dir]] —— pkg-dir — 把最近的 package.json 收成包根目录

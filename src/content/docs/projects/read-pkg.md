---
title: read-pkg — 读当前目录的 package.json 并做规范化
description: 固定版本只读 cwd 下的 package.json，默认交给 parse-json 与 normalize-package-data
来源: https://github.com/sindresorhus/read-pkg
日期: 2026-08-27
分类: 包管理
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/sindresorhus/read-pkg
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: ae4bbc6588ba8707f931fc141d2b1d3bf0c8c703
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 10.1.0
---

## 是什么

read-pkg 是一个只负责读 **当前工作目录里那一份** `package.json` 的小库。日常类比：它不是管家去整栋楼敲门找门牌，而是打开你指定房间桌上的那张清单，必要时再按 npm 的习惯把字段擦整齐。

固定 `10.1.0` 是纯 ESM，入口只有 `readPackage`、`readPackageSync` 和 `parsePackage`。常见用法：

```js
import {readPackage} from 'read-pkg'

const pkg = await readPackage()
```

不传选项时，路径是 `path.resolve('.', 'package.json')`，也就是 `process.cwd()` 下的那份文件。

## 为什么重要

不看这三步，很容易把它和「随便读 JSON」或「向上找最近 package.json」混成一句话：

- 为什么换到子目录再调用，读到的是子目录的 manifest，而不是仓库根
- 为什么默认会把 `"unicorn "` 收成 `unicorn`，还多出 `_id`
- 为什么坏 JSON 的报错语气不像 `JSON.parse`，而像 `parse-json`
- 为什么对象版 `parsePackage` 改不到你手里的源对象

一句话：read-pkg 的合同是 **cwd 定位 + 更好的 JSON 报错 + 默认真规范化**。

## 核心要点

固定 `10.1.0` 的主链可以拆成四步：

1. **定位文件**：`getPackagePath(cwd)` 用 `unicorn-magic/node` 的 `toPath` 把 `string | URL` 收成路径，再 `path.resolve(..., 'package.json')`。`cwd` 缺省时 `toPath` 得到 `undefined`，回退 `'.'`。
2. **读成字符串**：异步走 `fs/promises.readFile(..., 'utf8')`，同步走 `fs.readFileSync`。这里没有 Buffer / BOM 专用解码。
3. **解析**：字符串交给 `parse-json`；已经是对象则原样进入下一步。
4. **规范化**：默认 `normalize = true`，原地调用 `normalize-package-data`。测试夹具 `test/package.json` 的 `"name": "unicorn "` 在默认路径下变成 `unicorn`，并且断言存在 `_id`。

`parsePackage` 是第三条入口：接受 object 或 string。object 会先 `structuredClone`，所以规范化不会改调用方手里的字面量。数组、`null`、函数一律抛 `TypeError('\`packageFile\` should be either an \`object\` or a \`string\`.')`。

## 实践示例

### 案例 1：读仓库根，而不是当前测试目录

```js
import {readPackage} from 'read-pkg'
import {fileURLToPath} from 'node:url'
import path from 'node:path'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const pkg = await readPackage({cwd: root})
```

**逐部分解释**：默认 `cwd` 是进程工作目录。固定测试在 `test/` 里跑，不传 `cwd` 会读到夹具包名 `unicorn`；要读库自己的 `package.json`，测试显式把 `cwd` 指到仓库根，并同时用 `pathToFileURL(root)` 核对 URL 与字符串等价。

### 案例 2：关掉规范化，保留原始字段

```js
const raw = await readPackage({normalize: false})
// 夹具里 name 仍是 "unicorn "，不会出现 _id
```

默认规范化是开关，不是永远发生。需要对照磁盘原文时，必须显式 `normalize: false`。

### 案例 3：已经有对象，只走同一套规范化

```js
import {parsePackage} from 'read-pkg'

const input = {name: 'unicorn ', version: '1.0.0'}
const pkg = parsePackage(input)
// input === 原来的对象；pkg 是 clone 后的结果
```

这条路不读磁盘。字符串输入仍走 `parse-json`；对象输入跳过解析，只 clone + 可选 normalize。

## 踩过的坑

1. **以为它会像 `read-package-up` 一样向上找**：源码只拼 `cwd/package.json`。仓库根在上面一层时，默认调用会 `ENOENT` 或读到另一份文件。
2. **把 read-pkg 当成 [[load-json-file]]**：本包不用那条通用 JSON 加载器，也不剥 BOM；错误路径走 `parse-json`。
3. **默认输出当原文**：`normalize-package-data` 会改 name、补 `_id` 等字段。要比对磁盘，先关 `normalize`。
4. **就地改传入对象**：`parsePackage` 对 object 先 `structuredClone`。测试断言返回值与源对象不是同一引用。
5. **把下载量、bundle 体积或「比 fs.readFile 更快」写成结论**：本轮没有跑依赖、测试或打包。

## 适用 vs 不适用场景

**适用**：

- 已经知道哪一层目录有 `package.json`，只要读出来并按 npm 习惯规范化
- 需要 `cwd` 同时接受文件 URL 和字符串
- 坏 JSON 时希望带文件语境的 `parse-json` 错误

**不适用**：

- 要从当前文件向上找最近的 manifest——那是 sibling `read-package-up`
- 要读任意 JSON、处理 UTF-8 BOM，或自己接 `reviver`——那是 [[load-json-file]]
- 还在 Node 18：固定包声明 `engines.node` 为 `>=20`
- 要把未实测的体积或速度写成选型依据

## 固定版本边界

- 本文绑定 `sindresorhus/read-pkg@ae4bbc65...`，npm 包 `read-pkg@10.1.0`。
- annotated tag `v10.1.0` 解引用后与 npm `gitHead`、`origin/main` 同指此提交。
- 运行时依赖声明为 `parse-json`、`normalize-package-data`、`unicorn-magic`、`type-fest` 与 `@types/normalize-package-data`；本轮未打开这些依赖的源码。
- 本文只做静态阅读，没有执行 `xo` / `node --test`，状态保持 `UNVERIFIED`。

## 学到什么

1. **「读 package.json」默认带规范化**——输出不一定等于磁盘 JSON
2. **定位合同是 cwd，不是 nearest-parent**
3. **解析器和加载器是两件事**——这里用 `parse-json`，不用 [[load-json-file]]
4. **对象入口会 clone**——规范化副作用停在返回值上

## 应用型自测

1. 在 `packages/app/` 里调用 `readPackage()`，不传 `cwd`，会读到仓库根的 `package.json` 吗？
2. 默认 `readPackage()` 读到夹具 `"name": "unicorn "` 时，`name` 还带着尾空格吗？
3. `parsePackage({name: 'x', version: '1.0.0'})` 会改传入的那个对象吗？

检查点：

1. 不会。它只读 `cwd/package.json`，默认 cwd 是 `process.cwd()`。
2. 不会。默认 `normalize: true`，测试里变成 `unicorn`。
3. 不会。object 输入先 `structuredClone`。

## 延伸阅读

- README：[sindresorhus/read-pkg](https://github.com/sindresorhus/read-pkg)
- 固定源码：[sindresorhus/read-pkg](https://github.com/sindresorhus/read-pkg) —— 本文绑定提交 `ae4bbc6588ba8707f931fc141d2b1d3bf0c8c703`
- 规范化说明：[npm/normalize-package-data](https://github.com/npm/normalize-package-data#what-normalization-currently-entails)
- [[load-json-file]] —— 通用 JSON 文件加载，不认 package 字段
- [[pnpm]] —— 真正负责安装与 workspace 的包管理器，不是读 manifest 的小函数

## 关联

- [[load-json-file]] —— 任意 JSON + BOM / reviver，不做 package 规范化
- [[pnpm]] —— workspace 与安装图；读哪一份 manifest 仍要自己选定
- [[changesets]] —— 版本声明另一条线，不替代读 `package.json`

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[load-json-file]] —— load-json-file — 读任意 JSON 文件并剥掉 UTF-8 BOM

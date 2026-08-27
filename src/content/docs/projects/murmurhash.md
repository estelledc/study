---
title: murmurhash — 把字符串收成 32 位 MurmurHash 整数
description: 固定 v2：默认导出是 MurmurHash3，字符串先 TextEncoder 再混成 32 位整数
来源: https://github.com/perezd/node-murmurhash
日期: 2026-08-27
分类: 工具库
难度: 初级
difficulty: beginner
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/perezd/node-murmurhash
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 0359fb98cd2e11dc79dbc0ae08ad9d5f8e7a66f7
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 2.0.1
---

## 是什么

`murmurhash` 是一个把字符串或字节数组压成 **32 位无符号整数** 的 CJS 小模块。日常类比：给一串字节盖一个四位数邮编——查重、分桶很快，但不能当锁或签名。

```js
const murmurhash = require("murmurhash");
murmurhash("abc");
murmurhash.v2("abc", 0);
murmurhash.v3("abc", 0);
```

固定 `2.0.1` 的默认导出就是 `MurmurHashV3`。`v2` / `v3` 是同一文件里的两条实现。它不序列化对象，也不输出 Base64 摘要；对象稳定指纹看 [[ohash]]。

## 为什么重要

不读固定文件，文档和注释会把合同写歪：

- README 用字符串当 seed，类型声明却是可选数字
- 注释和 `.d.ts` 仍写 “ASCII only”，实现已经 `TextEncoder` 成 UTF-8 字节
- 默认函数到底是 v2 还是 v3，不打开 `murmurhash.js` 末尾看不出来

一句话：它是 **Austin Appleby 的 MurmurHash2 / MurmurHash3 r136 的 JS 移植**，给分桶用，不给保密用。

## 核心要点

固定源码的主链可以拆成五步：

1. **收输入**：字符串走 `new TextEncoder().encode(val)`；已经是 `Uint8Array`（含 Node `Buffer`）就直接用。
2. **选算法**：直接调用等于 `v3`；要 MurmurHash2 必须写 `murmurhash.v2`。
3. **按 4 字节一块混**：v3 用常量 `0xcc9e2d51` / `0x1b873593`，每块 rotate、再混进 `h1`；尾巴 1–3 字节单独收。
4. **收尾 avalanche**：v3 先 `h1 ^= length`，再两次 multiply + xor；最后 `>>> 0` 保证是无符号 32 位。
5. **导出形态**：Node 下 `module.exports = murmur`；浏览器把函数挂到全局 `murmur`，并提供 `noConflict`。

v2 的种子写法是 `seed ^ length`；v3 的种子直接当 `h1` 初值。`seed` 为 `undefined` 时，位运算会把它收成 `0`。

## 实践示例

### 案例 1：默认入口就是 v3

```js
const murmurhash = require("murmurhash");
murmurhash("abc") === murmurhash.v3("abc");
```

文件末尾：`const murmur = MurmurHashV3; murmur.v2 = MurmurHashV2; murmur.v3 = MurmurHashV3`。没有单独的 `v1`。

### 案例 2：字符串和字节必须是同一段 UTF-8

```js
const { v3 } = require("murmurhash");
v3("abc");
v3(Buffer.from("abc"));
v3(new Uint8Array([97, 98, 99]));
```

仓内 `test.js` 断言这三路都等于 `3017643002`。本页没有执行该测试，只记录固定提交里的断言。

### 案例 3：seed 影响整条链

```js
const murmurhash = require("murmurhash");
murmurhash.v3("abc", 0);
murmurhash.v3("abc", 1);
```

同一段字节、不同数字种子，得到不同的 32 位值。不要把 README 里的 `"some seed value"` 字面量抄进生产代码。

## 踩过的坑

1. **注释还在说 ASCII**：非 ASCII 字符串会按 UTF-8 多字节编码后再混，不是按 UCS-2 代码单元。
2. **默认不是 v2**：只写 `murmurhash(str)` 就是 v3。要旧算法必须显式 `v2`。
3. **返回值是数字，不是 hex 串**：`>>> 0` 之后仍是 JS number；要 hex 自己 `toString(16)`。
4. **npm `gitHead` 对不上 GitHub tag**：npm `2.0.1` 写着 `e6aec85b...`，canonical remote 不可达。本文只绑定 tag 解引用提交 `0359fb98...`，不伪造另一份源码。
5. **把它当密码学哈希**：32 位、无密钥、可预测。密码和完整性校验应走 SHA 系列或运行时 `crypto`。

## 适用 vs 不适用场景

**适用**：

- 缓存分片、Bloom / 计数桶、需要稳定 32 位整数的本地索引
- 已经有字符串或 `Uint8Array`，不想先序列化对象
- 同时要 MurmurHash2 和 MurmurHash3 两个入口

**不适用**：

- 要对任意 JS 对象做稳定结构指纹 → [[ohash]]
- 需要抗碰撞、HMAC、口令摘要
- 需要 128 位 MurmurHash3 或 x64 变体——本文件只有 32 位实现
- 要把 README 的速度形容词写成测过的结论

## 固定版本边界

- 本文绑定 `perezd/node-murmurhash@0359fb98cd2e11dc79dbc0ae08ad9d5f8e7a66f7`。lightweight tag `2.0.1` 与 `origin/master` 同指此提交。
- 实现注释指向 Gary Court 的 [murmurhash-js](https://github.com/garycourt/murmurhash-js) 与 Appleby 的 MurmurHash 主页。
- npm `murmurhash@2.0.1` 的 `gitHead` 在 GitHub 上不可达；未把它写成第二份绑定 revision。
- 未安装依赖，未跑 `test.js`，状态保持 `UNVERIFIED`。

## 学到什么

1. **算法名写在默认导出里**——同文件两个版本，默认只是其中一个。
2. **“ASCII only” 可能是过时注释**——真正吃的是 `TextEncoder` 字节。
3. **种子类型要以类型声明和位运算为准**，不以 README 示例为准。
4. **包 registry 的 `gitHead` 不是自动可信**——远端不可达就停在可达 tag。

## 应用型自测

1. `require("murmurhash")("abc")` 走的是 v2 还是 v3？
2. 注释写 ASCII only，`"abc"` 和 `Uint8Array([97,98,99])` 会得到不同结果吗？
3. npm 上的 `gitHead` 不可达时，本文绑定了哪一个 SHA？

检查点：

1. v3。默认导出被赋成 `MurmurHashV3`。
2. 按固定测试，两者相同；实现先把字符串编成 UTF-8。
3. `0359fb98cd2e11dc79dbc0ae08ad9d5f8e7a66f7`，即 tag `2.0.1`。

## 延伸阅读

- 固定源码：[perezd/node-murmurhash](https://github.com/perezd/node-murmurhash) —— 本文绑定提交 `0359fb98cd2e11dc79dbc0ae08ad9d5f8e7a66f7`
- [[ohash]] —— 同主题的另一端：先序列化对象，再 SHA-256
- [[minhash-broder-1997]] —— 集合最小哈希，不是 32 位 Murmur
- MurmurHash 背景：[Wikipedia: MurmurHash](https://en.wikipedia.org/wiki/MurmurHash)

## 关联

- [[ohash]] —— 对象稳定序列化 + SHA-256，不是 32 位整数
- [[minhash-broder-1997]] —— 近似集合相等，底层也常用类似的独立哈希族
- [[simhash-charikar-2002]] —— 近邻指纹，输出形态不同
- [[consistent-hashing-1997]] —— 把哈希值铺到环上做分区
- [[ofetch]] —— 同属 JS 小工具，但合同是 HTTP 而不是散列

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[ohash]] —— ohash — 先稳定序列化，再做 SHA-256 摘要

- [[ohash]] —— ohash — 先稳定序列化，再做 SHA-256 摘要

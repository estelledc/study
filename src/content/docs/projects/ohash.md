---
title: ohash — 先稳定序列化，再做 SHA-256 摘要
description: 固定 v2：hash 是 serialize 后再 SHA-256，key 排序不再走 localeCompare
来源: https://github.com/unjs/ohash
日期: 2026-08-27
分类: 工具库
难度: 初级
difficulty: beginner
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/unjs/ohash
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 764b0a3203308956ef07597612af5ad59f36c791
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 2.0.12
---

## 是什么

ohash 是一个把任意 JavaScript 值先收成稳定字符串、再做成摘要的小库。日常类比：先把抽屉里的东西按固定顺序摆好拍照，再把照片压成一枚指纹——比的是摆法，不是抽屉在房间的位置。

```js
import { hash, serialize } from "ohash";
serialize({ b: 2, a: 1 }); // "{a:1,b:2}"
hash({ foo: "bar" });
```

固定 `2.0.12` 的 `hash(input)` 只做一件事：`digest(serialize(input))`。`digest` 是 SHA-256，输出 Base64URL。它不是 [[murmurhash]] 那种 32 位整数，也不是 v1 的 `objectHash` 分段串。

## 为什么重要

不看固定 2.0.12 入口，旧印象会把三件事说错：

- 还以为 `hash` 是 murmur 风格短整数或 v1 `object:1:string:3:...` 格式
- 还以为对象 key 排序走运行时 `localeCompare`（斯洛伐克语里 `ch` 会当成一个字母）
- 还以为这枚指纹能当密码学承诺或防篡改签名

一句话：它是 **稳定结构串 + SHA-256**，明确写了不按安全用途设计。

## 核心要点

固定源码的主链可以拆成五步：

1. **入口分流**：顶层字符串直接包单引号；其余交给 `Serializer`。
2. **写成稳定文本**：`null` / 数字 / 布尔 / `undefined` / `bigint` 走字面量；对象按 `Object.prototype.toString` 分发到 `$Date`、`$Map`、`$Set`、TypedArray 等；普通对象用 `Object.keys` 排序后写成 `{key:value}`。
3. **循环引用记账**：`#context` Map 第一次看见某个对象先记 `#N`，写完再换成正文；再次遇见就返回占位，例如 `{foo:#0}`。
4. **摘要**：`digest` 从 `ohash/crypto` 进来。Node 条件导出优先 `process.getBuiltinModule("crypto").hash("sha256", data, "base64url")`；没有这条快捷路径再用 `createHash`。浏览器默认入口是基于 crypto-js 4.1.1 的纯 JS SHA-256。
5. **比较与 diff**：`isEqual` 先 `===`，再比两份 `serialize`。`diff` 在 `ohash/utils`，按可枚举 key 做 added / removed / changed，并跳过 `__proto__`。

## 实践示例

### 案例 1：key 顺序不同，结构串相同

```js
import { serialize, isEqual } from "ohash";
serialize({ b: 2, a: 1 });
isEqual({ a: 1, b: 2 }, { b: 2, a: 1 }); // true
```

`compareStrings` 用一张可打印 ASCII 权重表，大写只在平局时输给小写。仓内测试专门把 `String.prototype.localeCompare` 换掉，确认排序不再看 ICU。

### 案例 2：`hash` 是序列化后再摘要

```js
import { hash } from "ohash";
hash({ foo: "bar" });
```

仓内 `test/hash.test.ts` 把这个输入钉在 `g82Nh7Lh3CURFX9zCBhc5xgU0K7L0V1qkoHyRsKNqA4`。本页没有复跑测试，只记录固定提交里的断言。

### 案例 3：`digest` 只吃字符串

```js
import { digest } from "ohash";
digest("Hello World");
```

`crypto.test.ts` 同时钉 JS 实现和 Node 实现：`Hello World` → `pZGm1Av0IEBKARczz7exkNYsZb8LzaMrV7J32a2fFG4`。对象请先 `serialize`，或直接走 `hash`。

## 踩过的坑

1. **把 v1 `objectHash` 当 v2 API**：v2 没有同格式 helper。要稳定文本用 `serialize`，要短摘要用 `hash`。
2. **Symbol key 会消失**：`Object.keys` 不收集 Symbol，`{ [Symbol("k")]: 1 }` 序列化成 `{}`。
3. **`toJSON` 会改形状**：自定义类若实现 `toJSON`，先走返回值再序列化；返回对象时拼 `ClassName{...}`，返回标量时拼 `ClassName(...)`。
4. **`diff` 不是 `serialize` 的镜像**：引用相等的子树整段跳过；叶子对上非空容器时不发 `changed`。
5. **把它写成安全哈希**：源码写明可能被输入故意碰撞。密码、完整性校验应走运行时 `crypto`，不是这层便利函数。

## 适用 vs 不适用场景

**适用**：

- 缓存 key、去重、快照：同一个结构要得到同一串
- 比较两个普通对象是否“长得一样”，而不是是不是同一个引用
- 需要看 nested 增删改时用 `diff`

**不适用**：

- 只要对字节做非密码学 32 位散列 → [[murmurhash]]
- 需要 v1 `objectHash` 逐字段类型前缀
- 需要密码学承诺、HMAC、抗碰撞保证
- 要把静态阅读升级成已测 bundle 或跨引擎 SHA-256 性能结论

## 固定版本边界

- 本文绑定 `unjs/ohash@764b0a3203308956ef07597612af5ad59f36c791`。annotated tag `v2.0.12` 解引用到此提交；npm `ohash@2.0.12` 无 `gitHead`。
- 序列化注释写明源自 `puleos/object-hash` v3.0.0；JS digest 注释写明源自 crypto-js 4.1.1。
- 未安装依赖，未跑 vitest / coverage / bench，状态保持 `UNVERIFIED`。

## 学到什么

1. **对象哈希常常是“先变成字，再哈希”**——`hash` 自己不做遍历。
2. **稳定排序不能交给 locale**——ICU 数据会让同一对象在不同机器上得到不同串。
3. **循环引用靠占位，不靠无限展开**——`#N` 是记账，不是内容拷贝。
4. **比较 API 和 diff API 不是同一条链**——一个比完整串，一个走可枚举树。

## 应用型自测

1. `hash({ a: 1, b: 2 })` 和 `hash({ b: 2, a: 1 })` 在固定源码里应不应该相同？
2. v2 有没有函数能复现 v1 `objectHash` 的 `object:1:string:3:...` 串？
3. `isEqual` 在引用不同时，下一步比的是 SHA-256 还是序列化文本？

检查点：

1. 应该相同。key 会按 `compareStrings` 排序后再序列化。
2. 没有。官方迁移表只指向 `serialize` / `hash`。
3. 比的是 `serialize` 字符串，不是 digest。

## 延伸阅读

- 固定源码：[unjs/ohash](https://github.com/unjs/ohash) —— 本文绑定提交 `764b0a3203308956ef07597612af5ad59f36c791`
- [[murmurhash]] —— 同主题的另一端：对字节做 32 位 MurmurHash，不序列化对象
- [[ofetch]] —— 同一 unjs 工具带，请求包装而不是哈希
- [[minhash-broder-1997]] —— 近似集合哈希，不是对象稳定摘要

## 关联

- [[murmurhash]] —— 非密码学 32 位整数哈希，输入是字符串或字节
- [[ofetch]] —— unjs 生态里的 Fetch 包装，合同完全不同
- [[minhash-broder-1997]] —— 集合相似度，不是结构 canonicalization
- [[simhash-charikar-2002]] —— 近邻指纹，不是 SHA-256 digest
- [[consistent-hashing-1997]] —— 分区环，不是对象序列化

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[murmurhash]] —— murmurhash — 把字符串收成 32 位 MurmurHash 整数

- [[murmurhash]] —— murmurhash — 把字符串收成 32 位 MurmurHash 整数

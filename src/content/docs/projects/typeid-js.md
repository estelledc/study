---
title: typeid-js — 用前缀 + UUIDv7 suffix 做出可排序、可辨类型的 ID
description: 介绍 typeid-js 1.2.0 如何把 [a-z_] 前缀和 Crockford base32 的 UUIDv7 拼成 TypeID。
来源: https://github.com/jetify-com/typeid-js
日期: 2026-08-27
分类: 工具库
难度: 入门
difficulty: beginner
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/jetify-com/typeid-js
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 3199b119fb2e8b77b2710e2e8eaec9f0220a9d18
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 1.2.0
---

## 是什么

typeid-js 是 TypeID 规格的官方 TypeScript 实现：左边是可读的类型前缀，右边是 UUIDv7 的 Crockford base32。日常类比：工牌上先印部门，再印工号；扫码能还原成标准 UUID，肉眼也能看出这是用户还是订单。

你写：

```ts
import { typeid, TypeID } from 'typeid-js';

const userId = typeid('user');
userId.toString(); // user_<26 位 suffix>
userId.toUUID();   // 8-4-4-4-12 的 UUID 文本
```

固定 1.2.0 的 `TypeID` 类只是外壳：构造时调用 unboxed `typeidUnboxed`，再把品牌字符串拆回 `prefix` / `suffix`。真正生成随机 ID 时，走 `uuid` 包的 `v7` 写入 16 字节，再 `encode`。

## 为什么重要

不理解前缀规则、suffix 校验和两套 API 的参数顺序，就解释不了下面几件事：

- 为什么 `typeid('User')` 直接抛错，而 `user_profile` 合法
- 为什么空前缀的规范串没有下划线
- 为什么类上的 `fromUUID` 和 unboxed `fromUUID` 不能换着抄
- 为什么 suffix 第一位不能是 `8` 或 `f`

## 核心要点

固定 1.2.0 的主链可以拆成五步：

1. **先定前缀合同**：`isValidPrefix` 允许最多 63 个 `[a-z_]`，但第一个和最后一个必须是 `[a-z]`。空前缀合法。
2. **随机 suffix 来自 UUIDv7**：没传 suffix 时，`typeidUnboxed` 分配 16 字节数组，交给 `v7(undefined, buffer)`，再 Crockford base32。字母表是 `0123456789abcdefghjkmnpqrstvwxyz`，没有 `i` / `l` / `o` / `u`。
3. **再卡三条 suffix 硬条件**：长度必须 26；首字符必须 `<= "7"`（挡住超出 48-bit 时间戳高位的值）；然后 `decode` 查表，遇到 `0xff` 就报非法字符。
4. **解析按下划线最后一次出现切开**：`fromString` 用 `lastIndexOf("_")`。没有下划线就当成空前缀；有分隔符但前缀为空，抛 `EmptyPrefixError`。可选的第二参数用来核对前缀。
5. **类 API 和 unboxed API 并存**：`TypeID` 是对象；`TypeId<T>` 是品牌字符串。类方法 `fromUUID(prefix, uuid)` 前缀在前；unboxed `fromUUID(uuid, prefix?)` 正好相反。

## 实践示例

### 案例 1：带前缀生成，再收成 UUID

```ts
const tid = typeid('user');
tid.getType();    // 'user'
tid.getSuffix();  // 26 位
tid.toString();   // user_...
tid.toUUID();     // stringify(decode(suffix))
```

`typeid('user')` 走进 `new TypeID('user', '')`。空 suffix 触发 `v7`。`toString()` 在前缀非空时拼 `prefix_suffix`，前缀为空时只返回 suffix。

### 案例 2：从已知 UUID 还原，并收窄类型

```ts
const tid = TypeID.fromUUID('prefix', '01889c89-df6b-7f1c-a388-91396ec314bc');
tid.toString(); // prefix_01h2e8kqvbfwea724h75qc655w

const same = tid.asType('prefix');
// tid.asType('other') 抛 TypeIDConversionError
```

`fromUUID` 先 `parseUUID` 拆成 16 字节，再 `encode`。`asType` 只比较运行时前缀字符串，成功时把同一个对象当成 `TypeID<U>` 返回。

### 案例 3：解析带下划线的前缀，并拒绝空前缀串

```ts
const tid = TypeID.fromString('user_profile_00041061050r3gg28a1c60t3gf', 'user_profile');
tid.getType(); // 'user_profile'

TypeID.fromString('_00041061050r3gg28a1c60t3gf'); // EmptyPrefixError
```

因为切开用的是最后一次 `_`，`user_profile` 这种前缀能活下来，前提是首尾仍是小写字母。`_suffix` 则被当成“分隔符在，前缀却空”。

## 踩过的坑

1. **把类 `fromUUID` 和 unboxed `fromUUID` 当成同一签名**：`TypeID.fromUUID('user', uuid)`；unboxed 是 `fromUUID(uuid, 'user')`。抄反会把 UUID 文本当前缀校验，立刻失败。
2. **以为任意 slug 都能当前缀**：大写、空格、首尾下划线、超过 63 个字符都会 `InvalidPrefixError`。数字也不行。
3. **把 Crockford 表当成普通 base32**：`i` / `l` / `o` / `u` 不在字母表。`fromString` 遇到它们走 `InvalidSuffixCharacterError` 或 `Invalid base32 character`。
4. **把“type-safe”理解成运行时强制对象类型**：`TypeID<'user'>` 是 TypeScript 字面量；运行时仍是普通类实例。跨边界传字符串时，要用 `fromString(str, 'user')` 再核对。
5. **把 GitHub tag 当成 1.2.0 的绑定点**：该仓在审查时没有 release / tag。本页绑定的是 npm `gitHead` `3199b119fb2e8b77b2710e2e8eaec9f0220a9d18`。

## 适用 vs 不适用场景

**适用**：

- 主键或 API 资源 ID 需要可读类型，并且希望按时间近似排序
- 已经或准备把存储层落成 UUID / UUIDv7，只在边界加上前缀
- TypeScript 5 能消费 `const` 类型参数，打包器能读 `dist/` 的 CJS / ESM 条件导出

**不适用**：

- 只要固定 27 位、无前缀、秒级时间戳的 Node ID——看 [[ksuid]]
- 不能引入运行时依赖 `uuid@^10`
- 需要在无构建步骤的环境直接跑 `src/*.ts`
- 前缀必须含大写、数字或 Unicode——本实现的字母表是 ASCII `[a-z_]`

## 固定版本边界

- 本文绑定 `jetify-com/typeid-js@3199b119fb2e8b77b2710e2e8eaec9f0220a9d18`。npm `typeid-js@1.2.0` 的 `gitHead` 与该提交一致；GitHub 上没有对应 tag。
- `package.json` 声明 `sideEffects: false`，`main` / `module` / `types` 都指向 `dist/`；源码审查读的是 `src/`。
- 运行时依赖只有 `uuid@^10.0.0`。README 写过需要 TypeScript > 5.0.0，`package.json` 没有 `engines` 字段。
- `base32.encode` 的注释写 “10 byte timestamp”，实际是 10 个 base32 字符覆盖 UUID 前 6 字节（UUIDv7 的 48-bit 时间戳）。
- 本文未安装依赖、运行上游测试或测量 bundle，状态保持 `UNVERIFIED`。

## 学到什么

1. **类型前缀是解析合同，不是装饰**——合法字符、首尾字母、最后一次下划线，决定 `user_profile_…` 能不能圆回来。
2. **可排序来自 UUIDv7，不是另做一套时间戳**——库自己不写 epoch 常数，而是调用 `uuid` 的 `v7`。
3. **类和品牌字符串是两套表面**——`TypeID` 方便方法链；`TypeId<T>` 避免序列化来回。混用时先对一下 `fromUUID` 参数顺序。
4. **suffix 的第一位是安全阀**——`> "7"` 直接拒绝，避免编码出超出规格的高位时间。

## 应用型自测

1. `typeid('User')` 会得到一个 `TypeID<'User'>` 吗？
2. 空前缀时，`typeid().toString()` 里会不会出现 `_`？
3. unboxed `fromUUID` 的第一个参数是前缀还是 UUID 字符串？

检查点：

1. 不会。前缀必须是小写 `[a-z_]`，`User` 会 `InvalidPrefixError`。
2. 不会。空前缀直接返回 26 位 suffix。
3. 是 UUID 字符串。前缀是可选第二参数；类方法才是前缀在前。

## 延伸阅读

- 规格：[jetify-com/typeid](https://github.com/jetify-com/typeid)
- 固定源码：[jetify-com/typeid-js](https://github.com/jetify-com/typeid-js) —— 本文绑定提交 `3199b119fb2e8b77b2710e2e8eaec9f0220a9d18`
- [[ksuid]] —— 无前缀、自管秒级时间戳的对照实现

## 关联

- [[ksuid]] —— 同样可按时间排序，但不带类型前缀、也不经过 UUIDv7
- [[date-fns]] —— 处理绝对时间；TypeID 把时间藏进 UUIDv7 suffix
- [[lodash]] —— 通用工具；typeid-js 只做这一件 ID 的事

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[ksuid]] —— ksuid — 把秒级时间戳放进 20 字节、27 位 base62 的可排序 ID

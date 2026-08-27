---
title: validator — 只对字符串做格式校验与轻量清洗
description: 介绍 validator 13.15.35 如何用 assertString 守门，并拆出 isEmail、isURL 与字符级 escape。
来源: https://github.com/validatorjs/validator.js
日期: 2026-08-27
分类: 工具库
难度: 入门
difficulty: beginner
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/validatorjs/validator.js
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 7a8079709cd4cb27b2a1846e6f6508d68c9d928f
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 13.15.35
---

## 是什么

validator（npm 包名 `validator`，仓库 `validatorjs/validator.js`）是一组字符串校验器和清洗器。日常类比：海关只检查标签上的文字——先确认你递过来的是一张纸条，再按规则看它像不像邮箱、URL 或数字；它不打开箱子核对里面的物件形状。

你写：

```js
var validator = require('validator');

validator.isEmail('foo@bar.com'); // => true
```

也可以按函数引用：`require('validator/lib/isEmail')` 或 `validator/es/lib/isEmail`。固定 13.15.35 的作者源在 `src/`，发布物由 Babel 打到 `index.js` / `lib` / `es`。

## 为什么重要

不理解“只收字符串”和“校验不是消毒”，就解释不了下面几件事：

- 为什么传入数字或 `null` 会抛错，而不是返回 `false`
- 为什么 `isURL('example.com')` 默认能通过，而 `javascript:…` 默认不能
- 为什么 `escape()` 不能当成 HTML 消毒
- 为什么它不能替代 [[zod]] 那种对象 schema

## 核心要点

固定 13.15.35 的主链可以拆成五步：

1. **先断言是字符串**：`assertString` 在 `undefined` / `null` 或其他 constructor 时抛 `TypeError`。README 写明“只处理字符串”；拿不准时先自己写成 `input + ''`。

2. **选项与默认值合并**：`merge(options, defaults)` 只补 `undefined` 的键，不会把 `false` 盖回默认。`isEmail` / `isURL` 都走这条路径。

3. **`isEmail` 按最后一个 `@` 切开**：默认最大长度 254；user 最长 64 字节、domain 最长 254 字节。domain 默认走 `isFQDN`；打开 `allow_ip_domain` 才接受 IP 或 `[IPv6]`。带显示名的 `Name <mail>` 要显式开 `allow_display_name`。

4. **`isURL` 用正则认 scheme，不依赖 `://`**：默认协议是 `http` / `https` / `ftp`，`require_protocol` 默认 false。`javascript:` 会被认成协议，再因不在允许列表而失败。空串、空白、`<>` 和 `mailto:` 直接 false。默认长度上限 2084。

5. **清洗器是另一组函数，且 XSS 消毒已删除**：`escape` 只把 `&`、引号、`<>`、斜杠、反斜杠和反引号换成实体。README 写明 XSS sanitization 已在历史提交 `2d5d6999` 移除，并指向 [[xss-filters]]（以及未在本轮审查的 DOMPurify）。

## 实践示例

### 案例 1：非字符串会抛，而不是当假值

```js
validator.isEmail('ada@example.com'); // true
validator.isEmail(null);              // TypeError: Expected a string but received a null
```

`assertString` 看的是 `constructor.name === 'String'`。调用方必须先保证类型；库不会帮你 `String(value)`。

### 案例 2：默认 `isURL` 不要求协议，但会拒绝未允许的 scheme

```js
validator.isURL('example.com');                 // true（默认不要求协议）
validator.isURL('javascript:alert(1)');         // false（协议不在 http/https/ftp）
validator.isURL('example.com', { require_protocol: true }); // false
```

源码用 `/^([a-z][a-z0-9+\-.]*):/i` 抓协议，再区分 `http://`、`user:pass@host` 和 `hostname:port`。README 仍建议生产环境打开 `require_protocol`。

### 案例 3：`escape` 只替换字符，不理解 HTML 结构

```js
validator.escape('<a href="x">');
// '&lt;a href=&quot;x&quot;&gt;'
```

这和 [[xss-filters]] 的上下文编码不同：它不管这段字符将出现在正文还是属性，也不处理 `javascript:` 协议。

## 踩过的坑

1. **把 `isEmail` / `isURL` 当成“可以安全渲染”**：通过格式检查只说明字符串像邮箱或 URL，不证明输出上下文安全。

2. **给 `isURL` 默认值赋予“已挡协议相对 URL 和 javascript”的完整保证**：默认 `allow_protocol_relative_urls` 为 false，未允许的 scheme 会失败；但默认不要求协议，`example.com` 仍为 true。

3. **把 `escape` 或 `whitelist` 当成 XSS 消毒**：XSS 相关 sanitizer 已删除。`escape` 是字符表替换；`whitelist` / `blacklist` 是按字符集合删字。

4. **把 Gmail 的点号规则写进 `isEmail` 默认行为**：去掉点、处理 `+` 子地址是 `normalizeEmail` 的事。`isEmail` 只在 `domain_specific_validation` 打开时对 gmail/googlemail 做更严的 user 检查。

5. **把 `src/` 直接当成 Node `require('validator')` 的入口**：发布合同是 Babel 之后的 `index.js` / `lib`。本页绑定的是源码 tag 对应提交，不是某个 CDN 上的 `validator.min.js` 单独哈希。

## 适用 vs 不适用场景

**适用**：

- 已经有字符串，只需判断它像不像邮箱、URL、UUID、信用卡号等格式
- 打包器能消费 `sideEffects: false` 的单函数入口
- 需要轻量字符清洗（trim、escape、normalizeEmail），并清楚它们不是 HTML 消毒

**不适用**：

- 输入可能是对象、数字或 FormData——先自己规范化，或改看 [[zod]]
- 需要按 HTML 上下文编码输出——看 [[xss-filters]]
- 需要可组合的 schema、异步 refine 或 TypeScript 推断
- 不能接受 `engines.node >= 0.10` 与“字符串以外即抛错”的调用约定

## 固定版本边界

- 本文绑定 `validatorjs/validator.js@7a8079709cd4cb27b2a1846e6f6508d68c9d928f`，tag `13.15.35` 与 npm `validator@13.15.35` 的 `gitHead` 指向同一提交。
- `src/index.js` 内 `version` 同为 `13.15.35`；`package.json` 无 runtime 依赖。
- `isEmail` 默认 `defaultMaxEmailLength = 254`，`allow_utf8_local_part` 默认 true，`require_tld` 默认 true。
- `isURL` 默认 `protocols: ['http', 'https', 'ftp']`，`max_allowed_length: 2084`。
- 本文未安装依赖、运行上游测试或测量 bundle，状态保持 `UNVERIFIED`。

## 学到什么

1. **类型门和格式门是两层**——先保证是字符串，再谈像不像邮箱。
2. **默认 `isURL` 偏向“看起来像网址”，不是“带安全协议的绝对 URL”**——生产环境应显式收紧 `require_protocol` 和协议表。
3. **清洗不等于消毒**——`escape` 改字符；XSS sanitization 已从库中拿走。
4. **Gmail 特例不在默认 `isEmail` 里**——点号和 `+` 子地址属于 `normalizeEmail` / `domain_specific_validation`。

## 应用型自测

1. `validator.isEmail(1)` 会返回 `false` 吗？
2. 默认选项下，`validator.isURL('javascript:alert(1)')` 为 true 吗？
3. `validator.escape` 会不会按 HTML 属性上下文只编码一种引号？

检查点：

1. 不会返回 false。`assertString` 抛 `TypeError`。
2. 不为 true。`javascript` 不在默认协议表。
3. 不会。它按固定字符表替换，不区分 HTML 状态。

## 延伸阅读

- 文档：[validator.js README](https://github.com/validatorjs/validator.js)
- 固定源码：[validatorjs/validator.js](https://github.com/validatorjs/validator.js) —— 本文绑定提交 `7a8079709cd4cb27b2a1846e6f6508d68c9d928f`
- [[xss-filters]] —— README 点名的输出过滤替代
- [[zod]] —— 对象 / schema 校验对照

## 关联

- [[xss-filters]] —— 输出上下文编码；本库停在字符串格式
- [[zod]] —— TypeScript-first schema，不走 `assertString`
- [[express]] —— 常见的把 query/body 先当字符串再校验的出口
- [[koa]] —— 另一条 Node HTTP 入口，同样只保证你自己传入字符串

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

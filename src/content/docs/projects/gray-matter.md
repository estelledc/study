---
title: gray-matter — 带 engine 与 excerpt 的 front-matter 解析器
description: 介绍 gray-matter 4.0.3 如何用分隔符、language 行和 js-yaml 3 把文档拆成 data / content，并说明 cache 与缺闭分隔符边界。
来源: https://github.com/jonschlinkert/gray-matter
日期: 2026-08-27
分类: Markdown / 解析
难度: 入门
difficulty: beginner
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/jonschlinkert/gray-matter
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: e54a33b394e14a1808b88f939507f374552906e4
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 4.0.3
---

## 是什么

gray-matter 是一个把文档开头的 front-matter 拆出来的 Node 库。日常类比：它像拆信封——先认封口线，再按信封上写的语言读里面的卡片，剩下的信纸交给你。

你写：

```js
var matter = require('gray-matter');
var file = matter('---\ntitle: Home\n---\nOther stuff');
// file.data.title === 'Home'
// file.content === 'Other stuff'
```

固定 `4.0.3` 默认用 YAML，也内置 JSON 与 JavaScript engine，并可换分隔符、抽 excerpt。它不是 Markdown 渲染器；正文原样留下，交给 [[marked]] / [[markdown-it]] / [[micromark]]。

## 为什么重要

不理解分隔符、language 行和 cache，就解释不了下面几件事：

- 为什么 `---json` 能当 JSON 解析，而 `---whatever` 会抛未注册 engine
- 为什么只有开分隔符、没有闭分隔符时，正文会变成空串
- 为什么 `matter.test('----')` 为 true，解析却把这段当普通文本
- 为什么 README 仍写 TOML / Coffee，3.0 之后却必须自己挂 engine

## 核心要点

固定 4.0.3 的主链可以拆成五步：

1. **先规范化再决定是否缓存**：`toFile` 把字符串或 `{ content }` 收成对象，去掉 BOM，并把 `orig` 设成非枚举 `Buffer`。没传 `options` 时，按 `file.content` 把这个对象放进 `matter.cache`，再交给 `parseMatter` 就地改；下次无 options 的相同输入拿浅拷贝。

2. **认开分隔符**：默认 `---`。若下一字符还是分隔符末字符（例如 `----`），直接返回，不当 front-matter。

3. **读 language 行**：剥开分隔符后，第一行非空就当作 language。内置只有 `yaml` / `yml`、`json`、`js` / `javascript`。`coffee` / `toml` 只有别名，默认表里没有实现。

4. **切块并解析**：闭分隔符是 `\n` + 闭标记。找不到时，剩余全部当 matter，`content` 变为 `''`。YAML 走 `js-yaml@^3.13.1` 的 `safeLoad`；JavaScript engine 用 `eval`。

5. **可选 excerpt / sections**：`excerpt` 默认关闭。`excerpt: true` 用开分隔符在正文里再切一段；也可传函数或 `excerpt_separator`。`sections: true` 才调用依赖 `section-matter`。

## 实践示例

### 案例 1：默认 YAML，以及 language 行

```js
var matter = require('gray-matter');

matter('---\ntitle: Home\n---\nHello');
matter('---json\n{"title":"Home"}\n---\nHello');
```

第一例开分隔符后立刻换行，language 保持默认 `yaml`。第二例第一行是 `json`，走 `JSON.parse`。`--- true\n---` 会被读成 language `true` 且 matter 为空，所以 `data` 是 `{}`，不是布尔值。

### 案例 2：自定义分隔符与 excerpt

```js
var file = matter('~~~\nabc: xyz\n~~~\nfoo\n---\nbar', {
  delims: '~~~',
  excerpt: true
});
// file.data.abc === 'xyz'
// file.excerpt === 'foo\n'
```

`delims` / `delimiters` 可以是字符串或二元数组。`excerpt: true` 在**已经去掉 front-matter 的正文**里找开分隔符，不从原文件重切。

### 案例 3：读文件与写回

```js
var file = matter.read('./post.md');
var text = matter.stringify('body', { title: 'Home' });
```

`read` 是 `fs.readFileSync`；包的 `browser.fs = false`，浏览器构建没有这条路径。`stringify` 用当前 language 的 `stringify`；YAML / JSON 有实现，JavaScript engine 会抛错。

## 踩过的坑

1. **把缺闭分隔符当成“解析失败并保留原文”**：`---\nname: x\n` 会得到 `data.name === 'x'` 且 `content === ''`。对照 [[front-matter]]：它在缺闭合时把整段当正文。

2. **相信 `matter.test` 等于“能解析”**：它只检查是否以开分隔符开头。`-----------name` 测试为 true，解析却因 `----` 规则拒绝。

3. **把 README 的 TOML / Coffee 当作出厂能力**：3.0.0 起默认 engine 只有 yaml / json / javascript；另外两种要自己 `options.engines`。

4. **把无 options 的重复调用当无状态**：相同字符串会命中模块级 cache。改过 `file.data` 后再解析同一段，可能看到旧对象的浅拷贝。需要时调用 `matter.clearCache()`。

5. **把 4.0.3 当成带 GitHub tag 的发布**：npm `gitHead` 指向提交 `e54a33b3...`（说明为 `4.0.3`），远端没有 `4.0.3` tag。本页绑定该提交，不绑定之后的 master README / security PR。

## 适用 vs 不适用场景

**适用**：

- 静态站点或文档管线要 YAML / JSON front-matter，并可能换分隔符或抽 excerpt
- 需要 `matter.read` 这种同步读文件的 Node 工具
- 愿意接受 js-yaml 3 的 `safeLoad` 语义，而不是 js-yaml 4 API

**不适用**：

- 只要一对 `---` / `...`、不要 cache 和 engine——看更小的 [[front-matter]]
- 需要把 Markdown 本身解析成 AST——看 [[micromark]] / [[unified]]
- 不能接受 JavaScript engine 的 `eval`，或不能接受缺闭合就吞掉正文
- 要把本页写成“已测速度 / 体积”的结论——本轮未跑 benchmark

## 固定版本边界

- 本文绑定 `jonschlinkert/gray-matter@e54a33b394e14a1808b88f939507f374552906e4`，`package.json` 为 `4.0.3`，与 npm `gray-matter@4.0.3` 的 `gitHead` 一致。
- GitHub 最近源码 tag 是轻量 `4.0.2` → `90f81203005a26893247c03eb4790c5e082cb319`；4.0.3 相对它主要是去掉箭头函数、升 `js-yaml@^3.13.1` / mocha，以及 `Buffer.from`。
- `engines.node` 为 `>=6.0`。本文未安装依赖、未跑 mocha，状态保持 `UNVERIFIED`。

## 学到什么

1. **front-matter 库的合同是“怎么切”，不是“怎么渲染 Markdown”**。
2. **language 行和闭分隔符决定正文还在不在**——缺闭合会吞正文。
3. **默认表比 README 窄**：TOML / Coffee 是插件位，不是内置实现。
4. **无 options 的 cache 是模块状态**，不是纯函数。

## 应用型自测

1. `matter('---\nname: x\n')` 的 `content` 是原文还是空串？
2. `matter.test('----')` 为 true 时，解析会不会抽出 `data`？
3. 不传 options 连续解析同一字符串，会不会走 `matter.cache`？

检查点：

1. 空串。找不到闭分隔符时 `content` 被设为 `''`。
2. 不会。开分隔符后下一字符是 `-`，直接返回空 `data`。
3. 会。无 options 时先按 `file.content` 写入 cache，再就地解析。

## 延伸阅读

- 仓库：[jonschlinkert/gray-matter](https://github.com/jonschlinkert/gray-matter) —— 本文绑定提交 `e54a33b394e14a1808b88f939507f374552906e4`
- 对照：[jxson/front-matter](https://github.com/jxson/front-matter) —— 更小的 YAML-only 抽取器，见 [[front-matter]]
- YAML 实现：[nodeca/js-yaml](https://github.com/nodeca/js-yaml) 3.x `safeLoad` / `safeDump`
- Markdown 下层：[[micromark]] / [[unified]] / [[marked]]

## 关联

- [[front-matter]] —— 同主题、无 engine / cache、缺闭合不吞正文
- [[micromark]] —— 把 Markdown 扫成事件，不负责 YAML 头
- [[unified]] —— remark 管线；front-matter 通常是上游一步
- [[marked]] / [[markdown-it]] —— 吃的是 gray-matter 留下的 `content`
- [[astro]] / [[starlight]] —— 站点侧会再做 frontmatter schema，不是这个库

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

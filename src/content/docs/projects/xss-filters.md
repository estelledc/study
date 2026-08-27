---
title: xss-filters — 按 HTML 上下文做刚好够用的输出编码
description: 介绍 xss-filters 1.2.7 如何按 HTML 数据、注释和属性上下文做最小编码，并用协议黑名单处理 URI。
来源: https://github.com/YahooArchive/xss-filters
日期: 2026-08-27
分类: 工具库
难度: 入门
difficulty: beginner
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/YahooArchive/xss-filters
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 5174da0a282f5fbd9289be1d0dd217f874a9f05c
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 1.2.7
---

## 是什么

xss-filters 是 Yahoo 的上下文敏感输出过滤器：不解析整段 HTML，只按“这段字符串将出现在哪种 HTML 状态”编码最少的字符。日常类比：不是把整封信扔进碎纸机，而是看它要贴在门牌、信封还是备注栏，只涂掉那一栏会改语义的符号。

你写：

```js
var xssFilters = require('xss-filters');

res.send('<h1> Hello, ' + xssFilters.inHTMLData(firstname) + '!</h1>');
```

`inHTMLData` 只处理 HTML 正文里的 `<`。若这段值要进 `href` 或未加引号的属性，必须换更具体的 URI / 属性过滤器。固定 1.2.7 的 `main` 是 `src/xss-filters.js`，没有 runtime 依赖。

## 为什么重要

不理解“上下文选过滤器”和“URI 还要再挡协议”，就解释不了下面几件事：

- 为什么只转义 `& < > " '` 挡不住 `javascript:` 链接
- 为什么 `inHTMLData` 不编码引号，却能用于 `<div>…</div>`
- 为什么空的未加引号属性会被换成 `\uFFFD`
- 为什么过滤器不能丢进 `onclick` 或 `<script>`

## 核心要点

固定 1.2.7 的主链可以拆成五步：

1. **先选上下文，再选函数**：通用入口是 `inHTMLData`、`inHTMLComment`、`inSingleQuotedAttr`、`inDoubleQuotedAttr`、`inUnQuotedAttr`。它们分别接到私有过滤器 `yd` / `yc` / `yavs` / `yavd` / `yavu`。

2. **只编码会拆当前状态的字符**：HTML 正文只把 `<` 编成 `&lt;`；双引号属性只编 `"`；单引号属性只编 `'`。这是“刚好够用”，不是全量 HTML escape。

3. **未加引号的属性更严**：`yavu` 会编码空白、`=`、引号、`<>` 和空串。空串或全 NULL 会注入 `\uFFFD`，避免 HTML5 把后面的 `name="passwd"` 吞进当前属性。

4. **URI 走三层，且 `yubl` 必须最后**：`uriInAttr` 先 `encodeURI` 或 IPv6 友好的 `yufull`，再做属性编码，最后 `yubl`。`yup` 抽出协议后，若落在 `javascript` / `data` / `vbscript` / `mhtml` / `x-schema`，就加 `x-` 前缀。

5. **可脚本上下文不在合同内**：README 写明不要把任何过滤器放进 `<script>`、`<style>`、`<object>`、`<embed>`、`<svg>`，以及 `style=""` / `onXXX=""`。需要给 JS 传值时，先放进加了引号的普通属性，再用 DOM 读取。

## 实践示例

### 案例 1：正文和属性要用不同过滤器

```js
var name = xssFilters.inHTMLData(userName);
var href = xssFilters.uriInDoubleQuotedAttr(userUrl);

'<div>' + name + '</div>';
'<a href="' + href + '">link</a>';
```

`inHTMLData` 不管 `"`；`uriInDoubleQuotedAttr` 会先 `yufull`，再编码 `"`，最后检查协议黑名单。把 URI 过滤器换成 `inHTMLData`，`javascript:` 仍可能留在 `href` 里。

### 案例 2：未加引号属性的空串会被换成替换字符

```js
xssFilters.inUnQuotedAttr('');          // '\uFFFD'
xssFilters.inUnQuotedAttr('Ada Lovelace'); // 'Ada&#32;Lovelace'
```

空串按 HTML5 会提前结束未加引号状态。`yavu` 因此写入 `\uFFFD`。空格也必须编码，否则 `value=Ada Lovelace` 会拆成多个属性。

### 案例 3：URI 黑名单加的是 `x-` 前缀，不是删除

```js
xssFilters.uriInDoubleQuotedAttr('javascript:alert(1)');
// 以 x-javascript: 开头，再经过 encodeURI / 属性编码
```

`yubl` 看的是解码后的协议名。它不会改写成 `about:blank`，只让浏览器不再把它当可执行 scheme。

## 踩过的坑

1. **把 xss-filters 当成 HTML 消毒器**：它不解析标签、不做白名单、不处理 DOM。输入应是将要插入某一上下文的字符串，而不是一整页 markup。

2. **在 `onclick` / `<script>` 里套过滤器**：源码和 README 都标成不安全。过滤器只管“别拆出当前 HTML 状态”，不管脚本语法。

3. **只用 `inHTMLData` 处理 `href`**：正文过滤器不挡 `javascript:` / `data:`。URI 属性必须走 `uriIn*Attr`，让 `yubl` 最后执行。

4. **以为 Yahoo 源码仓还在 `yahoo/xss-filters` 活动**：GitHub 已把仓库归到 `YahooArchive/xss-filters` 并 archived。npm `xss-filters@1.2.7` 的 `gitHead` 仍指向同一提交 `5174da0a…`。

5. **把 README 的 jsPerf“快一倍”写成本轮测量**：本轮未跑 benchmark，也未测 bundle。

## 适用 vs 不适用场景

**适用**：

- 已确定输出上下文（正文、注释、加引号或不加引号的属性），并按上下文选函数
- 需要 URI 属性在编码后仍挡住 `javascript:` / `data:` 一类协议
- 能接受“最小编码”而不是把所有 HTML 特殊字符一律实体化

**不适用**：

- 要清洗整段用户 HTML——本库不做标签级消毒
- 要把不可信输入放进脚本、样式或事件处理程序
- 需要输入格式判断（邮箱、URL 是否合法）——那是 [[validator]] 的合同
- 不能接受归档仓库与 Yahoo BSD 许可边界

## 固定版本边界

- 本文绑定 `YahooArchive/xss-filters@5174da0a282f5fbd9289be1d0dd217f874a9f05c`，tag `v1.2.7` 与 npm `xss-filters@1.2.7` 的 `gitHead` 指向同一提交。
- `package.json` 的 `repository` / `homepage` 仍写 `yahoo/xss-filters`；GitHub 当前全名是 `YahooArchive/xss-filters`，仓库已 archived。
- 源码仓无 runtime 依赖；`main` 为 `src/xss-filters.js`。
- `URI_BLACKLIST_PROTOCOLS` 在该提交是 `javascript`、`data`、`vbscript`、`mhtml`、`x-schema`。
- 本文未安装依赖、运行上游测试或测量 bundle，状态保持 `UNVERIFIED`。

## 学到什么

1. **输出编码按状态机选字符，不按“危险词”清单**——正文怕的是 `<`，双引号属性怕的是 `"`。
2. **URI 属性和 HTML 正文不是同一条合同**——协议黑名单是第三层，且必须最后做。
3. **空的未加引号属性会改后续语法**——库用 `\uFFFD` 主动结束该状态。
4. **过滤器不是脚本沙箱**——可脚本上下文被明确排除。

## 应用型自测

1. `inHTMLData('a<b')` 会不会同时把 `"` 编成 `&quot;`？
2. `uriInDoubleQuotedAttr` 内部会不会先做属性编码，再调用 `yubl`？
3. `inUnQuotedAttr('')` 的返回值是空串还是替换字符？

检查点：

1. 不会。`yd` 只替换 `<`。
2. 不会颠倒。`uriInAttr` 是 `yubl(yav(yu(s)))`，`yubl` 在最后。
3. 是 `\uFFFD`，不是空串。

## 延伸阅读

- 固定源码：[YahooArchive/xss-filters](https://github.com/YahooArchive/xss-filters) —— 本文绑定提交 `5174da0a282f5fbd9289be1d0dd217f874a9f05c`
- HTML 语法状态：[HTML Standard — tokenization](https://html.spec.whatwg.org/multipage/syntax.html#tokenization)
- [[validator]] —— 字符串输入校验；README 把 xss-filters 列为 XSS 清洗替代之一
- [[express]] —— README 里的服务端拼接示例所在的框架

## 关联

- [[validator]] —— 输入侧字符串校验；本库是输出侧上下文编码
- [[zod]] —— schema 形状校验，不负责 HTML 上下文
- [[express]] —— 常见的服务端字符串拼接出口
- [[koa]] —— 另一条 Node HTTP 出口，同样需要自己选上下文过滤器

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

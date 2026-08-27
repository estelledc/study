---
title: entities — 默认 XML、可选 HTML 的字符引用编解码库
description: 介绍 entities 8.0.0 如何用 XML 默认层级、HTML trie 和 WHATWG attribute/text escape 组织编解码。
来源: https://github.com/fb55/entities
日期: 2026-08-27
分类: 解析 / HTML 实体
难度: 入门
difficulty: beginner
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/fb55/entities
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 2322ee76c431b990facb259b61b9ff4eb89ef3c9
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 8.0.0
---

## 是什么

entities 是一个把 HTML / XML 字符引用分开处理的 TypeScript 库。日常类比：它像两本词典共用一个柜台——不说明要哪一本时，柜台先递 XML 那本；HTML 的命名实体、遗留无分号写法和属性限制，要显式换成 HTML 词典。

```js
import * as entities from 'entities'

entities.decode('&amp; &nbsp;')          // XML 默认：&nbsp; 不会当 HTML 实体
entities.decodeHTML('&amp; &nbsp;')
entities.encodeXML('&#38; ü')            // '&amp;#38; &#xfc;'
entities.encodeHTML('&#38; ü')           // '&amp;&num;38&semi; &uuml;'
entities.escapeUTF8('&#38; ü')           // '&amp;#38; ü'
```

固定 8.0.0 是 ESM 包：`type: module`，`sideEffects: false`，导出 `.` / `./decode` / `./escape`。`he` 只出现在 devDependencies，用来对照 benchmark，不是运行时依赖。

## 为什么重要

不读固定 8.0.0 源码，根导出很容易按“HTML 实体库”来用：

- 为什么 `decode()` / `encode()` 默认是 XML，不是 HTML
- 为什么 `decodeHTML('&amp')` 能解、`decodeXML('&amp')` 不解
- 为什么 `encodeHTML` 会把 `#` 写成 `&num;`，而 `encodeXML` 不会
- 为什么文档劝你别用包装后的 `encode` / `decode` 做 tree-shake

## 核心要点

固定版本的主链可以拆成五步：

1. **根函数先选层级**：`decode()` / `encode()` 的默认参数是 `EntityLevel.XML`。数字参数当成 level；对象参数才读 `level` / `mode`。

2. **HTML 解码有三种模式**：`decodeHTML` 默认 `DecodingMode.Legacy`；`decodeHTMLStrict` 要求分号；`decodeHTMLAttribute` 按 WHATWG 属性规则，`=` 或字母数字结尾时不把遗留实体吃掉。`decodeXML` 固定 `Strict`，并别名为 `decodeXMLStrict`。

3. **编码按 mode 分派**：默认 `EncodingMode.Extensive`。XML 走 `encodeXML`，HTML 走 `encodeHTML`。`UTF8` 是 `escapeUTF8`，`Attribute` / `Text` 走 WHATWG `escapingString`。

4. **HTML encode 用生成 trie**：`encodeHTML` 扫描 ASCII bitset，再查 `htmlTrie`。能配对的双字符会一次消费两个 code unit；没有命名实体就写 `&#x…;`。`encodeNonAsciiHTML` 换一套更窄的 bitset。

5. **XML escape 与流式 decoder**：`escape` 等于 `encodeXML`，用 bitset + `xmlCodeMap`（`quot` / `amp` / `apos` / `lt` / `gt`）。`EntityDecoder.write()` 可分段输入，实体不完整时返回 `-1`。

## 实践示例

### 案例 1：根 `decode` 不会处理 HTML 专有实体

```js
import { decode, decodeHTML, EntityLevel } from 'entities'

decode('A&nbsp;B')
decode('A&nbsp;B', EntityLevel.HTML)
decodeHTML('A&nbsp;B')
```

第一行保持 `&nbsp;`，因为默认 XML 树只有 `amp` / `lt` / `gt` / `apos` / `quot`。要 HTML 命名实体，必须换 level 或直接调用 `decodeHTML`。

### 案例 2：同一段文本，三种 encode 合同不同

```js
import { encodeXML, encodeHTML, escapeUTF8 } from 'entities'

encodeXML('&#38; ü')
encodeHTML('&#38; ü')
escapeUTF8('&#38; ü')
```

`encodeXML` 只保证 XML 五字符和非 ASCII 变成实体，`ü` 写成 `&#xfc;`。`encodeHTML` 尽量用命名实体，`#` / `;` 也会变成 `&num;` / `&semi;`。`escapeUTF8` 只转 `"&'<>`，保留 `ü`。

### 案例 3：属性模式拒绝“半截实体 + 标识符”

```js
import { decodeHTML, decodeHTMLAttribute, DecodingMode } from 'entities'

decodeHTML('&amp copy', DecodingMode.Legacy)
decodeHTMLAttribute('&amp=1')
```

文本 Legacy 模式可以接受无分号 `&amp`。属性模式里，实体后面紧跟 `=` 或字母数字时，当前分支会放弃这次解码，避免把 `?a=1&amp=2` 误伤。

## 踩过的坑

1. **把根 `decode` / `encode` 当成 HTML API**：默认 level 是 XML。`&nbsp;`、`&copy;`、`&uuml;` 都不会走 HTML 树。

2. **为了方便只导入根包装函数**：文档写明 `encode` / `decode` 会拖住多条实现。要 tree-shake，应直接从 `entities/decode` 或 `entities/escape` 取具体函数。

3. **把 README 的 ops/s 当成 8.0.0 的测量**：readme 表格标注的是 7.0.0 / 2025-09 微基准。本轮未跑 `scripts/benchmark.ts`。

4. **忽略 `engines.node >= 20.19.0`**：8.0.0 的 `package.json` 写了这条下限。本页没有在更旧 Node 上验证。

5. **以为数字引用非法时会抛错**：高层 `decodeHTML` / `decodeXML` 没有挂 `EntityErrorProducer`。代理区和越界码点经 `replaceCodePoint` 变成 `U+FFFD`，注释写明这段改编自 [[he]]。

## 适用 vs 不适用场景

**适用**：

- 已经在 htmlparser2 / cheerio / [[markdown-it]] 依赖图里，需要同一套编解码合同
- 要明确区分 XML 与 HTML，或按 attribute / text 做最小转义
- 打包器能吃 ESM 子路径，并接受 Node `>=20.19.0`

**不适用**：

- 只要一份 CJS/UMD、默认十六进制、可全局改 options 的旧工具——看 [[he]]
- 要把 Markdown 解析成 token / HTML——主链在 [[markdown-it]] / [[marked]]
- 需要本轮证明“比 he 快”或某个 gzip 体积；这些都不是静态阅读能给的
- 不能接受根 API 默认 XML

## 固定版本边界

- 本文绑定 `fb55/entities@2322ee76c431b990facb259b61b9ff4eb89ef3c9`，tag `v8.0.0` 与 npm `entities@8.0.0` 的 `gitHead` 同指此提交。
- `package.json` 声明 `engines.node >= 20.19.0`；发布文件包含 `dist/` 与 `src/`，不含 `*.spec.ts`。
- `replaceCodePoint` 对 `0x80–0x9F` 做 HTML 覆盖表替换，逻辑改编自 he `36afe179…` 的 `codePointToSymbol`。
- 本文未安装依赖、运行 vitest、构建 `dist/` 或复现 benchmark，状态保持 `UNVERIFIED`。

## 学到什么

1. **默认层级是 XML**——根函数不替你打开 HTML 命名实体表。
2. **mode 比“encode/decode”两个动词更重要**——Extensive / UTF8 / Attribute / Text 是四条输出合同。
3. **HTML decode 的分号策略是枚举，不是布尔**——Legacy、Strict、Attribute 处理遗留实体的方式不同。
4. **he 是对照样本，不是运行时依赖**——8.0.0 只在 devDependencies 里列出它。

## 应用型自测

1. `decode('&nbsp;')` 在默认参数下会不会变成不换行空格？
2. `escape` 和 `encodeXML` 是不是同一个函数？
3. `decodeHTML` 的默认 `DecodingMode` 是 Strict 还是 Legacy？

检查点：

1. 不会。默认 `EntityLevel.XML`，`&nbsp;` 原样留下。
2. 是。`src/escape.ts` 把 `escape` 赋成 `encodeXML`。
3. Legacy。`decodeHTML` 的默认参数是 `DecodingMode.Legacy`。

## 延伸阅读

- 文档：[fb55/entities](https://github.com/fb55/entities#readme)
- 固定源码：[fb55/entities](https://github.com/fb55/entities) —— 本文绑定提交 `2322ee76c431b990facb259b61b9ff4eb89ef3c9`
- [[he]] —— 默认十六进制、escape 六字符表与 CJS/UMD 对照
- [[markdown-it]] —— 生产依赖列出 `entities`

## 关联

- [[he]] —— 同一问题的旧独立工具；entities 的覆盖表注释指向它
- [[markdown-it]] —— 渲染 HTML 时会用到实体包，主链仍是 token / ruler
- [[marked]] —— 另一条 Markdown 渲染路径，不把 entities 当作默认运行时

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

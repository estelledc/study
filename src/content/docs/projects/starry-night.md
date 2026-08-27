---
title: starry-night — 用 TextMate grammar 产出 GitHub 风格 hast 的高亮器
description: 介绍 @wooorm/starry-night 3.10.0 如何用 vscode-textmate、Oniguruma WASM 和 PrettyLights class 把代码变成 hast。
来源: https://github.com/wooorm/starry-night
日期: 2026-08-27
分类: 语法高亮
难度: 入门
difficulty: beginner
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/wooorm/starry-night
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: c8dcd37f5ff8db0fb732a71965040f7c2bb2a6c3
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 3.10.0
---

## 是什么

starry-night 是 GitHub 内部 PrettyLights 高亮器的开源实现。日常类比：先查一本和 VS Code 同款的「语法词典」（TextMate grammar），再用同一套正则引擎切词，最后给每段词贴上 `pl-*` 班级名，而不是直接把颜色写进 HTML。

你写：

```js
import {common, createStarryNight} from '@wooorm/starry-night'

const starryNight = await createStarryNight(common)
const tree = starryNight.highlight('const ready = true', 'source.js')
```

`createStarryNight` 是异步的，因为要加载 Oniguruma WASM。`highlight` 返回 hast 树（一组 `<span>` 节点），不是 HTML 字符串。固定 3.10.0 的 npm 包名是 `@wooorm/starry-night`。

## 为什么重要

不理解它的 scope、WASM 和 class 合同，就解释不了下面几件事：

- 为什么围栏写 `js` 还不够，真正染色要用 `source.js`
- 为什么创建实例必须 `await`，而染色本身是同步的
- 为什么换暗色主题常常只换 CSS，不必重跑高亮
- 为什么缺依赖 grammar 时，嵌套语言会 silently 变素

## 核心要点

固定 3.10.0 的主链可以拆成五步：

1. **选定 grammar 集合**：`common` 预置 34 种；`all` 预置 694 种；也可以只传入 `@wooorm/starry-night/source.css` 这种单文件。
2. **加载 Oniguruma**：Node 默认用 `fs.readFile` 读 `vscode-oniguruma` 的 `onig.wasm`；浏览器默认 `fetch` esm.sh 上的同名文件。可用 `getOnigurumaUrlFs` / `getOnigurumaUrlFetch` 改地址。
3. **注册到 vscode-textmate Registry**：每个 grammar 的 `names`、`extensions` 和 `scopeName` 写入查找表，再 `loadGrammar`。
4. **把围栏旗标译成 scope**：`flagToScope('js')` 或 `flagToScope('path/to/app.js')` 得到 `source.js`。同名扩展可能对应多个语言，函数只返回其中之一。
5. **按行 tokenize 成 hast**：`tokenizeLine2` 产出 metadata；主题把前景/背景/字体编码成 `pl-*` class。空行也要走一遍，因为有的 pattern 盯着空行。

## 实践示例

### 案例 1：common 集合 + 明确 scope

```js
import {common, createStarryNight} from '@wooorm/starry-night'
import {toHtml} from 'hast-util-to-html'

const starryNight = await createStarryNight(common)
const tree = starryNight.highlight('em { color: red }', 'source.css')
const html = toHtml(tree)
```

`highlight` 第二参必须是已注册 scope。要 HTML 时再自己序列化；本页未运行 `toHtml`。

### 案例 2：围栏旗标先翻译

```js
starryNight.flagToScope('pandoc')      // 'text.md'
starryNight.flagToScope('.workbook')   // 'text.md'
starryNight.flagToScope('app.js')      // 'source.js'
starryNight.flagToScope('whatever')    // undefined
```

实现会先 `toLowerCase()`，去掉开头空白和结尾斜杠，再查名字表；没有点时把整段当成扩展名。

### 案例 3：缺依赖时 `missingScopes()`

```js
import {createStarryNight} from '@wooorm/starry-night'
import textXmlSvg from '@wooorm/starry-night/text.xml.svg'
import textXml from '@wooorm/starry-night/text.xml'

const onlySvg = await createStarryNight([textXmlSvg])
onlySvg.missingScopes() // ['text.xml']

const both = await createStarryNight([textXmlSvg, textXml])
both.missingScopes() // []
```

`text.xml.svg` 声明依赖 `text.xml`。只注册前者时，嵌套 XML 不会按完整 grammar 着色。

## 踩过的坑

1. **把 `highlight('code', 'js')` 当成合法调用**：第二参是 scope。未注册会抛错，不会悄悄退化成纯文本。
2. **以为返回值已经是 HTML**：返回的是 hast `Root`。要字符串需 `hast-util-to-html` 或自己的 renderer。
3. **忽略 WASM 来源**：浏览器默认拉取 esm.sh；类型注释写明必须是 `vscode-oniguruma` v2 的 `onig.wasm`，版本错了可能直接坏。
4. **把 `register` 理解成换一套全新表**：它往同一个 `registered` Map 追加，然后重建 Registry。
5. **把 README 里的 gzip 体积当成本轮测量**：文档写过 core / common / all 的压缩体积，本轮未安装依赖、未打包、未测体积。

## 适用 vs 不适用场景

**适用**：

- 需要跟 GitHub 接近的 class 主题，并能接受 TextMate + WASM
- 下游要 hast / React 节点 / ANSI，而不是先出 HTML 再解析
- 可以用 `common` 或按语言按需 import，接受 grammar 体积

**不适用**：

- 只要浏览器里几 KB、不加载 WASM——看 [[sugar-high]]
- 必须用 `js` / `py` 当染色参数、不能先做 flag→scope
- 不能接受默认 CDN WASM 或自己托管 `onig.wasm`

## 固定版本边界

- 本文绑定 `wooorm/starry-night@c8dcd37f5ff8db0fb732a71965040f7c2bb2a6c3`，tag `3.10.0` 与 npm `@wooorm/starry-night@3.10.0` 的 `gitHead` 指向同一提交。
- `package.json` 的 `name` 是 `@wooorm/starry-night`；`sideEffects` 只有 `style/*.css`。
- `common` 在该提交有 34 个 grammar，`all` 有 694 个。
- 本文未安装依赖、运行上游测试或测量 bundle，状态保持 `UNVERIFIED`。

## 学到什么

1. **旗标和 scope 是两层名字**——围栏写 `js`，引擎认 `source.js`。
2. **异步只发生在创建期**——WASM 和 grammar 加载完成后，`highlight` 是同步的。
3. **class 主题把颜色推迟到 CSS**——`pl-*` 让暗色模式不必重 tokenize。
4. **嵌套语言是显式依赖**——缺 `missingScopes()` 里的 grammar，嵌套块会掉色。

## 应用型自测

1. `starryNight.highlight('const x = 1', 'js')` 在只注册了 `common` 时会不会静默返回纯文本节点？
2. 创建实例时为什么必须 `await`，染色时却不用？
3. 只注册 `text.xml.svg`、不注册 `text.xml`，`missingScopes()` 会列出什么？

检查点：

1. 不会静默成功。未注册 scope 会抛 `Expected grammar js to be registered`。
2. `await` 是为了 `loadWASM` 和 `loadGrammar`；`highlight` 读已加载的 grammar。
3. `['text.xml']`。

## 延伸阅读

- 文档：[wooorm/starry-night](https://github.com/wooorm/starry-night)
- 固定源码：[wooorm/starry-night](https://github.com/wooorm/starry-night) —— 本文绑定提交 `c8dcd37f5ff8db0fb732a71965040f7c2bb2a6c3`
- [[sugar-high]] —— 零依赖、返回 HTML 的轻量对照
- [[shiki]] —— 另一条 TextMate / VS Code 主题路线
- [[unified]] —— hast 管线；starry-night 的树可以直接交给 rehype

## 关联

- [[sugar-high]] —— 正则启发式对照；不走 WASM / TextMate
- [[shiki]] —— 同样复用编辑器 grammar，但默认产出带 inline style 的 HTML
- [[unified]] —— starry-night 输出 hast，适合 remark / rehype
- [[vitepress]] —— 文档站高亮的常见消费方
- [[starlight]] —— 本站文档框架；其默认高亮栈不是 starry-night

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[sugar-high]] —— sugar-high — 零依赖、按 canonical 语言名返回 HTML 的轻量高亮器

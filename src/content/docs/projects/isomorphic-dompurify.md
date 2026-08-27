---
title: isomorphic-dompurify — 给 DOMPurify 补一层 Node/浏览器同一入口
description: 介绍 isomorphic-dompurify 3.23.0 如何用 JSDOM 窗口和 Proxy 复用 DOMPurify，以及 clearWindow 与双入口导出边界。
来源: https://github.com/kkomelin/isomorphic-dompurify
日期: 2026-08-27
分类: 解析
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/kkomelin/isomorphic-dompurify
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 7607c2f4c16695cced78e4e5f30ab87f895257a0
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 3.23.0
---

## 是什么

isomorphic-dompurify 是一层很薄的包装：在浏览器里直接转出 DOMPurify；在 Node 里先造一个 jsdom `window`，再把同一个 `sanitize` / `addHook` API 递给你。日常类比：它不发明安检规则，只负责把安检门搬到没有 DOM 的仓库——门还是 DOMPurify 那一扇。

```js
import DOMPurify, { sanitize } from 'isomorphic-dompurify'

const clean = sanitize('<img onload="alert(1)"><b>ok</b>')
```

固定 3.23.0 的 `src/index.ts` 在模块加载时 `new JSDOM('<!DOCTYPE html>').window`，然后 `DOMPurifyFactory(window)`。浏览器入口 `src/browser.ts` 只做 `bind`，`clearWindow` 是空函数。

## 为什么重要

只看 README 的「两端写法一样」，会漏掉这些合同：

- 为什么 Node 入口要长期握着一个 jsdom window，而不是每次 `sanitize` 新建
- 为什么默认导出既是带方法的对象，又能当 factory 调用
- 为什么 `clearWindow()` 之后，以前的 `addHook` / `setConfig` 会消失
- 为什么这层包装的版本号几乎跟着 DOMPurify / jsdom 的每次 bump 走

## 核心要点

固定 3.23.0 可以拆成五层：

1. **条件导出**：`package.json` `exports["."].node` 指向 `dist/index.*`；`default`（打包器 / 浏览器）指向 `dist/browser.*`。`tsup` 把 `dompurify` 和 `jsdom` 标成 external。

2. **模块级单例**：Node 源码里的 `window` 与 `purify` 是 `let`。具名 `sanitize` 关闭在当前 `purify` 上，不是每次从默认导出上现场取方法。

3. **Proxy 默认导出**：`get` 把函数 `bind` 到当前实例；`apply` 则调用 `DOMPurifyFactory(root)`，用来绑定你自己给的 window。这是为了对齐 `dompurify` 的可调用默认导出。

4. **`removed` 也是 Proxy**：读取落到 `purify.removed`。`clearWindow()` 换实例后，这个具名导出仍指向新数组，不必重新 import。

5. **`clearWindow()`**：`window.close()`，再新建 JSDOM 与 factory。README 写明 hooks / config 要重装。浏览器构建故意 no-op。

## 实践示例

### 案例 1：具名 sanitize 把 config 原样交给 DOMPurify

```js
import { sanitize } from 'isomorphic-dompurify'

sanitize('<b>bold</b><i>italic</i>', { ALLOWED_TAGS: ['b'] })
```

包装层测试把期望写成 `'<b>bold</b>italic'`。本页没有运行这些测试；它只说明 config 对象不会被这层改写。

### 案例 2：默认导出当 factory，绑到另一扇 JSDOM 窗

```js
import DOMPurify from 'isomorphic-dompurify'
import { JSDOM } from 'jsdom'

const other = new JSDOM().window
const purify = DOMPurify(other)
const node = purify.sanitize('<p>Text</p>', { FORCE_BODY: true, RETURN_DOM: true })
```

`RETURN_DOM` 返回的节点属于你传入的 window。跨 JSDOM 文档比 `isEqualNode` 时，不能用 `instanceof HTMLElement`——元素类在 Node 里不是同一份。

### 案例 3：清窗之后要重装 hook

```js
import { addHook, clearWindow, sanitize } from 'isomorphic-dompurify'

addHook('afterSanitizeAttributes', (node) => {
  if ('removeAttribute' in node) node.removeAttribute('target')
})
clearWindow()
// 这里的 purify 是新实例，上面的 hook 不在了
sanitize('<a href="https://example.com" target="_blank">x</a>')
```

`clearWindow` 只换 window / factory，不搬运 hook 表。

## 踩过的坑

1. **把包装层当成第二套 XSS 规则**：`src/` 里没有标签白名单。规则全在依赖 `dompurify@^3.4.12`。本轮未阅读 DOMPurify 源码。

2. **长进程里只 `sanitize`、不清窗**：README 与 `clearWindow` 测试都假设 jsdom 会积 DOM 状态。本页没有复现内存曲线，只记录存在这个 API。

3. **`require()` 一个 ESM-only 传递依赖**：README 记录 v3 之后 `jsdom` 可能在 Next.js / Vercel CommonJS 里触发 `ERR_REQUIRE_ESM`。那是已知问题说明，不是本轮复现。

4. **把 npm 版本当成 SemVer 功能变更**：README 写明 DOMPurify 自己不跟 SemVer，所以包装层几乎每次依赖变动都发 minor。`3.23.0` 的发布提交只是 bump pnpm 与版本号。

5. **以为浏览器里的 `clearWindow` 也会释放什么**：`src/browser.ts` 里它是空函数。

## 适用 vs 不适用场景

**适用**：

- 同一份调用要在 Node SSR 和浏览器里走到 DOMPurify
- 接受模块级单例 window，并知道何时自己 `clearWindow`
- 需要把 factory 绑到测试用的独立 JSDOM

**不适用**：

- 只要 Node、只要字符串白名单、不想拖 jsdom → [[sanitize-html]]
- 需要审查 DOMPurify 的默认标签 / hook 语义本身——应直接绑定 `cure53/DOMPurify`，本页不够
- 目标运行时低于 `^22.22.2 || ^24.15.0 || >=26.0.0`
- 还没装依赖就声称「两端行为已验证一致」

## 固定版本边界

- 本文绑定 annotated tag `3.23.0` 的剥皮提交 `7607c2f4c16695cced78e4e5f30ab87f895257a0`。npm `isomorphic-dompurify@3.23.0` 无 `gitHead`。
- 运行时依赖 `dompurify@^3.4.12`、`jsdom@^30.0.0`；两者都没有单独固定到本页。
- `tsup` 产出 `dist/`，源码审查读的是 `src/`，不是构建产物。
- 本文未安装依赖、未调用 `JSDOM`、未跑 vitest，状态保持 `UNVERIFIED`。

## 学到什么

1. **「同构」在这里是入口对齐，不是实现复制**——浏览器路径甚至不加载 jsdom。
2. **具名导出抓住的是当前 factory**——`clearWindow` 会换实例，hook 不会跟着搬家。
3. **可调用默认导出是为了兼容 `dompurify(window)`**——Proxy 的 `apply` 不复用模块级单例。
4. **包装层版本不能当 DOMPurify 合同**——要读依赖声明，而不是把 `3.23.0` 当成净化规则版本。

## 应用型自测

1. 在 Node 入口调用 `clearWindow()` 之后，此前 `addHook` 的回调还在吗？
2. `import DOMPurify from 'isomorphic-dompurify'` 再 `DOMPurify(someWindow)`，得到的是模块级单例还是新实例？
3. 浏览器构建里的 `clearWindow()` 会关闭什么窗口？

检查点：

1. 不在。函数会新建 `purify`，旧 hook 留在被关掉的实例上。
2. 新实例。`apply` 走 `DOMPurifyFactory(root)`。
3. 什么也不关。浏览器实现是空函数。

## 延伸阅读

- 固定源码：[kkomelin/isomorphic-dompurify](https://github.com/kkomelin/isomorphic-dompurify) —— 本文绑定提交 `7607c2f4c16695cced78e4e5f30ab87f895257a0`
- DOMPurify 文档：[cure53/DOMPurify](https://github.com/cure53/DOMPurify)（本页未绑定其 revision）
- 对照字符串白名单：[[sanitize-html]]

## 关联

- [[sanitize-html]] —— 不靠 DOM，用 htmlparser2 事件拼字符串
- [[markdown-it]] —— 渲染后再交给 sanitizer 的常见上游
- [[marked]] —— 默认 HTML 直通，更依赖外置清洗
- [[unified]] —— rehype 阶段接 sanitizer 的另一条管线

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

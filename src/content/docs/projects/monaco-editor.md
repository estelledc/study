---
title: monaco-editor — 把 VSCode 编辑器搬进浏览器的 SDK
来源: 'Microsoft, "monaco-editor", https://github.com/microsoft/monaco-editor'
日期: 2026-05-30
子分类: projects / 前端
分类: 后端 API
难度: 中级
provenance: pipeline-v3
---

## 是什么

Monaco Editor 是 Microsoft 把 **VSCode 桌面版的代码编辑器整块拆出来**，重新打包成可以挂进任何网页的 JavaScript 库。日常类比：像把一辆赛车的发动机原样搬上一辆家用车——你拿到的不是仿制件，是同一颗发动机。它由四件抽象组成：`ITextModel`（基于 PieceTree 的文本真理源）+ `ICodeEditor`（用户输入控制器）+ Web Worker LSP（跨线程语言服务）+ Provider Registry（hover / completion 注册器）。

你写：

```js
monaco.editor.create(document.getElementById('container'), {
  value: 'function hello() { return 42; }',
  language: 'typescript',
})
```

页面上立刻就有了一个**会自动补全、悬浮看类型、点击跳转定义、实时报错**的编辑器。它不是一个高级 textarea，而是 IDE 的浏览器版。GitHub Codespaces、StackBlitz、Replit、CodeSandbox 这些"在网页里写代码"的产品，底层用的就是它。

## 为什么重要

不理解 Monaco，下面这些事都没法解释：

- 为什么浏览器里写 TypeScript 能像桌面 VSCode 一样**马上看到类型错误**
- 为什么同一段编辑器代码可以**桌面版浏览器版同时跑**，不会两边漂移
- 为什么 Monaco 的安装包是 1.5MB+，比 [[codemirror]] 6 重 10 倍，仍然有大量产品愿意用
- 为什么"语言服务"必须跑在 Web Worker 里，主线程跑就会卡死 UI

## 核心要点

Monaco 的设计可以拆成 **三块**：

1. **真理源是 model，不是 DOM**：所有补全、hover、诊断都引用 `model.uri + model.version`。类比：每张快递单都印着订单号，过期作废。这让 IME 输入、撤销、虚拟滚动重渲染时结果不会错乱。具体表现：worker 算了 200 ms 才返回的补全，如果期间用户又敲了一个键导致 version 涨了，结果直接丢弃，不会回写过期建议。

2. **DOM 是单向投影**：`TextModel → ViewModel → DOM` 只能从左到右流，键盘输入要走 `TypeOperations` 转成对 model 的 edit，DOM 不能反向写 model。类比：水电站只能从上游放水，不能让下游倒灌。这条规则保证了折叠、minimap、IME 三件互不打架。

3. **语言服务跑在 Web Worker**：TypeScript 编译器、CSS 解析器都是几百毫秒的同步任务，放主线程会卡键盘。Monaco 默认起 4 个 worker（TS / JSON / CSS / HTML），主线程通过 `postMessage` 异步要结果。worker 内部存的是 model 的镜像副本，主线程发 edit diff 过去保持同步。

三块加起来，就是为什么 Monaco 能做到"桌面 VSCode 用什么 API，网页就能用什么 API"。

## 实践案例

### 案例 1：最小嵌入

```html
<div id="root" style="height:400px"></div>
<script type="module">
  import * as monaco from 'monaco-editor'
  monaco.editor.create(document.getElementById('root'), {
    value: '// 写点什么',
    language: 'javascript',
    theme: 'vs-dark',
  })
</script>
```

**逐部分解释**：`create()` 拿一个 DOM 容器和配置，返回一个 editor 实例。`language` 决定起哪个 worker，`theme` 决定配色。这一行就拥有了完整的 JS 编辑能力。底层会同时初始化 PieceTree 缓冲、ViewModel、并启动对应的语言 worker。

### 案例 2：拿到内容 + 监听变化

```js
const editor = monaco.editor.create(el, { value: '', language: 'json' })
editor.onDidChangeModelContent(() => {
  console.log(editor.getValue())
})
editor.getModel().onDidChangeDecorations(() => { /* 装饰也会变 */ })
```

**为什么不直接读 DOM**：Monaco 用虚拟滚动，DOM 只渲染可见行。读真值必须走 `editor.getValue()`，背后是 PieceTree 缓冲区拼出来的完整文本。事件订阅也走 model 而不是 DOM——这样 IME 中途按键不会误触发。

### 案例 3：注册一个自己的补全 provider

```js
monaco.languages.registerCompletionItemProvider('markdown', {
  triggerCharacters: ['/'],
  provideCompletionItems(model, position) {
    const word = model.getWordUntilPosition(position)
    return {
      suggestions: [{
        label: 'TODO',
        kind: monaco.languages.CompletionItemKind.Snippet,
        insertText: 'TODO: ${1:描述}',
        insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
        range: { startLineNumber: position.lineNumber, endLineNumber: position.lineNumber,
                 startColumn: word.startColumn, endColumn: word.endColumn },
      }],
    }
  },
})
```

**意义**：这就是 Monaco 跟桌面 VSCode 同形的扩展点。把同一个 provider 改 5 行就能搬到 VSCode 扩展里。`triggerCharacters` 控制触发字符，`InsertAsSnippet` 让 `${1:...}` 占位变成可 Tab 跳转的填空。Provider 数量没有上限，多个 provider 的结果会被 suggest UI 自动合并去重。

## 踩过的坑

1. **webpack / vite 不配 worker entry 直接 404**：4 个 worker 是单独 chunk，必须用 `MonacoWebpackPlugin` 或 vite 的 `?worker` 写法注册，否则一加载就报"Cannot find /editor.worker.js"。原因：worker 走 `new Worker(url)`，bundler 不能像普通 import 那样自动追踪。
2. **dispose 不彻底导致内存泄漏**：`editor.dispose()` 只清 widget，model 可能被别的 editor 共享，要单独 `model.dispose()` 才真释放。SPA 路由切换页面时常踩，监控里看到内存只升不降基本就是这条。
3. **超大文件触发降级**：单行超过 1 万字符或文件超过 10MB，Monaco 会自动关掉 token 高亮、bracket 匹配等特性保活，体验突然变差，需要预先分片或截断。
4. **自定义 CSS 覆盖内部 class 会让光标飘**：Monaco 用 DOM 测量算行高字宽，外部样式动了 `.monaco-editor .view-line` 这类 class 会让坐标对不齐。改主题应优先用 `monaco.editor.defineTheme()` 而不是直接覆盖 CSS。

## 适用 vs 不适用场景

**适用**：
- 浏览器里写代码（在线 IDE / 教程平台 / 配置编辑器 / 沙箱）
- 需要 IDE 级体验：补全、hover、诊断、find-all-references
- 想跟 VSCode 桌面共享扩展协议（用 monaco-language-client 接 LSP）

**不适用**：
- 富文本编辑（标题、加粗、图片）→ 用 [[lexical]] / [[prosemirror]]
- 极致小体积（<200KB gzip）→ 用 [[codemirror]] 6
- 单文件低交互的代码展示（只读、无补全）→ Prism / highlight.js 够了
- 移动端为主的场景 → Monaco 的虚拟滚动和事件模型主要给桌面浏览器调优

## 历史小故事（可跳过）

- **2011 年**：Microsoft 内部启动 "Monaco" 项目，最初是 Azure 网页版编辑器的代号，那时还在用 RequireJS + AMD。
- **2015 年**：VSCode 发布，编辑器内核搬进 `src/vs/editor` 子树，用 TypeScript 重写。
- **2016 年**：把这棵子树单独抽出来打包成 npm 包 `monaco-editor` v0.1，宣告"浏览器也能跑 VSCode 编辑器"。
- **2018 年**：GitHub Codespaces 前身 Visual Studio Online 开始公测，底层就是 Monaco。
- **2020 年起**：StackBlitz、Replit、CodeSandbox 等浏览器 IDE 全部以 Monaco 为编辑器层。
- **现在**：vscode 仓库每天数十次提交，编辑器子树变更几乎实时同步进 monaco-editor 包。

## 学到什么

1. **真理源 vs 视图层分离**——所有跨线程结果都靠 model.uri + version 校验，过期就丢，比 try/catch 简单
2. **Web Worker 是 first-class 而不是优化项**——一开始就规划进架构，比后来再"优化"代价低得多
3. **复用桌面端代码的工程价值**——不是炫技，而是省下两套编辑器十年漂移的维护成本
4. **抽象的代价是 bundle 大**——1.5MB 不是浪费，是把 IDE 整套语义协议端上来的合理价格
5. **Provider 协议的开放设计**——只要遵守 schema，谁都可以接入语言服务，monaco-language-client 把 LSP 翻译进来就是经典示范

## 延伸阅读

- 官方主页：[microsoft.github.io/monaco-editor](https://microsoft.github.io/monaco-editor/)（playground 可以现场调 API）
- 源码导览：[microsoft/vscode `src/vs/editor`](https://github.com/microsoft/vscode/tree/main/src/vs/editor)（真正的心脏在这里）
- 介绍视频：[Building Monaco Editor — VSCode team talk](https://www.youtube.com/results?search_query=monaco+editor+architecture)（讲架构和 worker 协议）
- 接远程 LSP 的胶水库：[monaco-languageclient 仓库](https://github.com/TypeFox/monaco-languageclient)
- PieceTree 数据结构原理：[VSCode 团队博客 "Text Buffer Reimplementation"](https://code.visualstudio.com/blogs/2018/03/23/text-buffer-reimplementation)
- [[codemirror]] —— 同领域另一种思路对照

## 关联

- [[codemirror]] —— 同样是浏览器代码编辑器，走小核心 + Facet 模块化路线，与 Monaco 的"VSCode 整块搬"形成对照
- [[lexical]] —— Meta 出品的富文本框架，做的是文章而不是代码，赛道不同
- [[prosemirror]] —— 富文本编辑的另一巨头，强在结构化文档模型
- [[markdown-it]] —— 把 Markdown 文本转 HTML，常和 Monaco 配合做实时预览编辑器
- [[typescript-compiler]] —— Monaco 的 TS worker 内部跑的就是 tsserver 同款代码

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[atom]] —— Atom — 已归档的 Web 编辑器先驱
- [[code-server]] —— code-server — 在浏览器里跑完整 VS Code
- [[codemirror]] —— CodeMirror — 编辑器不是一个类，是一组扩展的合奏
- [[emacs]] —— GNU Emacs — Lisp 自文档编辑器
- [[excalidraw]] —— Excalidraw — 手绘风协作白板
- [[geany]] —— Geany — GTK 轻量 IDE
- [[kakoune]] —— Kakoune — 多光标优先模态编辑器
- [[lapce]] —— Lapce — 把编辑器搬到 GPU 上的 Rust 实验
- [[lazyvim]] —— LazyVim — lazy.nvim 驱动的 Neovim 发行版
- [[markdown-it]] —— markdown-it — 把 Markdown 文本变成 HTML 的工业级解析器
- [[openvscode-server]] —— OpenVSCode Server — VS Code Server 上游
- [[prosemirror]] —— ProseMirror — schema 先定 DOM 后服从的富文本编辑器框架
- [[shiki]] —— shiki — 把 VS Code 那套染色搬到网页上
- [[textmate]] —— TextMate — macOS 经典编辑器，语法格式影响了所有人
- [[theia]] —— Eclipse Theia — 云原生 IDE 框架基座
- [[vim]] —— Vim — 模态编辑器之父
- [[vscode]] —— VS Code — 把编辑/调试/扩展捏成一个跨平台壳
- [[vscodium]] —— VSCodium — 去微软遥测的 VS Code 干净构建


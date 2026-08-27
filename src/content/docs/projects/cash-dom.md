---
title: cash-dom — 只把能用原生 API 表达的 jQuery 子集留下来
description: cash-dom 8.1.5 用原生 QSA 复刻 jQuery 集合子集，不含 ajax 与 Deferred
来源: 'https://github.com/fabiospampinato/cash'
日期: 2026-08-27
分类: 前端
难度: 初级
difficulty: 初级
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/fabiospampinato/cash
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 61e3b8f26ca11fecb47c9f0a404228375966a931
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 8.1.5
---

## 是什么

cash-dom 是 `fabiospampinato/cash` 发布到 npm 的包名，目标是在现代浏览器里复刻一部分 jQuery 集合 API。日常类比：像把中餐馆满汉全席菜单收成“家常菜”——点名还是那些（`$()`、`.on()`、`.find()`），后厨却不再备宴席冷盘（ajax、Deferred、动画队列）。

你写：

```js
import cash from "cash-dom";

cash(".item").addClass("on").on("click", "button", handler);
```

`cash` 不是普通函数，而是 `Cash.prototype.init`。`new Cash(selector)` 之后，`cash.fn === Cash.prototype`，所以 `cash() instanceof Cash`。字符串先看是不是 `#id` 或一段 HTML，否则才 `find`。

## 为什么重要

对照 [[jquery]] 时，cash 让这些边界变得具体：

- 哪些“jQuery 写法”其实只是 `querySelectorAll` 加一层集合
- 哪些能力（`:eq`、ajax、`$.Deferred`、`.animate`）根本不在默认构建里
- `.html()` 什么时候直接 `innerHTML`，什么时候为了 `<script>` 改走 `append` + `evalScripts`
- 为什么迁移时不能假设 `$.getScript` 或 `$el.click(fn)` 一定存在

## 核心要点

固定 8.1.5 的主链是：

1. **类 + init 双身份**：`Cash` 构造集合；导出的 `cash` 是 `fn.init`。函数参数当 `ready`，节点或 `window` 被包成单元素集合。

2. **三种字符串**：`idRe` 用 `getElementById`（只在 document context）；`htmlRe`（`/<.+>/`）走 `parseHTML`；其余 `find`。`htmlRe` 比 jQuery 的“必须以 `<` 开头并以 `>` 结尾”更松。

3. **find 没有自备 compiler**：class 用 `getElementsByClassName`，tag 用 `getElementsByTagName`，其它一律 `querySelectorAll`。DocumentFragment 上这两条快捷路径会被跳过。

4. **HTML 插入会按需执行脚本**：`parseHTML` 把 markup 写进按标签选的容器（`tr`/`td`/`tbody`/…）再 `detach`。`.html(s)` 若匹配 `/<script[\s]>/` 就 `empty().append()`；`insertElement` 只对第一次插入的副本调用 `evalScripts`。

5. **事件是命名空间 + 委托爬树**：`on` 拆命名空间，focus/hover 会换成冒泡名，委托时从 `event.target` 往上 `matches`。回调 `return false` 等于 `preventDefault` 加 `stopPropagation`。默认 `methods.ts` 不收录 `getScript` 和 click 这类 shorthand。

## 实践示例

### 案例 1：选择器只信任浏览器

```js
import cash from "cash-dom";

cash("#main .item").filter(".on").first().addClass("current");
```

**逐部分**：

- `#main .item` 不是纯 id，不会走 `getElementById`，而是 `querySelectorAll`
- `.filter` / `.first` 是集合方法，不再次编译 jQuery 伪类
- 这里写 `:eq(0)` 不会得到 jQuery 那种扩展伪类实现，应改用 `.first()` / `.eq(0)`

### 案例 2：带脚本的 HTML

```js
cash("#box").html("<div>ok</div>");
cash("#box").html("<script>window.__x = 1</script><div>after</div>");
```

**逐部分**：

- 第一行没有 `<script`，直接 `ele.innerHTML = html`
- 第二行命中 `/<script[\s>]/`，改走 `empty().append()`，`evalScripts` 把 script 插进 `document.head` 再删掉
- 多目标插入时只有 index 为 0 的那次 `evaluate=true`，后面是 `cloneNode`

### 案例 3：委托和命名空间

```js
const $root = cash("#list");
$root.on("click.item", "li", (event) => {
  console.log(event.currentTarget, event.delegateTarget);
});
$root.off("click.item");
```

**逐部分**：

- `click.item` 被拆成类型和命名空间；触发时对 `event.namespace` 做包含检查
- 委托沿 `parentNode` 爬到第一个 `matches("li")` 的节点，再把它写成 `currentTarget`
- `return false` 会同时取消默认和冒泡，与 jQuery 同形但实现完全独立

## 踩过的坑

1. **把 cash 当成完整 jQuery**：默认构建没有 ajax、Deferred、动画队列，也没有 `getScript` 和 `$el.click(fn)` shorthand。这些文件在源码里，但 `methods.ts` 写了 `@no-require`。

2. **用 jQuery 扩展伪类**：`:visible`、`:eq`、`:has` 不是这条 `find` 的合同。能用的是浏览器 `querySelectorAll` 加上集合方法。

3. **`parseHTML` 的 context 比看起来脏**：它用页面上的 `div`/`table` 容器做 `innerHTML`。源码自己还留着“应该改用 fragment、防止 inline handler”的 TODO，不能把它写成已经隔离的解析器。

4. **`.data()` 不是 jQuery 的 expando 缓存**：8.1.5 读写 `dataset` 辅助函数。对象值、非 `data-*` 生命周期和 jQuery `dataPriv` 不保证相同。

5. **包名和仓库名不同**：npm 是 `cash-dom`，GitHub 是 `fabiospampinato/cash`。按仓库名 `cash` 去 Study 站点找不到这篇。

## 适用 vs 不适用场景

**适用**：

- 现代浏览器里只需要选择、遍历、class/attr、委托事件和基本 DOM 插入
- 想保持 jQuery 阅读习惯，但不想引入 ajax / Deferred / effects
- 用 `querySelectorAll` 能表达的选择器，再加 `.eq` / `.filter` 集合操作

**不适用**：

- 依赖 `$.ajax`、`$.Deferred`、`.animate`、`:visible` 或大量 jQuery UI 插件的老代码
- 需要 `$.getScript` 或 `$el.click(fn)` 而又不想自己做 partial build
- React 等框架已经管理 DOM 的应用——和 [[jquery]] 一样会抢节点
- 服务端解析 HTML 的场景；cash 的 `parseHTML` 依赖浏览器 `document` / `innerHTML`

## 固定版本边界

- 本文绑定 `fabiospampinato/cash@61e3b8f2...`，即 tag `8.1.5`，npm 包 `cash-dom@8.1.5`。
- npm `gitHead` 与 GitHub tag 是同一提交，`package.json` 版本一致。
- 发布入口是 `dist/cash.js` / `dist/cash.esm.js` / `dist/cash.d.ts`；源码是 TypeScript 模块，靠注释 `@require` 做拼接。
- 默认方法表不含 `extra/get_script.ts` 与 `extra/shorthands.ts`。
- `show` / `hide` / `toggle` 只改 display，不是 fx queue。
- 本文未安装依赖、未跑 Playwright 或 jQuery 兼容套件，状态保持 `UNVERIFIED`。

## 学到什么

1. **兼容 API 可以只覆盖“浏览器已经提供的那一层”**：cash 把查找几乎全部交给 QSA
2. **默认构建的 `@no-require` 比 README 口号更硬**：能力在不在，看 `methods.ts`
3. **插入 HTML 的脚本策略是显式开关**：普通 `innerHTML` 一条路，带 `<script>` 才 `evalScripts`
4. **包名、仓库名、全局 `$` 不必同一**：迁移时先核 npm 名 `cash-dom`

## 应用型自测

1. `cash("#a .b")` 会调用 `getElementById("a .b")` 吗？
2. 默认 `import cash from "cash-dom"` 之后，`cash.getScript` 是否一定存在？
3. `cash(".a, .b").append("<script>ok</script>")` 会给两个目标都执行脚本吗？

检查点：

1. 不会。它不是纯 `#id`，走 `find` → `querySelectorAll`。
2. 不一定。默认 `methods.ts` 排除了 `get_script.ts`。
3. 不会。一次 `append` 里 `insertSelectors` 只让第一个 anchor 的 `evaluate=true`，后面是 `cloneNode`。注意 `.html()` 会对每个目标单独 `append` 一次，那是另一条路径。

## 延伸阅读

- 仓库与文档：[fabiospampinato/cash](https://github.com/fabiospampinato/cash)
- 固定源码提交 `61e3b8f26ca11fecb47c9f0a404228375966a931`，npm 包名 `cash-dom`
- [[jquery]] —— 对照完整工厂、compiler 选择器和 ajax/Deferred
- [[sortablejs]] —— 另一条不经过 `$` 的 DOM 行为库

## 关联

- [[jquery]] —— API 外观的参照系，也是 cash 明确不做的那一半
- [[react]] —— 组件树持有 DOM 时，cash 集合同样不适用
- [[sortablejs]] —— 列表拖拽这类“直接改节点”的相邻工具
- [[dayjs]] —— “缩小老库表面 API”的另一例，领域不同
- [[axios]] —— 若你是为了 ajax 才想起 jQuery，应看专门的 HTTP 客户端

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

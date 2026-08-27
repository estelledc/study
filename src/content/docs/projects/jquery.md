---
title: jQuery — 选择器工厂、集合栈和委托事件的 DOM 工具
description: jQuery 4.0.0 的选择器工厂、集合栈、委托事件和 Deferred ajax
来源: 'https://github.com/jquery/jquery'
日期: 2026-08-27
分类: 前端
难度: 初级
difficulty: 初级
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/jquery/jquery
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 4f2fae08f23b54ce09322e62e73cce6161b8d3cb
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 4.0.0
---

## 是什么

jQuery 是一套把“找节点、改节点、听事件、发请求”收成同一套集合 API 的浏览器 DOM 工具。日常类比：像餐厅传菜口——你报一个桌号或一道菜名（选择器），它递出一叠盘子（array-like 集合），后面的加菜、撤盘、喊服务员都在这叠盘子上操作。

你写：

```js
const $items = $(".list").find(".item").addClass("ready");
$items.on("click", "button", handler);
```

`$()` 并不是直接 `querySelectorAll`。固定 4.0.0 里它是 `new jQuery.fn.init(selector, context)`：空值返回空集合，DOM 节点包一层，函数交给 `ready`，以 `<` 开头且以 `>` 结尾的字符串走 `parseHTML`，`#id` 走 `getElementById`，其余再 `$(context).find(selector)`。

## 为什么重要

不理解这套工厂，下面这些事会对不上：

- 为什么 `$("#id")` 和 `$("<div>")` 必须先用不同的快速路径，而不是一律当 CSS 选择器
- 为什么 `$(html)` 可能执行脚本，而单独调用 `$.parseHTML(html)` 默认会换一个空 `DOMParser` 文档
- 为什么 `.find()` 有时用原生 `querySelectorAll`，有时又掉进仓库内自己编译的 matcher
- 为什么 `$.ajax` 返回的不是 `fetch` Response，而是带 `done` / `fail` / `then` 的 jqXHR

## 核心要点

jQuery 4.0.0 的主链可以拆成五步：

1. **工厂变成集合**：`jQuery` 只负责 `new init`。原型是 array-like，`pushStack` 记下 `prevObject`，`.end()` 弹回上一层。

2. **输入分流**：`init` 按节点 / 函数 / 明显 HTML / `rquickExpr`（HTML 或 `#id`）/ `find` 分支。`rquickExpr` 把 `#id` 放在 HTML 前面，避免 `location.hash` 被当成标签解析（trac-9521）。

3. **查找先走原生，再编译**：`find` 对简单 id/tag/class 用 `getElementBy*`；否则尽量 `querySelectorAll`，必要时给选择器加 `:scope` 或临时 id；失败或复杂伪类才走仓库内的 `tokenize` → `compile` → `select()`。

4. **事件共用一个监听器**：`on` 解析 `type.namespace`，每个元素每种类型只 `addEventListener` 一次，真正分发走 `jQuery.event.dispatch`。带 selector 的调用是委托，不给每个子节点绑一次。

5. **ajax 是 Deferred 管线**：默认 `GET`、`async: true`、`processData: true`、`global: true`。prefilter 先改选项，transport 再发请求，`text json` 转换器用 `JSON.parse`。返回值是 Promise 风格的 jqXHR，不是标准 `fetch`。

## 实践示例

### 案例 1：集合上链式改 DOM

```js
import { jQuery as $ } from "jquery";

const $row = $("<li>", { class: "row", text: "hello" });
$("#list").append($row).find(".row").addClass("on");
```

**逐部分**：

- `$("<li>", props)` 命中单标签 HTML；`props` 里的函数名当方法调，其余当属性
- `append` 之后的 `.find(".row")` 是新集合，`prevObject` 指向原来的 `#list`
- 再 `.end()` 就能回到 `#list`，这是 `pushStack` 而不是重新查 DOM

### 案例 2：命名空间和委托

```js
$("#board").on("click.toolbar", "button.ok", (event) => {
  console.log(event.target);
});
$("#board").off("click.toolbar");
```

**逐部分**：

- `click.toolbar` 被 `rtypenamespace` 拆成类型 `click` 和命名空间 `toolbar`
- 第二个参数是 selector，所以监听器挂在 `#board` 上，点击子 `button.ok` 才进回调
- `off("click.toolbar")` 只拆这一组命名空间，不会误删别的 `click` 处理器

### 案例 3：ajax 默认值

```js
const req = $.ajax({ url: "/api/item", dataType: "json" });
req.done((data) => console.log(data.id));
req.fail((_, status) => console.error(status));
```

**逐部分**：

- 未写 `type` 时默认 `GET`；`processData` 默认把对象编成 query
- `dataType: "json"` 走 `text json` converter，也就是 `JSON.parse`
- `req` 同时是 jqXHR 和 Deferred；它不是 `fetch` 的 `Response`

## 踩过的坑

1. **`$(html)` 和 `$.parseHTML(html)` 不是同一条安全边界**：工厂路径传入当前 `document` 且 `keepScripts=true`；无 context 的 `parseHTML` 才用空 `DOMParser` 文档挡住立即执行。

2. **把 `$` 当成 `querySelectorAll`**：`:eq()`、`:odd`、`:has()` 这类表达式不保证能被原生 QSA 消化，会掉进自带 compiler；失败时还会写入 `nonnativeSelectorCache`。

3. **委托写在会换掉的子节点上**：正确挂法是稳定祖先 + selector。子节点被 `.html()` 换掉后，祖先上的那一个 `addEventListener` 还在。

4. **`return false` 不是只 `preventDefault`**：事件系统把它当成取消默认并且停止冒泡。只想阻止提交不要顺便拦冒泡时，应显式调用。

5. **README 表格和 tag 不一致**：这个提交的 README 仍把 4.x 写成 Beta，但 tag 与 `package.json` 已是 `4.0.0`。浏览器支持应以当时官方 support 页和实测为准，不能只抄 README 那一行。

## 适用 vs 不适用场景

**适用**：

- 需要同一套 API 同时做选择、遍历、委托事件和 ajax 的多页或渐进增强站点
- 选择器里仍依赖 jQuery 扩展伪类，而不仅是标准 CSS
- 既有插件生态假设 `$`、`$.Deferred` 和 `noConflict`

**不适用**：

- 只要现代 CSS 选择器和 `addEventListener` 的新页面——现金/原生已经够用
- React / Vue 这类由框架持有 DOM 的应用；再包一层 jQuery 集合会和虚拟 DOM 抢所有权
- 明确只要 slim 构建、又不想带 ajax/effects 时，应走 `jquery/slim`，不要假设默认包是瘦的
- 需要标准 Fetch 语义、取消和 streaming 时，应看 [[axios]] 或原生 `fetch`，不要把 jqXHR 当成 Response

## 固定版本边界

- 本文绑定 `jquery/jquery@4f2fae08...`，即 GitHub annotated tag `4.0.0` 剥出的提交，`package.json` 版本 `4.0.0`。
- npm `jquery@4.0.0` 的 `gitHead=cfd8e3a8...` 在 `jquery/jquery` 上不可达；本文不伪造该提交，只绑定可达 tag。
- 包是 `"type": "module"`，条件导出包含 `.`、`./slim`、`./factory`、`./factory-slim`。
- ajax 默认 `GET` / `async` / `processData` / `global`；JSON 转换是 `JSON.parse`。
- 选择器和 `:selected` 仍留有 `isIE` 分支；`jQuery.proxy` 与 `holdReady` 仍在 deprecated 模块。
- 本文未安装依赖、未跑上游测试或浏览器矩阵，状态保持 `UNVERIFIED`。

## 学到什么

1. **同一套 `$()` 是分流器，不是一种查找**：节点、HTML、id、函数、选择器走的是不同代码
2. **原生 QSA 是快路径，不是全部合同**：扩展伪类和有 bug 的选择器仍要自己的 compiler
3. **委托能活过子树替换，是因为监听器在祖先上**：集合 API 把这件事藏进了 `on(type, selector, fn)`
4. **“解析 HTML”和“插进当前 document”的脚本策略不同**：工厂默认偏兼容，显式 `parseHTML` 才偏隔离

## 应用型自测

1. `$("#foo")` 和 `$("<div id='foo'>")` 会走同一条 `querySelectorAll` 路径吗？
2. 调用 `$.parseHTML("<img onerror=alert(1)>")` 不传 context 时，默认 document 是哪一个？
3. `$("#a").on("click.ns", fn)` 之后 `$("#a").off("click")` 会不会把 `.ns` 那组一起拆掉？

检查点：

1. 不会。`#id` 走 `getElementById`；HTML 字符串走 `parseHTML`。
2. 空的 `DOMParser` `text/html` 文档，不是页面上的 `window.document`。
3. 会。不带命名空间的 `off("click")` 按类型拆除；只想拆一组要用 `off("click.ns")`。

## 延伸阅读

- 官方站点：[jquery.com](https://jquery.com/)
- 固定源码：[jquery/jquery](https://github.com/jquery/jquery) —— 本文绑定提交 `4f2fae08f23b54ce09322e62e73cce6161b8d3cb`
- 升级说明以官方 blog / upgrade guide 为准；本仓库该提交的 README 版本表仍写 Beta
- [[cash-dom]] —— 同一选择器外观、没有 ajax/Deferred 的现代子集
- [[sortablejs]] —— 另一类直接操作 DOM 的列表工具，不走 `$` 集合

## 关联

- [[cash-dom]] —— 对照：原生 QSA + 无 ajax
- [[react]] —— 框架持有 DOM 时，不宜再让 jQuery 集合改同一棵树
- [[axios]] —— 需要 HTTP 客户端时的显式替代，而不是 jqXHR
- [[sortablejs]] —— 拖拽排序这类 DOM 行为库，常被误以为“只要有 jQuery 就能做”
- [[dayjs]] —— 另一条“缩小老 API”的路，但是日期而不是 DOM

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

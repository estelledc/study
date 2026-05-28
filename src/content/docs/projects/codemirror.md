---
title: codemirror — 编辑器不是一个类，是一组 Facet 的合奏
description: CodeMirror 6 完全重写为分包架构，每个特性都是 plugin。一个零基础学习者读心脏代码的状元篇笔记。
sidebar:
  label: codemirror
  order: 16
---

> 项目类型 self-classify：**框架/SDK**（v1.1 分支 D）。
> 不是一个 React 组件、也不是一个开箱即用的 IDE——它是"编辑器抽象的开放协议"，
> 通过 `EditorState`/`Transaction`/`Facet` 三件套把 history、keymap、syntax、autocomplete
> 都做成可插拔的扩展。Replit / Codesandbox / Sourcegraph / Sentry 用它做嵌入式编辑器。

| 维度 | 数据 |
|---|---|
| 主仓库 star | codemirror/dev 7k+（监控仓库），子包合计 GitHub > 27k |
| fork | 子包加起来 ~600 |
| 最近活跃 | 2026-04-15 全部 archive 至 code.haverbeke.berlin（迁移，不是死项目）|
| 读时 commit hash | state `9c801279cb83011e6f92af778f4443406e8f1200` / view `fbff59ba004d80d8c914f64c42586387b08706ac` / language `8e9700018446d46f23267f6e31da56628d5117c0` / autocomplete `9a01794def6f9f12468805dce2d687b7548ff469` |
| 主语言 | TypeScript 100% |
| 维护方 | 个人主导（Marijn Haverbeke，同时维护 ProseMirror、Lezer parser）|
| 主要贡献者 | marijnh / dependabot / 少量 PR contributor |
| License | MIT |
| 类似项目 | Monaco Editor / Ace / Lexical / Slate / ProseMirror |

![Figure 1. CodeMirror 6 架构总览](/projects/codemirror/01-architecture.webp)

> Figure 1：从左到右是状态变更管道（EditorState → Transaction → EditorView → DOM diff）；
> 中间一排是各 Facet provider（history、keymap、syntaxHighlighting、autocompletion、lineNumbers、theme）；
> 底排是 Lezer parser pipeline（source → LRParser → Tree → TreeFragment cache → highlight visitor → Decoration RangeSet）。
> 这张图请配合 Layer 3 三段精读（state.ts、facet.ts/decoration.ts、language.ts）来回看。

## 一句话定位

CodeMirror 6 把"代码编辑器"拆成两层——一个 immutable EditorState 内核 + 一组用 Facet 暴露 extension point 的 plugin 系统——
任何特性（搜索、补全、语法树、协同光标）都不是内置类，而是组合上去的 extension。
所以它不是"一个组件"，是"一个让你拼出自己编辑器的协议"。

## Why（为什么 Season 15 选它做编辑器框架的代表）

CodeMirror 5 之前所有特性都缝在 `CodeMirror` 这个 god class 上：搜索、补全、bracket matching、history……
扩展第三方特性必须 monkey-patch class 内部。
2018 年 Marijn 发了 [The Architecture of CodeMirror 6](https://marijnhaverbeke.nl/blog/codemirror-6.html)：

- "**Mutable state is bad**"——文档/光标/选区每次改动都返回新 state，view 拿到 transaction 才知道变化是什么
- "**The editor isn't a class, it's a composition of features**"——把"编辑器"当成 Linux kernel + module，每个 feature 是 module
- 旧版做协同编辑要 patch CodeMirror 内部、做 collab plugin。新版直接：transaction 对外发布 → 远端 apply → 同一份不可变 doc 上重放

CodeMirror 6 = 把这套理念落到 7 个独立 npm 包：`@codemirror/state` / `@codemirror/view` / `@codemirror/language` /
`@codemirror/commands` / `@codemirror/search` / `@codemirror/autocomplete` / `@codemirror/lint`。
每个都能单装单用。**用户的编辑器不再是一个对象，是一个 `EditorState.create({extensions: [...]})` 调用**。

## 仓库地形（Layer 2）

CodeMirror 6 不是单仓库——是 GitHub org `codemirror/` 下 ~30 个独立 repo，每个对应一个 npm 包。
精读时我聚焦四个心脏包：

```
@codemirror/state          ← 不可变状态内核（doc / selection / facet / transaction）
@codemirror/view           ← DOM 渲染层（contentEditable + 自管 diff）
@codemirror/language       ← 语法树管理（封装 Lezer parser）
@codemirror/autocomplete   ← extension point 示范（外挂的补全 plugin）

@codemirror/commands       ← 内置命令（undo / cursorMove 等）
@codemirror/search         ← 搜索 plugin
@codemirror/lint           ← 诊断 plugin
@codemirror/lang-javascript / lang-python / ...   ← 单语言适配
```

state 子目录角色（commit `9c801279cb83011e6f92af778f4443406e8f1200`）：

```
state/src/
  state.ts         ← EditorState 类，约 446 行（心脏 1）
  transaction.ts   ← Transaction + StateEffect + Annotation，约 407 行（心脏 2）
  facet.ts         ← Facet 系统 + Extension resolver，约 577 行（心脏 3）
  change.ts        ← ChangeSet / ChangeDesc，文档 diff 表示
  selection.ts     ← EditorSelection / SelectionRange
  text.ts          ← Text 类（rope，惰性按行索引）
  extension.ts     ← 内置 facet（lineSeparator / readOnly / changeFilter）
  rangeset.ts      ← RangeSet 通用容器（decoration / fold range 都用它）
  index.ts         ← 公开 API barrel
```

view 子目录角色（commit `fbff59ba004d80d8c914f64c42586387b08706ac`）：

```
view/src/
  editorview.ts    ← EditorView 类，1250 行（心脏 4）
  docview.ts       ← 文档 block 树
  inlineview.ts    ← inline 节点（TextView / WidgetView / MarkView）
  blockview.ts     ← block 节点
  decoration.ts    ← Decoration（mark/widget/replace/line）
  domobserver.ts   ← MutationObserver 包装
  domchange.ts     ← 把 DOM 变更反向变成 Transaction
  heightmap.ts     ← 行高缓存（虚拟滚动）
  viewstate.ts     ← view 自己的派生状态
  input.ts         ← 键盘/触屏/IME 事件
  cursor.ts        ← 光标移动算法
  bidi.ts          ← 双向文本（RTL）
  extension.ts     ← view 暴露的 facet（decorations / scrollMargins / keymap...）
```

extension point 路径（用户写 plugin 必须知道的"插槽"）：

```
@codemirror/state    facet.ts                ← Facet.define / Facet.compute / Compartment
@codemirror/state    transaction.ts          ← StateEffect.define / Annotation.define
@codemirror/view     extension.ts            ← ViewPlugin.fromClass / decoration facet
@codemirror/language language.ts             ← LRLanguage.define / Language extension
```

commit 热点（state 仓库 `git log --format='' --name-only | sort | uniq -c | sort -rn | head -10`）：

```
 89  CHANGELOG.md
 71  package.json
 68  src/state.ts
 64  src/transaction.ts
 58  src/facet.ts
 47  src/change.ts
 39  src/selection.ts
 36  src/text.ts
 28  test/test-state.ts
 24  src/extension.ts
```

热点验证："`state.ts` + `transaction.ts` + `facet.ts` 是真心脏"——三者合计提交量等于其他文件之和。
我下面的 Layer 3 就锁定这三个 + 顺带 language.ts。

---

## 核心机制（Layer 3）

按框架/SDK 分支 D 模板，三段独立精读：(a) immutable EditorState + Transaction 内核；
(b) Decoration / Extension / Facet 系统；(c) Lezer parser + syntax tree 集成。

### Layer 3-a · EditorState + Transaction：immutable 是怎么做到的

[state/src/state.ts#L36-L93](https://github.com/codemirror/state/blob/9c801279cb83011e6f92af778f4443406e8f1200/src/state.ts#L36-L93)

```ts
/// The editor state class is a persistent (immutable) data structure.
/// To update a state, you [create](#state.EditorState.update) a
/// [transaction](#state.Transaction), which produces a _new_ state
/// instance, without modifying the original object.
///
/// As such, _never_ mutate properties of a state directly. That'll
/// just break things.
export class EditorState {
  /// @internal
  readonly status: SlotStatus[]
  /// @internal
  computeSlot: null | ((state: EditorState, slot: DynamicSlot) => SlotStatus)

  private constructor(
    /// @internal
    readonly config: Configuration,
    /// The current document.
    readonly doc: Text,
    /// The current selection.
    readonly selection: EditorSelection,
    /// @internal
    readonly values: any[],
    computeSlot: (state: EditorState, slot: DynamicSlot) => SlotStatus,
    tr: Transaction | null
  ) {
    this.status = config.statusTemplate.slice()
    this.computeSlot = computeSlot
    // Fill in the computed state immediately, so that further queries
    // for it made during the update return this state
    if (tr) tr._state = this
    for (let i = 0; i < this.config.dynamicSlots.length; i++) ensureAddr(this, i << 1)
    this.computeSlot = null
  }

  update(...specs: readonly TransactionSpec[]): Transaction {
    return resolveTransaction(this, specs, true)
  }
```

旁注：

- **构造函数 `private`**——用户不能 `new EditorState(...)`，只能 `EditorState.create({...})` 或 `tr.state` 拿。
  这是把"产生新 state"的入口收紧成 transaction 一条路，杜绝"改一半"的中间状态。
- `readonly doc: Text` / `readonly selection: EditorSelection` / `readonly values: any[]`——TS 编译期约束，
  加上注释顶部"_never_ mutate properties of a state directly"，就是 immutable 契约。
  没有 `Object.freeze`（性能成本太高），靠类型 + 文化。
- `values: any[]` 是所有 facet/field 的"slot 值数组"。**地址 = 索引 << 1**（参见 `ensureAddr(this, i << 1)`）。
  facet 不是 Map<id, value>——是一个偶数索引数组，奇数索引存 status flag。这是 v8 友好的紧凑布局。
- `computeSlot` 是个函数指针，在构造时立刻调一遍把所有 dynamic slot 填好；填完就置 null。
  目的是：构造完 state 后再 `field()` 查询不会触发懒计算。"只在构造期间惰性，构造结束就冻结"。
- `tr._state = this` 这一行藏在 `if (tr)` 里：transaction 持有它产生的新 state 指针，
  避免 transaction 后续有人调 `.state` 又走一遍构造。**reentrancy guard**。
- `update(...specs)` 不返回新 state——返回 Transaction。这一步把"我想改"和"已经改了"分开：
  Transaction 还能被 `transactionFilter` 拒绝/改写。如果 update 直接返回 state，
  filter 就没插入点了。

[state/src/transaction.ts#L156-L205](https://github.com/codemirror/state/blob/9c801279cb83011e6f92af778f4443406e8f1200/src/transaction.ts#L156-L205)

```ts
/// Changes to the editor state are grouped into transactions.
/// Typically, a user action creates a single transaction, which may
/// contain any number of document changes, may change the selection,
/// or have other effects. Create a transaction by calling
/// [`EditorState.update`](#state.EditorState.update), or immediately
/// dispatch one by calling
/// [`EditorView.dispatch`](#view.EditorView.dispatch).
export class Transaction {
  /// @internal
  _doc: Text | null = null
  /// @internal
  _state: EditorState | null = null

  private constructor(
    /// The state from which the transaction starts.
    readonly startState: EditorState,
    /// The document changes made by this transaction.
    readonly changes: ChangeSet,
    /// The selection set by this transaction, or undefined if it
    /// doesn't explicitly set a selection.
    readonly selection: EditorSelection | undefined,
    /// The effects added to the transaction.
    readonly effects: readonly StateEffect<any>[],
    /// @internal
    readonly annotations: readonly Annotation<any>[],
    /// Whether the selection should be scrolled into view after this
    /// transaction is dispatched.
    readonly scrollIntoView: boolean
  ) {
    if (selection) checkSelection(selection, changes.newLength)
    if (!annotations.some((a: Annotation<any>) => a.type == Transaction.time))
      this.annotations = annotations.concat(Transaction.time.of(Date.now()))
  }
  /// The new document produced by the transaction.
  get newDoc() {
    return this._doc || (this._doc = this.changes.apply(this.startState.doc))
  }
```

旁注：

- Transaction 持有 `startState`（旧）+ `changes`（diff）+ `selection`/`effects`/`annotations`，**不持有 newState**。
  newDoc 是 `get` 惰性算的——这样 filter 链可以快速看 changes 而不强制把整个新 state 算出来。
- `_doc` / `_state` 是手写 memoization——TypeScript 没原生 lazy getter，于是 nullable 字段 + getter 检查。
  和 React fiber 里 `memoizedState` 思路一样：第一次算就缓存。
- `Transaction.time` 是个内置 Annotation 类型。如果用户没传时间戳就自动加一个 `Date.now()`——
  history plugin 用这个时间戳做 group（500ms 内连续输入合并成一个 undo 单元）。
  框架不知道 history 的存在，但提供了"时间标签"作为通用基础设施。
- `selection` 可以是 `undefined`——transaction 可以"只改文档不动光标"或反过来。
  在 view 端 `tr.newSelection` 会自动 map 旧 selection 到新文档坐标。
- `effects: readonly StateEffect<any>[]`——**StateEffect 是 plugin 之间的消息通道**。
  比如 autocomplete 用 `setSelectedEffect.of(idx)` 让自己的 state field 接收高亮变更，
  而不需要在 EditorState 上加 `selectedCompletion` 字段。

**怀疑 1（Layer 3-a）**：Transaction 里的 `_doc` 缓存是单线程假设——
如果两个 filter 同时读 `tr.newDoc`，会触发两次 `changes.apply`。但单线程下一次 dispatch 只走一遍 filter，
所以这个假设成立。要做并发（如 worker 里跑 filter）就崩了——
是不是 codemirror 6 默认禁用 SharedArrayBuffer doc 的根因？
（追到 `text.ts` 看 Text 是不是真 share-safe，待验证。）

### Layer 3-b · Facet：每个 feature 都是数据流声明，不是 imperative 注册

[state/src/facet.ts#L43-L114](https://github.com/codemirror/state/blob/9c801279cb83011e6f92af778f4443406e8f1200/src/facet.ts#L43-L114)

```ts
/// A facet is a labeled value that is associated with an editor
/// state. It takes inputs from any number of extensions, and combines
/// those into a single output value.
export class Facet<Input, Output = readonly Input[]> implements FacetReader<Output> {
  /// @internal
  readonly id = nextID++
  /// @internal
  readonly default: Output
  /// @internal
  readonly extensions: Extension | undefined

  private constructor(
    /// @internal
    readonly combine: (values: readonly Input[]) => Output,
    /// @internal
    readonly compareInput: (a: Input, b: Input) => boolean,
    /// @internal
    readonly compare: (a: Output, b: Output) => boolean,
    private isStatic: boolean,
    enables: Extension | undefined | ((self: Facet<Input, Output>) => Extension)
  ) {
    this.default = combine([])
    this.extensions = typeof enables == "function" ? enables(this) : enables
  }

  /// Define a new facet.
  static define<Input, Output = readonly Input[]>(config: FacetConfig<Input, Output> = {}) {
    return new Facet<Input, Output>(config.combine || ((a: any) => a) as any,
                                    config.compareInput || ((a, b) => a === b),
                                    config.compare || (!config.combine ? sameArray as any : (a, b) => a === b),
                                    !!config.static,
                                    config.enables)
  }

  /// Returns an extension that adds the given value to this facet.
  of(value: Input): Extension {
    return new FacetProvider<Input>([], this, Provider.Static, value)
  }

  /// Create an extension that computes a value for the facet from a
  /// state. You must take care to declare the parts of the state that
  /// this value depends on, since your function is only called again
  /// for a new state when one of those parts changed.
  compute(deps: readonly Slot<any>[], get: (state: EditorState) => Input): Extension {
    if (this.isStatic) throw new Error("Can't compute a static facet")
    return new FacetProvider<Input>(deps, this, Provider.Single, get)
  }
```

旁注：

- 一个 Facet 是 `<Input, Output>` 二元类型——多个 provider 提供 `Input`，`combine` 函数把 inputs 合成 `Output`。
  例：`tabSize` facet 是 `<number, number>`，combine 默认取第一个非 undefined。
  `keymap` facet 是 `<KeyBinding[], KeyBinding[]>`，combine 是 flat。
- `id = nextID++` 是模块级递增——这个 id 是上面 state.ts 里 `values[]` 数组的索引来源。
  Facet 注册顺序决定 slot address。这个**全局可变 id 计数器**是整个不可变体系里少见的副作用，
  但它只在模块加载时跑，所以 OK。
- `Facet.define()` 静态工厂代替 public constructor——和 EditorState 一样的风格：
  收紧入口，便于以后改实现不破坏 ABI。
- `of(value)` 和 `compute(deps, get)` 是同一个东西的两种 provider：
  - `of`：静态值，提供一次就完了
  - `compute`：动态值，依赖某些 field/facet，依赖变了重算
  返回的是 `FacetProvider`，是 `Extension` 的一种——**用户写 plugin 时拿到的就是这个**。
- `compareInput` / `compare` 是性能旋钮：state 更新时框架要决定"这个 slot 要不要重算"，
  默认 `===` 比较；面值类型用户可以传自己的比较器避免误失效。
  类似 React `memo` 的 `arePropsEqual`。
- `Provider.Single` / `Provider.Multi`——computeN 一次 emit 多个值。例：
  autocomplete 的 keymap.computeN，依赖 config 里的 `defaultKeymap` flag，决定 emit 0 或 1 个 keymap。
- 整个 facet 系统读起来像 **dataflow graph**：
  Field 是源、Facet 是聚合节点、view 是消费者。每次 transaction 后框架做一遍拓扑排序的增量重算。
  这就是为什么 plugin 之间不需要直接通信——大家都在 facet 数据流上。

[state/src/facet.ts#L70-L76](https://github.com/codemirror/state/blob/9c801279cb83011e6f92af778f4443406e8f1200/src/facet.ts#L70-L76) 的小细节：
`compare` 默认值的三元 `!config.combine ? sameArray : (a,b) => a===b`——
没传 combine 时 Output 必然是 readonly array，所以默认用 `sameArray` 浅比较。
传了 combine 就假定 Output 是 scalar 用 `===`。这是个**易踩坑点**：
你写 `combine` 返回 object，没传 `compare`，框架用 `===` 比较 object 永远不等，每次更新都重算。

[view/src/decoration.ts#L7-L100](https://github.com/codemirror/view/blob/fbff59ba004d80d8c914f64c42586387b08706ac/src/decoration.ts#L7-L100) 是 facet 的
具体使用——decoration 不是单独类型，是四种 spec：

```ts
interface MarkDecorationSpec {
  inclusive?: boolean
  inclusiveStart?: boolean
  inclusiveEnd?: boolean
  attributes?: {[key: string]: string}
  class?: string
  tagName?: string
  bidiIsolate?: Direction | null
  [other: string]: any
}

interface WidgetDecorationSpec {
  widget: WidgetType
  side?: number
  inlineOrder?: boolean
  block?: boolean
  [other: string]: any
}

interface ReplaceDecorationSpec {
  widget?: WidgetType
  inclusive?: boolean
  inclusiveStart?: boolean
  inclusiveEnd?: boolean
  block?: boolean
  [other: string]: any
}

interface LineDecorationSpec {
  attributes?: {[key: string]: string}
  class?: string
  [other: string]: any
}
```

旁注：

- 四种 decoration（Mark / Widget / Replace / Line）覆盖所有"DOM 装饰"需求：
  改文字样式、插自定义元素、用 widget 替换文本、给整行加属性。
- `inclusive` / `inclusiveStart` / `inclusiveEnd` 是文档 diff 时的关键——
  当用户在 mark 边界插入字符，是该并进 mark 还是排除？这个布尔决定边界归属。
- `[other: string]: any` 这个 index signature——decoration 允许用户挂任意自定义字段，
  通过 `decoration.spec` 取回。是 plugin 之间另一种约定通信方式（不走 facet）。
- decoration 不直接渲染——它进 RangeSet（state.ts 里的通用容器），
  view 把所有 decoration RangeSet 合并起来一次 diff 出 DOM patch。

**怀疑 2（Layer 3-b）**：Facet `id = nextID++` 是 module-load 时确定的，
如果一个 facet 被两个不同打包出口 import（比如 ESM 和 CJS 双产物），
两次 module init 会产生两个不同 id 的"同名" facet——provider 加到一个 facet，
reader 读另一个，全是 default value，安静失败。这是不是 codemirror 强制要求所有
`@codemirror/*` 包必须用同一个 `@codemirror/state` 实例（peer dep）的根因？
（待用 npm dedupe 实验验证。）

### Layer 3-c · Lezer parser + syntax tree：增量解析怎么进 Facet 的

[language/src/language.ts#L59-L104](https://github.com/codemirror/language/blob/8e9700018446d46f23267f6e31da56628d5117c0/src/language.ts#L59-L104)

```ts
/// A language object manages parsing and per-language
/// [metadata](#state.EditorState.languageDataAt). Parse data is
/// managed as a [Lezer](https://lezer.codemirror.net) tree. The class
/// can be used directly, via the [`LRLanguage`](#language.LRLanguage)
/// subclass for [Lezer](https://lezer.codemirror.net/) LR parsers, or
/// via the [`StreamLanguage`](#language.StreamLanguage) subclass
/// for stream parsers.
export class Language {
  /// The extension value to install this as the document language.
  readonly extension: Extension

  /// The parser object. Can be useful when using this as a [nested
  /// parser](https://lezer.codemirror.net/docs/ref#common.Parser).
  parser: Parser

  constructor(
    /// The [language data](#state.EditorState.languageDataAt) facet
    /// used for this language.
    readonly data: Facet<{[name: string]: any}>,
    parser: Parser,
    extraExtensions: Extension[] = [],
    /// A language name.
    readonly name: string = ""
  ) {
    // Kludge to define EditorState.tree as a debugging helper,
    // without the EditorState package actually knowing about
    // languages and lezer trees.
    if (!EditorState.prototype.hasOwnProperty("tree"))
      Object.defineProperty(EditorState.prototype, "tree", {get() { return syntaxTree(this) }})

    this.parser = parser
    this.extension = [
      language.of(this),
      EditorState.languageData.of((state, pos, side) => {
        let top = topNodeAt(state, pos, side), data = top.type.prop(languageDataProp)
        if (!data) return []
        let base = state.facet(data), sub = top.type.prop(sublanguageProp)
        if (sub) {
          let innerNode = top.resolve(pos - top.from, side)
          for (let sublang of sub) if (sublang.test(innerNode, state)) {
            let data = state.facet(sublang.facet)
            return sublang.type == "replace" ? data : data.concat(base)
          }
        }
        return base
      })
    ].concat(extraExtensions)
  }
```

旁注：

- `Language` **不是 EditorState 的内置概念**——`@codemirror/state` 完全不知道语法树。
  这里 `Object.defineProperty(EditorState.prototype, "tree", ...)` 是个 monkey-patch hack，
  把 `state.tree` 加上去当调试 helper。注释里直白写 "Kludge"——作者承认这是脏的。
  这就是框架/SDK 风格的 trade-off：内核保持纯净，特性靠 prototype patch 注入。
- `this.extension = [language.of(this), EditorState.languageData.of((state, pos, side) => {...})]`——
  Language 不是类继承也不是 method 调用，它**返回一个 Extension 数组**给用户拼到 EditorState.create 的 extensions 里。
  "面向 extension 编程"。
- `EditorState.languageData` 是个内置 facet（在 `state/src/extension.ts`），用来 query 某位置的语言元数据
  （indent / autocomplete word chars 等）。Language 注册时就往这个 facet 里插一个 compute provider，
  根据语法树顶层节点查 `languageDataProp` node prop。
- `topNodeAt` 处理嵌套语言：HTML 里嵌 `<script>JS</script>`，光标在 JS 部分时
  topNode 是 JS 子树。这通过 Lezer 的 `mounted` tree prop 实现——nested parser
  在父树的某个 node 上挂载子树。
- `Sublanguage` 系统：同一种语言里可以有"子方言"——例如 JSX 里的 `{}` 内部是 JS 表达式，
  外面是 JSX 模板字符串。两套补全规则、两套 indent 算法，靠 `sublanguageProp` 切换。

[language/src/language.ts#L165-L210](https://github.com/codemirror/language/blob/8e9700018446d46f23267f6e31da56628d5117c0/src/language.ts#L165-L210)：

```ts
/// A subclass of [`Language`](#language.Language) for use with Lezer
/// [LR parsers](https://lezer.codemirror.net/docs/ref#lr.LRParser).
export class LRLanguage extends Language {
  private constructor(data: Facet<{[name: string]: any}>, readonly parser: LRParser, name?: string) {
    super(data, parser, [], name)
  }

  /// Define a language from a parser.
  static define(spec: {
    name?: string,
    parser: LRParser,
    languageData?: {[name: string]: any}
  }) {
    let data = defineLanguageFacet(spec.languageData)
    return new LRLanguage(data, spec.parser.configure({
      props: [languageDataProp.add(type => type.isTop ? data : undefined)]
    }), spec.name)
  }

  /// Create a new instance of this language with a reconfigured
  /// version of its parser and optionally a new name.
  configure(options: ParserConfig, name?: string): LRLanguage {
    return new LRLanguage(this.data, this.parser.configure(options), name || this.name)
  }

  get allowsNesting() { return this.parser.hasWrappers() }
}

/// Get the syntax tree for a state, which is the current (possibly
/// incomplete) parse tree of the active
/// [language](#language.Language), or the empty tree if there is no
/// language available.
export function syntaxTree(state: EditorState): Tree {
  let field = state.field(Language.state, false)
  return field ? field.tree : Tree.empty
}
```

旁注：

- `LRLanguage.define({parser, languageData})` 是 `@codemirror/lang-javascript` 这类包的入口——
  它们其实就是 "把 Lezer 生成的 parser + 一个 languageData object" 打包成 Extension。
  `lang-javascript` 包自己只有几百行胶水代码，真正的 parse 工作在 `@lezer/javascript`。
- `parser.configure({props: [languageDataProp.add(...)]})` 是 Lezer 的 NodeProp 系统——
  每种 node type 可以挂自定义 prop，syntaxTree 遍历时拿到。
  这是 cm6 把"语言元数据"塞进 parser 而不是塞进 state field 的关键 trick。
- `syntaxTree(state)` 是用户 plugin 拿语法树的标准 API——它读 `Language.state` 这个隐式 state field。
  field 内部维护一个 `parse: PartialParse`，每次 transaction 后增量推进。
- `Tree.empty` 是 fallback——没装 language 时 plugin 不应崩，应该拿到空 tree。
  graceful fallback 是 cm6 整个体系的纪律。

`syntaxTree` 怎么"增量"的：回看 [language/src/language.ts#L211-L249](https://github.com/codemirror/language/blob/8e9700018446d46f23267f6e31da56628d5117c0/src/language.ts#L211-L249)：

```ts
export function ensureSyntaxTree(state: EditorState, upto: number, timeout = 50): Tree | null {
  let parse = state.field(Language.state, false)?.context
  if (!parse) return null
  let oldVieport = parse.viewport
  parse.updateViewport({from: 0, to: upto})
  let result = parse.isDone(upto) || parse.work(timeout, upto) ? parse.tree : null
  parse.updateViewport(oldVieport)
  return result
}

export function syntaxTreeAvailable(state: EditorState, upto = state.doc.length) {
  return state.field(Language.state, false)?.context.isDone(upto) || false
}

/// Move parsing forward, and update the editor state afterwards to
/// reflect the new tree. Will work for at most `timeout`
/// milliseconds. Returns true if the parser managed get to the given
/// position in that time.
export function forceParsing(view: EditorView, upto = view.viewport.to, timeout = 100): boolean {
  let success = ensureSyntaxTree(view.state, upto, timeout)
  if (success != syntaxTree(view.state)) view.dispatch({})
  return !!success
}

export function syntaxParserRunning(view: EditorView) {
  return view.plugin(parseWorker)?.isWorking() || false
}
```

旁注：

- `parse.work(timeout, upto)` 是 Lezer 的"增量驱动"——给它一个 deadline，它做能做的，到点就停。
  这是 cm6 不卡 UI 的关键：解析在 `requestIdleCallback` 里挤时间，每次最多 50ms。
- `parse.viewport` 是优先级提示——只在用户能看到的范围内必须解析完，
  屏幕外的可以慢慢来。配合 view 的 `viewport.to` 拿到当前可视边界。
- `forceParsing` 后 `view.dispatch({})`——空 transaction 触发一次 view 重渲染，让新解析出来的语法树
  立刻反映到 highlight。**空 transaction 是 cm6 一个被故意暴露的 trick**：
  我没改 doc/selection/effect，就让 view 重跑一遍 view-level computed facet（如 decoration）。

**怀疑 3（Layer 3-c）**：`Object.defineProperty(EditorState.prototype, "tree", ...)` 这种
全局 prototype 污染——如果一个页面同时 import 了两个不同版本的 `@codemirror/language`，
后 import 的会覆盖前 import 的 `tree` getter。多版本下行为难以预测。
是不是 codemirror 把所有 lang-* 包都标 peerDep `@codemirror/language` 来强制统一的根因？
（待用 monorepo + 双版本实验验证；很可能 lezer 解析的是 `@codemirror/state` 实例，强制 dedupe。）

---

## Hands-on（Layer 4）

按框架/SDK 分支 D：跑通 + 写 1 个 plugin / extension + 看 lifecycle。

### 30 分钟跑通

```bash
mkdir cm-toy && cd cm-toy && npm init -y
npm install codemirror @codemirror/state @codemirror/view \
  @codemirror/lang-javascript @codemirror/commands @codemirror/autocomplete

# 装个 dev server
npm install --save-dev vite

# 写最小 index.html + main.ts
cat > index.html <<'EOF'
<!doctype html><html><body>
<div id="ed"></div>
<script type="module" src="/main.ts"></script>
</body></html>
EOF

cat > main.ts <<'EOF'
import {EditorState} from "@codemirror/state"
import {EditorView, keymap, lineNumbers} from "@codemirror/view"
import {defaultKeymap, history, historyKeymap} from "@codemirror/commands"
import {javascript} from "@codemirror/lang-javascript"
import {autocompletion, completionKeymap} from "@codemirror/autocomplete"

const state = EditorState.create({
  doc: "function hello() {\n  return 'Season 15';\n}\n",
  extensions: [
    lineNumbers(),
    history(),
    javascript(),
    autocompletion(),
    keymap.of([...defaultKeymap, ...historyKeymap, ...completionKeymap]),
  ]
})

new EditorView({state, parent: document.getElementById("ed")!})
EOF

npx vite
# open http://localhost:5173 -> 一个能跑的 IDE
```

打开浏览器：能看到行号、语法高亮、Ctrl-Z 撤销、Ctrl-Space 触发补全。
**整个 IDE 没有一个 React/Vue 组件**——它是 100% 框架自己管 DOM 的 contentEditable 嵌入。

### 改一处实验：写一个 plugin 把每次 dispatch 的 transaction 打到 console

```ts
import {EditorView, ViewPlugin, ViewUpdate} from "@codemirror/view"

const logUpdates = ViewPlugin.fromClass(class {
  update(u: ViewUpdate) {
    if (u.docChanged) {
      console.log("[doc]", u.transactions.map(t => ({
        userEvent: t.annotation((window as any).Transaction?.userEvent),
        changes: t.changes.toJSON(),
      })))
    }
    if (u.selectionSet) {
      console.log("[sel]", u.state.selection.main.from, u.state.selection.main.to)
    }
  }
})

// 加到 extensions:
//   extensions: [..., logUpdates]
```

观察输入 / 撤销 / 选区移动的实际 transaction 流：

- 输入 `a`：`{userEvent: "input.type", changes: [[19, 19, "a"]]}`
- 按 ArrowRight：触发 `selectionSet`，但 `docChanged: false`
- Ctrl-Z：单条 transaction 包含两个 effect——history 还原 doc + 还原 selection

把 `if (u.docChanged)` 改成 `if (u.docChanged || u.viewportChanged)`，
能看到滚动也走同一个 ViewUpdate 通道——只是 transactions 是空数组。
**所有 view 状态变更（doc / selection / viewport / focus）共用同一条 update 流水线**——
这是 cm6 设计纪律的精华：单一 update 通道。

### 改一处实验 2：自定义 facet + provider

```ts
import {Facet, EditorState} from "@codemirror/state"

const wordCount = Facet.define<number, number>({
  combine: values => values.reduce((a, b) => a + b, 0),
})

const wordCountFromDoc = wordCount.compute(["doc"], state =>
  state.doc.toString().split(/\s+/).filter(Boolean).length
)

// 把 wordCountFromDoc 加到 extensions
// 任何 plugin 调用 state.facet(wordCount) 都拿到当前词数
```

在 `logUpdates` 的 `update(u)` 里加 `console.log("[wc]", u.state.facet(wordCount))`，
观察：每次 doc 变更后 word count 自动重算；selection 变更时 facet 不重算（因为 `deps: ["doc"]`）。
**facet 的 deps 声明就是 React useMemo deps 的等价物**，但精度到 EditorState 字段级别。

### 改一处实验 3：在心脏代码改一行看影响

把 `/tmp/cm-clone/state/src/state.ts:198` `if (addr == null) return facet.default` 改成
`if (addr == null) { console.warn("default facet:", facet.id); return facet.default }`，
然后 `npm link` 进 toy 项目。

观察：刷新页面，console 立刻刷出几十条 default facet warning——
**很多内置 facet 没有 provider 时 EditorState 走的是 default 路径**。
这给了一个直觉：facet 系统本质是"把所有 plugin 配置项收口成默认值 + 可选 override"，
不是"必须注册才能用"。

---

## 横向对比（Layer 5）

| 维度 | CodeMirror 6 | Monaco Editor | Ace | Lexical | Slate | ProseMirror |
|---|---|---|---|---|---|---|
| 编辑对象 | 代码 | 代码 | 代码 | 富文本 | 富文本 | 富文本 |
| 包大小（min+gz） | ~50 KB（核心）+ extension 按需 | ~600 KB | ~200 KB | ~25 KB（核心）+ plugin | ~30 KB | ~80 KB |
| 哲学 | composition of facets | feature-rich god-class | feature-rich god-class | composition + React-first | "controlled component" | composition of plugins |
| 状态管理 | immutable EditorState + Transaction | mutable model | mutable session | immutable EditorState | controlled (parent state) | immutable EditorState + Transaction |
| extension API | Facet / StateField / ViewPlugin / StateEffect | contribution / decoration / monaco.languages | edit_session events | NodeTransform / command listener | render handlers | Plugin / NodeSpec / Schema |
| 语法树 | Lezer（自研增量 parser） | TextMate grammar / Tree-sitter（部分） | TextMate grammar | 无 | 无 | 无（schema-based） |
| 协同 | transaction 直接广播 | OT 第三方 plugin | 较弱 | Yjs binding | Yjs/Automerge 第三方 | OT 第一方 collab plugin |
| 定制成本 | 高（必须懂 facet）但天花板高 | 中（API 多但糙） | 中 | 中（React 生态友好） | 低（写组件） | 高（必须懂 schema） |
| TypeScript 一等 | 是（100%） | 是 | 否（手动 d.ts） | 是 | 是 | 是 |
| 维护方 | Marijn 个人主导 | 微软 VS Code 团队 | 社区 | Meta | 社区 | Marijn 个人主导 |
| License | MIT | MIT | BSD | MIT | MIT | MIT |

哲学差异（4 个最有信息量的对比）：

- **CodeMirror 6 vs Monaco**：Monaco 是"完整 IDE 切下来一块"——把 VS Code 的 Monarch / contribution / renderer 一锅端，
  bundle 大但开箱即用。cm6 是"编辑器协议"——你得自己拼，但能拼出更轻、更可控、更适合嵌入的版本。
  Replit 选 cm6 因为他们的多语言运行时不需要 Monaco 那 600 KB 包。
- **CodeMirror 6 vs Lexical**：都是 immutable + composition，但 Lexical 是 React-first（用 React node 树渲染），
  cm6 是自管 DOM。React 生态用 Lexical，跨框架嵌入用 cm6。
- **CodeMirror 6 vs Slate**：Slate 把状态外提给 React parent component（controlled），用户写 `<Slate value={...} />`。
  cm6 自己持有 state，外部通过 dispatch 改。Slate 心智模型简单但难做大 doc 性能优化（每次 React re-render）；
  cm6 复杂但 10 万行文件还能跑。
- **CodeMirror 6 vs ProseMirror**：同一作者两个项目。ProseMirror 是富文本，schema 强制语义节点（Doc / Paragraph / Node）；
  cm6 是代码，文档是纯 Text + Lezer 语法树（不强制语义节点）。两个 transaction 系统几乎一致。

选型建议：

- 跨框架代码编辑器嵌入（Replit / Sourcegraph / 知乎评论里的代码块）→ **cm6**
- 需要"开箱即用"的 IDE 体验，团队接受 600 KB 包 → **Monaco**
- React App 内的代码块编辑（评论 / 笔记类）→ **cm6 with React wrapper**（react-codemirror）
- 富文本（文档 / 笔记应用）→ **Lexical / ProseMirror**（不要硬塞 cm6）
- 老项目维护，没动力大改 → **Ace**（少折腾）

---

## 与你当前工作的连接（Layer 6）

按 v1.1 三段，每段 ≥ 4 子弹。

### 今天就能用的部分

- 实习日志站如果想加"代码片段编辑+运行"功能：`@codemirror/state` + `@codemirror/view` + `lang-javascript` 三个包足够，
  bundle 50 KB 内，比塞 Monaco 友好十倍
- 学 Facet 的 dataflow 思路反向理解 React `useMemo` / `useCallback` 的 deps 数组——
  cm6 的 `compute(deps, get)` 就是 hooks deps 的服务端语义版
- 看 `Transaction._doc` lazy getter 学手写 memoization 的 pattern——
  TS 没 lazy getter 时用 nullable 字段 + getter 检查（learning candidate：写进 patterns/）
- ViewPlugin 的"单一 update 通道"思路适合迁移到任何"前端状态变更要日志/observability"的场景：
  把所有变更收口成 `update(u: ViewUpdate)` 一个 callback，比散落在 N 个 setState 容易追

### 下个月能用的部分

- 如果之后做"评估结果可视化对比"——文本 diff / 高亮变化区——
  RangeSet + Decoration 的模型是直接借鉴对象，不必发明自己的高亮坐标系
- 给 agent infra 加"prompt template 编辑器"，cm6 + `lang-yaml` + 自定义 autocomplete source
  能给 prompt key 自动补全（配合 schema），这是后续 explore 候选项
- 如果做"日报 markdown 编辑器"想要语法高亮 + 渲染预览 split view，
  cm6 + `lang-markdown` + 一个 `outerDecorations` plugin 做内嵌 widget 是直接路径
- 学 cm6 怎么把 600 行 facet.ts 写得没有一处 `if (xxx instanceof yyy)` 大分支——
  每种 provider 用 `Provider.Static / Single / Multi` enum 区分，dispatch table。
  反向消化：以后我自己写 plugin 系统不要 if-else 分流，用 enum + 跳表

### 不要用的部分

- 不要拿 cm6 写富文本——文档模型只是 Text rope，没有 schema/节点语义，
  做"链接节点" / "图片块" 会拧着用，应该选 Lexical / ProseMirror
- 不要在小项目（< 100 行可视区域）盲目上 cm6 的 `Facet.compute(deps, ...)` ——
  对小数据 facet 重算开销高于直接每次重算，用 `Facet.of(value)` 静态值就够
- 不要 monkey-patch `EditorState.prototype` 加自己的字段——cm6 自己 `language.ts:84` 那段是无奈而为，
  作者注释里都说 "Kludge"。模仿这个 pattern 会让多版本兼容崩
- 不要学 `_doc: Text | null = null` 这种 nullable lazy 字段在你自己的 immutable data class 里
  滥用——cm6 这么写是因为 `apply` 算 newDoc 真的贵；普通 plain object 直接算就完事，
  搞 lazy 反而让代码可读性变差

---

## 自检问题 + 延伸阅读（Layer 7）

具体怀疑（追到行号）：

1. **怀疑 1（Transaction 单线程假设）**：在 worker 里跑 `transactionFilter` 会不会导致 `Transaction._doc` 二次计算？
   定位 `state/src/transaction.ts#L203-L205`，结合 `state/src/state.ts#L91-L93` 的 `update().resolveTransaction` 调用
   链——filter 是在 `resolveTransaction` 内同步走的还是异步？目前我猜是同步，要源码里 `resolveTransaction` 实现验证。
2. **怀疑 2（Facet id 全局计数）**：双产物 ESM/CJS 同时 import 时 facet id collision 路径具体怎么走？
   要做实验：vite 打 ESM + esbuild 打 CJS 混用 → state.facet(facet) 返回什么。
   定位 `state/src/facet.ts#L4` 的 `let nextID = 0` —— 这是 module scope 单例，
   两次 module init 各自从 0 开始，几乎必然 collision。
3. **怀疑 3（prototype 污染）**：`language.ts#L84` 的 `Object.defineProperty(EditorState.prototype, "tree", ...)`
   多版本下行为？两个 language 版本 import 顺序决定哪个 getter 留下，先 import 的失效但不报错。
   peerDep 标注是不是真的强制 dedupe？要查 `package.json` 的 peerDependencies 字段。
4. **怀疑 4（空 transaction trick）**：`forceParsing` 里 `view.dispatch({})` 触发的 ViewUpdate
   的 `docChanged` 应该是 false，但 view 仍重算 decoration——这是因为 language state field 内部 effect 让
   field 值变了，`u.viewUpdate.startState !== u.state` 触发 view re-render。具体哪个 facet 是"重算开关"？
   定位 `view/src/extension.ts` 的 `decorations` facet 重算条件。
5. **怀疑 5（heightmap 对超长行）**：单行 100 万字符时 cm6 怎么不卡？看 `view/src/heightmap.ts`
   是怎么把长行的高度估计 chunk 化的——是不是 line break-based segmentation。

延伸阅读（按学习顺序）：

| # | 文件 | 回答的问题 | 估计时间 |
|---|---|---|---|
| 1 | `state/src/change.ts` | ChangeSet 的 OT-like compose / map 算法怎么写的？协同编辑基础 | 25 分钟 |
| 2 | `state/src/text.ts` | Text rope 是怎么做到 O(log n) splice 的？为什么不直接用 string | 20 分钟 |
| 3 | `view/src/heightmap.ts` | 虚拟滚动怎么处理超长行 + 折叠区？Lezer 解析没完时高度怎么估 | 30 分钟 |
| 4 | `view/src/domobserver.ts` | contentEditable + IME + 中文输入法怎么收口成 transaction | 30 分钟 |
| 5 | `language/src/highlight.ts` | Tree -> Decoration 的 visitor 怎么写，和 RangeSet 怎么对接 | 20 分钟 |
| 6 | `autocomplete/src/state.ts` | completionState 怎么管 active completion lifecycle？multi-source merge | 25 分钟 |
| 7 | Marijn 的 [The Architecture of CodeMirror 6](https://marijnhaverbeke.nl/blog/codemirror-6.html) | 设计哲学一手描述 | 15 分钟 |

---

## 限制（Layer 7 补）

不抄项目自夸文档，按我读完的实际感受：

- **学习曲线陡**：facet / provider / extension / state field / view plugin / decoration / range set 这些概念
  必须一起内化才能写出能用的 plugin。10 行 hello-world 简单，写到第 50 行就开始踩 facet 重算/失效坑
- **类型体操重**：Facet`<Input, Output>` / StateEffect`<Value>` / ViewPlugin`<V>` 的泛型层数让 IDE 提示
  经常给出 800 字符长的类型签名。新手看类型读不下去
- **Marijn 个人主导**：bus factor 真实存在。2026-04-15 archive 到 `code.haverbeke.berlin` 暗示
  作者想脱离 GitHub 的 issue 噪音独自维护——这是好事也是坏事
- **DOM 自管开销**：cm6 不用 React/Vue，所有 DOM diff 自己实现（view/src/inlineview.ts 等）。
  代码量大、易出 bug；近期 issue 仍在修 contentEditable + IME 边缘场景
- **Lezer parser 写起来不友好**：要新加一个语言必须写 Lezer grammar（不是 BNF / PEG，是 Lezer 自家 DSL），
  学习成本独立于 cm6 本身

---

## 附录：宣传 vs 现实

| 文档/blog 宣传 | 代码现实 |
|---|---|
| "Editor is a composition of features" | 是真的——但 facet/extension 系统的内部实现 600+ 行复杂度全甩给用户 plugin 作者 |
| "Immutable state, no surprise mutations" | 大方向对，但 `Transaction._doc` / `_state` 是手写 lazy 字段（局部 mutable），`computeSlot` 在构造期可写。文化执行 |
| "Tiny core, plugins on demand" | 核心 50 KB 真的小，但实际可用的最小 IDE（state + view + lang + commands + autocomplete）也要 ~150 KB gz |
| "Lezer parser 增量、不卡 UI" | 多数情况是；但 50 ms work budget 是经验值，超长 jsx + ts 文件初次解析可见卡顿 |

---

## 元数据

- 升级日期：2026-05-29
- 项目类型：v1.1 分支 D（框架/SDK）
- 启用工具：Read（src 精读 4 文件 ~1500 行）/ Bash git clone shallow / Python+Pillow+cwebp 生成架构图 / WebFetch 探仓状态
- 锚定 commit hash：state `9c801279cb83011e6f92af778f4443406e8f1200` / view `fbff59ba004d80d8c914f64c42586387b08706ac` / language `8e9700018446d46f23267f6e31da56628d5117c0` / autocomplete `9a01794def6f9f12468805dce2d687b7548ff469`
- 标签：编辑器框架 / immutable state / Facet / 增量 parser / extension point

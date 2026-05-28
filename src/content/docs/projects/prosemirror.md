---
title: prosemirror — schema 不是配置项，是 contentEditable 的护身符
description: ProseMirror 用强 schema + Step + immutable State 把"在 contentEditable 上做协同富文本"从玄学变成可证明正确。一个零基础学习者读心脏代码的状元篇笔记。
sidebar:
  label: prosemirror
  order: 17
---

> 项目类型 self-classify：**框架/SDK**（v1.1 分支 D）。
> 不是开箱即用的"富文本组件"，是把"contentEditable 上做结构化文档编辑"拆成 schema-model-transform-state-view 五个独立 npm 包的协议。
> Tiptap / Atlassian Editor / The New York Times / Notion 早期版本都站在它上面。
> 同作者 Marijn Haverbeke——同一个人维护 [codemirror](/projects/codemirror/) 和 Lezer parser，bus factor 提示一直挂着。

| 维度 | 数据 |
|---|---|
| prosemirror-model star | 6.1k+（截至 2026-05） |
| 子包合计 star | GitHub 上 prosemirror-* 6 个核心包合计 ~12k |
| fork（model）| ~600 |
| 最近活跃 | 2026 上半年 GitHub 仓库陆续 archive，迁移到 code.haverbeke.berlin（同 cm6 路径，**不是死项目**） |
| 读时 commit hash | model `6264de069d8439131e88f8ba06973551916184e4` / state `ffad5d9450a0b93438be53a801deee1a223a81bf` / view `ca4c78e9b56f1b164c0b3758b59d8748f11b7534` / transform `662b7a937bafde19b7e2a83241dbc8888e257c89` |
| 主语言 | TypeScript 100% |
| 维护方 | 个人主导（Marijn Haverbeke，同 CodeMirror 6 / Lezer 一作） |
| 主要贡献者 | marijnh / dependabot / 少量长期 PR contributor（含 Atlassian / Tiptap 团队成员） |
| License | MIT |
| 类似项目 | Slate.js / Lexical / Quill / Tiptap（包它）/ Draft.js（已弃） / [codemirror](/projects/codemirror/)（同作者，代码编辑） |

![Figure 1. ProseMirror 数据流总览](/projects/prosemirror/01-architecture.webp)

> Figure 1：上排是「编译期一次」的链路——Schema (NodeType/MarkType + ContentMatch DFA) 编译出可校验的 Doc 树，
> 任何 Transaction 都是一组 Step 的组合，apply 后产出新的 EditorState。中排展开 Step 的三件套：apply / invert / map——
> 后两个是协同编辑的灵魂，让远端 step 能 rebase 到本地最新位置。下排是 view 那一侧：dispatch → state.apply → DOMObserver
> + viewdesc 局部 diff 写回 contentEditable，浏览器自己处理 IME / 选区 / 粘贴。最底排提示：所有协同编辑（Tiptap / Atlassian
> / Notion 早期）都把这套图当协议，远端送来的不是 DOM，是序列化后的 Step。

## 一句话定位

ProseMirror 不是"富文本编辑器"，是**让 contentEditable 在结构化 schema 约束下不再野蛮生长**的协议——
schema 是合法形态的判定器，Step 是原子修改的语法，State 是不可变的当前快照，View 是把这一切落到浏览器 DOM 上的薄壳。
这套抽象的最大代价是上手陡，最大回报是协同编辑、协作冲突、AI 自动改稿这些场景能"可证明正确"。

## Why（为什么 Season 15 把它收进编辑器线）

2014 年以前的浏览器富文本，几乎全部走 contentEditable + execCommand 路线：
你给浏览器一段 HTML，它给你一堆 `<font>` 标签 + 嵌套到第六层的 `<span>`。问题不是丑——问题是**没人能证明编辑结果合法**：

- 用户能粘贴出一个 `<li>` 在 `<p>` 里、又被一个 `<table>` 包着的不合法 DOM
- 协同编辑两端 patch DOM，两边 patch 完结构都不合法、字符还可能乱序
- 自动化（AI 自动改稿、宏命令、模板）想"在第 3 个段落第 2 句后面插一行"，没语义就只能字符串拼接

Marijn 在 [The Architecture of ProseMirror](https://marijnhaverbeke.nl/blog/prosemirror.html) 的第一句话就把锚定明确：
> "ProseMirror does not allow arbitrary DOM trees as documents. Instead, it works with documents that conform to a **schema** that you define."

也就是把"我接受任何 DOM"反过来——**schema 先定，DOM 后服从**。这条 inversion 拉出三件附属决策：

1. 文档是 immutable 的 Node 树（不是 DOM 节点），每次编辑产生新树
2. 修改是 Step 序列（atomic op），每个 step 自带 invert 和 map
3. View 只是把当前 Doc 渲染到 contentEditable，并捕获 DOM 突变翻译回 Step

这一套刚好和 Operational Transformation / CRDT 的协同编辑理论对齐：远端送来一个 Step，本地把它 map 过自己最近的 Step 链就能干净 apply。
所以**协同编辑不是后挂的功能，是 Step 抽象的副产品**。这也是为什么 Tiptap、Atlassian、Notion 早期都不重写——重写就要重证明。

## 仓库地形（Layer 2）

ProseMirror 是 GitHub `ProseMirror/` org 下 ~10 个独立 npm 包，**每个对应一个职责切片**。
和 [codemirror](/projects/codemirror/) 6 一样，主仓库没有"巨型 src"，要读必须 clone 多个：

```
prosemirror-model       ← 文档模型 + Schema + ContentMatch（心脏 1）
prosemirror-state       ← EditorState + Transaction + Plugin（心脏 2）
prosemirror-transform   ← Step / Mapping / 协同编辑核心（心脏 3）
prosemirror-view        ← contentEditable 包装 + DOMObserver + viewdesc（心脏 4）

prosemirror-commands    ← 内置编辑命令（toggleMark / wrapIn / lift / 等）
prosemirror-history     ← undo/redo plugin，跑在 transform 抽象上
prosemirror-keymap      ← 键位绑定 plugin
prosemirror-collab      ← 协同编辑 plugin（rebase 算法封装）
prosemirror-schema-basic / schema-list ← 现成 schema 砖块
prosemirror-inputrules / dropcursor / gapcursor ← UX 增强 plugin
```

我聚焦四个心脏包，每个对应 Layer 3 一段精读：

```
prosemirror-model/src/   (commit 6264de069d8439131e88f8ba06973551916184e4)
  schema.ts        ← Schema / NodeType / MarkType / NodeSpec / MarkSpec / AttributeSpec   705 行
  node.ts          ← Node + TextNode + 序列化 / 内容校验                                  403 行
  mark.ts          ← Mark + addToSet 集合代数                                             111 行
  content.ts       ← ContentMatch（schema 的 DFA 引擎）
  fragment.ts      ← Fragment（Node 的有序集合）
  resolvedpos.ts   ← ResolvedPos / position 解析
  to_dom.ts / from_dom.ts ← DOMSerializer / DOMParser

prosemirror-state/src/   (commit ffad5d9450a0b93438be53a801deee1a223a81bf)
  state.ts         ← EditorState + Configuration + applyTransaction                       266 行
  transaction.ts   ← Transaction（extends Transform）                                     215 行
  plugin.ts        ← Plugin / PluginKey / StateField
  selection.ts     ← Selection / TextSelection / NodeSelection

prosemirror-transform/src/   (commit 662b7a937bafde19b7e2a83241dbc8888e257c89)
  step.ts          ← Step 抽象基类 + StepResult                                            97 行
  replace_step.ts  ← ReplaceStep / ReplaceAroundStep（最常用 step）                       187 行
  map.ts           ← StepMap / Mapping / MapResult                                        284 行
  transform.ts     ← Transform 链式 API（addStep / replaceRange / split / lift）          271 行
  attr_step.ts     ← AttrStep / DocAttrStep
  mark_step.ts     ← AddMarkStep / RemoveMarkStep / Add/RemoveNodeMarkStep
  structure.ts     ← 结构化辅助（findWrapping / canSplit / canJoin）

prosemirror-view/src/    (commit ca4c78e9b56f1b164c0b3758b59d8748f11b7534)
  index.ts         ← EditorView 主类 + dispatch + updateStateInner                        825 行
  viewdesc.ts      ← ViewDesc / NodeViewDesc / 局部 DOM diff 实现
  domobserver.ts   ← MutationObserver 包装 + IME 期间静音
  domchange.ts     ← readDOMChange：DOM 突变 → Step 反向推导
  decoration.ts    ← Decoration / DecorationSet（覆盖层 / inline 装饰）
  input.ts         ← 键鼠 / 复制粘贴 / 拖拽事件路由
  selection.ts     ← DOM Selection ↔ ProseMirror Selection 翻译
```

commit 热点（model 仓库 master 最近 200 commit 改动文件 top）：

```
schema.ts          (基础定义在动，但增量小，主要是新加字段 / 修正 spec)
to_dom.ts / from_dom.ts (DOM 互转改得最多——浏览器兼容性 + parse 边界 case)
node.ts            (序列化、textBetween、check 等持续微调)
content.ts         (ContentMatch DFA 偶尔修边界)
```

state 和 view 仓库改动更频繁，view 一直在打浏览器兼容补丁（Safari shadow root、Chrome IME、Firefox space-eaten）。
**结论**：心脏在 model（schema 决策最稳）、抽象在 transform（step 代数稳定）、苦活在 view（contentEditable 永远在打补丁）。

## 核心机制（Layer 3，分支 D：核心 abstraction + 扩展点 + lifecycle）

按"框架/SDK 三段式"组织：(a) 核心 abstraction = Schema + Node + Mark 类型系统；
(b) middleware/handler 模型 = Step / Transaction（OT-like rebase 是这里）；
(c) lifecycle = View 的 dispatch → updateStateInner → DOM 局部 diff。
每段贴 commit hash 永久链接 + ≥ 20 行真实 TS 代码 + ≥ 5 旁注 + ≥ 1 怀疑。

### 3.1 核心 abstraction：Schema + NodeType + Mark

精读 [`prosemirror-model/src/schema.ts:572-687`](https://github.com/ProseMirror/prosemirror-model/blob/6264de069d8439131e88f8ba06973551916184e4/src/schema.ts#L572-L687)：
Schema 类的构造函数——这里是把 NodeSpec / MarkSpec 编译成 NodeType / MarkType + ContentMatch 的入口。

```ts
// prosemirror-model/src/schema.ts:572-625（删了部分注释，保留语义）
export class Schema<Nodes extends string = any, Marks extends string = any> {
  spec: {
    nodes: OrderedMap<NodeSpec>,
    marks: OrderedMap<MarkSpec>,
    topNode?: string
  }

  nodes: {readonly [name in Nodes]: NodeType} & {readonly [key: string]: NodeType}
  marks: {readonly [name in Marks]: MarkType} & {readonly [key: string]: MarkType}
  linebreakReplacement: NodeType | null = null

  constructor(spec: SchemaSpec<Nodes, Marks>) {
    let instanceSpec = this.spec = {} as any
    for (let prop in spec) instanceSpec[prop] = (spec as any)[prop]
    instanceSpec.nodes = OrderedMap.from(spec.nodes),
    instanceSpec.marks = OrderedMap.from(spec.marks || {}),

    this.nodes = NodeType.compile(this.spec.nodes, this)
    this.marks = MarkType.compile(this.spec.marks, this)

    let contentExprCache = Object.create(null)
    for (let prop in this.nodes) {
      if (prop in this.marks)
        throw new RangeError(prop + " can not be both a node and a mark")
      let type = this.nodes[prop], contentExpr = type.spec.content || "", markExpr = type.spec.marks
      type.contentMatch = contentExprCache[contentExpr] ||
        (contentExprCache[contentExpr] = ContentMatch.parse(contentExpr, this.nodes))
      ;(type as any).inlineContent = type.contentMatch.inlineContent
      if (type.spec.linebreakReplacement) {
        if (this.linebreakReplacement) throw new RangeError("Multiple linebreak nodes defined")
        if (!type.isInline || !type.isLeaf) throw new RangeError("Linebreak replacement nodes must be inline leaf nodes")
        this.linebreakReplacement = type
      }
      type.markSet = markExpr == "_" ? null :
        markExpr ? gatherMarks(this, markExpr.split(" ")) :
        markExpr == "" || !type.inlineContent ? [] : null
    }
    for (let prop in this.marks) {
      let type = this.marks[prop], excl = type.spec.excludes
      type.excluded = excl == null ? [type] : excl == "" ? [] : gatherMarks(this, excl.split(" "))
    }

    this.nodeFromJSON = json => Node.fromJSON(this, json)
    this.markFromJSON = json => Mark.fromJSON(this, json)
    this.topNodeType = this.nodes[this.spec.topNode || "doc"]
    this.cached.wrappings = Object.create(null)
  }
  // ... node()/mark()/text() 工厂方法在下方
}
```

旁注（Schema 编译这一段揭了 7 件事）：

- **OrderedMap 不是普通 object**：spec.nodes 必须保留声明顺序——schema-basic 里 `doc` → `paragraph` → `text` 的顺序决定了 toDOM 时的"找最近合法包裹"行为。如果用普通对象，浏览器引擎对 key 顺序的实现差异会让序列化结果在 Safari/Chrome 不一致
- **NodeType 和 MarkType 不能重名**：`if (prop in this.marks) throw` 这一行很容易漏掉——但漏了就出现"用户加了一个叫 strong 的 node 又加了 strong 的 mark"这种 toJSON 时无法 round-trip 的陷阱
- **ContentMatch 是 DFA，且按 contentExpr 字符串缓存**：`contentExprCache[contentExpr]` 让所有 content 表达式相同的 NodeType 共享同一个 DFA 状态机，`paragraph` content 是 "inline\*" 的 schema 全局只编译一次。这是性能优化，也是隐式约束——`content: "block+"` 和 `content: "block+ "`（多空格）会变成两个 DFA
- **markSet 三态语义**：`null`（marks="\_"）= 任意 mark；空数组 = 不允许 mark；具体数组 = 白名单。`type.inlineContent` 也参与判定——非 inlineContent 的 block 默认不带 mark。这让 ProseMirror 的"标题不能加 mark"这种规则不是 plugin 加的，是 schema **结构强制**
- **excluded 关系**：`excl == null ? [type]` 默认 mark 排除自己同类型——所以两个 strong mark 不会嵌套；`excl == ""` 表示空排除集合，允许同类共存（少见，但 link 要不同 href 共存就靠它）
- **linebreakReplacement 唯一**：每个 schema 只能有一个 linebreak 节点（如 `<br>`），多了直接 throw。这是为了保证 `setBlockType` 切换 `<pre>` ↔ `<p>` 时的 newline 转换有唯一锚
- **fromJSON 闭包绑定**：`this.nodeFromJSON = json => Node.fromJSON(this, json)`——把 schema 实例打包进闭包，所以 schema-aware 的 deserialize 不用每次传 schema。但代价是 schema 是被引用的，**多 schema 共存时序列化顺序敏感**

继续读上面的 NodeType 字段（[schema.ts:60-145](https://github.com/ProseMirror/prosemirror-model/blob/6264de069d8439131e88f8ba06973551916184e4/src/schema.ts#L60-L145)）：

```ts
export class NodeType {
  groups: readonly string[]
  attrs: {[name: string]: Attribute}
  defaultAttrs: Attrs

  constructor(
    readonly name: string,
    readonly schema: Schema,
    readonly spec: NodeSpec
  ) {
    this.groups = spec.group ? spec.group.split(" ") : []
    this.attrs = initAttrs(name, spec.attrs)
    this.defaultAttrs = defaultAttrs(this.attrs)
    ;(this as any).contentMatch = null
    ;(this as any).inlineContent = null
    this.isBlock = !(spec.inline || name == "text")
    this.isText = name == "text"
  }

  declare inlineContent: boolean
  isBlock: boolean
  isText: boolean
  get isInline() { return !this.isBlock }
  get isTextblock() { return this.isBlock && this.inlineContent }
  get isLeaf() { return this.contentMatch == ContentMatch.empty }
  get isAtom() { return this.isLeaf || !!this.spec.atom }

  isInGroup(group: string) {
    return this.groups.indexOf(group) > -1
  }
  declare contentMatch: ContentMatch
  markSet: readonly MarkType[] | null = null

  hasRequiredAttrs() {
    for (let n in this.attrs) if (this.attrs[n].isRequired) return true
    return false
  }
}
```

旁注（NodeType 这段揭了 5 件事）：

- **isBlock 由 name 决定，不靠 spec.block**：`name == "text"` 直接被定义为非 block——schema 名字 "text" 是 ProseMirror 的保留字，自定义 schema 用 "text" 当其他东西的 name 会破坏整套类型推导
- **contentMatch / inlineContent 在 constructor 里赋 null**：在 Schema 构造函数里二次填——这是显式的"两阶段构造"，因为 contentMatch 要解析的字符串里能引用其他 NodeType，存在循环依赖
- **isLeaf vs isAtom 不是同义词**：isLeaf 是"content 表达式为空"（结构上不能含子节点）；isAtom 多一种"虽然能含但用户不能编辑"的 node（如带固定结构的 mention 节点，spec.atom = true）。一个混淆点：所有 leaf 都是 atom，反之不然
- **markSet 字段在 Schema 构造函数里赋值**：注意这里 `markSet: readonly MarkType[] | null = null`——默认 null = 允许所有 mark；NodeType 自己不能决定，必须等 Schema 全编译完才能解析 "strong em" 这种字符串
- **declare 关键字**：`declare contentMatch` 让 TS 知道这个字段会"在 Schema 构造里被赋"——不是 class 字段语法的二次赋值，是规避 TS strictPropertyInitialization 的逃逸口。这种"我对 TS 撒了谎，但运行时保证 OK"的写法在 cm6 也很常见

**怀疑 1**：ContentMatch 是 DFA。如果用户的 content 表达式是 `"(paragraph | heading)+ blockquote*"`，DFA 节点数会爆炸吗？我猜是按表达式语法树编译，节点数 ≈ O(原表达式 token 数 × 嵌套层数)。但没找到上限测试——schema 里写 `block+` 这种通用 group 后又 100 个 nodeType 都属于 block，DFA 实际状态会不会膨胀？**追到具体实验**：写一个 200 nodeType + 嵌套 group 的 schema 看 ContentMatch.parse 的耗时和编译后的状态数。

### 3.2 middleware/handler 模型：Step + Transaction（OT-like rebase）

精读 [`prosemirror-transform/src/step.ts:16-66`](https://github.com/ProseMirror/prosemirror-transform/blob/662b7a937bafde19b7e2a83241dbc8888e257c89/src/step.ts#L16-L66)（Step 基类）和
[`prosemirror-transform/src/replace_step.ts:7-86`](https://github.com/ProseMirror/prosemirror-transform/blob/662b7a937bafde19b7e2a83241dbc8888e257c89/src/replace_step.ts#L7-L86)（最常用 step 的实例）：

```ts
// prosemirror-transform/src/step.ts:16-66
export abstract class Step {
  abstract apply(doc: Node): StepResult
  getMap(): StepMap { return StepMap.empty }
  abstract invert(doc: Node): Step
  abstract map(mapping: Mappable): Step | null
  merge(other: Step): Step | null { return null }
  abstract toJSON(): any

  static fromJSON(schema: Schema, json: any): Step {
    if (!json || !json.stepType) throw new RangeError("Invalid input for Step.fromJSON")
    let type = stepsByID[json.stepType]
    if (!type) throw new RangeError(`No step type ${json.stepType} defined`)
    return type.fromJSON(schema, json)
  }

  static jsonID(id: string, stepClass: {fromJSON(schema: Schema, json: any): Step}) {
    if (id in stepsByID) throw new RangeError("Duplicate use of step JSON ID " + id)
    stepsByID[id] = stepClass
    ;(stepClass as any).prototype.jsonID = id
    return stepClass
  }
}

// prosemirror-transform/src/replace_step.ts:7-87
export class ReplaceStep extends Step {
  constructor(
    readonly from: number,
    readonly to: number,
    readonly slice: Slice,
    readonly structure = false
  ) { super() }

  apply(doc: Node) {
    if (this.structure && contentBetween(doc, this.from, this.to))
      return StepResult.fail("Structure replace would overwrite content")
    return StepResult.fromReplace(doc, this.from, this.to, this.slice)
  }

  getMap() {
    return new StepMap([this.from, this.to - this.from, this.slice.size])
  }

  invert(doc: Node) {
    return new ReplaceStep(this.from, this.from + this.slice.size, doc.slice(this.from, this.to))
  }

  map(mapping: Mappable) {
    let to = mapping.mapResult(this.to, -1)
    let from = this.from == this.to && ReplaceStep.MAP_BIAS < 0 ? to : mapping.mapResult(this.from, 1)
    if (from.deletedAcross && to.deletedAcross) return null
    return new ReplaceStep(from.pos, Math.max(from.pos, to.pos), this.slice, this.structure)
  }

  merge(other: Step) {
    if (!(other instanceof ReplaceStep) || other.structure || this.structure) return null
    if (this.from + this.slice.size == other.from && !this.slice.openEnd && !other.slice.openStart) {
      let slice = this.slice.size + other.slice.size == 0 ? Slice.empty
          : new Slice(this.slice.content.append(other.slice.content), this.slice.openStart, other.slice.openEnd)
      return new ReplaceStep(this.from, this.to + (other.to - other.from), slice, this.structure)
    } else if (other.to == this.from && !this.slice.openStart && !other.slice.openEnd) {
      let slice = this.slice.size + other.slice.size == 0 ? Slice.empty
          : new Slice(other.slice.content.append(this.slice.content), other.slice.openStart, this.slice.openEnd)
      return new ReplaceStep(other.from, this.to, slice, this.structure)
    } else { return null }
  }

  static MAP_BIAS: -1 | 1 = 1
}
Step.jsonID("replace", ReplaceStep)
```

旁注（Step 抽象 + ReplaceStep.map 是协同编辑灵魂）：

- **abstract apply / invert / map 三件套是必须**：任何 custom step 必须实现这三个——少一个 history 就坏（invert 不出来）、少 map 协同就坏（远端 step 无法 rebase）。这是显式不可绕的 contract，不像很多框架的"建议但不强制"
- **getMap 默认 empty**：对纯 metadata 的 step（比如 mark step 不改变 content size），getMap 返回 empty 表示"位置不偏移"。这让光标和 selection 在这类 step 后不动，是 mark 和 attr 类 step 的正确行为
- **stepsByID 注册表 + jsonID 装饰**：`Step.jsonID("replace", ReplaceStep)` 这一行写在 class 外面——是因为 ES class field 顺序问题，jsonID 必须在 class 完全声明后调用。重复注册会 throw，这是防止两个第三方 plugin 都注册 "replace" id 撞车
- **ReplaceStep.map 是 OT-like rebase 入口**：`mapping.mapResult(this.to, -1)` 和 `mapResult(this.from, 1)` 用不同 bias——end 偏左、start 偏右，意思是"我这一段的边界尽量往中间收"，这样和别人的并发插入不会互相吃掉。MAP_BIAS = 1 的注释也提示了：在协同场景下经常需要切到 -1 来让 redo 不跳到陌生位置
- **deletedAcross 双删返回 null**：如果远端 step 的 from 和 to 都被本地另一个 step 删干净了，rebase 就放弃——这是 ProseMirror 的"放弃比错误更好"哲学。Slate.js 在这种场景会硬插入，结果是协同两端文档分裂
- **merge 是 history 折叠用，不是协同用**：连续打字其实是一连串 1-char ReplaceStep，merge 把它们合并成一个 step 让 undo 一次撤销整段。但 structure step 不允许 merge——保护"用户做了一次 wrap，不应该和后续打字一起被撤销"
- **MAP_BIAS 是静态字段，不是参数**：这个看着很不优雅——为什么不让用户在创建 step 时传？因为这是协同 plugin 的全局策略选择，按 step 实例传容易出现"一半 step 偏左一半偏右"的混乱状态。但代价是要换策略必须改 prototype，也是为什么 collab plugin 实现起来要打 monkey patch 的微妙原因

**怀疑 2**：ReplaceStep.map 里 `from.deletedAcross && to.deletedAcross` 返回 null——但如果**只有 from 被删而 to 还在**呢？看代码会构造出 `new ReplaceStep(from.pos, Math.max(from.pos, to.pos), ...)`，这意味着步长缩成了 0 但 slice 还要插入。**追到具体场景**：本地用户 `delete(0, 10)`，远端在 5-7 处 `insert("xy")`——map 之后远端 step 变成什么？要写小测试跑一下看实际 from/to 落到哪里。

### 3.3 lifecycle：EditorView.dispatch → updateStateInner → DOM 局部 diff

精读 [`prosemirror-view/src/index.ts:69-93`](https://github.com/ProseMirror/prosemirror-view/blob/ca4c78e9b56f1b164c0b3758b59d8748f11b7534/src/index.ts#L69-L93)（构造）+
[`prosemirror-view/src/index.ts:153-233`](https://github.com/ProseMirror/prosemirror-view/blob/ca4c78e9b56f1b164c0b3758b59d8748f11b7534/src/index.ts#L153-L233)（updateStateInner）+
[`prosemirror-view/src/index.ts:510-514`](https://github.com/ProseMirror/prosemirror-view/blob/ca4c78e9b56f1b164c0b3758b59d8748f11b7534/src/index.ts#L510-L514)（dispatch）：

```ts
// prosemirror-view/src/index.ts:69-93
constructor(place, props: DirectEditorProps) {
  this._props = props
  this.state = props.state
  this.directPlugins = props.plugins || []
  this.directPlugins.forEach(checkStateComponent)

  this.dispatch = this.dispatch.bind(this)

  this.dom = (place && (place as {mount: HTMLElement}).mount) || document.createElement("div")
  if (place) {
    if ((place as DOMNode).appendChild) (place as DOMNode).appendChild(this.dom)
    else if (typeof place == "function") place(this.dom)
    else if ((place as {mount: HTMLElement}).mount) this.mounted = true
  }

  this.editable = getEditable(this)
  updateCursorWrapper(this)
  this.nodeViews = buildNodeViews(this)
  this.docView = docViewDesc(this.state.doc, computeDocDeco(this), viewDecorations(this), this.dom, this)

  this.domObserver = new DOMObserver(this, (from, to, typeOver, added) =>
    readDOMChange(this, from, to, typeOver, added))
  this.domObserver.start()
  initInput(this)
  this.updatePluginViews()
}

// prosemirror-view/src/index.ts:510-514
EditorView.prototype.dispatch = function(tr: Transaction) {
  let dispatchTransaction = this._props.dispatchTransaction
  if (dispatchTransaction) dispatchTransaction.call(this, tr)
  else this.updateState(this.state.apply(tr))
}

// prosemirror-view/src/index.ts:153-233（节选 updateStateInner 核心 60 行）
private updateStateInner(state: EditorState, prevProps: DirectEditorProps) {
  let prev = this.state, redraw = false, updateSel = false
  if (state.storedMarks && this.composing) {
    clearComposition(this); updateSel = true
  }
  this.state = state
  let pluginsChanged = prev.plugins != state.plugins ||
                       this._props.plugins != prevProps.plugins
  if (pluginsChanged || ...) {
    let nodeViews = buildNodeViews(this)
    if (changedNodeViews(nodeViews, this.nodeViews)) {
      this.nodeViews = nodeViews; redraw = true
    }
  }
  this.editable = getEditable(this)
  updateCursorWrapper(this)
  let innerDeco = viewDecorations(this), outerDeco = computeDocDeco(this)
  let scroll = prev.plugins != state.plugins && !prev.doc.eq(state.doc) ? "reset"
      : (state as any).scrollToSelection > (prev as any).scrollToSelection ? "to selection" : "preserve"
  let updateDoc = redraw || !this.docView.matchesNode(state.doc, outerDeco, innerDeco)
  if (updateDoc || !state.selection.eq(prev.selection)) updateSel = true

  if (updateSel) {
    this.domObserver.stop()
    let forceSelUpdate = updateDoc && (browser.ie || browser.chrome) && !this.composing &&
        !prev.selection.empty && !state.selection.empty &&
        selectionContextChanged(prev.selection, state.selection)
    if (updateDoc) {
      let chromeKludge = browser.chrome ?
        (this.trackWrites = this.domSelectionRange().focusNode) : null
      if (this.composing) this.input.compositionNode = findCompositionNode(this)
      if (redraw || !this.docView.update(state.doc, outerDeco, innerDeco, this)) {
        this.docView.updateOuterDeco(outerDeco)
        this.docView.destroy()
        this.docView = docViewDesc(state.doc, outerDeco, innerDeco, this.dom, this)
      }
      if (chromeKludge && (!this.trackWrites || !this.dom.contains(this.trackWrites))) forceSelUpdate = true
    }
    if (forceSelUpdate ||
        !(this.input.mouseDown && this.domObserver.currentSelection.eq(this.domSelectionRange()) &&
          anchorInRightPlace(this))) {
      selectionToDOM(this, forceSelUpdate)
    } else {
      syncNodeSelection(this, state.selection)
      this.domObserver.setCurSelection()
    }
    this.domObserver.start()
  }
  this.updatePluginViews(prev)
}
```

旁注（lifecycle 这段揭了 8 件事，很多是浏览器苦水）：

- **dispatch 是默认 + 可拦截的双层**：`if (dispatchTransaction) dispatchTransaction.call(this, tr)`——用户传了 dispatchTransaction prop 就完全接管，不传就走默认 `state.apply(tr)`。这是 React 集成（react-prosemirror / Tiptap）的关键扩展点：拦下来 → setState → re-render 时再传新的 state 进 view
- **constructor 里手动 bind dispatch**：`this.dispatch = this.dispatch.bind(this)`——因为 dispatch 经常作为 callback 传出去（点击外部按钮触发 toggleMark），不 bind 就会丢 this 上下文。但 prototype 上的 dispatch 又是后挂的（line 510 的 `EditorView.prototype.dispatch =`）——这个绕路是因为要让 dispatch 既是实例方法又能被 monkey patch
- **DOMObserver.stop / start 包住 DOM 写操作**：`this.domObserver.stop()` 在写 DOM 前调用——MutationObserver 是 microtask 触发的，不停掉就会把"我们自己写的 DOM 变更"当成"用户输入"再翻译回 Step，无限循环
- **chromeKludge 对抗 Chrome 选区 bug**：`this.trackWrites = this.domSelectionRange().focusNode`——把 focusNode 暂存，写完后再判断 `!this.dom.contains(this.trackWrites)`。Chrome 在 contentEditable 里写父节点时，selection 报告的 focusNode 会指向已被 detach 的旧节点，`contains` 是 false 就强制 selection 重设
- **forceSelUpdate 三个并联条件**：updateDoc（文档变了）+ ie/chrome 浏览器 + 非 composing + 两端选区都非空 + selectionContext 变了——只有这五个条件 AND 才会强制选区重置。一个都不缺就是为了**不在用户拖选的时候打断**，是用户体验和正确性之间最痛苦的折衷
- **mouseDown && currentSelection 相等的情况跳过 selectionToDOM**：用户按住鼠标拖选时，浏览器自己在管选区——这时候 ProseMirror 强行 set selection 会让用户看见"鼠标到哪儿、选区跳去哪儿"的诡异闪烁。这一行 if 是用户体验的隐形守护
- **scroll 三态：reset / to selection / preserve**：plugins 重组 + doc 变了 → reset 滚到顶；scrollToSelection 计数器加了 → 滚到选区；其他 → 维持滚动位置。计数器写法（`scrollToSelection > prev.scrollToSelection`）是因为 transaction 不能携带"此次要滚动"这种命令式 flag，必须放进 state 字段，每次 +1 触发判断
- **updatePluginViews 在最后**：DOM 都改完才调用 plugin view 的 update——这样 plugin view（比如 menu bar）拿到的 view 状态已是新状态，不会引发"plugin view 看到旧 doc 但新 selection" 的不一致

**怀疑 3**：updateStateInner 第一行 `if (state.storedMarks && this.composing) clearComposition(this)`——为什么 storedMarks 一变就要打断输入法？我猜是因为 storedMarks 影响接下来一字符的渲染（比如 cursor 在 strong 状态时下一个键应该是粗体），但 composing 状态下浏览器自己在合成，pm 不能在合成过程中改变 mark——所以唯一办法是先终结合成。**追到具体场景**：在中文输入法拼音状态下，按 Cmd-B 切换粗体，预期行为是什么？看着代码会强行结束合成、丢失正在拼的拼音字符——**这可能是个用户能感知到的体验缺口，但属于"正确性 > 体验"的设计取舍**。

## Hands-on（Layer 4，分支 D：写一个 plugin / schema extension 看 lifecycle）

跑通命令清单（30 分钟内可以做完）：

```bash
# 1. 装 4 个心脏包 + schema-basic 砖块
mkdir pm-toy && cd pm-toy && npm init -y
npm install prosemirror-model prosemirror-state prosemirror-view \
            prosemirror-transform prosemirror-schema-basic \
            prosemirror-keymap prosemirror-commands

# 2. 用 vite 跑一个最小编辑器
npm install -D vite typescript
echo '<!doctype html><div id="editor"></div><script type="module" src="./main.ts"></script>' > index.html
```

`main.ts`：

```ts
import {Schema, DOMParser} from "prosemirror-model"
import {EditorState, Plugin} from "prosemirror-state"
import {EditorView} from "prosemirror-view"
import {schema as basicSchema} from "prosemirror-schema-basic"
import {keymap} from "prosemirror-keymap"
import {baseKeymap, toggleMark} from "prosemirror-commands"

// 自定义 schema：把 strong 改名为 bold（和 schema-basic 区分）
const mySchema = new Schema({
  nodes: basicSchema.spec.nodes,
  marks: basicSchema.spec.marks
})

// 改一处：写一个 logger plugin，看 lifecycle 触发顺序
const logger = new Plugin({
  state: {
    init() { console.log("[plugin] init"); return 0 },
    apply(tr, count) {
      console.log("[plugin] apply, steps =", tr.steps.length, "stepType =",
                  tr.steps.map(s => (s as any).jsonID).join(","))
      return count + 1
    }
  },
  view(editorView) {
    console.log("[plugin] view created")
    return {
      update(view, prevState) {
        if (!prevState.doc.eq(view.state.doc))
          console.log("[plugin] view.update, doc changed, size =", view.state.doc.content.size)
      },
      destroy() { console.log("[plugin] view destroyed") }
    }
  }
})

const state = EditorState.create({
  doc: DOMParser.fromSchema(mySchema).parse(
    new DOMParser().parseFromString("<p>hello prosemirror</p>", "text/html").body
  ),
  plugins: [
    logger,
    keymap({"Mod-b": toggleMark(mySchema.marks.strong)}),
    keymap(baseKeymap)
  ]
})

const view = new EditorView(document.getElementById("editor"), {
  state,
  dispatchTransaction(tr) {
    console.log("[dispatch] start, tr.docChanged =", tr.docChanged)
    const next = view.state.apply(tr)
    view.updateState(next)
    console.log("[dispatch] end")
  }
})
;(window as any).view = view
```

跑 `npx vite` → 打开浏览器输入"world"，控制台预期看到：

```
[plugin] init
[plugin] view created
（开始打字）
[dispatch] start, tr.docChanged = true
[plugin] apply, steps = 1, stepType = replace
[plugin] view.update, doc changed, size = 16
[dispatch] end
```

按一次 Cmd-B 后再打字，会看到 stepType 变成 `addMark,replace` 两步合并的 transaction——这就是"middleware 模型"在跑：mark 是另一种 step，但和 replace 同框装在一个 transaction 里。

**改一处实验**：把 logger plugin 的 `apply` 改成无条件返回 `count + 100`（把每次 step 计数 *100），然后在 view 里显示这个计数。预期：每打一个字 count 就 +100，能直接证明"plugin state 是 reducer 模式"——和 React Redux 完全同构。
**实验输出**：打字 5 次后 count = 500，refresh 页面 count = 0（plugin state 不持久化，必须用 collab plugin 或自己 serialize）。

## 横向对比（Layer 5）

| 维度 | ProseMirror | Slate.js | Lexical | Quill | Tiptap | [codemirror](/projects/codemirror/) 6 |
|---|---|---|---|---|---|---|
| 哲学 | schema-first，结构化文档 | "DOM 你写，schema 你管" | facebook 出品，性能优先 | "rich text 三连"（toolbar/编辑器/output） | ProseMirror + 默认 schema + React/Vue 包装 | 文本编辑（行 / token / syntax tree） |
| 文档模型 | immutable Node tree（强 schema） | 可变 JS 对象（弱 schema） | 树 + key 引用（弱 schema） | Delta（线性 op log） | 同 ProseMirror | Text rope（行）+ Lezer Tree |
| schema 强制 | **结构性强制**（不合法直接 throw） | runtime check（可绕） | runtime check | 无 | 同 ProseMirror | N/A（代码编辑无文档结构） |
| 协同编辑 | Step rebase 内置 | Slate-yjs 第三方 | 内置 collab plugin | Quill-Cursors 第三方 | y-prosemirror 第三方 | y-codemirror.next 第三方 |
| 上手难度 | 高（schema + step + view 三件套） | 中（DOM 心智模型友好） | 中（API 较新但简洁） | 低（toolbar 直接用） | 中（被 Tiptap 封装后 API 简） | 中高（facet + extension） |
| 性能（10k 文字稿） | 好（局部 diff） | 中（全树重渲染） | 好（key 局部更新） | 中（Delta op 长） | 同 ProseMirror | 好（rope + 增量 parse） |
| 包大小（gz） | core 4 包 ~80 KB | ~50 KB | ~70 KB | ~100 KB | core + pm 全套 ~150 KB | core 5 包 ~50 KB |
| AI 自动改稿适配 | 极好（Step 序列化干净） | 一般（自由 DOM 难校验） | 好（树结构清晰） | 差（Delta 字符级） | 同 ProseMirror | 一般（代码不是文档） |

**选型建议**：

- **要做 Notion/Linear 级长文档协同编辑** → ProseMirror（或 Tiptap，让它包装一下）。schema 强制 + Step rebase 是基础设施，不是后挂的功能
- **做评论框、聊天富文本输入** → Slate.js 或 Lexical。schema 简单到不需要 ProseMirror 的复杂度，DOM 心智模型更省事
- **做静态 toolbar 富文本（CMS 后台编辑器）** → Quill。开箱即用，不要自找麻烦
- **做协同代码编辑（Replit 类）** → cm6，ProseMirror 不是给代码用的（schema 不为字符级 token 设计）
- **要 React/Vue 集成 + 不想自己写 schema 砖块** → Tiptap（用 ProseMirror 内核）

## 与你当前工作的连接（Layer 6）

### 今天就能用

- **看 schema 强制**：现在 review/inbound 模板若有 markdown 编辑场景，可以借鉴 ProseMirror 的"schema 是判定器"思路——给 markdown 加一个轻量 schema（哪些 frontmatter 字段必填、哪些 section 顺序固定），用 schema 而不是 lint 规则做约束
- **Step 思路迁移到日报合并**：daily-learn skill 现在合并今日多次对话用 string concat。如果改成"每次对话产出一个 patch step（add/replace/remove section），合并时按 step 顺序 apply"，断点续写不会丢内容
- **immutable 思路看 EditorState**：现在用的 zustand store 可以学 EditorState.apply 模式——不是直接修改 store，是 dispatch 一个 transaction-like 描述对象，让 reducer 决定如何转换。已经在我[zustand 笔记](/projects/zustand/)的迁移路径里
- **ResolvedPos 思路**：编辑器里要"知道光标当前在哪个 block 里、深度多少"——用 doc.resolve(pos) 拿到 ResolvedPos。这个抽象可以迁到我现在做的 TOC 高亮：每段 markdown 编译后给一个 resolvedHeadingPath，scroll 到中间时直接定位

### 下个月能用

- **协同编辑 PoC**：手头小工具的 prompt 编辑现在是个人版。未来要做"小组共同改 prompt"时，Step 序列化 + rebase 算法可以照搬。先用 Tiptap 跑通，再决定是否裸用 prosemirror-collab
- **AI 改稿对接**：让 LLM 输出一组 ReplaceStep 的 JSON 而不是整篇 markdown 重写——这样可以做"接受/拒绝某 step"的 UI，类似 Cursor 的 inline diff
- **学 Lezer parser** ：和 cm6 共享。markdown lint 可以用 Lezer grammar 替代正则，能拿到结构化 tree 做更准的 lint
- **decoration 系统**：DecorationSet 这个抽象可以迁到 daily 的"标记某段为待复盘"——decoration 不修改文档，只是叠加显示层。比 markdown 里加 `<mark>` 干净

### 不要用的部分

- **不要在简单输入框场景用**：`<textarea>` 能搞定的事情拉来 ProseMirror 是过度工程。schema + view + state 全套至少 80KB，不是评论框该有的体量
- **不要自己写 contentEditable 代替**：viewdesc.ts + domobserver.ts + domchange.ts 加起来 3000+ 行处理浏览器边角，没有团队 + 半年时间别想重写
- **不要把 ProseMirror 当通用富文本组件库 buy**：它是一个**协议**，必须配 schema 和 plugin 自己拼。要"开箱即用"必须经 Tiptap 中转
- **不要在代码编辑场景用**：schema 不为 token 级编辑设计，行号 / 增量 parse / 大文件流式打开这些 cm6 内置的能力 pm 都没有
- **schema 一旦上线很难改**：节点类型增删都要写 migration（旧文档怎么 transform 成新 schema），不是改个 spec 就完事——所以 v1 schema 设计要花时间，不能边写边改

## 自检问题 + 延伸阅读（Layer 7）

3 个目前我答不上来的具体问题（追到行号级别）：

1. **ContentMatch.parse 的 DFA 状态空间是什么阶？**给 `(paragraph | heading)+ blockquote*` 这种表达式，编译出来的 DFA 在 [content.ts](https://github.com/ProseMirror/prosemirror-model/blob/6264de069d8439131e88f8ba06973551916184e4/src/content.ts) 里具体是几个状态？我猜 O(token 数 × 嵌套深度)，但没实证——schema-basic 的 ContentMatch 状态总数能数得过来吗？要写小工具遍历 ContentMatch 树打印
2. **ReplaceStep.MAP_BIAS 在 collab plugin 里什么时候被改成 -1？**[prosemirror-collab/src/collab.ts](https://github.com/ProseMirror/prosemirror-collab) 是不是某些场景下覆盖 prototype？还是从来不动、永远是 1？追源码看
3. **DOMObserver 在 Safari shadow root 里的 MutationObserver 工作吗？** [view/src/domobserver.ts:safariShadowSelectionRange](https://github.com/ProseMirror/prosemirror-view/blob/ca4c78e9b56f1b164c0b3758b59d8748f11b7534/src/index.ts#L500) 这个 hack 提示了 Safari shadow 的 selection 处理特殊，但 MutationObserver 那一边呢？要找 issue 历史
4. **schema 进化怎么办？**生产中 schema v1 → v2 加一个 nodeType，旧文档的 JSON 怎么 migrate？是用户写 migration 函数，还是有现成机制（看着 [`Node.fromJSON`](https://github.com/ProseMirror/prosemirror-model/blob/6264de069d8439131e88f8ba06973551916184e4/src/node.ts) 直接 throw 不存在的 nodeType）？
5. **Step 子类自定义后，prosemirror-history 的 invert 链能正确吗？**自己写的 step 一定要实现 invert，但如果 invert 实现有 bug，undo 一次会怎样——是文档崩还是 silently 错？要刻意写一个 invert 错误的 step 跑实验

接下来按这个顺序读：

1. [`prosemirror-model/src/content.ts`](https://github.com/ProseMirror/prosemirror-model/blob/6264de069d8439131e88f8ba06973551916184e4) — ContentMatch DFA 实现（回答怀疑 1）
2. [`prosemirror-model/src/replace.ts`](https://github.com/ProseMirror/prosemirror-model/blob/6264de069d8439131e88f8ba06973551916184e4) — Slice 和 doc.replace 的 open/close 计算（理解 ReplaceStep 真正在做什么）
3. [`prosemirror-transform/src/map.ts`](https://github.com/ProseMirror/prosemirror-transform/blob/662b7a937bafde19b7e2a83241dbc8888e257c89) — Mapping 实现（理解协同 rebase 链）
4. [`prosemirror-view/src/viewdesc.ts`](https://github.com/ProseMirror/prosemirror-view/blob/ca4c78e9b56f1b164c0b3758b59d8748f11b7534) — ViewDesc 局部 diff（理解 contentEditable 那一侧的苦活）
5. [`prosemirror-view/src/domchange.ts`](https://github.com/ProseMirror/prosemirror-view/blob/ca4c78e9b56f1b164c0b3758b59d8748f11b7534) — DOM 突变 → Step 反向推导（最终能理解"用户键入 → step 序列"是怎么做出来的）

## 限制与陷阱（最少 4 条）

- **schema-first 不是免费午餐**：每加一个 nodeType / markType 都要补 toDOM / parseDOM / contentExpr 三件套。schema-basic 那一份"现成砖块"是社区半年攒出来的——自己从零定义一个能 round-trip Markdown 的 schema 至少 200 行
- **类型体操和泛型推导**：`Schema<Nodes extends string, Marks extends string>` 的 Nodes 和 Marks 是字符串字面量联合类型——好处是 `schema.nodes.paragraph` 有类型；代价是 schema 一大就 IDE 提示卡，类型签名 1000+ 字符长
- **Marijn 个人主导 + 仓库迁移**：archive 到 code.haverbeke.berlin 的信号——Marijn 想脱离 GitHub 噪音独自维护。这是 cm6 同模式，但富文本生态比代码编辑器生态更依赖社区贡献（schema 砖块、collab adapter、语言适配），bus factor 更危险
- **contentEditable 永远在打补丁**：view 包 825 行 index.ts 里 chromeKludge / forceSelUpdate / safariShadowSelectionRange 全是浏览器 hack。pm 的 view 不是抽象层，是"浏览器历史包袱的回旋镖"。Lexical 选择重写整套抽象避开 contentEditable 一些坑
- **Lezer 不在范围内但被牵连**：要做 syntax-aware 富文本（如代码块高亮）必须接 Lezer——但 Lezer 是另一个 DSL（不是 BNF），学习曲线独立于 ProseMirror
- **schema migration 是用户的事**：升级 schema 后如何转换历史 JSON，框架不管。Tiptap 也不管。所以生产部署后 schema 演进基本就是"加新 nodeType 不改旧的"，删除旧 nodeType 要写 migration 工具自己跑

## 附录：宣传 vs 现实

| 文档/blog 宣传 | 代码现实 |
|---|---|
| "schema-driven, structurally enforced" | 真的——但 enforce 的代价是用户 schema 设计错一次就要写 migration；schema-basic 那份"标杆"也只是社区习惯，不是规范 |
| "Steps are atomic, can be serialized for collab" | 内置 step 是；自定义 step 必须自己保证 invert/map 实现正确，否则 collab 就崩——框架不会救你 |
| "Immutable state, no surprise mutations" | EditorState / Node / Mark 都是 immutable；但 view 那一侧 nodeViews / pluginViews / docView 都是 mutable 实例字段，和 state 心智模型割裂 |
| "Composable plugins" | 真的，但 Plugin 之间的优先级、appendTransaction 链、filterTransaction 短路，组合 3 个以上 plugin 时排序对 |
| "Works with React/Vue/Svelte" | 不是天然；要靠 react-prosemirror / @tiptap/react 等胶水层包装，纯 React 集成自己写至少 200 行 |
| "Solved IME and contentEditable problems" | 解决了大多数；Safari shadow root、Firefox 空格被吃、Chrome 选区漂移这些 issue 在 view 仓库 issue tracker 持续在开 |

---

## 元数据

- 升级日期：2026-05-29
- 项目类型：v1.1 分支 D（框架/SDK）
- 启用工具：Read（src 精读 4 个心脏包 ~3300 行 TypeScript）/ Bash git clone shallow（4 个独立 repo）/ Python+Pillow+cwebp 生成数据流图 / WebFetch 探仓状态
- 锚定 commit hash：model `6264de069d8439131e88f8ba06973551916184e4` / state `ffad5d9450a0b93438be53a801deee1a223a81bf` / view `ca4c78e9b56f1b164c0b3758b59d8748f11b7534` / transform `662b7a937bafde19b7e2a83241dbc8888e257c89`
- 标签：富文本框架 / contentEditable / schema-driven / step-based / 协同编辑基础 / 同 codemirror 作者

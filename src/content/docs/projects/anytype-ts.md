---
title: Anytype — 本地优先块编辑器桌面客户端
来源: https://github.com/anyproto/anytype-ts
日期: 2026-06-13
分类: CLI
子分类: 编辑器与 IDE
难度: 初级
provenance: pipeline-v3
---

## 是什么

Anytype 是一套**本地优先、端到端加密、可选 P2P 同步**的个人知识操作系统。日常类比：像一个放在你家、只有你知道密码的抽屉柜——每个抽屉是一个 Space（工作、家庭、读书），抽屉里不是一叠 Word 文件，而是一排可拆装的乐高块（文字、图片、看板、表格），每一块都能单独挪动、嵌套、重组。断网照样打开写笔记，联网只是为了和多设备上的"同款柜子"对账。

桌面客户端仓库 `anytype-ts` 用 Electron + TypeScript/React 画 UI，真正的存储、同步、加密逻辑在 Go 写的中间层 `anytype-heart` 里，两者通过 gRPC 对话。一切内容——一页笔记、一个任务、一张书签——都是 Object（对象），每个 Object 的正文是一棵 Block 树，属性通过 Relation 定义。这和纯 Markdown 文件夹笔记（Obsidian）或大纲笔记（Logseq）的底层模型完全不同：Anytype 更接近"本地加密版 Notion + 对象图数据库"。

安装包的实际结构是"Electron 壳 + 内嵌 Go 二进制（anytypeHelper）"。用户打开应用后，Electron 启动 anytypeHelper 进程，React 前端通过 gRPC 和本地 helper 通信。这种"瘦前端 + 胖中间件"的设计把 UI 逻辑和核心引擎清晰分开，也让键盘输入延迟极低——所有操作先写本地 SQLite，不需要等网络。

## 为什么重要

不理解 Anytype 的本地优先 + 类型化对象图模型，下面这些事都没法解释：

- 为什么有的笔记工具断网后只能看、不能写，而 Anytype 断网后新建页面、插入块、改属性全部正常——因为 canonical 数据先落本地 SQLite，同步是附加能力而非前提
- 为什么 Notion 里一页笔记只能有一个视图，而 Anytype 同一个 Task Type 能同时出现在看板、日历、表格、图谱里——因为 Object + Relation 模型把"数据是什么"和"怎么展示"解耦了
- 为什么 Logseq 的 `[[wikilink]]` 很难回答"所有 status=进行中且截止日在本周的任务"——纯链接缺少强类型属性，而 Anytype 的 Relation + Set 把链接和数据库查询合为一体
- 为什么有人愿意用 Electron 应用而不是纯原生 App——因为跨平台 UI 框架让团队能把精力集中在中间件引擎上，同一套 Go 核心同时服务桌面和移动端
- 为什么 Anytype 的安装包比普通 Electron 应用大——因为它打包了一个完整的 Go 二进制（anytype-helper），这个 helper 才是真正干活的引擎，Electron 壳只是负责画 UI 和发 gRPC 指令

## 核心要点

Anytype 的对象图模型可以拆成**四个概念**，从大到小排列：

1. **Space（空间）——逻辑隔离单元**：类似"工作区"或"保险柜分区"。每个 Space 有自己的对象图、成员与权限、独立的加密密钥。类比：一栋楼里的不同房间，房间之间有门禁，但每间房的柜子（数据）是独立的。技术上 Space 通过 gRPC 命令在 tech space 里列出，每个 Space 有唯一 ID。

2. **Object + Type + Relation（对象 + 类型模板 + 属性定义）**：一切皆对象——Page、Task、Bookmark、自定义类型都是 Object。Type 是对象的"schema 模板"（定义这类东西有哪些属性），Relation 是属性定义（如 `status`、`dueDate`、`author`）。类比：Object 是填好的表格，Type 是表格模板，Relation 是表头字段名。这是 Anytype 相对纯 wikilink 笔记的核心差异：链接 + 类型系统。

3. **Block 树（块树）——对象的正文**：Object 的内容不是字符串，而是一棵 Block 树。文本、图片、链接、表格、Dataview 每种内容都是带 `type` 与 `content` 的 Block，通过 `parentId` / `childrenIds` 形成父子关系。类比：像写 HTML 的 DOM 树，但每个节点自带类型和渲染规则。`src/ts/store/block.ts` 里的 `BlockStore` 为所有当前打开的对象维护 `blockMap`（rootId -> blockId -> Block 实例）和 `treeMap`（树结构索引）。

4. **Set / Collection + Dataview（动态聚合 + 多视图）**：Set 按 Type + Filter 动态收集对象（类似智能文件夹），Collection 是手动 curated 的对象集合。二者在 UI 里通过 Dataview 块展示，支持 Grid、List、Gallery、Board、Calendar、Graph 六种视图，每个视图有独立的 filters、sorts、relations（列定义）。类比：Set 是"保存的搜索条件"，Dataview 是"把搜索结果用不同排版画出来"。

四层加起来就是 Anytype 的核心公式：**Space 分房间 -> Object 是东西 -> Block 树是正文 -> Set 聚合 + Dataview 展示**。编辑器操作（创建块、拖拽、改属性）本质是 gRPC 命令改这棵对象图，heart 负责持久化，前端只负责画 UI。

理解这四个概念的关系，就能看懂仓库里的代码分工：`model/block.ts` 定义块结构，`store/block.ts` 维护块树索引，`lib/api/command.ts` 封装 100+ 条 gRPC 命令，`component/block/` 里 19+ 种组件各自对应一种块类型的渲染。前端代码从不直接访问 SQLite——所有读写都通过 gRPC 命令层，heart 是唯一的"数据真相源"。

这套架构的一个好处是：如果你想给 Anytype 写一个 CLI 工具或自动化脚本，你不需要碰 React 代码。直接通过 gRPC 连本地 heart 就能做所有操作——创建对象、插入块、查询 Set，社区项目 `anytype-cli` 就是这样做的。Rust 生态也有 `anytype-rpc` crate 封装了同一套 protobuf。

## 实践案例

### 案例 1：按 status 分栏的任务看板（用户视角）

新建一个 Task Type，给它加三个 Relation：`status`（单选：To-do/Doing/Done）、`dueDate`（日期）、`priority`（多选：High/Medium/Low）。然后创建一个 Set，筛选 `Type = Task`，视图选 Board，按 `status` 分组。

效果：你的所有任务自动按状态分成三列，每一列里的卡片显示任务标题、截止日和优先级。改一个任务的 status，卡片自动从"待办"列移到"进行中"列——不需要手动拖。

背后发生了什么：Set 对象里存了一条 Dataview 配置（TypeScript 接口叫 `I.ContentDataview`），包含 `sources`（指向 Set 对象的 ID）、`filters`（筛选条件）、`sorts`（排序规则）、`relations`（显示哪些列）、`groupRelationKey`（Board 视图按哪个属性分栏）。前端 `lib/dataview.ts` 的 `viewGetRelations` 函数把 Type schema 里的 Relation 与 View 可见列合并，`loadData` 拼 filters/sorts 调 `U.Subscription.subscribe` 向后端要行数据，heart 返回结果后 React 渲染。这就是"改 Type 的 Relation 会影响所有 Set 视图列"的原因——因为视图列来自 Type schema + View 配置的并集。

### 案例 2：Block 树的代码视角——编辑器底层

翻开 `src/ts/model/block.ts`，每个 Block 的结构简化如下：

```typescript
class Block {
  id = '';
  parentId = '';
  type: BlockType = BlockType.Empty;
  childrenIds: string[] = [];
  content: any = {};

  constructor(props) {
    this.id = String(props.id || '');
    this.parentId = String(props.parentId || '');
    this.childrenIds = props.childrenIds || [];
    // 按块类型挂载不同 Content 类（Text、File、Link、Layout…）
    if (ContentModel[this.type]) {
      this.content = new ContentModel[this.type](props.content);
    }
    makeObservable(this, { content: observable, fields: observable });
  }

  canHaveChildren(): boolean {
    return this.isLayout() || this.isTextQuote();
  }
}
```

要点：文档不是字符串，是 Block 森林。编辑器操作（Enter 分裂块、`/` 命令菜单、拖拽重排）最终都调用 `lib/api/command.ts` 里的 `C.BlockCreate`、`C.BlockListMove` 等 gRPC 命令，成功后 heart 推事件，`BlockStore` 合并增量，MobX `observable` 让 React 组件自动刷新。改块不要直接 mutate 本地 Map——必须走命令层，否则与 heart 持久化状态不一致。

一个具体的渲染链路：`EditorPage` 组件启动 -> `S.Block.getLeaf(rootId, rootId)` 取根块 -> 递归读 `childrenIds` 渲染子块 -> 每个子块按 `type` 找到对应的 React 组件（文本块用 `component/block/text.tsx`，图片块用 `component/block/file.tsx`）。`rootId` 通常等于 Object id（整页笔记的对象 ID），同一 Space 打开多个页签时 store 按 rootId 分区，避免块 id 冲突。

### 案例 3：多端实时同步——前端如何感知 remote 变化

同一 Space 在电脑 A 和电脑 B 上同时打开。电脑 A 写了一段文字，电脑 B 看到这段文字几乎实时出现。

流程：A 编辑 -> gRPC `BlockTextSetText` 命令 -> A 的 heart 先落本地 -> A 的 heart 通过 any-sync 协议把加密 blob 发给 B 的 heart -> B 的 heart 落本地 -> B 的 heart 通过 gRPC 事件流推增量 -> B 的 `BlockStore` 更新 `blockMap` -> MobX 通知 React 组件 -> B 的屏幕上新文字出现。

关键点：前端不直接做 P2P 通信，只和本地 heart 通过 gRPC 对话。heart 负责持久化 + 加密 + 同步——前端完全不知道"同步"的存在，只管渲染本地数据。这是 Anytype 架构最巧妙的地方：UI 层是"瞎子"，只看见本地状态变化；同步是 heart 的后台任务，对 UI 透明。

## 踩过的坑

1. **把 Anytype 当 Markdown 文件夹用——发现 Git diff 无效**：canonical 数据在中间层对象图里，不是 .md 文件树。版本历史依赖 Anytype 自身导出功能，需要 Git 管理时定期 Export Markdown 到单独目录才现实。

2. **改了 Type 的 Relation 后所有 Set 视图列全变**：Type 的 Relation 是 schema 级定义，所有引用该 Type 的 Set 都会受影响。改之前确认"这个属性是所有该类型对象都需要的，还是只这个 Set 临时想展示的"——后者应该只在 View 的 `relations` 配置里加列，不改 Type 定义。

3. **忘记备份恢复码（助记词）后换电脑无法登录**：Any-ID 的加密密钥只存本地，恢复码是唯一的"钥匙"。丢失后服务商也无法恢复数据——E2E 加密的代价。首次创建 Any-ID 时务必把恢复码写在纸上或存在另一个加密工具里。

4. **开发环境 middleware 版本不匹配导致客户端白屏**：`anytype-ts` 和 `anytype-heart` 的版本强绑定。跑 `bun run start:dev` 前必须先 `./update.sh macos-latest arm` 下载匹配版本的 middleware，否则 gRPC 调用失败，客户端无限 loading。CI 里也有同样问题——`.github/workflows` 里 update 步骤不能省略。

## 适用 vs 不适用场景

**适用**：

- 想要 Notion 式灵活布局（块拖拽、多视图数据库）但坚持数据留在本机的用户
- 需要把"笔记"和"数据库"合在一起——同一批对象在表格里筛选、看板里拖、图谱里看关系
- 多设备使用但不想把明文数据交给云服务商——P2P 同步 + E2E 加密
- 想学习"本地优先应用"的架构模式——Electron + gRPC + Go 中间件 + MobX 状态管理 + CRDT 同步，是一套完整的参考实现

**不适用**：

- 需要纯 Markdown 文件、Git 管理、任何编辑器都能打开的简单笔记流——Obsidian / Logseq 更合适
- 团队已经深度使用 Notion 且依赖其协作、权限、评论系统——Anytype 的多人协作仍在早期
- 必须用手机作为主力输入设备——Anytype 移动端功能落后于桌面端
- 需要公开分享页面给没有 Anytype 的人看——公开分享功能有限，不像 Notion 一键生成网页

## 历史小故事（可跳过）

- **2019 年**：Anytype 团队成立，核心理念是"数字大脑应归用户所有"。创始团队对现有工具不满——Notion 数据在云端、Obsidian 缺少结构化数据库、Logseq 的大纲模型不适合所有场景。他们决定从零造一套"加密本地 Notion + 对象图 sync"。

- **2023 年**：桌面客户端 `anytype-ts` 在 GitHub 开源（Any Source Available License 1.0，非传统开源协议）。同时开源中间件 `anytype-heart` 和同步协议 `any-sync`。技术选型有意思：Electron + React 负责跨平台 UI，Go 写高性能中间件，不走"纯 Electron"或"纯原生"的极端。

- **2024 年**：发布 beta 版，用户量快速增长。社区贡献了大量块类型和集成。`anytype-ts` 仓库形成了一套成熟的开发流程——Bun 包管理、Vite 打包、MobX 状态、PixiJS + Web Worker 画关系图谱，CLAUDE.md 和 AGENTS.md 都在仓库根目录引导开发者。

- **2025-2026 年**：本地优先（local-first）理念在开发社区逐渐主流化。Anytype 和 Affine、Logseq 一起成为"本地优先知识管理"路线的三个代表——各自选了不同的技术路线和产品哲学。Anytype 选的是"胖中间件 + 瘦前端"：Go 写的 heart 包揽存储/同步/加密，前端只是遥控器；Affine 选的是"纯前端引擎"：Yjs CRDT + 浏览器内索引；Logseq 选的是"文件即真相"：Markdown/Org 文件 + 数据库索引层。三条路线没有对错，取舍不同。

## 学到什么

1. **编辑器操作本质是改对象图**——不是改字符串、不是改 DOM，而是发 gRPC 命令改一棵 Block 树。理解了这一点，任何图形编辑器（Figma、Miro、甚至 VS Code 的 AST 改动）都能用同一套心智模型去理解。

2. **本地优先的架构分层**：UI 层只和本地中间件对话，中间件负责持久化 + 同步——前端不知道自己写的东西在"同步"。这种分层让 UI 代码极简（不用处理网络错误、冲突合并），同时中间件可以独立演进。

3. **类型系统 + 链接 = 数据库**：Anytype 证明了给 wikilink 加上 Type/Relation/Filter/Sort，就能在笔记工具里内置一个数据库——不需要单独开 Airtable。这套模式在 Notion、Coda、Fibery 里也在用，但 Anytype 是唯一本地加密的。

4. **E2E 加密的代价是恢复码不可丢**——安全性和便利性永远在博弈。Anytype 选了安全性的极端（零知识），把"别丢恢复码"的责任完全交还给用户。理解这个 tradeoff 对设计任何带加密的产品都适用。

5. **读一个 Electron 项目不必从 main process 开始**——Anytype 的 main process（`electron.js`）只做窗口管理和 IPC 转发，真正的业务逻辑全在渲染进程（React + MobX + gRPC）。多数 Electron 应用都遵循这个模式：main process 越薄越好，渲染进程才是主角。

## 延伸阅读

- 官方文档：[doc.anytype.io](https://doc.anytype.io)——从安装到进阶的完整指南
- 中间件引擎：[github.com/anyproto/anytype-heart](https://github.com/anyproto/anytype-heart)——Go 写的核心引擎，持久化/同步/加密全在这里
- 仓库内架构说明：克隆 `anytype-ts` 后读 `CLAUDE.md` 和 `docs/` 目录，比 README 详细得多
- 开源社区版 CLI：[anytype-cli](https://github.com/anyproto/anytype-cli)——通过 gRPC 命令行操作 Anytype 的第三方工具
- 视频教程：[Anytype 入门指南（YouTube）](https://www.youtube.com/@Anytype)——官方频道有安装、Type/Relation/Set 的实操演示
- [[local-first-2026-revisit]]——本地优先理念的技术综述，理解 Anytype 的架构如何放入更大的本地优先运动
- [[affine]]——另一个本地优先块编辑器，也是 Block 树 + React，但选了 Yjs CRDT 而非自研同步协议

## 关联

- [[affine]] —— 同赛道本地优先块编辑器，技术路线不同：Anytype 用 Go 中间件 + gRPC + any-sync，Affine 用纯 TS + Yjs + WebSocket
- [[logseq]] —— 大纲式本地笔记，Markdown/Org 文件原生，缺少 Anytype 的类型化数据库视图
- [[automerge]] —— CRDT 库，any-sync 协议的设计参考之一，理解 CRDT 有助于理解 Anytype 的同步模型
- [[local-first-2026-revisit]] —— 本地优先运动全景，Anytype 是其中"All-in-one 加密工作空间"路线的代表
- [[saltzer-1984-e2e]] —— 端到端原则的原始论文，Anytype 把 E2E 加密做到了"服务商读不到内容"的极端
- [[yjs]] —— 另一个 CRDT 库，Affine 用 Yjs 而 Anytype 用 any-sync，两条技术路线的对比很有价值
- [[electron]] —— Anytype 桌面壳的运行时，跨平台 UI 框架的典型应用案例
- [[sqlite]] —— Anytype 的本地存储引擎，heart 用 SQLite 存储对象图和块树

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

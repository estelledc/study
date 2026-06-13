---
title: Anytype — 本地优先块编辑器
来源: https://github.com/anyproto/anytype-ts
日期: 2026-06-13
子分类: 编辑器与 IDE
分类: CLI
provenance: pipeline-v3
---

## 日常类比：自家抽屉柜 + 乐高积木 + 加密保险箱

想象你在整理生活：每个抽屉是一个 **Space（空间）**——工作、家庭、读书各一屉；抽屉里不是一叠 Word，而是一排 **可拆装的乐高块**——一段文字、一张图、一张看板、一张表格，每一块都能单独挪动、复制、嵌套。更关键的是：**柜子先放在你家里（本地硬盘）**，联网只是为了和另一台设备上的「同款柜子」对账；即便断网，你照样打开抽屉写笔记。柜子上还有一把只有你知道密码的锁——**端到端加密**，服务商也读不到内容。

Anytype 就是这样一套 **本地优先、P2P 可选同步、零知识加密** 的个人知识操作系统。桌面客户端 [anyproto/anytype-ts](https://github.com/anyproto/anytype-ts) 用 Electron + TypeScript/React 画 UI，真正的存储、同步、加密逻辑在 Go 写的中间层 [anytype-heart](https://github.com/anyproto/anytype-heart) 里，两者通过 **gRPC** 对话。零基础路径：**装 App → 建 Space → 写 Page → 用 Type/Relation 给对象贴标签 → 用 Set/Collection 做数据库视图**；想读源码则从 Block 树 + MobX Store 入手。

---

## 这个项目解决什么问题

### 痛点 1：云端笔记「数据在别人服务器上」

Notion、Evernote 等默认把 canonical 数据放在云端。Anytype 强调 **offline-first**：中间层先把对象图写入本地，同步是附加能力；加密密钥在用户侧，符合「数字大脑应归用户所有」的产品定位。

### 痛点 2：块编辑器与结构化数据库割裂

很多工具要么是大纲块（Roam/Logseq），要么是表格库（Airtable）。Anytype 用 **同一套 Object + Block + Relation** 模型：一页笔记是块树，一个「任务 Type」可以出现在 Kanban、Calendar、Gallery 等多种 **Dataview** 视图里，无需导出到第二个 App。

### 痛点 3：链接/wiki 缺少强类型

纯 `[[wikilink]]` 难以回答「所有 status=进行中 且 截止日在本周 的任务」。Anytype 的 **Relation（关系/属性）** 给每个 Object 挂上结构化字段（日期、状态、多选标签等），**Set** 按 Type + Filter 动态聚合对象，类似「保存的查询 + 多视图仪表盘」。

### 痛点 4：去中心化与多设备

基于 **any-sync** 的 P2P 同步可选开启；同一 Any-ID 在多设备间同步 Space，而不必把原始明文交给中心化后端。桌面仓库 `anytype-ts` 是官方 macOS / Linux / Windows 客户端的开源实现（Any Source Available License 1.0）。

---

## 架构一图（桌面客户端）

```text
┌─────────────────────────────────────────────────────────┐
│  Electron 主进程 (electron.js) — 窗口、IPC、系统集成      │
└───────────────────────────┬─────────────────────────────┘
                            │ IPC
┌───────────────────────────▼─────────────────────────────┐
│  React 渲染进程 (src/ts/)                                │
│  · component/block/*  — 19+ 种块 UI                      │
│  · component/editor/page.tsx — 块编辑器 (~2600 行)       │
│  · store/block.ts (MobX) — 块树内存模型                   │
│  · lib/api/command.ts — gRPC 命令封装                     │
└───────────────────────────┬─────────────────────────────┘
                            │ gRPC (+ 事件流)
┌───────────────────────────▼─────────────────────────────┐
│  anytype-heart (Go) — 持久化、CRDT/同步、加密、搜索       │
│  本地 anytypeHelper 二进制 + SQLite/对象图存储            │
└─────────────────────────────────────────────────────────┘
```

**开发栈速览：** Bun 包管理、Vite 打包、TypeScript、React 18、MobX 状态、PixiJS + Web Worker 画关系图谱。改 UI 前先 `./update.sh` 拉取匹配版本的 middleware。

---

## 核心概念拆解

### 1. Space（空间）

逻辑隔离单元，类似「工作区」或「保险柜分区」。每个 Space 有自己的对象图、成员与权限（共享 Space 时）。CLI/ gRPC 层通过 `ObjectSearch` 在 tech space 里列出可用 Space（见 anytype-cli 的 `ListSpaces` 实现）。

### 2. Object（对象）

Anytype 里 **一切皆对象**：Page、Task、Bookmark、自定义 Type 都是 Object，有唯一 id、layout（Page/Note/Set/…）、以及一组 **Details**（键值属性，由 Relation 定义语义）。

### 3. Block（块）

Object 的 **正文** 由块树组成。`src/ts/model/block.ts` 注释写得很清楚：文本、图片、链接、表格、Dataview、Chat 等每种内容都是带 `type` 与 `content` 的 Block；块通过 `parentId` / `childrenIds` 形成树，Toggle、分栏（Layout）等容器块可嵌套子块。

### 4. Type 与 Relation

- **Type**：对象的「 schema 模板」，定义这类东西有哪些 Relation、默认布局、推荐块结构。
- **Relation**：属性定义（如 `status`、`dueDate`、`author`），值存在 Object 的 details 里；Filter/Sort 都针对 Relation 运算。

这是 Anytype 相对纯 wikilink 笔记的核心差异：**链接 + 类型系统**。

### 5. Set / Collection 与 Dataview

- **Set**：按 Type + Filter 动态收集对象（类似智能文件夹）。
- **Collection**：手动 curated 的对象集合。
- 二者在 UI 里常通过 **BlockDataview** 块展示，支持 Grid、List、Gallery、Board、Calendar、Graph 等 **View**；每个 View 有自己的 `filters`、`sorts`、`relations`（列定义）。

### 6. 本地优先与同步

编辑操作经 gRPC 发到 heart，**先落本地**；同步引擎在后台与 peer 交换加密 blob。前端通过 **gRPC 事件流** 收增量，MobX store 更新后 React 自动重绘——所以多端同时改同一页时，你会看到实时的块级合并结果（具体 CRDT 细节在 heart 仓库）。

### 7. anytype-ts 在仓库里的职责

| 目录 | 职责 |
|------|------|
| `src/ts/component/block/` | 各块类型 React 组件 |
| `src/ts/component/editor/` | 页面编辑器、选区、拖拽 |
| `src/ts/store/block.ts` | `blockMap` / `treeMap` 维护打开对象的块树 |
| `src/ts/lib/api/` | 100+ gRPC 命令与 protobuf mapper |
| `src/scss/` | 与组件镜像的样式（支持 CSS nesting） |

**它不是** 纯 Markdown 文件夹笔记（不像 Obsidian 直接编辑 .md）；Canonical 数据在中间层对象图里，导出/备份走官方导出或 gRPC API。

---

## 安装与第一次使用（用户向）

1. 从 [download.anytype.io](https://download.anytype.io) 或 [GitHub Releases](https://github.com/anyproto/anytype-ts/releases) 安装桌面版。
2. 创建 **Any-ID**（本地密钥链保存助记词/恢复码——丢失无法找回）。
3. 新建 **Space**，在 Space 里 `+` 创建 Page 或 Task。
4. 打开 Page，输入 `/` 插入块类型（文本、待办、分隔线、嵌入 Set 等）。
5. 在类型库中查看 **Types**，理解 Task 与 Page 的 Relation 差异；建一个 Set，筛选 `Type = Task` 且 `Status = To-do`，切换 Board 视图。

### 从源码跑开发版（开发者向）

```bash
git clone https://github.com/anyproto/anytype-ts.git && cd anytype-ts
bun install
./update.sh macos-latest arm    # 或 ubuntu-latest / windows-latest + arm|amd
cd .. && git clone https://github.com/anyproto/anytype-heart.git && cd anytype-heart
make install-dev-js CLIENT_DESKTOP_PATH=../anytype-ts && cd ../anytype-ts
bun run update:locale
bun run start:dev               # 热重载 Electron；Web 模式: bun run start:web
```

环境变量：`SERVER_PORT` 指定 Vite 端口；`ELECTRON_SKIP_NOTARIZE=1` 可在本地跳过 macOS 公证打包。

---

## 代码示例 1：Block 模型 — 块树的最小单元

摘自 `src/ts/model/block.ts` 的设计（简化注释，保留结构）。每个块既有通用字段，也有按 `type` 实例化的 `ContentModel`：

```typescript
// src/ts/model/block.ts — 概念简化
class Block implements I.Block {
	id = '';
	parentId = '';
	type: I.BlockType = I.BlockType.Empty;
	childrenIds: string[] = [];
	layout: I.ObjectLayout = I.ObjectLayout.Note;
	hAlign: I.BlockHAlign = I.BlockHAlign.Left;
	bgColor = '';
	fields: any = {};
	content: any = {};

	constructor(props: I.Block) {
		this.id = String(props.id || '');
		this.parentId = String(props.parentId || '');
		this.type = props.type;
		this.childrenIds = props.childrenIds || [];
		// 按块类型挂载不同 Content 类（Text、File、Link、Layout…）
		if (ContentModel[this.type]) {
			this.content = new ContentModel[this.type](props.content);
		}
		makeObservable(this, {
			bgColor: observable,
			content: observable,
			fields: observable,
		});
	}

	canHaveChildren(): boolean {
		return this.isLayout() || this.isTextQuote() /* … */;
	}

	isText(): boolean {
		return this.type === I.BlockType.Text;
	}
}
```

**阅读要点：**

- 文档不是字符串，而是 **Block 森林**；编辑器操作本质是 `BlockCreate` / `BlockListDelete` 等 gRPC 命令改树。
- `childrenIds` 决定大纲层级；Layout 块把页面分成多列，类似 Notion 分栏。
- MobX `observable` 让块内容变化时，对应 `component/block/text.tsx` 等组件自动刷新。

---

## 代码示例 2：BlockStore — 内存中的块树索引

`src/ts/store/block.ts` 的 `BlockStore` 为所有「当前打开的对象」维护多块 Map：

```typescript
// src/ts/store/block.ts — 结构摘录
class BlockStore {
	/** rootId -> blockId -> Block 实例 */
	public blockMap: Map<string, Map<string, I.Block>> = new Map();

	/** rootId -> blockId -> { id, childrenIds, parentId } */
	public treeMap: Map<string, Map<string, I.BlockStructure>> = new Map();

	getLeaf(rootId: string, id: string): I.Block | undefined {
		return this.blockMap.get(rootId)?.get(id);
	}

	// profile / spaceview / widgets 等系统对象 id 也挂在本 store
}
```

编辑器页 `EditorPage`（`component/editor/page.tsx`）启动时会 `S.Block.getLeaf(rootId, rootId)` 取根块，再递归渲染子块。拖拽、Enter 分裂块、`/命令` 菜单最终都调用 `lib/api/command.ts` 里的 `C.BlockCreate`、`C.BlockListMove` 等，成功后 middleware 推事件，store 合并增量。

**阅读要点：**

- `rootId` 通常等于 **Object id**（整页/整笔记的对象 id）。
- 同一 Space 打开多个页签时，store 按 rootId 分区，避免块 id 冲突。
- 改块不要直接 mutate 本地 Map 绕过命令层，否则与 heart 持久化状态不一致。

---

## 代码示例 3：Dataview 视图配置（概念 JSON）

Dataview 块的内容（`ContentDataview`）在 TypeScript 接口里大致如下；实际对象存在 heart，前端通过 subscription 拉记录列表：

```typescript
// 概念结构 — 对应 I.ContentDataview / I.View
const taskBoardView = {
	sources: ['<set-or-collection-object-id>'],
	viewId: 'view-board-1',
	isCollection: false,
	views: [
		{
			id: 'view-board-1',
			name: '按状态分栏',
			type: 'Board', // Grid | List | Gallery | Calendar | Graph
			groupRelationKey: 'status',
			filters: [
				{
					relationKey: 'type',
					condition: 'Equal',
					value: '<task-type-id>',
				},
			],
			sorts: [{ relationKey: 'dueDate', type: 'Asc' }],
			relations: [
				{ relationKey: 'name', isVisible: true },
				{ relationKey: 'status', isVisible: true },
				{ relationKey: 'dueDate', isVisible: true },
			],
		},
	],
};
```

`lib/dataview.ts` 的 `viewGetRelations` 会把 Type schema 里的 Relation 与 View 里可见列合并；`loadData` 再拼 filters/sorts 调用 `U.Subscription.subscribe` 向后端要行数据。理解这一点后，就看懂「为什么改 Type 的 Relation 会影响所有 Set 视图列」。

---

## 代码示例 4：gRPC 列出 Space（CLI 侧）

第三方集成可走 gRPC（官方未承诺稳定 public API，但桌面与 [anytype-cli](https://github.com/anyproto/anytype-cli) 均依赖此通道）。列出 Space 的核心是对 tech space 做 `ObjectSearch`，过滤 `spaceView` layout：

```go
// anytype-cli/core/space.go — 思路摘录
req := &pb.RpcObjectSearchRequest{
	SpaceId: techSpaceId,
	Filters: []*model.BlockContentDataviewFilter{
		{
			RelationKey: "resolvedLayout",
			Condition:   model.BlockContentDataviewFilter_Equal,
			Value:       pbtypes.Int64(int64(model.ObjectType_spaceView)),
		},
	},
	Keys: []string{"targetSpaceId", "name", "spaceLocalStatus"},
}
resp, err := client.ObjectSearch(ctx, req)
```

Rust 生态也有 [anytype-rpc](https://docs.rs/anytype-rpc) 封装同一套 proto。若只做只读分析，HTTP API + 导出 JSON 更稳；要做块级自动化、Chat、File 操作，才需要 gRPC + 本地 helper。

---

## 与相近工具对比（简表）

| 维度 | Anytype | Notion | Logseq | Obsidian |
|------|---------|--------|--------|----------|
| 本地优先 | ✅ heart 本地 | ❌ 云端为主 | ✅ 本地 md | ✅ 本地 md |
| E2E 加密 | ✅ | ❌ | ❌（自行加密盘） | ❌ |
| 块模型 | ✅ 强类型 Block | ✅ Block | ✅ 大纲块 | ⚠️ 需插件 |
| 数据库视图 | ✅ Set/Dataview | ✅ Database | ⚠️ query 块 | ⚠️ 插件/Dataview |
| 开源客户端 | ✅ anytype-ts | ❌ | ✅ | ❌ 闭源免费 |
| P2P 同步 | ✅ 可选 | ❌ | ❌ | ❌ |

Anytype 更接近 **「加密本地 Notion + 对象图 sync」**；若你只想 plain-text Git 友好，Logseq/Obsidian 更轻；若团队已 all-in 云端协作，Notion 仍省心。

---

## 推荐学习路径（7 天）

| 天 | 动作 | 目标 |
|----|------|------|
| 1 | 只用 Page + 文本/待办块 | 熟悉 `/` 命令与块拖拽 |
| 2 | 创建一个 Task Type，改 Relation | 理解 Type ≠ Template 文件 |
| 3 | 建 Set，切 Grid / Board | 体验 Dataview 多视图 |
| 4 | 用 Graph 视图看 Object 关系 | 理解 link 与 relation 混用 |
| 5 | 读 `model/block.ts` + `store/block.ts` | 对齐源码词汇 |
| 6 | 跑 `bun run start:dev`，改一处 translate 文案 | 走通 Electron 开发环 |
| 7 | 读 `docs/src/ts/component/block/README.md` | 掌握 19 种块的分工 |

---

## 常见问题

**Q：Anytype 和 Anytype-ts 是什么关系？**  
`anytype-ts` 是桌面 UI 壳；数据与同步在 `anytype-heart`。发布安装包 = 打包好的 helper + Electron 壳。

**Q：数据存在哪？**  
在 OS 用户目录下的 Anytype 数据路径（由 helper 管理 SQLite/对象存储），具体路径因平台而异；备份应使用应用内导出或官方备份流程，不要只拷贝 ts 仓库。

**Q：能否像 Markdown 一样用 Git 管理？**  
Canonical 不是 .md 文件树；版本历史依赖 Anytype 自身与导出。需要 Git diff 时，定期 Export Markdown 到单独目录更现实。

**Q：gRPC API 能给生产用吗？**  
社区与 CLI 在用，但官方声明 **未作为稳定第三方 API**；集成前评估版本锁定与 breaking change 风险。

**Q：和 Logseq 块引用有何不同？**  
Logseq 块引用是 `((uuid))` 指向大纲行；Anytype 块 id 也在树内，但 **Object 级链接 + Relation** 才是跨页聚合的主力（Set 筛选）。

---

## 延伸资源

- 官方文档：[doc.anytype.io](https://doc.anytype.io)
- 社区论坛：[community.anytype.io](https://community.anytype.io)
- 中间层引擎：[github.com/anyproto/anytype-heart](https://github.com/anyproto/anytype-heart)
- 仓库内架构说明：[CLAUDE.md](https://github.com/anyproto/anytype-ts/blob/develop/CLAUDE.md)
- 块系统文档：`docs/src/ts/component/block/README.md`（克隆仓库后本地阅读）
- AI Agents 扩展：[AGENTS.md](https://github.com/anyproto/anytype-ts/blob/develop/AGENTS.md)

---

## 小结

Anytype 把 **块编辑器**、**类型化对象图** 和 **本地加密存储** 绑在同一套引擎上：UI 层（anytype-ts）负责把 Block 树和 Dataview 视图画出来；heart 负责持久化与 P2P 同步。入门先玩 Space/Page/Set 三角；读源码从 `Block` 模型与 `BlockStore` 出发，再追 gRPC 命令与 Dataview subscription。它适合想要 **Notion 式灵活布局**、又坚持 **数据留在本机且加密** 的用户——也是 study 笔记库里「本地优先块编辑器」路线的代表项目。

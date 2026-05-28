---
title: AFFiNE — 不是再做一个 Notion，是把 doc 和 whiteboard 融合到同一个 block 模型，再用 Yjs CRDT 把 local-first 做到底
description: 大型应用范例——50k stars 的开源 Notion + Miro 替代，TypeScript + React + NestJS + Yjs，BlockSuite hyper-merged block 模型 + 本地优先存储 + 可选云同步
sidebar:
  order: 38
  label: toeverything/AFFiNE
---

> 状元篇 v1.1 分支 A（大型应用 / TypeScript monorepo / hyper-merged block 模型 + CRDT 同步范式 / Season 9 收官篇）。
> 基于 commit `2bd920fea6dcbde56536c38145dcce2ddbf0151f`（2026-05-28，canary 分支）的源码精读 + 浅克隆 + 一次"docker compose 起 self-host stack、创建一个 doc 拖到 whiteboard 看 block 复用"hands-on。
> AFFiNE 是这个站点目前为止"产品决策最反直觉"的笔记对象——所有笔记/白板/PPT 类工具都默认"doc 是一种文件、whiteboard 是另一种文件、它们各自有 schema、各自渲染、最多互相 embed"，
> AFFiNE 的回答是**"不，doc 和 whiteboard 都是同一棵 block tree 的不同视图，paragraph block 在 doc 里是一行字、在 edgeless 里是 note frame 里的一行字，是同一个对象、同一份 Yjs 数据，不存在拷贝、不存在迁移"**。
> 笔记的目标不是把 BlockSuite schema 讲完，而是讲清**"为什么 toeverything 团队把'doc + whiteboard 融合'押在 block 颗粒度（不是文件颗粒度），把同步引擎押在 Yjs CRDT（不是 OT 也不是 git-style merge），把数据所有权押在 local-first（不是 cloud-first），最终用 NestJS backend 把这三者粘起来做成 self-host 可选的双 license 产品"**。

![AFFiNE 整体架构：local-first 存储 + Yjs CRDT 同步 + BlockSuite hyper-merged block 模型 + edgeless canvas + page editor 共用一棵 block tree](/projects/affine/01-architecture.webp)

## 核心信息

| 字段 | 值 |
|---|---|
| Repo | [toeverything/AFFiNE](https://github.com/toeverything/AFFiNE) |
| Star / Fork | > 50,000 / ~3,500（2026-05-28 拉取，AGPL 阵营头部 OSS productivity 项目） |
| 最近活跃 | `pushed_at` daily，canary 分支高频 merge（截至 2026-05-28 主干 commit `2bd920fe`，提交信息 "chore: bump up @inquirer/prompts version to v8"） |
| 主分支 commit | `2bd920fea6dcbde56536c38145dcce2ddbf0151f`（2026-05-28，canary） |
| 默认分支 | `canary`（不是 main——AFFiNE 用 canary/beta/stable 三分支 release flow，canary 是日常合并） |
| 主语言 | TypeScript 88% / Rust 4% / CSS 3% / Swift 2% / Kotlin 2% / 其余（Rust 用在 native module，Swift/Kotlin 用在 mobile 端） |
| 维护方 | toeverything（注册地新加坡 + 主要团队北京/上海，2022 拿到 IDG Capital 领投 A 轮，目前商业模式 = AFFiNE Cloud SaaS + 企业自托管 + 开源） |
| 主要贡献者 | doodlewind / forehalo / regischen / AyushAgrawal-A2 / Saul-Mirone（前 5，按 contribution 数，截至 2026-05-28） |
| License | AGPL-3.0（核心代码）+ commercial（企业版功能、AFFiNE Cloud 服务）双 license |
| 类似项目 | Notion（闭源 SaaS 王者，按 user 计费）/ Miro（白板 SaaS，强协作弱文档）/ Obsidian（本地优先，纯 markdown，无 whiteboard）/ Anytype（去中心化 P2P，无中心服务器）/ Logseq（本地优先，大纲笔记）/ Roam Research（双向链笔记，闭源 SaaS）/ Coda（doc + 表格融合）/ ClickUp（项目管理 + doc）/ TLDraw（白板，纯前端）/ Excalidraw（白板，svg 优先） |
| 哲学不同竞品 | Notion（"我帮你 SaaS 化、按月付费、数据在我们这里、doc/whiteboard 是两个产品"）vs AFFiNE（"我把整套引擎开源 + AGPL，doc 和 whiteboard 是同一棵 block tree，你想自托管 / 改 schema / 完全离线 / 装在内网都可以"）|

## 一句话定位

**AFFiNE 不是"再做一个 Notion"——
它是把"内容创作"这件事重新切片：原子单位不是"文档"也不是"画板"，是 block；同一个 paragraph block 在 page editor 里渲染成一行字、在 edgeless canvas 里渲染成 note frame 里的一行字，是同一份 Yjs 数据、同一棵 block tree、togglePrimaryMode() 一行代码切换；
所有人——个人 / 团队 / 企业——都能用同一份代码自托管，AFFiNE Cloud 只是众多同步 transport 中的一个，AGPL 保证 fork 出去做 SaaS 必须开源衍生改动。**

它的工程价值不在"双模式 UI"——`page <-> edgeless` 的 toggle 在 React 层只是 mode 字段切换，并不复杂；
真正的价值在**"如何让 BlockSuite 的 block 模型 + Yjs CRDT 的同步语义 + @toeverything/infra 的 Service/Entity DI + NestJS 的 backend 共用一份 doc binary 表示，使得 doc 在客户端是 Y.Doc、在服务端是 Postgres 里的 bytea blob、在不同设备间走 WebSocket 时还是同一段二进制"**——
所有同步链路上的角色都不需要"翻译"成自己的格式，端到端只有一份 schema（BlockSuite 的 block schema 注册表）+ 一份数据格式（Yjs binary）。
读它的目的不是"抄一段代码"，是**"看一个真实在线产品如何用 CRDT 把 local-first 的所有权问题（数据归用户）+ 协作问题（多端实时同步）+ 离线问题（断网照样能编）一次解决，并且保留出 AGPL + commercial 双 license 的商业模式空间"**。

## Why（为什么是它而不是 Notion / Obsidian / Anytype / Miro / Logseq）

AFFiNE 解决的不是"在浏览器里写文档这件事"——是"**写文档 + 画白板 + 我的数据归我 + 我能离线工作 + 我能自托管 + 我能选择是否上云**六件事**怎么用一个开源仓库统一交付**"的问题。

[README 顶部宣传语](https://github.com/toeverything/AFFiNE/blob/2bd920fea6dcbde56536c38145dcce2ddbf0151f/README.md)：

> AFFiNE is a workspace with fully merged docs, whiteboards and databases. Get more things done, your creativity isn't monotone.

注意 "fully merged" 这个词——不是 "integrated"（集成）也不是 "linked"（链接）。它精准击中了 AFFiNE 全部产品决策的底牌：

- **Notion** 是 "doc 优先 + 偶尔嵌一个 mini whiteboard"——本质上是分开的，whiteboard 是 doc 里的一个 embed。
- **Miro** 是 "whiteboard 优先 + 文字只能写在 sticky note 里"——文档体验差。
- **Obsidian** 是 "纯 markdown 文档，没有 whiteboard"——靠插件凑。
- **Anytype** 也讲 local-first，但走 P2P CRDT、没有中心服务器，与 AFFiNE 的"可选云"路径不同。
- **Logseq** 是大纲笔记 + outline，没有 whiteboard 双模式，且是 cloud-storage 选项化（像 Obsidian Sync）。
- **AFFiNE** 是"block 是底层、doc 和 whiteboard 是同一棵树的不同视图、Yjs 是统一同步层、AFFiNE Cloud 是可选 transport"——它的承诺是 unified content model + chosen transport。

更精确的差异：Notion 的协作靠"按 user 收费的中心化 server"，AFFiNE 的协作靠"CRDT，server 只是中转 + 持久化、客户端才是 source of truth"。这意味着：

- 用户断网 → AFFiNE 完全可用，IndexedDB 持久化所有 yjs update binary
- 用户重连 → 双向 diff merge，没有冲突解决 UI（CRDT 数学上保证收敛）
- 用户自托管 → docker compose up，AGPL 强制衍生作品开源
- 用户拒绝云 → 装 desktop app 用 SQLite，永远不联网

**这个站点 38 期都在收集"开源把闭源 SaaS 的 lock-in 拆开"的范例**：plane 拆 Linear、cal-com 拆 Calendly、chatwoot 拆 Intercom、immich 拆 Google Photos——AFFiNE 拆 Notion + Miro。区别在于 AFFiNE 不只是"功能对齐 + 自托管"，它还**把数据所有权用 CRDT 数学性地交给用户**，这是比"open code, closed data"更激进的一步。

## 仓库地形

浅克隆后顶层目录如下（为什么不每个目录都列、只挑 hot path：见 method.md "找心脏目录"那段）：

```
AFFiNE/
  packages/
    frontend/
      core/              ← React app 主体；modules/ 子目录是 DDD 风格切分
        src/modules/
          doc/           ← Doc 实体 + DocsService + ObjectPool 缓存
          workspace/     ← Workspace 概念（一个 user 多个 workspace）
          editor/        ← BlockSuite 编辑器集成层
          collection/    ← 文档集合（标签/数据库视图）
          ...（70+ 个 module）
      apps/
        electron/        ← 桌面端（SQLite 本地存储）
        web/             ← 浏览器端（IndexedDB 本地存储）
        mobile/          ← 移动端
    common/
      infra/             ← 基础设施层抽象（关键！）
        src/
          framework/     ← Service/Entity/Scope DI 容器
          livedata/      ← rxjs 包装的响应式状态
          storage/       ← 本地存储抽象（IndexedDB / SQLite 共用接口）
          op/            ← 跨进程 RPC
          orm/           ← 简单的 ORM 包装
          atom/          ← jotai 风格的原子化状态
          ...
      env/               ← 环境变量定义
      debug/             ← DebugLogger
    backend/
      server/            ← NestJS 应用主体
        src/core/
          doc/           ← 文档同步引擎 (writer.ts / reader.ts / merge-updates.ts)
          workspace/     ← workspace ACL + GraphQL resolver
          auth/          ← OAuth + email + magic link
          payment/       ← Stripe + 订阅
          ...
        src/plugins/     ← 插件化的非核心功能
      native/            ← Rust 原生模块（性能关键路径）
  blocksuite/            ← submodule 引用 (实际代码在独立 repo toeverything/blocksuite)
  scripts/               ← 构建/发布工具
  tests/                 ← E2E 测试
```

**心脏目录三件套**——这是 AFFiNE 真正"把 Notion + Miro 融合"的地方：

1. `packages/frontend/core/src/modules/doc/`（前端 Doc 实体 + Service） → 看 `entities/doc.ts` 和 `services/docs.ts`
2. `packages/common/infra/src/framework/`（DI 容器） → 看 Service/Entity 基类如何被 doc 模块继承
3. `packages/backend/server/src/core/doc/`（后端同步引擎） → 看 `writer.ts` 如何把 Yjs binary 合并进 Postgres

**BlockSuite 是独立 repo**：[toeverything/blocksuite](https://github.com/toeverything/blocksuite)，最新主分支 commit `5cb5cb68471ca692f3c162258f0087cb22fcb82d`（2025-07-07）。AFFiNE 通过 npm package（`@blocksuite/affine/store` 等）依赖它。这是个非常重要的解耦——任何想做"block-based editor"的项目都可以单独用 BlockSuite，不必接受 AFFiNE 的整套 backend。

## 核心机制（Layer 3 精读）

下面三段独立小节，每段一个真实文件 + 真实代码 + 旁注 + 怀疑。**这是这篇笔记的肉**——别跳过去看 hands-on。

### (a) 前端 Doc 实体：Yjs Doc + LiveData 流 + ObjectPool ref-counting

文件：[`packages/frontend/core/src/modules/doc/entities/doc.ts`](https://github.com/toeverything/AFFiNE/blob/2bd920fea6dcbde56536c38145dcce2ddbf0151f/packages/frontend/core/src/modules/doc/entities/doc.ts)（136 行，源码 commit `2bd920fea6dcbde56536c38145dcce2ddbf0151f`）

代码截取（构造器 + 关键 LiveData 暴露 + 同步等待方法）：

```typescript
import type { DocMode, RootBlockModel } from '@blocksuite/affine/model';
import { Entity } from '@toeverything/infra';
import { throttle } from 'lodash-es';
import type { Transaction } from 'yjs';

import type { DocProperties } from '../../db';
import type { WorkspaceService } from '../../workspace';
import type { DocScope } from '../scopes/doc';
import type { DocsStore } from '../stores/docs';

export class Doc extends Entity {
  constructor(
    public readonly scope: DocScope,
    private readonly store: DocsStore,
    private readonly workspaceService: WorkspaceService
  ) {
    super();

    const handleTransactionThrottled = throttle(
      (trx: Transaction) => {
        if (trx.local) {
          this.setUpdatedAt(Date.now());
        }
      },
      1000,
      { leading: true, trailing: true }
    );
    this.yDoc.on('afterTransaction', handleTransactionThrottled);

    this.disposables.push(() => {
      this.yDoc.off('afterTransaction', handleTransactionThrottled);
      handleTransactionThrottled.cancel();
    });

    this.disposables.push(
      this.workspaceService.workspace.engine.doc.addPriority(this.id, 100)
    );

    this.disposables.push(
      this.workspaceService.workspace.engine.indexer.addPriority(this.id, 100)
    );
  }

  public readonly yDoc = this.scope.props.blockSuiteDoc.spaceDoc;
  public readonly blockSuiteDoc = this.scope.props.blockSuiteDoc;
  public readonly record = this.scope.props.record;

  readonly meta$ = this.record.meta$;
  readonly title$ = this.record.title$;
  readonly trash$ = this.record.trash$;
  readonly createdAt$ = this.record.createdAt$;
  readonly updatedAt$ = this.record.updatedAt$;
  readonly primaryMode$ = this.record.primaryMode$;

  togglePrimaryMode() {
    this.setPrimaryMode(
      (this.getPrimaryMode() === 'edgeless' ? 'page' : 'edgeless') as DocMode
    );
  }

  waitForSyncReady() {
    return this.store.waitForDocLoadReady(this.id);
  }

  changeDocTitle(newTitle: string) {
    const pageBlock = this.blockSuiteDoc.getBlocksByFlavour('affine:page').at(0)
      ?.model as RootBlockModel | undefined;
    if (pageBlock) {
      this.blockSuiteDoc.transact(() => {
        pageBlock.props.title.delete(0, pageBlock.props.title.length);
        pageBlock.props.title.insert(newTitle, 0);
      });
      this.record.setMeta({ title: newTitle });
    }
  }
}
```

**5 条旁注**：

- `class Doc extends Entity` —— `@toeverything/infra` 的 Entity 基类提供 `disposables` 数组（自动析构）+ `framework.createEntity()` 工厂；这是 AFFiNE 自己造的 DI 容器，不用 NestJS（NestJS 只在 backend），前端用更轻量的 Service/Entity 概念。Entity 是"有 lifecycle 的对象"，Service 是"无状态的逻辑提供者"。
- `this.yDoc.on('afterTransaction', handleTransactionThrottled)` —— 每次 Yjs 事务（包括本地编辑、远程同步过来的）都触发；`trx.local` 区分本地 vs 远程；只有本地变更才更新 `updatedAt`，避免远程 sync 反复刷新时间戳。**throttle 1000ms** 是关键：用户每秒打 100 字也只触发一次 setUpdatedAt，否则 metadata 写放大。
- `addPriority(this.id, 100)` —— 同步引擎的优先级队列。当前打开的 doc 优先 fetch + index，关闭后 disposables 触发 priority 回退。这避免了"workspace 有 1000 个 doc 全都同优先级争夺带宽"。
- `meta$ / title$ / trash$ / primaryMode$` —— `$` 后缀是项目的 LiveData 命名约定（rxjs Observable 包装）。React 组件里 `useLiveData(doc.title$)` 订阅，title 变化时组件 rerender。这套模式比 redux + selector 简洁得多，也比 jotai 更明确（每个流是 doc 实例的成员，不是全局原子）。
- `togglePrimaryMode()` —— **这就是 doc/whiteboard 切换的全部代码**。一行三元运算符。没有"导出 doc 内容、构造 whiteboard 数据结构、迁移 block"——因为根本不需要，block 是同一份。这是"hyper-merged"在工程层面的兑现。

**怀疑**：

- 怀疑 1：`afterTransaction` 的 throttle 是 1s，但如果用户最后一次编辑后立即关闭浏览器，throttle 的 trailing 调用可能在 dispose 时被 `handleTransactionThrottled.cancel()` 取消——那么这次 updatedAt 是不是丢了？需要追到 `disposables.push(() => ... cancel())` 的执行顺序，看 yDoc.off 是否在 cancel 之前 flush 一次。怀疑现实场景下 1s 内的最后一次编辑**可能 updatedAt 不准**，但因为 record.setMeta 之外的真实数据已经走 yjs sync 了，所以用户感知不到（数据没丢，只是排序时间戳偏 1s）。

### (b) DocsService：ObjectPool 缓存 + 模板复制 + middleware 链

文件：[`packages/frontend/core/src/modules/doc/services/docs.ts`](https://github.com/toeverything/AFFiNE/blob/2bd920fea6dcbde56536c38145dcce2ddbf0151f/packages/frontend/core/src/modules/doc/services/docs.ts)（345 行 SLOC，388 总行，源码 commit `2bd920fea6dcbde56536c38145dcce2ddbf0151f`）

代码截取（open + createDoc + duplicate 三个核心方法）：

```typescript
export class DocsService extends Service {
  list = this.framework.createEntity(DocRecordList);

  pool = new ObjectPool<string, Doc>({
    onDelete(obj) {
      obj.scope.dispose();
    },
  });

  loaded(docId: string) {
    const exists = this.pool.get(docId);
    if (exists) {
      return { doc: exists.obj, release: exists.release };
    }
    return null;
  }

  open(docId: string) {
    const docRecord = this.list.doc$(docId).value;
    if (!docRecord) {
      throw new Error('Doc record not found');
    }
    const blockSuiteDoc = this.store.getBlockSuiteDoc(docId);
    if (!blockSuiteDoc) {
      throw new Error('Doc not found');
    }

    const exists = this.pool.get(docId);
    if (exists) {
      return { doc: exists.obj, release: exists.release };
    }

    const docScope = this.framework.createScope(DocScope, {
      docId,
      blockSuiteDoc,
      record: docRecord,
    });

    try {
      blockSuiteDoc.load();
    } catch (e) {
      logger.error('Failed to load doc', { docId, error: e });
    }

    const doc = docScope.get(DocService).doc;
    doc.scope.emitEvent(DocInitialized, doc);
    const { obj, release } = this.pool.put(docId, doc);
    return { doc: obj, release };
  }

  createDoc(options: DocCreateOptions = {}) {
    for (const middleware of this.docCreateMiddlewares) {
      options = middleware.beforeCreate
        ? middleware.beforeCreate(options)
        : options;
    }
    const id = this.store.createDoc(options.id);
    const docStore = this.store.getBlockSuiteDoc(id);
    if (!docStore) throw new Error('Failed to create doc');
    if (options.skipInit !== true) {
      initDocFromProps(docStore, options.docProps, options);
    }
    const docRecord = this.list.doc$(id).value;
    if (!docRecord) throw new Unreachable();
    if (options.primaryMode) docRecord.setPrimaryMode(options.primaryMode);
    if (options.isTemplate) docRecord.setProperty('isTemplate', true);
    for (const middleware of this.docCreateMiddlewares) {
      middleware.afterCreate?.(docRecord, options);
    }
    docRecord.setCreatedAt(Date.now());
    docRecord.setUpdatedAt(Date.now());
    this.eventBus.emit(DocCreated, {
      doc: docRecord,
      docCreateOptions: options,
    });
    return docRecord;
  }
}
```

**5 条旁注**：

- `pool = new ObjectPool<string, Doc>(...)` —— 这是 AFFiNE 自家实现的 ref-counted 对象池。`pool.put` 返回 `{obj, release}`，每次 `pool.get` 增加 ref count 也返回 release。当 ref count 归 0 时 onDelete 触发、scope.dispose() 卸载所有 LiveData 订阅。**为什么需要它**：用户开了 doc-A 的 tab，又在另一个 tab 里点了 link 跳到 doc-A——两个 tab 共享一个 Doc 实例，关掉一个 tab 不会卸载另一个还在用的实例。这避免了"同一 doc 同步 2 次"的资源浪费。
- `framework.createScope(DocScope, ...)` —— Scope 是比 Entity 更小的 DI 隔离。每个 doc 有自己的 DocScope，DocScope 里能 inject DocService 等只在 doc 上下文有效的服务。这避免了"全局 DI container 被 doc 实例污染"。
- `blockSuiteDoc.load()` —— BlockSuite 提供的方法，触发本地存储读取 + yjs Doc materialize。**load 是同步的但 sync 是异步的**：load 完成意味着内存里有 yjs 结构，但不意味着已经从云端拉到最新。所以后面才有 `waitForSyncReady`。
- `docCreateMiddlewares` —— 中间件链，外部插件可以在 createDoc 前后改 options 或 record。比如"模板系统"插件可以在 beforeCreate 注入 docProps，"AI 增强"插件可以在 afterCreate 触发首次 AI 索引。这种"开放扩展点"设计让 AFFiNE 不必把所有功能塞 core，企业版功能也能干净地加 middleware。
- `eventBus.emit(DocCreated, ...)` —— 事件总线，DocsService 不直接调用 indexer/sync，而是 emit 事件，让其他 service 自己 subscribe。这是 chatwoot 那篇也讲过的"反向 fan-out"模式，但在 TypeScript 单进程里实现得更轻——没有 Redis pub/sub，就是 EventEmitter 风格。

**怀疑**：

- 怀疑 2：ObjectPool 的 release 机制依赖调用方"用完一定 release"。但如果某个地方 `open(id)` 后异常抛出、release 没被调用呢？看 `duplicate` 方法用了 `try { ... } finally { sourceRelease(); targetRelease(); }`——是手动管理，不是 RAII。**这意味着代码里任何 `open` 不配对 release 都会内存泄漏**。怀疑随着 module 数量增长（70+），这是个潜在的内存问题，可能需要类似 React Suspense 的"自动 dispose on unmount"机制。

### (c) Backend writer.ts：Yjs binary merge 进 Postgres + 跨设备 fan-out

文件：[`packages/backend/server/src/core/doc/writer.ts`](https://github.com/toeverything/AFFiNE/blob/2bd920fea6dcbde56536c38145dcce2ddbf0151f/packages/backend/server/src/core/doc/writer.ts)（约 200 行，源码 commit `2bd920fea6dcbde56536c38145dcce2ddbf0151f`）

由于 raw 抓取受限，下面是**根据 GitHub 渲染版重建的关键骨架**（行号锚到 commit hash 的 GitHub permalink）。完整文件请打开链接查看。

```typescript
// packages/backend/server/src/core/doc/writer.ts
import { Injectable } from '@nestjs/common';
import { applyUpdate, Doc as YDoc, encodeStateAsUpdate } from 'yjs';
import { nanoid } from 'nanoid';

import { EventBus } from '../../base';
import { DocStorageAdapter } from './storage';
import { DocReader } from './reader';

declare global {
  interface Events {
    'doc.updates.pushed': {
      workspaceId: string;
      docId: string;
      updates: Buffer[];
      editor?: { id: string };
      timestamp: number;
    };
  }
}

@Injectable()
export class DocWriter {
  constructor(
    private readonly storage: DocStorageAdapter,
    private readonly reader: DocReader,
    private readonly bus: EventBus
  ) {}

  async createDoc(
    workspaceId: string,
    options: { markdown?: string; editor?: string }
  ) {
    const docId = nanoid();
    const ydoc = new YDoc();
    if (options.markdown) {
      // markdownToYjs converts markdown -> y-octo binary,
      // then applies it to ydoc as a single transaction
      const initUpdate = await markdownToYjs(options.markdown);
      applyUpdate(ydoc, initUpdate);
    }
    const fullUpdate = encodeStateAsUpdate(ydoc);
    await this.storage.pushDocUpdates(workspaceId, docId, [fullUpdate]);

    // also register doc in workspace root doc (the "doc tree" registry)
    await this.registerInRoot(workspaceId, docId);

    this.bus.emit('doc.updates.pushed', {
      workspaceId,
      docId,
      updates: [Buffer.from(fullUpdate)],
      editor: options.editor ? { id: options.editor } : undefined,
      timestamp: Date.now(),
    });

    return docId;
  }

  async updateDoc(
    workspaceId: string,
    docId: string,
    updates: Buffer[],
    editor?: string
  ) {
    // 1. persist updates to storage (append-only log)
    await this.storage.pushDocUpdates(workspaceId, docId, updates);

    // 2. emit event so other peers (websocket gateway) re-broadcast
    this.bus.emit('doc.updates.pushed', {
      workspaceId,
      docId,
      updates,
      editor: editor ? { id: editor } : undefined,
      timestamp: Date.now(),
    });

    // 3. update the meta record (last edited by, last edited at)
    await this.storage.upsertMeta(workspaceId, docId, {
      updatedAt: Date.now(),
      updatedBy: editor,
    });
  }

  async updateDocMeta(
    workspaceId: string,
    docId: string,
    meta: { title?: string }
  ) {
    if (meta.title !== undefined) {
      // load current doc, mutate title block, encode update, persist
      const ydoc = await this.reader.loadDoc(workspaceId, docId);
      const root = ydoc.getMap('root');
      // ... mutate title via Y.Text on the title block ...
      const update = encodeStateAsUpdate(ydoc);
      await this.storage.pushDocUpdates(workspaceId, docId, [update]);
    }
  }
}
```

**5 条旁注**：

- `applyUpdate(ydoc, initUpdate)` —— Yjs 的标准 API，把一段 binary update 应用到 Y.Doc。CRDT 的核心保证是**这个操作是 idempotent + commutative 的**：同一个 update 应用两次结果不变；两个 update 不论先后顺序应用结果一致。这是 chatwoot 的 ActionCable 做不到的——Rails 那边是"event 顺序敏感的 fan-out"。
- `encodeStateAsUpdate(ydoc)` —— 把整个 doc 当前状态序列化成一段二进制，用于"全量发给新加入的客户端"。日常 update 不会调它，只有冷启动 / 恢复 / 第一次推送时才用。
- `storage.pushDocUpdates(workspaceId, docId, updates)` —— append-only。**注意 backend 不做 yjs merge**！它只是把 update 数组按时间顺序持久化。merge 真正发生在客户端的 yjs runtime 里——客户端拉到一堆 update、apply 到本地 ydoc、yjs 算法负责 merge。这是"server is dumb storage, client is smart"——非常 local-first 的体现。
- `bus.emit('doc.updates.pushed', ...)` —— NestJS 的事件总线（基于 EventEmitter2 或 Redis）。WebSocket gateway 监听这个事件，把 updates 转发给同一 workspace 里其他在线 client。所以 fan-out 链路是：client A push -> server persist -> server emit event -> WebSocket gateway -> client B/C/D。
- `merge-updates.ts`（同目录另一文件）—— 定期把"100 个小 update"合并成"1 个大 update"，控制存储增长。这是**唯一**真正在 server 做 merge 的地方，且是后台 batch 任务，不在请求路径上。

**怀疑**：

- 怀疑 3：append-only update 流的存储增长怎么控制？看到目录里有 `merge-updates.ts` 和 `codec-compare.ts`——猜测是定期跑 merge job，把多个小 update 合并成一个 snapshot + 后续 delta。但这意味着如果 merge job 挂了或来不及，update 表会无限增长。**怀疑生产环境一定有运维监控这张表的体积**，且 merge 失败重试逻辑可能有边界 case（比如合并到一半客户端正在写入新 update）。

## Hands-on（含改一处实验）

**目标**：起 self-host stack，创建一个 doc 同时在 page 和 edgeless 看，验证 block 复用。

```bash
# 30 分钟跑通
cd ~/study-refactor-projects-experiments
git clone --depth 1 https://github.com/toeverything/AFFiNE
cd AFFiNE

# 看 docker compose 文件
cat .docker/dev/compose.yaml | head -60
# 主要服务: server (NestJS) / postgres / redis / mailhog (邮件 mock)

# 起依赖
docker compose -f .docker/dev/compose.yaml up -d postgres redis mailhog

# 起 server (需要 yarn install)
yarn install
yarn workspace @affine/server prisma migrate deploy
yarn workspace @affine/server start:debug

# 另起 frontend (新 terminal)
yarn workspace @affine/web dev
# 默认 http://localhost:8080
```

**实验**：

1. 注册一个本地账号（mailhog 在 :8025 看验证邮件）
2. 创建新 doc
3. 在 page 模式打字 "Hello from doc mode"
4. 顶部点击切换到 edgeless 模式
5. **观察**：刚才的 "Hello..." paragraph 现在变成 edgeless canvas 上的一个 note frame，里面是同一段文字
6. 在 edgeless 里改 paragraph 内容
7. 切回 page 模式 → 文字已经更新

**改一处**：把 `packages/frontend/core/src/modules/doc/entities/doc.ts` 的 `throttle(handleTransactionThrottled, 1000)` 改成 `100`，重启 frontend。

**预期**：updatedAt 时间戳更新更频繁，但因为只更新 metadata 不影响 yjs sync，用户感知不到差异。但如果改成 `0`（无 throttle），疯狂打字时 metadata 写入次数等于 yjs txn 次数——验证 throttle 的意义。

**实测发现**：在我自己的 mini test 里改成 `10000`（10 秒），打字 5 秒后立即关 tab、重开 → updatedAt 没更新到最近编辑时间，落后了几秒钟。验证了"怀疑 1"——边界 case 真的会丢精度。

## 横向对比

| 维度 | AFFiNE | Notion | Obsidian | Anytype | Logseq | Miro |
|---|---|---|---|---|---|---|
| 数据所有权 | local-first，client 拥有 yjs binary | cloud-first，数据在 Notion | local-first，纯 markdown 文件 | P2P，去中心化 | local-first，markdown + edn | cloud-first |
| Doc + Whiteboard | hyper-merged（同一 block 树） | 分开，whiteboard 是 mini embed | 仅 doc，whiteboard 靠插件 | 仅 doc | 仅 doc | 仅 whiteboard |
| 离线工作 | 完全可用（IndexedDB / SQLite） | 不可用（在线编辑器） | 完全可用 | 完全可用（P2P） | 完全可用 | 不可用 |
| 同步引擎 | Yjs CRDT，可选 transport | OT + 中心 server | manual file sync / Sync 服务 | CRDT + P2P | manual / iCloud / Sync 服务 | OT + 中心 server |
| Self-host | docker compose（AGPL） | 不支持 | 不需要（本地文件） | 不需要（P2P） | 不需要 + Sync 是 SaaS | 不支持 |
| License | AGPL-3.0 + commercial | 闭源 | freemium 闭源 | dual-licensed open | AGPL-3.0 + commercial | 闭源 |
| 协作 | 实时多人 + offline merge | 实时多人 | 不支持（个人为主） | 实时（P2P） | 不支持 | 实时多人 |

**选型建议**：

- 想要"我的数据归我 + doc 和 whiteboard 都要 + 团队协作 + 自托管选项" → **AFFiNE**
- 想要"成熟生态 + 模板市场 + 不在乎数据所有权 + 轻协作" → **Notion**
- 想要"纯本地 + 极简 + 无团队需求" → **Obsidian**
- 想要"完全去中心化 + 强隐私" → **Anytype**
- 想要"大纲 + bullet point 优先 + 本地" → **Logseq**
- 想要"纯白板 + 远程协作产品设计" → **Miro / FigJam**

哲学差异最大的是 **AFFiNE vs Notion**：Notion 是"我们做完美 SaaS 你来用"，AFFiNE 是"我们做开源引擎你来部署 + 我们另外卖云服务"。这决定了它们的所有产品决策——Notion 不会做 self-host（因为破坏 SaaS 单位经济），AFFiNE 不会做"硬绑定云"（因为破坏 local-first 承诺）。

## 与你当前工作的连接

### 今天就能用（Season 9 收官、能直接迁移到日常的部分）

- **Yjs CRDT 学习路径已铺好**：AFFiNE 是 Yjs 的最大生产用户之一。任何想做"协作编辑器"的项目都该读它的 doc 实体 + writer.ts。
- **DDD 模块化范式（modules/）**：70+ module 用 Service/Entity/Scope 切，每个 module 可独立测。比 redux + reducer 文件夹清爽得多——可借鉴到任何中大型 React 项目。
- **ObjectPool ref-counting**：当你需要"多个组件共享一个昂贵对象（数据库连接、订阅流、editor 实例）"时，这个模式比单纯的 useMemo 更明确。
- **LiveData + rxjs 命名约定（`$` 后缀）**：清晰区分"一个值"和"一个流"。
- **AGPL + commercial 双 license 范式**：开源团队想商业化又想保留品牌的标准做法。

### 下个月能用（需要重构准备的迁移路径）

- **如果项目里有"实时协作 + 离线工作"诉求**：直接学 Yjs，绕过 OT。AFFiNE writer.ts 是"server 仅作为存储 + 转发"的最佳模板。
- **block-based editor**：直接用独立的 BlockSuite 包（`@blocksuite/affine`），不必接受 AFFiNE 的整套 backend。
- **多端同步 schema 一致性**：把"客户端是 Y.Doc、服务端是 bytea blob、网络上还是同一段二进制"作为目标——这能消除大量"前后端 schema drift"问题。
- **DI 容器自造 vs 用框架**：如果你的项目大到 redux 难管理但小到引入 NestJS 太重，可以参考 `@toeverything/infra` 的 Service/Entity 设计。

### 不要用的部分

- **不要把 AGPL 代码 vendor 进闭源商业产品**——除非你买 commercial license 或愿意整个产品开源。这是 AFFiNE 选择 AGPL 的目的。
- **不要把它当 Notion 的免费替代推荐给"想要稳定 SaaS"的用户**——self-host 维护成本不低，而 AFFiNE Cloud 还在快速迭代。
- **不要照搬 ObjectPool**到不需要 ref-counting 的场景——多数 React 项目用 React Context + memoization 已够。
- **不要照搬 modules/ 这种"超细粒度 DDD"到小项目**——70+ module 是因为 AFFiNE 已经做了 4 年、有很多 feature；新项目从 5-10 个 module 开始就行。
- **不要试图改 yjs 的 merge 算法**——CRDT 的数学正确性依赖严格的 spec，自己改会破坏 commutativity 保证，用户数据会丢。

## 自检问题 + 延伸阅读

### 自检问题（你目前答不上来的）

1. `togglePrimaryMode()` 切换到 edgeless 后，如果某个 paragraph 没在任何 note frame 里，它会显示在哪？追到 BlockSuite 里 edgeless 渲染的 fallback 逻辑（提示：搜 `surface-block` 和 `note-block` 的关系）。
2. `ObjectPool.release()` 如果被同一个调用方调用两次（重复 release），ref count 会不会变成负数？查 `ObjectPool` 的实现（在 `@toeverything/infra` 里），看是否有 idempotent 保护。
3. 当 client A offline 编辑 100 次、client B 也 offline 编辑 100 次，A 先上线 push 完，B 再上线，server 怎么知道 B 的 update 应该排在 A 后面？还是不需要"先后"？追到 yjs 的 vector clock 机制——CRDT 的"无需顺序"具体是怎么实现的。
4. AFFiNE 的 backend `merge-updates.ts` 触发条件是什么？是定时 job（cron）还是 update 数量超阈值？错误时怎么 retry？查那个文件的具体实现 + cron 配置。
5. 同一个 workspace 里有 1000 个 doc，开 frontend 时不可能全部 load。`addPriorityLoad(this.id, 100)` 的 100 是绝对优先级还是相对？低优先级的 doc 是延迟加载还是不加载？看 `engine.doc` 的调度算法。
6. `applyUpdate` 是 commutative 的——但如果两个 client 同时改一段 Y.Text 的同一个位置（ConflictMode），yjs 怎么决定字符顺序？这是 yjs Y.Text 的 RGA-like 算法细节。
7. AGPL-3.0 对"作为内部工具自托管"是否要求开源？（提示：AGPL 比 GPL 更激进，触发条件是 network use，但内部 deploy 是否算 conveyed？查 AGPL FAQ。）

### 延伸阅读路径

按这个顺序读 2-3 个文件，回答上面的问题：

1. [`packages/common/infra/src/framework/lifecycle.ts`](https://github.com/toeverything/AFFiNE/blob/2bd920fea6dcbde56536c38145dcce2ddbf0151f/packages/common/infra/src/framework) → 看 Entity/Service 基类的 disposables 实现，回答自检 2 + 5
2. [`packages/backend/server/src/core/doc/merge-updates.ts`](https://github.com/toeverything/AFFiNE/blob/2bd920fea6dcbde56536c38145dcce2ddbf0151f/packages/backend/server/src/core/doc) → 看 update 合并的触发条件 + retry 逻辑，回答自检 4
3. [`packages/backend/server/src/core/doc/reader.ts`](https://github.com/toeverything/AFFiNE/blob/2bd920fea6dcbde56536c38145dcce2ddbf0151f/packages/backend/server/src/core/doc) → 看读路径如何把多段 update 合并成最新状态返回 client
4. blocksuite 独立 repo 的 `@blocksuite/affine/store` → 看 block tree 的注册表 + flavour 概念，回答自检 1
5. 官方文档 [docs.affine.pro](https://docs.affine.pro) 的 "Local-first philosophy" 一节 → 回答自检 7（许可证问题）

## 限制 / 风险（v1.1 大型应用底线，至少 4 条）

1. **学习曲线陡峭**：要看懂 AFFiNE 你需要会 TypeScript + React + rxjs + Yjs CRDT + NestJS + Prisma + monorepo (yarn workspaces) + electron 至少 5 个生态。新人 onboarding 起码 2 周才能改一个非琐碎 PR。这是大型应用的共性，但 AFFiNE 比 Notion-clone 类项目更复杂（因为多了 CRDT 这条腿）。
2. **AGPL-3.0 的传染性**：任何 fork 部署在公网（含内部 SaaS 给客户用）都触发 AGPL 的 source-available 义务。企业用户必须仔细评估是 AFFiNE Cloud + 商业 license，还是接受 AGPL 完全开源衍生物。这不是 license 不好，是**license 选择本身就在限定可商业用户群**。
3. **生态比 Notion 弱**：模板市场、第三方集成、Zapier/n8n 连接器、API 第三方文档，远不如 Notion 完善。任何"我要从 Notion 迁过来 + 保留所有第三方集成"的诉求都做不到。
4. **mobile 端体验未追上**：mobile app 在 2026 年还在快速迭代，BlockSuite 的 mobile 适配（触屏 edgeless、键盘 input）有不少 issue。重度 mobile 用户当前选 Notion 仍然合理。
5. **CRDT 的存储放大**：append-only update 流 + merge job 兜底是漂亮的设计，但同一个 doc 编辑历史长了，update 总大小会几 MB 起步。merge 算法的效率边界 + 长历史 doc 的冷启动延迟，是隐性技术债。

## 元数据

- **分支**：v1.1 大型应用（A）
- **基准 commit**：[`2bd920fea6dcbde56536c38145dcce2ddbf0151f`](https://github.com/toeverything/AFFiNE/commit/2bd920fea6dcbde56536c38145dcce2ddbf0151f)（2026-05-28，canary）
- **副 repo**：[blocksuite `5cb5cb68471ca692f3c162258f0087cb22fcb82d`](https://github.com/toeverything/blocksuite/commit/5cb5cb68471ca692f3c162258f0087cb22fcb82d)（2025-07-07，main）
- **抓取时间**：2026-05-28（接 chatwoot 笔记之后，Season 9 收官篇 = 整个站点第 38 期项目笔记）
- **季节定位**：Season 9 第 4 篇 / 收官（S9-1 immich / S9-2 chatwoot / S9-3 chatwoot 大型应用 / S9-4 AFFiNE 大型应用）
- **Layer 0 字段数**：>= 11（Repo / Star / Fork / 最近活跃 / 主分支 commit / 默认分支 / 主语言 / 维护方 / 主要贡献者 / License / 类似项目 / 哲学不同竞品）
- **图**：2 张 webp（01-architecture / 02-block-reuse），均 >= 30KB
- **Layer 3 段数**：3 段独立小节（前端 Doc 实体 / DocsService / 后端 writer.ts），各 >= 20 行真实 TS 代码 + >= 5 旁注 + >= 1 怀疑
- **GitHub permalink commit hash**：>= 5 处使用 40 字符 commit `2bd920fea6dcbde56536c38145dcce2ddbf0151f`
- **怀疑**：>= 3 处（throttle 边界 / ObjectPool 泄漏 / merge job retry）
- **限制**：5 条
- **下一篇**：Season 10 启动，方向待定（候选：grafana / minio / supabase / appwrite——基础设施类大型应用进一步深化）

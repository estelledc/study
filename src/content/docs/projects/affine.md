---
title: AFFiNE — 文档和白板共用同一棵 block 树的开源知识库
来源: toeverything/AFFiNE GitHub README
日期: 2026-05-29
分类: 开源工具
难度: 中级
---

## 是什么

AFFiNE 是一个**开源的知识库工具**，把"写文档"和"画白板"做成同一个东西。日常类比：像一张能折叠的纸——平铺时是文档，立体翻折后是画板，但你写在上面的字始终是同一份字，不会因为折叠而被复制成两份。

你新建一个 doc，写下"今天的会议笔记"。在顶部点一下切换按钮，刚才那行字立刻出现在一块自由画板里，可以拖动、可以画箭头连到其他文字。再切回去，文档模式里那行字也跟着改了——因为它们**根本是同一段数据**。

这套机制让 AFFiNE 同时是 Notion 的替代品（文档）和 Miro 的替代品（白板），但它的目标不是"功能合并"，而是"数据合并"。

## 为什么重要

不理解 AFFiNE 的设计思路，你就无法解释这些事：

- 为什么有些团队愿意花时间自托管一个笔记工具，而不是直接付钱用 Notion
- 为什么"local-first"（本地优先）这个词最近几年突然流行——和 CRDT 这种数学工具有什么关系
- 为什么"开源"和"商业化"可以同时存在（AGPL + commercial 双 license）
- 为什么"文档"和"白板"两类工具市面上一直分开，但底层其实可以统一

## 核心要点

AFFiNE 把三件事糅在一起：

1. **block 是原子单位，不是文件**：传统工具里"文档"和"白板"是两种文件，各自有 schema。AFFiNE 把一段文字、一张图、一个标题都视为 block，不论显示在文档里还是白板里都是同一份 block。类比：乐高积木，可以摆成房子也可以摆成车，但积木块本身不变。

2. **CRDT 处理多人同步**：你和同事各自离线编辑同一个 doc，再次联网时不需要"谁先谁后"的判断——数学上保证两份编辑能自动合并不冲突。类比：两个画家在两张透明纸上画同一幅画，叠起来时颜料不会互相冲掉。

3. **本地优先（local-first）**：数据先存在你的设备（IndexedDB 或 SQLite），云端只是"可选的中转站"。断网照常工作，自托管就是把中转站换成你自己的服务器。类比：把云盘当备份，主文件还在自己电脑里。

## 实践案例

### 案例 1：一行代码切换文档/白板模式

```typescript
togglePrimaryMode() {
  this.setPrimaryMode(
    this.getPrimaryMode() === 'edgeless' ? 'page' : 'edgeless'
  );
}
```

**逐部分解释**：

- `edgeless` 是白板模式，`page` 是文档模式
- 整个切换只是改一个字段，**不复制 block、不迁移数据**
- 因为底层是同一棵 block 树，UI 层只是换种渲染方式，类似"同一份 JSON 用列表渲染还是表格渲染"

### 案例 2：本地存储不依赖云

```typescript
// 简化伪代码：写一段文字
ydoc.getText('content').insert(0, '今天的会议笔记');

// Yjs 把这次操作编码成一段二进制 update
const update = encodeStateAsUpdate(ydoc);

// 通过 idb / Dexie 这类封装写入本地 IndexedDB
await db.put('updates', update, 'doc-123');
```

整个过程没碰服务器。下次联网时把累积的 update 推给后端，后端只需要存储并转发 update，不负责手写冲突合并；真正的合并发生在客户端。

### 案例 3：自托管启动

```bash
git clone https://github.com/toeverything/AFFiNE
cd AFFiNE

# 起依赖容器
docker compose -f .docker/dev/compose.yaml up -d postgres redis

# 装依赖、跑 migration、起后端
yarn install
yarn workspace @affine/server prisma migrate deploy
yarn workspace @affine/server start

# 另起 frontend
yarn workspace @affine/web dev
```

后端是 NestJS + Postgres + Redis 三件套。整套起来后浏览器打开 localhost:8080 就能注册账号用。这是和 Notion 最直接的差异——Notion 没有任何"自己装一份"的路径。

## 踩过的坑

1. **AGPL 传染性**：任何 fork 部署给外部用户都触发"必须开源衍生改动"。企业用之前要算清楚是用商业 license 还是接受开源义务，否则法务踩雷。

2. **学习曲线陡**：要看懂源码需要会 TypeScript + React + Yjs + NestJS + Prisma + monorepo 至少 5 个生态，新人 onboarding 通常 2 周起。比读普通 Notion-clone 项目复杂得多。

3. **CRDT 存储会膨胀**：append-only 的 update 流写多了会几 MB 起步，需要后台 merge job 定期合并。merge job 挂了或来不及，存储会无限增长——生产部署一定要监控这张表。

4. **生态比 Notion 弱**：模板市场、第三方集成、API 文档完整度都还在追赶。想"无缝从 Notion 迁过来 + 保留所有连接器"的诉求做不到。

## 适用 vs 不适用场景

**适用**：

- 想要"数据归我 + 文档和白板都要 + 团队协作 + 自托管选项"的团队
- 学习 Yjs CRDT、local-first 架构、TypeScript monorepo 的实战范例
- 离线工作场景（出差 / 网差环境 / 内网部署）

**不适用**：

- 要求"开箱即用 + 不维护后端"——Notion 仍然是最省心的选择
- 重度依赖 Notion 第三方集成（Zapier、Notion API 接的工具链）
- 移动端为主的用户——AFFiNE 的 mobile 端 2026 年还在迭代
- 闭源商业产品想 vendor 它的代码——AGPL 不允许

## 历史小故事（可跳过）

- **2022 年**：toeverything 团队开源 AFFiNE 第一版，定位是 "Notion + Miro + Airtable 的开源融合"。当时的 block 模型还很初级，doc 和 whiteboard 是分开实现的。
- **2023 年**：架构大改，把编辑器引擎抽出独立 repo（BlockSuite），doc 和 whiteboard 开始共享同一棵 block 树——这是"hyper-merged"的真正诞生。
- **2024 年**：用 Yjs 替换早期同步方案，正式确立 local-first 路线。AFFiNE Cloud 上线，定下 AGPL + commercial 双 license 模式。
- **2025 年**：移动端 app（iOS / Android）发布，BlockSuite 适配触屏交互。
- **2026 年初**：v0.26 系列，stars 破 6.8 万，11000+ commits、550+ releases。仍是高频活跃项目，每周多次合并到 canary 分支。

## 学到什么

1. **"数据格式统一"比"UI 统一"更深刻**：很多工具号称"all-in-one"，但底层各功能各存一份；AFFiNE 在 block 颗粒度上真正合并，UI 只是视图。

2. **server 可以很笨**：传统协作工具的 server 解析 + 合并 + 广播；AFFiNE 的 server 只做存储 + 转发，所有合并逻辑放在客户端的 CRDT 引擎里。这是 local-first 的精髓。

3. **license 是产品决策**：选 AGPL 既能开源吸引贡献者，又能用 commercial license 卖给企业——但代价是限制了"想白嫖部署"的用户群。

4. **DDD 模块化在前端**：70+ 个 module 用 Service/Entity/Scope 切分，比 Redux + reducer 文件夹清爽得多——值得借鉴到任何中大型 React 项目。

## 延伸阅读

- 官方文档：[docs.affine.pro](https://docs.affine.pro/) —— Local-first philosophy 那节最值得读
- Yjs 入门：[Yjs documentation](https://docs.yjs.dev/) —— 理解 CRDT 二进制 update 的工作原理
- local-first 宣言：[Local-First Software](https://www.inkandswitch.com/local-first/) —— Ink & Switch 实验室的原始论文，AFFiNE 设计哲学的源头
- BlockSuite 独立 repo：[toeverything/blocksuite](https://github.com/toeverything/blocksuite) —— 想做 block-based 编辑器但不想要整套 backend，单用这个包
- [[yjs]] —— AFFiNE 的同步引擎
- [[crdt-json]] —— CRDT 数学基础

## 关联

- [[yjs]] —— AFFiNE 把 Yjs 用到极致的产品级范例
- [[crdt-json]] —— 文档协作 CRDT 的论文基础
- [[excalidraw]] —— 同样是开源白板，但只做白板不做文档
- [[prosemirror]] —— 另一种富文本编辑器架构，与 BlockSuite 思路对照
- [[nestjs]] —— AFFiNE 后端用的 Node.js 框架
- [[react]] —— 前端 UI 库
- [[paxos]] —— 协作系统的另一类一致性方案，与 CRDT 形成对比

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[collabora-online]] —— Collabora Online — 浏览器里直接编辑 Office 文档的开源后端
- [[crdt-json]] —— CRDT JSON — 协同编辑 JSON 数据结构
- [[excalidraw]] —— Excalidraw — 手绘风协作白板
- [[nestjs]] —— NestJS — 把 Angular 思想搬到 Node.js 后端的企业级框架
- [[paxos]] —— Paxos — 分布式共识算法
- [[prosemirror]] —— ProseMirror — schema 先定 DOM 后服从的富文本编辑器框架
- [[react]] —— React UI 组件库
- [[tldraw]] —— tldraw — 把白板做成可嵌入的 SDK
- [[yjs]] —— Yjs — 让任何编辑器都能接的协同编辑内核


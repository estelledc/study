---
title: Anytype — 本地优先块编辑器
来源: 'https://github.com/anyproto/anytype-ts'
日期: 2026-07-07
分类: editors
难度: 初级
---

## 是什么

Anytype 是一个**本地优先、点对点同步、端到端加密的知识工作台**，桌面客户端代码在 `anytype-ts` 仓库里。

日常类比：它像一个离线也能开的个人资料馆。Notion 更像租一间云端办公室；Anytype 更像把文件柜放在自己家里，再让几台自己的设备互相对账。

它的基本单位不是“页面”，而是 **Object**。笔记、任务、书、电影、联系人都可以是 Object，再用 Type 和 Property 给它们分类。

如果用最小 TypeScript 伪代码表示，它的直觉大概是：

```ts
const book = {
  type: "Book",
  properties: { status: "reading", author: "Ursula K. Le Guin" },
  blocks: ["读书摘录", "自己的想法"],
  links: ["related-note-id"],
}
```

这段不是官方 API，只是帮助理解：Anytype 关心的是“一个对象是什么类型、有哪些属性、和谁相连”，而不是只把内容堆成一页文档。

## 为什么重要

不理解 Anytype，下面这些事很难说清：

- 为什么“离线能用”不是小功能，而是整个架构的出发点：数据先在本机成立，再考虑同步。
- 为什么它不像普通云笔记那样依赖中心服务器读写：同步层更像设备之间的加密转运。
- 为什么它要把 Pages / Tasks / Books 都叫 Objects：统一对象模型让查询、图谱、模板能复用。
- 为什么开发这个客户端比写普通 Electron 应用复杂：前端、Go 中间件、protobuf、gRPC、加密同步都要接上。

## 核心要点

1. **本地优先**：先把资料存在本机，再让网络同步补位。类比：你先在自己的本子上写，网络只是把几本本子对齐，不是唯一原稿。

2. **对象图模型**：所有内容都是 Object，Type 像文件夹标签，Property 像表格列。类比：图书馆不是只有书架，还有作者、主题、借阅状态这些索引。

3. **加密同步分层**：客户端只把加密后的变化交给同步网络，读取内容仍靠自己的密钥。类比：快递员可以搬箱子、按地址分拣，但打不开箱子里的信。

## 实践案例

### 案例 1：从源码跑桌面端

README 给的主线是：先装 JS 依赖，再准备 middleware / protobuf，最后跑 Electron 桌面端。

```bash
git clone https://github.com/anyproto/anytype-ts.git
cd anytype-ts
bun install
./update.sh ubuntu-latest amd
bash scripts/generate-protos.sh --from-dist
bun run start:dev
```

逐部分解释：

- `bun install`：安装桌面前端、构建脚本、protobuf 生成工具需要的依赖。
- `./update.sh ...`：按平台下载匹配版本的 `anytypeHelper` 和 proto 资源。
- `generate-protos.sh --from-dist`：从下载好的 proto 生成 TypeScript 绑定和 gRPC service registry。
- `bun run start:dev`：启动 Vite，再启动 Electron；Electron 关掉后开发服务器也会清理。

这个案例适合想读客户端源码的人。它提醒你：Anytype Desktop 不是纯前端，桌面 UI 背后还有本地 helper 和协议绑定。

### 案例 2：用 Web Mode 调浏览器环境

仓库文档还提供了 Web Mode，目标是开发和测试，不是正式浏览器版。

```bash
bun run start:web

ANYTYPE_USE_SIDE_SERVER=http://127.0.0.1:31008 bun run start:web
```

逐部分解释：

- 第一行会自动启动 `anytypeHelper`、gRPC-web 代理和 Vite，并打开浏览器。
- 第二行表示你已经单独跑了 helper，只让网页连到外部 gRPC-web 服务。
- Web Mode 会 mock 一部分 Electron API，所以菜单栏、托盘、原生文件系统能力不能按正式桌面端理解。

这个案例适合调 React 页面、路由、上传流程。它不适合拿来判断 Anytype 的完整安全边界，因为正式产品仍是桌面和移动端。

### 案例 3：用 Type + Query 做学习资料库

官方用例里有 Study Notes：把课程安排、教材、笔记、作业、任务连成一个图。

```text
/Objects -> Study Note
Type: Study Note
Properties: Course, Week, Status, Source

/Query -> Type: Study Note
Filter: Course is "Operating Systems"
Sort: Week ascending
```

逐部分解释：

- `/Objects` 来自编辑器命令菜单，用来新建指定类型的对象。
- `Type: Study Note` 让每条学习笔记进入同一类对象，之后能被 Query 找到。
- `Properties` 像表格列，但它挂在对象上，可以被筛选、排序、批量编辑。
- `/Query` 不是把对象复制进数据库，而是给图谱做一个实时过滤视图。

这个案例说明 Anytype 的重点不是“页面写得漂亮”，而是让个人知识逐渐变成可查询、可连接的对象图。

## 踩过的坑

1. **跳过 protobuf 生成会直接构建失败**：fresh checkout 没有 `middleware/` 和 `src/ts/lib/api/service.ts`，因为它们是生成物且被 git 忽略。

2. **Linux 反复要恢复短语通常不是账号坏了**：常见原因是系统没有可用 keychain，需要装 GNOME Keyring 一类的密钥存储。

3. **Web Mode 不等于正式 Web 版**：官方 FAQ 说明产品没有普通浏览器版；仓库里的 Web Mode 是开发测试通道。

4. **local-only 不代表零网络请求**：FAQ 里说明不会请求 Anytype Network，但 telemetry 或嵌入块、书签抓取等功能仍可能发请求。

## 适用 vs 不适用场景

**适用**：

- 想把日记、任务、读书、项目资料放进同一个本地优先工作台。
- 想用 Type / Property / Query 管理个人知识，而不是只靠文件夹层级。
- 对隐私和密钥控制敏感，希望同步节点不能读内容。
- 想学习 Electron + TypeScript 客户端如何接 Go middleware、protobuf 和 gRPC。

**不适用**：

- 只想要浏览器里打开就能用的 SaaS 协作文档。
- 团队已经重度依赖 Notion 数据库、权限、自动化和第三方集成。
- 主要在移动端使用复杂视图，因为部分 Query 搜索、批量选择、看板、日历、图谱视图在移动端受限。
- 想找一个宽松 MIT 的完整应用源码；桌面客户端使用 Any Source Available License。

## 历史小故事（可跳过）

- **Any 团队**：Anytype 由 Any 这个瑞士协会推进，目标是把个人数据控制权从云端平台拿回用户手里。
- **桌面客户端**：`anytype-ts` 是 macOS、Windows、Linux 桌面客户端，技术栈以 Electron + TypeScript 为主。
- **同步协议**：底层同步理念和 `any-sync` 相关，强调 local-first、P2P、E2E、加密 DAG 和可切换 provider。
- **社区演进**：项目从个人知识库扩展到 Channels、Chats、Gallery、协作空间，GitHub star 已经是数千到 8k+ 量级。
- **工程取舍**：为了安全和离线体验，它牺牲了一部分“打开网页立即协作”的便利性。

## 学到什么

1. **本地优先是一种产品哲学，也是一种工程约束**：UI、搜索、同步、密钥恢复都要围绕本机数据设计。
2. **对象图比普通页面更适合长期知识管理**：Type 和 Property 让内容以后还能被重新组织。
3. **端到端加密不是一句口号**：密钥、索引、备份节点、设备信任假设都会影响真实安全边界。
4. **读大型客户端要先找生成物链路**：middleware、protobuf、service registry 这种“跑前生成”的部分，经常是新人第一坑。

## 延伸阅读

- 官方仓库：[anyproto/anytype-ts](https://github.com/anyproto/anytype-ts)
- 官方文档：[Anytype Docs — Welcome](https://doc.anytype.io/anytype-docs)
- 安全文档：[Privacy & Encryption](https://doc.anytype.io/anytype-docs/advanced/data-and-security/how-we-keep-your-data-safe)
- 同步协议：[anyproto/any-sync](https://github.com/anyproto/any-sync)
- [[logseq]] —— 同样是知识图谱式笔记，但更偏大纲和本地文件。
- [[affine]] —— 同类 Notion / Miro 混合方向，可对比云协作和本地优先的差异。

## 关联

- [[logseq]] —— 对比“块 + 图谱”在知识管理里的另一种实现方式。
- [[affine]] —— 对比开源知识工作台如何在白板、文档、数据库之间取舍。
- [[joplin]] —— 对比本地笔记、同步和加密在传统笔记软件里的形态。
- [[yjs]] —— Anytype 的协作层不是 Yjs，但都面对多端编辑后的状态合并问题。
- [[automerge]] —— 用 CRDT 理解 local-first 应用为什么能离线修改再合并。
- [[libsignal]] —— 对比端到端加密在消息系统和知识库系统中的不同边界。
- [[sqlite]] —— 本地优先应用常需要认真对待本机存储、索引和迁移。

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

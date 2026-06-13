---
title: AppFlowy — 用 Rust 做内核、Flutter 做界面的开源 Notion
来源: 'https://github.com/AppFlowy-IO/AppFlowy'
日期: 2026-06-13
分类: CLI
子分类: 编辑器与 IDE
难度: 初级
provenance: pipeline-v3
---

## 是什么

AppFlowy 是一个**开源的 Notion 替代品**：Flutter 画界面，Rust 干所有重活（存数据、搜内容、多人协同），数据默认存在你自己的电脑上。

日常类比：Notion 像租精装公寓——拎包入住、漂亮省心，但家具不能改、笔记数据在别人家。AppFlowy 像**自己装修的工作室**——墙面（UI）用 Flutter 统一刷漆，水电承重墙（数据库、搜索、同步）用 Rust 浇筑；数据落本地 SQLite，想多人协作再接 AppFlowy Cloud；AGPL-3.0 许可下你可以 fork、改模块、甚至换整套 UI。

技术上看：它用**单份 Flutter 代码**覆盖 macOS / Windows / Linux / iOS / Android，**单份 Rust 代码**承载全部业务逻辑，中间通过 FFI（外部函数接口）桥接。文档编辑的协同冲突不靠"最后保存的覆盖前面的"，而是用 CRDT（无冲突数据类型）——你断网写的笔记，联网后会自动和别人的修改合并。

## 为什么重要

不理解 AppFlowy 的架构思路，下面这些事很难解释：

- 为什么一个笔记应用要用两种语言写——Flutter 管"看起来什么样"，Rust 管"数据怎么存、怎么搜、怎么同步"，各做各擅长的事
- 为什么断网也能编辑、联网后不会丢内容——CRDT 保证"你改你的、我改我的，联网后数学上一定能合并"，不靠中央服务器加锁
- 为什么"数据在本地"这个需求催生了一整个项目——70k+ GitHub stars 说明很多人愿意为数据主权付出"自己编译部署"的代价
- 为什么 FFI 桥接层的设计（Protobuf + Event-Dispatch）比"每个 Rust 函数各写一个 Dart 调用"更可持续——模块可插拔，改一处不影响全局

## 核心要点

1. **Flutter 画皮，Rust 做骨**：用户点一个按钮，Flutter 把操作序列化成字节，通过 FFI 丢给 Rust；Rust 跑完业务逻辑（查 SQLite、改 CRDT、搜 Tantivy），把结果序列化回来，Flutter 刷新界面。类比：餐厅点菜——服务员（Flutter）只负责传菜单和上菜，厨房（Rust）负责切、炒、装盘。服务员不懂炒菜，厨师不管摆盘。

2. **CRDT 让"断网编辑 + 多人协同"不打架**：传统做法是"谁最后保存谁赢"——你写了一大段，别人比你晚半秒保存，你的内容就丢了。CRDT 不这样——每个人的修改都被编码成"操作"（插一段字、删一个字、改一个属性），这些操作数学上保证不管按什么顺序合并，最终结果一致。AppFlowy 基于 Yrs（Yjs 的 Rust 实现）做这件事，编辑内容存在 RocksDB（CollabKVDB）里。

3. **本地优先，云是可选项**：核心数据流是"用户操作 → 先改本地 CRDT → 立刻持久化到 SQLite + RocksDB → 如果连了云，后台异步推送同步"。不连云也能用全部功能，连了云能多端自动合并。这和 Notion 的"所有操作必须过服务器"是根本性的设计差异。

## 实践案例

### 案例 1：Flutter 怎么把"打开文件夹"这个操作交给 Rust

用户点开一个文件夹时，Flutter 侧的代码大致是这样：

```dart
// Flutter 侧：只发事件，不碰数据库
context.read<FolderBloc>().add(OpenFolderEvent(folderId));
```

BLoC 收到事件后，经 Repository 调 `FlowySDK`，底层把 Dart 对象用 Protobuf 序列化成字节数组，通过 FFI 传给 Rust 侧的一个统一入口 `async_event`：

```rust
// Rust 侧：收到字节，反序列化，路由到对应 handler
#[no_mangle]
pub extern "C" fn async_event(port: i64, input: *const u8, len: usize) {
    let bytes = unsafe { std::slice::from_raw_parts(input, len) };
    // 反序列化成 Event { event: String, payload: Vec<u8> }
    // lib-dispatch 根据 event 名找到已注册的 handler，执行业务
    // 结果写回 Dart Port
}
```

**要点**：Flutter 从不直接碰 SQLite 或 RocksDB。它只发事件名字 + 参数，Rust 那边的 `flowy-folder` 模块负责真正打开文件夹、查数据库、返回结果。这就像寄信——你只写收件人和内容，邮局负责实际投递。

### 案例 2：一篇文档从编辑到落盘的完整路径

假设你在 AppFlowy 里写了一段文字，Rust 侧发生的事情：

```rust
// 1. 打开文档时：从 CollabKVDB 加载 CRDT 状态
let encoded: EncodedCollab = collab_kv.get_object(&doc_id)?;
let collab = Collab::new_with_source(CollabOrigin::Local, doc_id, encoded.into())?;

// 2. 编辑：在 Yrs transaction 里改块树
let mut txn = collab.transact_mut();
collab_document::block::insert_block(&mut txn, parent_id, new_block)?;
drop(txn); // transaction 结束时，插件自动把更新写入 RocksDB

// 3. 若启用了云同步，同一批更新同时推送到远端
```

**要点**：编辑不是直接写 SQL——而是先在 CRDT（Yrs）内存中产生一个 transaction，transaction 提交时触发两个插件：`RocksdbDiskPlugin` 把二进制态写入本地 RocksDB，`SyncPlugin` 把同一批 update 通过 WebSocket 发给云端的其他设备。

### 案例 3：从零在自己电脑上构建运行

```bash
# 1. 克隆仓库
git clone https://github.com/AppFlowy-IO/AppFlowy.git
cd AppFlowy/frontend

# 2. 安装构建工具（需要 Rust stable + Flutter 3.27.x + cargo-make）
cargo install cargo-make

# 3. 拉 Flutter 依赖
cd appflowy_flutter && flutter pub get && cd ..

# 4. 开发版构建（macOS Apple Silicon）
cargo make --profile development-macos-arm64 appflowy-dev

# 5. 运行
# 产物路径类似 frontend/appflowy_flutter/product/<version>/macos/...
```

**要点**：所有 `cargo make` 必须在 `frontend/` 目录执行，不要在仓库根目录敲。环境要求比普通笔记应用高——需要同时装 Flutter 工具链和 Rust 工具链，macOS 还需要 Xcode。

## 踩过的坑

1. **构建环境搭起来比想象中重**：Flutter SDK + Rust toolchain + LLVM + cargo-make + 各平台 C++ 构建链。macOS 缺 Xcode Command Line Tools 会在 `cargo make` 时卡在链接阶段，报错信息不直观。

2. **Protobuf 序列化有开销，大文档不能整篇穿 FFI**：每次 Flutter ↔ Rust 通信都要序列化/反序列化 Protobuf。一张几十 KB 的文档还好，但如果你存了上百张图片的文档，把整个文档对象穿过 FFI 会很慢。团队的做法是"传路径/引用，不传全量数据"——这和寄照片时发网盘链接而不是把 50MB 附件塞进邮件同理。

3. **AGPL-3.0 许可：自托管改代码必须开源**：如果你 fork AppFlowy 改完自己部署成网络服务，AGPL 要求你把修改开源。这和 MIT/Apache 的"随便用不用公开"不一样。只使用官方客户端不受影响。

4. **FFI 层报错不好追踪**：Rust 侧崩了，Flutter 侧只看到一个 Future 没完成，具体哪行崩、什么原因崩——需要看 Rust 日志而不是 Flutter 的 stack trace。调试时习惯开两个终端：一个跑 Flutter 看 UI，一个 tail Rust 日志。

## 适用 vs 不适用场景

**适用**：

- 想要 Notion 式的块编辑 + 数据库视图，但数据必须在本地、不想依赖云端
- 需要多人协同编辑文档，同时接受"断网能写、联网自动合并"的模式
- 团队有能力自托管 AppFlowy Cloud，或愿意在 AGPL-3.0 下定制
- 想学习 Flutter + Rust + CRDT 混合架构的工程实践——这个项目的架构文档和源码质量很高

**不适用**：

- 只需要纯 Markdown 笔记 + Git 同步 → Obsidian、Logseq 更轻
- 团队没有 Rust/Flutter 人力，只想用现成的 SaaS → 直接用 Notion
- 需要严格的权限控制和审批流 → AppFlowy 的权限模型还在完善中
- 只写纯文本不需要数据库视图 → 传统 Markdown 编辑器足够

## 历史小故事（可跳过）

- **2021 年底**：一个被 Notion 数据不可控困扰的团队，决定从零写一个"数据在自己手里"的 Notion。选了 Flutter + Rust 的组合——Flutter 保证一套代码跑所有平台，Rust 保证性能和内存安全。

- **2022 年**：首次公开发布，GitHub stars 快速增长。社区贡献者涌入，项目结构从单 crate 拆成模块化的 `flowy-*` 系列。

- **2023 年**：AppFlowy Cloud 发布——用户可以选择自托管同步服务器，不再是"要么纯本地、要么依赖官方云"的二选一。

- **2024-2025 年**：数据库引擎重写为 `flowy-database2`（支持 Grid/Board/Calendar/Gallery 四种视图），引入 AI 模块（`flowy-ai`，可接本地 Ollama），移动端体验大幅改善。

- **2026 年初**：GitHub 70k+ stars，370+ 贡献者，AGPL-3.0 许可证下的最成熟开源 Notion 替代品。

## 学到什么

1. **"本地优先 + 可选云"是一种值得重视的架构模式**——不把云端当必需品，而是当增强件。CRDT 让这种模式在数学上可行，不需要妥协"离线只能看不能改"。

2. **两种语言各司其职比"全用一种"更适合跨平台重业务应用**——Flutter 解决了"一套 UI 代码跑所有平台"的难题，Rust 解决了"同一套业务逻辑不想在每个平台重写一遍"的难题。FFI 是粘合剂，Protobuf 是共同语言。

3. **模块化不是一开始设计出来的，是长出来的**——AppFlowy 从单 crate 演进到 `flowy-*` 系列，Event-Dispatch 路由机制让模块可以独立开发、独立测试。这是"一开始别过度设计，等痛了再拆"的好案例。

4. **开源许可选 AGPL-3.0 是认真的**——它既保护了"数据主权"的初心（用户永远可以自己跑），又防止了"大厂拿走改改当 SaaS 卖"的局面。选许可时想清楚"你想阻止什么"比"你想允许什么"更重要。

## 延伸阅读

- 官方仓库：[AppFlowy-IO/AppFlowy](https://github.com/AppFlowy-IO/AppFlowy)
- 架构文档：[AppFlowy Architecture Overview](https://appflowy-io-appflowy.mintlify.app/developer/architecture) — 必读，讲清楚了 DDD 分层和 Event-Dispatch
- 设计博文：[How we built AppFlowy with Flutter and Rust](https://appflowy.com/blog/tech-design-flutter-rust) — 团队自己写的设计决策回顾
- 协作层独立仓库：[AppFlowy-Collab](https://github.com/AppFlowy-IO/AppFlowy-Collab) — 如果想只复用 CRDT 协作层而不要 Flutter 壳，看这个
- [[affine]] — 另一个开源 Notion 替代品，技术栈不同（Yjs + BlockSuite），可以对照看
- [[yjs]] — AppFlowy 用的 Yrs 是 Yjs 的 Rust 移植，理解 Yjs 的 CRDT 模型再看 AppFlowy 会轻松很多

## 关联

- [[affine]] —— 另一个开源 Notion 替代品，BlockSuite + Rust 后端，和 AppFlowy 是同一赛道的两个主要选手
- [[flutter]] —— AppFlowy 的 UI 层框架，Flutter 跨平台渲染 + Dart 语言是选择它的核心理由
- [[sqlite]] —— AppFlowy 用 SQLite 存元数据（用户、工作区、会话），正文不走 SQLite 而走 CollabKVDB
- [[yjs]] —— Yjs 是 CRDT 协同编辑的 JS 实现，AppFlowy 的 Yrs 是它的 Rust 移植
- [[rocksdb]] —— AppFlowy 桌面端用 RocksDB（CollabKVDB 后端）存文档 CRDT 二进制状态
- [[tantivy]] —— Rust 写的全文检索引擎，AppFlowy 用它实现搜索（`flowy-search` crate）
- [[flutter-rust-bridge]] —— Dart ↔ Rust FFI 的通用桥接方案，AppFlowy 自研了 Event-Dispatch 而没有用它

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

---
title: AppFlowy — Rust + Flutter 开源 Notion 替代品
来源: https://github.com/AppFlowy-IO/AppFlowy
日期: 2026-06-13
子分类: 编辑器与 IDE
分类: CLI
provenance: pipeline-v3
---

## 日常类比：把「私人笔记本」做成可拆装的模块化工作台

想象你有一间 **自己装修的工作室**，而不是租来的精装公寓：

- **Notion** 像精装 SaaS：拎包入住、界面漂亮、协作顺手，但家具布局改不了，笔记数据在别人的服务器上，离线或自托管能力有限。
- **AppFlowy** 像 **开源模块化工作室**：墙面（UI）用 Flutter 统一刷漆，水电与承重墙（业务逻辑、数据库、同步）用 Rust 浇筑；默认数据落在本机 SQLite，想协作再接 **AppFlowy Cloud**； AGPL-3.0 许可下你可以 fork、改模块、甚至换整套 UI，而核心「数据引擎」仍是一套跨平台 Rust 库。

零基础学习路径：**先装官方客户端体验 → 理解 Workspace / View / Document 层级 → 摸清 Flutter↔Rust 的 Event-Dispatch → 本地构建一次 → 按需读 `flowy-*` crate**。

---

## 这个项目解决什么问题

### 痛点 1：Notion 好用，但数据与扩展性不可控

[AppFlowy](https://github.com/AppFlowy-IO/AppFlowy) 官方 README 写得很直白：团队曾是 Notion 付费用户，但希望个人用户也能拥有 **同等功能 + 数据主权 + 跨平台原生体验**。开源 + 本地优先，让「笔记即数据资产」而不是「租来的页面」。

### 痛点 2：跨平台笔记应用常陷入「双端两套逻辑」

移动端一套、桌面端一套，同步与冲突处理各写一遍，维护成本爆炸。AppFlowy 用 **单 Flutter 代码库** 覆盖 macOS / Windows / Linux / iOS / Android（及 Web 方向），**单 Rust 工作区** 承载全部业务逻辑，通过 FFI 统一边界。

### 痛点 3：协作编辑的冲突与离线

多人同时改同一段文字，传统「最后写入胜出」会丢内容。AppFlowy 在文档层采用 **CRDT**（基于 [Yrs](https://github.com/y-crdt/yrs)，Yjs 的 Rust 实现），离线编辑生成本地更新，联网后自动合并，无需中央锁。

### 痛点 4：Notion 的 Database / Wiki / AI 要「可自建」

除富文本文档外，还有 **Grid / Board / Calendar / Gallery** 等数据库视图、全文搜索（Tantivy）、可选 AI 能力（`flowy-ai`）。自托管时整条链路可在自己环境跑通。

---

## 核心概念拆解

### 1. 混合架构：Flutter 画 UI，Rust 干重活

| 层 | 技术 | 职责 |
|----|------|------|
| **Presentation** | Flutter Widget + BLoC | 渲染、交互、UI 状态 |
| **Application** | Dart BLoC | 把用户操作转成领域请求，不含复杂业务 |
| **Domain** | Dart 模型 + Protobuf | 业务实体与接口定义 |
| **Infrastructure** | Rust (`frontend/rust-lib/`) | 持久化、CRDT、搜索、同步、权限 |

Rust 侧编译为 **静态库**（macOS/iOS）或 **动态库**（Windows/Linux/Android），Dart 通过 `dart:ffi` 调用。

### 2. 领域层级：User → Workspace → App → View

官方 DDD 博文中的实体关系（随版本演进，核心思想不变）：

```
User
 └── Workspace（工作区）
      └── App / Folder（应用或文件夹）
           └── View（可展示对象：Document、Database、…）
```

- **View** 是抽象：同一套导航树里可以挂文档、多维表、白板等。
- **Folder** 模块（`flowy-folder`）管层级、排序、回收站、收藏。

### 3. Event-Dispatch：Flutter 与 Rust 的「邮局系统」

团队自研 **Event-Dispatch** 模式，而不是早期常见的「每个 Rust 函数直接 FFI 导出」：

1. Flutter 把请求 **Protobuf 序列化** 成字节；
2. 经 `dart-ffi` 的 `async_event` 送进 Rust；
3. `lib-dispatch` 根据 **事件名** 路由到已注册的 Handler（各 `flowy-*` 模块在启动时注册）；
4. Handler 执行业务后，再序列化响应回 Dart；
5. BLoC 收到 Future 完成，重建 Widget。

优点：模块可插拔、可按事件类型分配线程池。代价：序列化开销与认知负担——读代码时要跟着「事件名」跳转。

### 4. 双库持久化：SQLite + CollabKVDB + KVStore

这是读 AppFlowy 源码时最容易误解的一点——**并不是所有数据都进 SQLite**。官方采用 **多引擎分流**：

| 存储层 | 技术 | 存什么 | 典型访问方式 |
|--------|------|--------|--------------|
| **SQLite** | Diesel ORM | 用户资料、工作区元数据、成员关系、AI 聊天历史 | SQL 查询、事务 |
| **CollabKVDB** | RocksDB（桌面）/ IndexedDB（Web） | 文档、多维表、文件夹结构的 **CRDT 二进制态** | `EncodedCollab` 键值读写 |
| **KVStore** | 键值偏好存储 | 主题、语言、服务器地址、会话缓存 | 简单 get/set |

协作实体（Document、Database、Folder）在内存里是 **`Collab` 对象**（封装 [Yrs](https://github.com/y-crdt/yrs)），编辑产生 CRDT transaction；`CollabPersistenceImpl` 把状态序列化成 `EncodedCollab` 刷进 CollabKVDB。需要关系查询的「谁拥有哪个工作区」仍走 SQLite——**元数据用 SQL，正文用 CRDT**，各取所长。

### 5. Local-first + 可选云同步

数据流（架构文档归纳）：

1. 用户操作 **先改本地 CRDT 状态**，并立即持久化到 CollabKVDB；
2. 结构化元数据（新建页面、改标题）同步更新 SQLite；
3. 若连接 **AppFlowy Cloud** 或自托管实例，`SyncPlugin` 经 WebSocket 推送/拉取二进制 update；
4. 远端 update 合并进本地 Yrs 文档，数学上保证 **最终一致**，不靠「最后写入胜出」。

没网也能写；有网时多端自动合并，而不是强依赖在线 API。

### 6. Core Managers：Rust 后端的「五个部门」

`AppFlowyCore` 在启动时按依赖顺序装配五个领域 Manager，Flutter 发来的事件最终由它们处理：

| Manager | Crate | 职责 |
|---------|-------|------|
| **UserManager** | `flowy-user` | 登录、OAuth、会话、工作区切换、数据导入 |
| **FolderManager** | `flowy-folder` | 工作区内的 View 树、排序、收藏、回收站 |
| **DocumentManager** | `flowy-document` | 块编辑器、文档 CRDT 生命周期 |
| **DatabaseManager** | `flowy-database2` | 多维表协调，为每张表维护 `DatabaseEditor` |
| **AIManager** | `flowy-ai` | AI 对话、模型选择、与本地 Ollama 等集成 |

登录成功后，`UserManager` 触发 `AppLifeCycle`，再调用各 Manager 的 `initialize_after_sign_in`——因此读「打开工作区」类 bug 时，要从 **User → Folder → Document** 的初始化链看，而不是只盯 UI。

多维表内部还有 **三层分工**（官方 Database Architecture）：

```
DatabaseManager（工作区级）
  └── DatabaseEditor（单表：行、字段、关系）
        └── DatabaseViewEditor（单视图：筛选、排序、分组）
```

### 7. Rust 工作区主要 Crate

路径：`frontend/rust-lib/`

| Crate | 作用 |
|-------|------|
| `dart-ffi` | C ABI 入口，连接 Dart |
| `flowy-core` | 生命周期、模块装配、配置 |
| `flowy-user` | 登录、OAuth、会话 |
| `flowy-folder` | 工作区与目录树 |
| `flowy-document` | 块编辑器 + CRDT |
| `flowy-database2` | 多维表视图 |
| `flowy-search` | Tantivy 全文检索 |
| `flowy-storage` | 附件与缓存 |
| `flowy-ai` | AI 对话与生成 |
| `lib-dispatch` | 事件注册与路由 |

### 8. 文档模型：Block-based + CRDT

`flowy-document` 把页面看成 **块（Block）** 列表：段落、标题、列表、待办、代码块、图片等。编辑操作转化为 CRDT 操作，适合协同与撤销历史。

### 9. 数据库视图：同一份行数据，多种「透镜」

`flowy-database2` 一张表可切换 Grid（表格）、Board（看板）、Calendar、Gallery。字段类型、筛选、排序、分组在 Rust 层统一处理，Flutter 只负责视图状态。

### 10. AppFlowy-Collab：可独立嵌入的协作层

协作逻辑不只躺在主仓库里——[AppFlowy-Collab](https://github.com/AppFlowy-IO/AppFlowy-Collab) 把 `collab` crate 单独发布，封装 Yrs、持久化插件、文档/数据库/文件夹领域模型。典型调用链：

1. 领域模块（如 `flowy-document`）通过 `Collab` API 改块树；
2. Yrs transaction 触发 **Plugin 钩子**（`RocksdbDiskPlugin` 写本地、`SyncPlugin` 推云端）；
3. 其他已连接客户端收到 update，刷新 UI。

想自建「带 Notion 式协同」的客户端，可以只依赖 `collab` + 自选同步后端，而不必 fork 整个 Flutter 壳。

### 11. 许可与生态

- **许可证**：AGPL-3.0——修改后网络提供服务需开源；自托管前要读清合规要求。
- **社区**：GitHub 7 万+ stars（2026 年初），370+ 贡献者；官方提供 [Mintlify 开发者文档](https://appflowy-io-appflowy.mintlify.app/developer/architecture)。
- **与 AppFlowy Editor**：富文本编辑器是独立 Flutter 包，可单独嵌入其他项目。

---

## 代码示例 1：Rust 侧 FFI 入口与事件分发（简化）

官方文档给出的 FFI 形状如下；真实仓库中还会接入 Tokio 运行时与 `lib-dispatch`：

```rust
// frontend/rust-lib/dart-ffi — 概念示意
#[no_mangle]
pub extern "C" fn async_event(port: i64, input: *const u8, len: usize) {
    let bytes = unsafe { std::slice::from_raw_parts(input, len) };
    // 1. 反序列化 Event { event: String, payload: Vec<u8> }
    // 2. dispatch::find_handler(&event).await
    // 3. 将结果写回 Dart Port
}

// lib-dispatch — 各模块注册处理器
pub fn register_event_handler(event: Event, handler: impl EventHandler) {
    // flowy-folder、flowy-document 等在 flowy-core 初始化时注册
}
```

**阅读技巧**：在仓库里搜具体 **Event 枚举**（如 Folder 相关事件），从 Flutter `Bloc` → `Dispatch` → Rust `handler` 跟一条完整链路，比泛泛读目录快得多。

---

## 代码示例 2：Collab 持久化与 EncodedCollab（Rust 概念）

协作对象从编辑到落盘的路径（简化自 `collab-integrate` / `flowy-database2`）：

```rust
// 打开文档时：从 CollabKVDB 加载二进制 CRDT 状态
let encoded: EncodedCollab = collab_kv.get_object(&doc_id)?;
let collab = Collab::new_with_source(CollabOrigin::Local, doc_id, encoded.into())?;

// 编辑：在 Yrs transaction 里改块树，插件自动刷盘
let mut txn = collab.transact_mut();
collab_document::block::insert_block(&mut txn, parent_id, new_block)?;
drop(txn); // DiskPlugin 将 update 写入 RocksDB

// 若启用云同步，SyncPlugin 把同一批 update 经 WebSocket 发出
```

**要点**：Flutter 从不直接碰 RocksDB；它只发「插入块」「改字段」类 **Event**，由 `DocumentManager` / `DatabaseManager` 在 Rust 里操作 `Collab`。

---

## 代码示例 3：Cargo 工作区与协作依赖

根目录 `frontend/rust-lib/Cargo.toml` 用 workspace 统一管理版本，核心协作 crate 依赖 `collab` 系列（封装 Yrs）：

```toml
[workspace]
members = [
  "lib-dispatch",
  "lib-log",
  "flowy-core",
  "dart-ffi",
  "flowy-user",
  "flowy-folder",
  "flowy-document",
  "flowy-database2",
  "flowy-search",
  "flowy-storage",
  "flowy-ai",
]

[workspace.dependencies]
tokio = { version = "1.38", features = ["full"] }
serde = { version = "1.0" }
collab = { version = "0.2" }
collab-document = { version = "0.2" }
```

单独测 Rust 后端时（文档建议）：

```bash
cd frontend/rust-lib
cargo test --no-default-features
cargo fmt   # 遵循 rustfmt.toml，max_width = 100
```

---

## 代码示例 4：Flutter 侧调用链（概念）

官方设计博文描述的 11 步流程，压缩成开发者日常心智模型：

```dart
// 1. Widget 触发
context.read<FolderBloc>().add(OpenFolderEvent(folderId));

// 2. Bloc 经 Repository 调 FlowySDK（内部 Protobuf + FFI）
final workspace = await folderRepository.openFolder(folderId);

// 3. emit 新状态 → UI rebuild
emit(state.copyWith(currentFolder: workspace));
```

`folderRepository` 底层会把 Dart 对象序列化，调用 Native 侧的 `async_event`。**不要**在 Widget 里直接调 FFI——DDD 分层就是为了把 FFI 锁在 Infrastructure。

---

## 从零构建：macOS / Linux 通用步骤

环境要求（以官方文档为准）：**Flutter 3.27.x**、**Rust stable**、`cargo-make`、`LLVM`、各平台 C++ 构建链。

```bash
# 克隆
git clone https://github.com/AppFlowy-IO/AppFlowy.git
cd AppFlowy/frontend

# 安装构建工具
cargo install cargo-make

# Linux 可跑一键依赖脚本（macOS 见文档 install_macos.sh）
# ./scripts/install_dev_env/install_linux.sh

# 拉取 Flutter 依赖
cd appflowy_flutter && flutter pub get && cd ..

# 开发版构建（Linux x86_64 示例）
cargo make --profile development-linux-x86_64 appflowy-dev

# 发行版
cargo make --profile production-linux-x86_64 appflowy
```

产物路径形如：`frontend/appflowy_flutter/product/<version>/linux/Debug/AppFlowy/`。  
**所有 `cargo make` 命令必须在 `frontend/` 目录执行**，不要站在仓库根目录盲敲。

macOS Apple Silicon 常用 profile：`development-macos-arm64` / `production-macos-arm64`（以 `Makefile.toml` 为准）。

---

## 与 Notion / 其他开源笔记的对比

| 维度 | Notion | AppFlowy | 典型 Markdown 笔记 |
|------|--------|----------|-------------------|
| 开源 | 否 | AGPL-3.0 | 多为 MIT/Apache |
| 本地优先 | 弱 | 强（SQLite） | 强 |
| 块编辑 + 数据库 | 有 | 有（Rust 实现） | 通常无或插件 |
| 技术栈 | 闭源 | Flutter + Rust | Electron / Web |
| 自托管 | 无官方 | AppFlowy Cloud 可自建 | 视项目而定 |
| 协同 | 云端实时 | CRDT + 可选云 | 多为 Git 同步 |

若你关心 **数据在本地、逻辑可审计、UI 可换皮**，AppFlowy 是值得深挖的「Notion 形、开源魂」样本；若只要纯 Markdown + Git，[[trilium]]、Obsidian 可能更轻。

---

## 学习路线建议（零基础 → 能读 PR）

### 第 1 周：用户视角

1. 安装 [官方发布版](https://github.com/AppFlowy-IO/AppFlowy/releases) 或 `brew install --cask appflowy`（macOS）。
2. 创建 Workspace，体验 Document、Database（Grid/Board）、搜索、导入导出。
3. 断网编辑再联网，观察同步行为——建立「本地优先」直觉。

### 第 2 周：架构视角

1. 读 [Architecture Overview](https://appflowy-io-appflowy.mintlify.app/developer/architecture) 与 [Rust Backend](https://appflowy-io-appflowy.mintlify.app/developer/rust-backend)。
2. 读博客 [How we built AppFlowy with Flutter and Rust](https://appflowy.com/blog/tech-design-flutter-rust)（DDD + Event-Dispatch）。
3. 在仓库跟踪 **一条** 打开文件夹的 Event，从 Dart 到 Rust 画时序图。

### 第 3 周：动手构建

1. 按上文命令本地 `appflowy-dev` 跑起来。
2. 改一处 Flutter 文案或图标，确认热重载/重编译流程。
3. 在 `flowy-search` 或 `flowy-document` 里读单元测试，理解模块边界。

### 第 4 周：进阶主题（按需）

- **协同**：`collab-document`、`Yrs` update 二进制格式。
- **搜索**：Tantivy 索引何时重建。
- **AI**：`flowy-ai` 如何接 OpenAI / 本地模型。
- **插件化**：社区 Marketplace 与动态加载的限制（官方有专文讨论 Flutter 动态加载的坑）。

---

## 常见问题

### Q1：为什么用 Rust 而不是全部 Dart？

基础设施层要处理 SQLite、CRDT、搜索索引、文件 IO 和长时间运行的同步任务；Rust 在 **性能、内存安全、跨平台静态库** 上更合适，且可把同一套逻辑给未来非 Flutter 壳复用（官方架构文提到的「换 UI 不换数据组件」策略）。

### Q2：Protobuf + FFI 会不会很慢？

团队承认序列化有成本；大图、大文档场景需要避免把整个文档反复穿过 FFI。学习时留意 **哪些数据走 Protobuf、哪些走文件路径或共享内存**——这是性能优化的关键战场。

### Q3：和 AFFiNE、Logseq 等开源 Notion-like 有何不同？

AppFlowy 的鲜明特征是 **Flutter UI + Rust 厚后端 + Event-Dispatch + 本地 SQLite + CRDT 协同** 的组合；AFFiNE 等另有各自栈（如 Yjs、BlockSuite）。选型时比「功能清单」更重要的是 **数据模型与自托管路径** 是否匹配你的团队。

### Q4：我只想用，不想编译？

直接用官方客户端 + 可选自托管 [AppFlowy Cloud](https://appflowy.com)； AGPL 不影响单纯使用官方二进制。

---

## 小结

AppFlowy 把「Notion 式工作空间」拆成两层可替换能力：**Flutter 负责体验一致的壳**，**Rust 负责数据、协同与搜索的核**；中间用 **Event-Dispatch + Protobuf + FFI** 粘合。零基础读者应先建立 **Local-first → CRDT → 模块化 crate** 三张心智地图，再跟一条事件链路读代码，最后本地 `cargo make` 构建一次——比一上来啃全部 `flowy-*` 更高效。

---

## 参考链接

- 仓库：[AppFlowy-IO/AppFlowy](https://github.com/AppFlowy-IO/AppFlowy)
- 开发者文档：[Architecture](https://appflowy-io-appflowy.mintlify.app/developer/architecture) · [Rust Backend](https://appflowy-io-appflowy.mintlify.app/developer/rust-backend) · [Setup](https://appflowy-io-appflowy.mintlify.app/developer/setup)
- 设计博文：[How we built AppFlowy with Flutter and Rust](https://appflowy.com/blog/tech-design-flutter-rust)
- 从源码构建：[Building on Linux](https://docs.appflowy.io/docs/documentation/appflowy/from-source/environment-setup/building-on-linux)

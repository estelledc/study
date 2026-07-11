---
title: AppFlowy — Rust 写的开源 Notion
来源: 'https://github.com/AppFlowy-IO/AppFlowy'
日期: 2026-07-08
分类: editors
难度: 初级
---

## 是什么

AppFlowy 是一个开源的协作工作台：你可以在里面写文档、管任务、做表格、放知识库，还能选择本地或自托管来控制数据。

日常类比：Notion 像租来的精装办公室，AppFlowy 更像可以买材料自己改的办公室，默认能用，也允许你拆墙、换灯、接自己的服务器。

从命令上看，它不是一个只在浏览器里跑的小网页，而是一个用 Flutter 做界面、Rust 做底层能力的跨平台客户端：

```bash
git clone https://github.com/AppFlowy-IO/AppFlowy.git
cd AppFlowy/frontend
cargo make --profile production-linux-x86_64 appflowy
```

这段命令的重点不是让你马上编译，而是说明一件事：AppFlowy 的价值在于“产品能直接用，源码也能继续改”。

如果你只是想用它，它像一个隐私优先的笔记和项目管理软件；如果你想学习，它又是一个很大的 Flutter + Rust 工程样本。

## 为什么重要

不理解 AppFlowy，下面这些事会很难判断：

- 你会把“开源 Notion”误解成“完全照抄 Notion”，看不懂它为什么强调数据控制、离线体验和自托管。
- 你会在选工具时只比较功能清单，忽略数据放在哪里、以后能不能迁走、团队能不能自己部署。
- 你会把 Flutter 客户端、Rust 后端、AppFlowy Cloud、AppFlowy Editor 混成一团，不知道问题该查哪个仓库或文档。
- 你会以为它适合所有团队，结果碰到协作人数、AI、云同步、许可证或部署维护成本时才发现边界。

## 核心要点

1. **客户端优先**：AppFlowy 先给你一个能装在桌面和移动端的工作台。类比：先有一张能写字的桌子，再考虑要不要把桌子连进办公室网络。

2. **数据控制优先**：它把本地、云端和自托管都放进路线图里，让用户按隐私和协作需求取舍。类比：同一本账本，你可以锁在家里，也可以放到自己租的保险柜。

3. **组件化扩展**：AppFlowy Editor、数据库视图、模板、插件和主题都是“积木”。类比：不是给你一整块焊死的柜子，而是给你抽屉、隔板和滑轨。

## 实践案例

### 案例 1：用 Docker 快速跑起桌面客户端

官方 Docker 文档给了一个 Linux 桌面场景：把 X11、显卡、系统总线和持久化数据卷挂进容器，然后运行 AppFlowy 客户端。

```bash
docker run --rm \
  -v $HOME/.Xauthority:/root/.Xauthority:rw \
  -v /tmp/.X11-unix:/tmp/.X11-unix \
  -v /dev/dri:/dev/dri \
  -v /var/run/dbus/system_bus_socket:/var/run/dbus/system_bus_socket \
  -v appflowy-data:/home/appflowy \
  -e DISPLAY=${DISPLAY} \
  appflowyio/appflowy_client:main
```

逐部分解释：

- `appflowyio/appflowy_client:main` 是要运行的 AppFlowy 客户端镜像。
- `appflowy-data:/home/appflowy` 把用户数据放进 Docker volume，容器删掉后数据还在。
- `DISPLAY`、`.Xauthority`、`/tmp/.X11-unix` 是让容器里的 GUI 能显示到宿主机桌面。
- `/dev/dri` 是图形加速相关挂载，少了它可能能跑但体验差。
- 这个案例适合“先试试看”，不适合完全不懂 Docker 和 Linux 图形栈的新手长期使用。

### 案例 2：从源码构建，确认自己能改客户端

官方 Linux 构建文档的核心路径是：克隆仓库，准备 Flutter/Rust 环境，进入 `frontend`，用 `cargo make` 调构建脚本。

```bash
git clone https://github.com/AppFlowy-IO/AppFlowy.git
cd AppFlowy
./frontend/scripts/install_dev_env/install_linux.sh
cd frontend
cargo make --profile development-linux-x86_64 appflowy-dev
```

逐部分解释：

- `git clone` 拿到的是整个客户端源码，而不是一个插件包。
- `install_linux.sh` 会准备项目需要的开发环境；官方文档也提醒 Flutter 版本要匹配。
- `cd frontend` 很关键，因为构建脚本和 Flutter 工程主要在这个目录下面。
- `development-linux-x86_64 appflowy-dev` 是开发构建，适合调试；发布构建则换成 `production-linux-x86_64 appflowy`。
- 这个案例的真实用途是贡献代码、排查 bug，或学习大型 Flutter 桌面项目怎么组织。

### 案例 3：把 AppFlowy Editor 嵌进自己的 Flutter 应用

AppFlowy Editor 是 AppFlowy 的核心富文本编辑器组件，也作为 Flutter package 给外部项目使用。

```bash
flutter pub add appflowy_editor
flutter pub get
```

```dart
final editorState = EditorState.blank(withInitialText: true);
final editor = AppFlowyEditor(
  editorState: editorState,
);
```

逐部分解释：

- `flutter pub add appflowy_editor` 把编辑器组件加进 Flutter 项目。
- `EditorState.blank` 创建一个空白文档状态，像拿出一张空白纸。
- `AppFlowyEditor` 是真正渲染和处理输入的编辑器 widget。
- 官方还展示了从 JSON 创建文档、定制主题、定制快捷键等方式；这说明 AppFlowy 不是只有成品 App，还有可复用的编辑器积木。
- 如果你的目标是做自己的写作工具，先理解 AppFlowy Editor 比直接读完整 AppFlowy 更轻。

## 踩过的坑

1. **把自托管等同于免费无限协作**：官方 AppFlowy Cloud 仓库说明它采用 open-core 模式，自托管免费层也有席位和访客限制。

2. **Flutter / Rust 版本随手装最新**：官方文档明确写了受支持的 Flutter 版本和 Rust 版本线索，版本不匹配会让构建错误变得很绕。

3. **Docker 桌面容器打不开窗口**：它需要访问宿主机 X server，权限或网络参数没配好时会出现 `cannot open display`。

4. **只看主仓库不看组件仓库**：AppFlowy Editor、AppFlowy Cloud 等能力分散在不同官方仓库或文档页，定位问题时要先分清模块。

## 适用 vs 不适用场景

**适用**：

- 想要 Notion 类体验，但更在意数据控制、离线能力和自托管选择。
- 想学习大型 Flutter 桌面 / 移动应用如何接 Rust 底层能力。
- 想在自己的 Flutter 应用里使用可定制富文本编辑器。
- 团队有基础设施能力，愿意为自托管、升级和备份付出维护成本。

**不适用**：

- 只想要“打开网页就多人协作”，不想碰客户端、部署、版本或账号配置。
- 需要和 Notion 生态完全等价的插件、模板、自动化和第三方集成。
- 对 AGPL / open-core / 商业功能边界没有判断能力，却要把它嵌进公司闭源产品。
- 期待 AI、云同步和高级协作全部本地免费无限用。

## 历史小故事（可跳过）

- **2021 年前后**：AppFlowy 开始以“开源 Notion 替代品”的定位进入大众视野，核心矛盾是 Notion 好用但数据和扩展控制不够自由。
- **早期路线**：项目选择 Flutter 做多端界面，选择 Rust 承担更底层、更强调性能和可靠性的部分。
- **社区增长**：主仓库已经有 7 万以上 star，官网也强调有来自许多国家的社区成员和贡献者。
- **产品演进**：它从笔记 / 表格 / 看板逐渐扩展到 AI、移动端、模板、站点发布和团队协作。
- **云端分化**：AppFlowy Cloud 走 open-core 路线，提醒学习者别把“开源客户端”和“所有云服务完全开源免费”混为一谈。

## 学到什么

- AppFlowy 的关键词不是“复制 Notion”，而是“把工作台的控制权还给用户和团队”。
- Flutter + Rust 的组合适合做跨平台客户端：界面统一，底层能力可以更稳。
- 自托管不是按钮，而是一组长期责任：部署、升级、备份、权限、费用和许可证都要一起算。
- 真正值得学的不是某个页面怎么用，而是它如何把成品应用、可复用编辑器组件和云端协作拆开。

## 延伸阅读

- 官方仓库：[AppFlowy-IO/AppFlowy](https://github.com/AppFlowy-IO/AppFlowy)（README、release、issue 都从这里进）
- 官方文档：[Start here](https://docs.appflowy.io/docs)（先理解数据控制、多平台和可扩展定位）
- 构建文档：[Building from Source](https://docs.appflowy.io/docs/documentation/appflowy/from-source)（按系统选择 Linux / macOS / Windows）
- 编辑器组件：[appflowy_editor on pub.dev](https://pub.dev/packages/appflowy_editor)（学习富文本编辑器积木）
- [[notion]] —— AppFlowy 最常被拿来对比的封闭式协作工作台
- [[flutter]] —— AppFlowy 客户端 UI 的主要技术栈

## 关联

- [[flutter]] —— AppFlowy 用它做跨平台客户端界面。
- [[rust]] —— AppFlowy 用它支撑更底层的可靠性和性能需求。
- [[notion]] —— AppFlowy 的产品定位需要通过 Notion 对比来理解。
- [[docker]] —— 官方给了 Docker 运行客户端和自托管相关路径。
- [[rich-text-editor]] —— AppFlowy Editor 的核心就是可定制富文本编辑。
- [[self-hosting]] —— AppFlowy 的差异点之一是让团队可以自己掌控部署。

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

（暂无反向链接）

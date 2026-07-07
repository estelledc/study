---
title: Yocto — 工业级定制嵌入式 Linux 的标准答案
来源: 'https://github.com/yoctoproject/poky'
日期: 2026-06-24
分类: 嵌入式
难度: 中级
---

## 是什么

Yocto Project 是一套**让你从零定制出自己的嵌入式 Linux 发行版**的构建框架。它的参考实现叫 **Poky**（读作"poky"，像 Pokémon 前两个音节）。日常类比：如果 [[buildroot]] 是"按菜单自动组装奶茶店"，那 Yocto 就是"一整条可乐生产线"——你不仅可以选口味，还能决定用哪条灌装线、换哪种瓶盖、让不同车间各管一段。

输入：一组**配方文件**（recipe，`.bb` 文件）和**层**（layer，按功能分的目录），描述"要编哪些软件、怎么配置、给什么硬件用"。

输出：一个完整的 Linux 发行版镜像——内核 + 根文件系统 + 引导程序 + SDK，可以直接烧进板子。

Yocto 由 Linux 基金会主持，Intel / TI / NXP / AMD 等芯片大厂都是成员。汽车仪表盘、工业网关、智能音箱背后跑的定制 Linux，相当一部分就是 Yocto 产出的。

## 为什么重要

嵌入式 Linux 的难点不在"编译一个内核"——真正难的是：**几十个团队、几百个软件包、十几款不同硬件平台，要出可复现、可维护、能过车规/医疗认证的镜像**。

不理解 Yocto，下面这些事很难做：

- 大公司同时维护 5 款产品（不同 SoC），每款共享 80% 的软件栈但各有定制——手动管理会失控
- 需要跨团队协作：BSP 团队管硬件层、应用团队管业务层、安全团队管补丁——必须有隔离和组合机制
- 要做增量构建：只改了一个应用，不想把内核也重编一遍——Buildroot 做不到，Yocto 的 sstate-cache 可以
- 需要审计每一个二进制的来源和许可证——汽车/医疗行业合规要求

一句话：**小项目用 Buildroot 够了，一旦产品线多、团队大、合规严，就需要 Yocto**。

## 核心要点

Yocto 的架构可以拆成三层抽象，层层叠加：

**1. BitBake——任务调度引擎**

BitBake 是 Yocto 的"大脑"，角色类似 `make`，但更强。它读取所有配方文件，解析依赖关系，生成一张巨大的任务有向无环图（DAG），然后按拓扑序并行执行。类比：工厂里的 MES（制造执行系统），它不自己拧螺丝，但它决定哪条产线先开工、哪个零件等哪个零件。

每个配方（`.bb` 文件）描述一个软件包的生命周期：从哪拉源码（`SRC_URI`）→ 打什么补丁 → 怎么配置（`do_configure`）→ 怎么编译（`do_compile`）→ 怎么安装（`do_install`）→ 怎么打包（`do_package`）。

**2. Recipe（配方）——描述"一个软件怎么编"**

一个 `.bb` 文件就是一个配方。核心变量只有几个：`SRC_URI`（源码在哪）、`DEPENDS`（编译时依赖谁）、`RDEPENDS`（运行时依赖谁）、`LICENSE`（许可证）。BitBake 读完所有配方就知道整张依赖图。

还有 `.bbappend` 文件：它不新建配方，而是在已有配方上"追加"修改。类比：你不需要复制整份菜谱来改一个步骤，只需要写一张便签"第 3 步把盐换成酱油"贴上去。

**3. Layer（层）——按职责隔离的目录**

Layer 是 Yocto 最核心的设计。每个 layer 是一个独立目录（以 `meta-` 开头），包含一组相关的配方和配置。典型分层：

- `meta`（OE-Core）：基础包，busybox / glibc / gcc 等
- `meta-poky`：Poky 发行版的默认配置
- `meta-yocto-bsp`：官方支持的几块参考板
- `meta-ti` / `meta-freescale`：芯片厂商提供的 BSP 层
- `meta-mycompany`：你自己公司的业务层

层可以叠加、覆盖、组合。A 团队维护硬件层，B 团队维护应用层，互不干扰，最后 BitBake 把所有层合并构建。

## 实践案例

### 案例 1：用 Poky 构建 QEMU 最小系统

```bash
# 克隆 Poky（Yocto 的参考发行版）
git clone -b scarthgap git://git.yoctoproject.org/poky
cd poky

# 初始化构建环境（会创建 build/ 目录）
source oe-init-build-env

# 构建最小镜像（首次约 1-2 小时）
bitbake core-image-minimal

# 用 QEMU 启动它
runqemu qemux86-64
```

`core-image-minimal` 是 Yocto 预定义的最小镜像配方，只包含 busybox + 基础启动脚本，产出约 10 MB。

### 案例 2：用 .bbappend 给已有包打补丁

假设你要给 `busybox` 加一个自定义补丁，不需要 fork 整个 `meta` 层：

```
# 在你自己的层里创建追加文件
meta-mycompany/recipes-core/busybox/busybox_%.bbappend

# 内容：
FILESEXTRAPATHS:prepend := "${THISDIR}/files:"
SRC_URI += "file://fix-my-bug.patch"
```

BitBake 会自动把这个补丁合并到 busybox 的构建流程中。你的层和上游层完全解耦。

### 案例 3：创建自己的发行版配置

```bash
# meta-mycompany/conf/distro/mydistro.conf
DISTRO = "mydistro"
DISTRO_NAME = "My Embedded Linux"
DISTRO_VERSION = "1.0"
DISTRO_FEATURES = "wifi bluetooth systemd"

# 在 build/conf/local.conf 里切换
DISTRO = "mydistro"
MACHINE = "raspberrypi4-64"
```

一份 `distro.conf` 决定了整个发行版的特性集——有没有 systemd、用不用 wayland、开不开 SELinux。切换 `MACHINE` 就能出不同板子的镜像，业务代码不用改。

## 踩过的坑

1. **首次构建极慢**：Yocto 首次构建会从源码编译整个工具链（gcc + glibc + binutils），在 8 核机器上也要 1-2 小时。但它会把中间产物存进 **sstate-cache**（共享状态缓存），之后只重编改了的包。新手常在第一次构建时以为卡住了——其实正常。

2. **磁盘空间黑洞**：一次完整构建轻松占 50-100 GB（所有源码 + 中间产物 + sstate-cache）。不预留空间会在编译到一半时 "No space left on device"。官方建议至少 150 GB 空闲。

3. **Layer 优先级冲突**：多个层里有同名配方时，BitBake 按 `BBFILE_PRIORITY` 决定谁赢。如果你的层优先级设低了，你的 `.bbappend` 可能被忽略，排查起来很头疼。用 `bitbake-layers show-appends` 可以检查。

4. **配方语法非 Python 非 Shell**：`.bb` 文件的语法是 BitBake 自创的 DSL（混合了 Python 和 Shell 片段），新手常搞混哪段是 Python、哪段是 Shell。关键区分：`python do_xxx() { ... }` 是 Python，`do_xxx() { ... }` 是 Shell。

## 适用 vs 不适用场景

**适用**：

- 多产品线、多硬件平台的嵌入式 Linux 开发——layer 机制天然支持组合
- 需要增量构建和构建缓存——sstate-cache 让改一个包只重编一个包
- 合规要求严格的行业（汽车/医疗/航空）——Yocto 能导出完整的许可证清单和 SBOM
- 需要生成 SDK 给应用开发者——`bitbake -c populate_sdk` 一键产出交叉编译 SDK

**不适用**：

- 个人小项目、一块板子一种镜像——Yocto 的学习成本和构建时间远超 [[buildroot]]
- 需要运行时包管理器（apt/opkg）的场景——Yocto 能做但配置复杂，不如 OpenWrt 顺手
- 桌面/服务器 Linux——直接用 Ubuntu / Fedora
- 纯 RTOS 需求——用 [[freertos]] / [[zephyr]] / [[nuttx]]，它们是微控制器级别的

## 与 Buildroot 的关键区别

两者都是"从源码构建嵌入式 Linux"的工具，但设计哲学完全不同：

Buildroot 的模型是 **一次性全量构建**：改了任何底层组件（工具链 / 内核配置），必须 `make clean` 从头来。它追求"简单、快、小项目友好"，整个系统用 Makefile 驱动，学习曲线平缓。

Yocto 的模型是 **增量构建 + 层级缓存**：sstate-cache 记录每个任务的输入哈希，只有输入变了才重新执行。改了一个应用层的配方，内核和工具链完全不受影响。这对大团队来说意味着 CI 从 2 小时缩到 10 分钟。

另一个关键区别是包管理：Buildroot 只产出"定型"镜像，Yocto 可以选择生成 `.rpm` / `.deb` / `.ipk` 包，甚至让设备在运行时通过包管理器安装新软件——虽然大多数嵌入式场景不这么做，但在需要 OTA 增量更新时非常有用。

选择建议：一个人做一块板子 → Buildroot；多团队多产品线长期维护 → Yocto。

## 历史小故事（可跳过）

Yocto 的前身是 **OpenEmbedded**（2003 年），一群嵌入式开发者受够了每个项目从头搭构建系统，于是开始维护一套共享的构建配方。2010 年，Linux 基金会看到了这件事的价值，发起 Yocto Project 作为"伞项目"，把 OpenEmbedded 的核心（OE-Core）、BitBake 引擎、以及一个参考发行版（Poky）打包在一起，提供标准化的版本发布和长期支持。

名字"Yocto"来自国际单位制中最小的前缀 yocto-（10^-24），寓意"给最小的设备做 Linux"。"Poky"则是"Pocket"的变体，意思是"口袋里的 Linux"。

截至 2025 年，Yocto 已发布到第 5.x 版本（代号 Scarthgap / Styhead），每半年一个版本，偶数版本是长期支持（LTS）。

## 学到什么

1. **Layer 分层是管理复杂度的利器**——硬件、系统、应用各管各的，组合时才拼到一起，和微服务思想异曲同工
2. **构建缓存（sstate-cache）的投资回报巨大**——首次慢，但之后每次增量构建节省的时间是指数级的
3. **配方 + 追加文件的设计避免了 fork 地狱**——不需要 fork 上游来改一个参数，`.bbappend` 就够了
4. **嵌入式开发的真正瓶颈不是写代码，是管理构建**——Yocto 本质上是一个"构建管理框架"，代码只是它处理的原料

## 延伸阅读

- 官方快速入门：https://docs.yoctoproject.org/brief-yoctoprojectqs/index.html （30 分钟走通第一次构建）
- Yocto 概念手册：https://docs.yoctoproject.org/overview-manual/index.html （理解 layer / recipe / class 的完整文档）
- 《Embedded Linux Systems with the Yocto Project》——Packt 出版，从零到产品级的实操指南
- Bootlin 免费培训 slides：https://bootlin.com/doc/training/yocto/ （欧洲嵌入式培训公司，slides 质量极高）
- Buildroot vs Yocto 对比：两者互补，小项目 Buildroot 快，大项目 Yocto 稳

## 关联

- [[buildroot]] —— 同为嵌入式 Linux 构建系统，Buildroot 更简单直接，Yocto 更适合大规模多产品线
- [[freertos]] —— 当你不需要 Linux 而需要硬实时 RTOS 时的选择
- [[zephyr]] —— 面向 Cortex-M 级别 MCU 的 RTOS，和 Yocto 不在同一个层次
- [[nuttx]] —— POSIX 兼容的 RTOS，比 Yocto 更底层
- [[docker]] —— Docker 在已有 Linux 上做隔离，Yocto 是造出整个 Linux；构建理念（层叠加）有相似之处
- [[nix]] —— 同样追求可复现构建，但面向桌面/服务器，Yocto 面向嵌入式
- [[rt-thread]] —— 国产 RTOS，嵌入式生态的另一个选择

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[openwrt]] —— OpenWrt — 把家用路由器变成 Linux 服务器


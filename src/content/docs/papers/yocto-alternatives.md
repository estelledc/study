---
title: You probably don't need Yocto, and that's fine — 嵌入式 Linux 不必默认上 Yocto
来源: 'sigma star gmbh, "You probably don''t need Yocto, and that''s fine", https://sigma-star.at/blog/2026/05/you-probably-dont-need-yocto-and-thats-fine/, 2026-05-26'
日期: 2026-06-13
子分类: 嵌入式
分类: 操作系统
provenance: pipeline-v3
---

## 从日常类比开始：定制西装 vs 成衣改裤脚

你要参加一场重要活动，需要一套得体的衣服。你有三条路：

1. **从零裁布做西装（Yocto）** — 选面料、画版型、自己锁边、自己装扣子。合身到毫米级，但量体、打版、试穿、改版的周期以「周」计，而且以后胖了瘦了都得自己改。
2. **买成衣再改裤脚（Debian + debos/mkosi）** — 商场里 70 000 款「零件」现成可选，你只挑需要的、改改长度，裁缝店（镜像构建工具）帮你打包成可穿的成品。
3. **直接穿厂家配好的套装（厂商预刷镜像 / Ubuntu Core）** — 最快，但款式和尺码由别人定。

嵌入式 Linux 选型的困惑，和这个一模一样：行业里常默认「正经项目必上 Yocto」，仿佛不上就不专业。sigma star（一家 Yocto 资深集成商）在 2026 年的这篇文章里反其道而行：**他们自己就是 Yocto 专家，却经常劝客户先别用 Yocto** — 因为「能定制一切」在「你其实不需要定制一切」时，会变成「你要维护一切」。

---

## 是什么：Yocto 不是发行版，是「造发行版的工具箱」

很多人把 Yocto 叫「Yocto Linux 发行版」，这是误解。

| 概念 | 含义 |
|------|------|
| **Yocto Project** | 用源码组装**自定义** Linux 发行版的工具链 |
| **Poky** | Yocto 自带的参考发行版（`bitbake` + `openembedded-core` + `meta-yocto`） |
| **BitBake** | 类似 Make 的构建引擎，按 recipe（`.bb`）描述如何编译每个软件包 |
| **Layer** | 分层配置；SoC 厂商常提供 **BSP layer** 作为板级起点 |
| **Recipe** | 单个组件的构建配方：版本、补丁、`DEPENDS`、`PACKAGECONFIG` 等 |

Yocto 的强大在于：你可以为特定 CPU 编译整个用户空间、给任意组件打补丁、开关任意特性、钉死任意版本。芯片厂商的 BSP layer 又提供了「能在真板上跑起来」的起点。**灵活 + 厂商支持** 让它成为默认选项；**同一份灵活** 在你不需要时，就是陷阱。

---

## 核心概念一：「自己的发行版」=「自己的维护账单」

欧盟 **Cyber Resilience Act（CRA，2024/2847）** 等产品安全法规要求：厂商在**产品生命周期内**持续提供安全更新。维护一个 Linux 系统，可能是很多年。

Yocto 的版本节奏：

| 类型 | 维护窗口（约） |
|------|----------------|
| 普通 release | ~7 个月（到下一版发布） |
| LTS release（自 5.0 Scarthgap 起） | 最多 ~4 年 |

听起来 LTS 够长，但有个隐蔽问题：**Yocto LTS 维护的是「那一套 recipe 集合 + Poky」**。一旦你做了这些事：

- 给若干组件打了非平凡补丁
- 额外加了 Yocto 未收录的组件
- 为了修 bug 或锁定版本而 bump/pin 了某些包

那么**每一次 Yocto 维护版发布**，你都要检查：本地改动是否还能干净地叠上去？自加/自 pin 的包谁负责打 CVE 补丁？**最终维护成本落在你的团队身上**。

文章抛出一个尖锐问题：如果你几乎不改 Poky，为什么要用 Yocto？

### 内核：房间里的大象

Yocto 会带内核并维护，但产品几乎总会：

- 叠加 SoC 厂商补丁
- 使用足够新的内核以包含所需驱动

因此 **CVE 跟踪 + 内核升级** 无论用不用 Yocto 都是大头。可控做法是：基于 **kernel.org LTS** 建整洁的 patch queue，随 stable 更新迁移；vendor 自带、多年不更新的内核通常是坏主意（少数例外）。

---

## 核心概念二：自建发行版的隐藏成本

| 成本维度 | 典型表现 |
|----------|----------|
| **构建时间** | 非平凡镜像 clean build 常需数小时；`sstate-cache` 可加速但 recipe 小改可能大面积失效 |
| **磁盘 / CI** | 工作目录轻松 **100 GiB+**；需大存储、共享 `sstate`/`DL_DIR`、自建镜像基础设施 |
| **学习曲线** | `bbappend`、classes、overrides、`DEPENDS` vs `RDEPENDS`、`PACKAGECONFIG`… 新人上手以**周**计 |
| **BSP 质量** | 有的厂商 layer 干净；有的 pin 五年老内核、把 machine recipe 放错层、一 bump Poky 就崩 |

这些不是「别用 Yocto」的理由，而是 **「确认你真的需要它再下注」** 的理由。

---

## 核心概念三：成熟发行版 + 镜像工具 = 常见路的捷径

若目标只是 **「有一块可靠的 Linux 跑我的应用」**，**Debian GNU/Linux** 等成熟发行版往往更省 per-project 人力：

- 约 **70 000** 个二进制包，覆盖 `amd64`、`arm64`、`armhf`、`riscv64`、`ppc64el` 等
- 很多 SoC **直接跑** Debian 预编译包，无需重编
- 可用 `systemd` 现代栈，也可用 BusyBox / SysV init 做 slim 系统
- **Debian stable** 安全更新约 3 年 + **Debian LTS** 社区再延约 2 年 → 合计 ~5 年，接近 Yocto LTS，但**你不必自己 backport 上游补丁**

关键澄清：**不是** 给设备插 U 盘跑 Debian Installer。而是在构建机上生成 **可刷写镜像**，再烧录到设备。组成四块：

1. Bootloader（通常 SoC 专用，如 U-Boot）
2. Linux kernel（通常 SoC 专用）
3. Rootfs（用户空间直接来自 Debian）
4. **镜像组装工具**：`mkosi`、`ELBE`、`debos`

维护形态更像 **`apt` 更新包 + 重新 roll 镜像**，而不是重写 BitBake recipe。

### debos 工作流（文章推荐的具体路径）

1. 用 **aptly** 建本地 Debian 镜像，收录所需包
2. 把自研 kernel（及可选 bootloader）打成 **Debian 包** 放进镜像
3. 给镜像 **打 tag / snapshot** → 即一次 release
4. 用 **debos** YAML recipe 产出目标镜像
5. 按需归档源码包 + **SBOM**（如 `debsbom`），满足 GPL 源码提供与 CRA 物料清单

---

## 代码示例 1：debos YAML — 最小 arm64 根文件系统镜像

下面是一个**教学用**的 debos recipe 骨架，展示「从 Debian 包列表生成 ext4 根分区」的思路（字段需按你的 aptly 镜像 URL 和架构调整）：

```yaml
architecture: arm64

actions:
  - action: debootstrap
    suite: bookworm
    components:
      - main
    mirror: http://127.0.0.1:8080/debian
    variant: minbase

  - action: apt
    update: true
    recommend: false
    packages:
      - systemd
      - openssh-server
      - python3
      - your-app

  - action: image-partition
    imagename: debian-arm64-product
    imagesize: 512MB
    partitiontype: gpt
    partitions:
      - name: root
        fs: ext4
        start: 64MB
        size: 448MB
        mountpoint: /

  - action: filesystem-deploy
    description: Deploy root filesystem to partition
```

要点：

- `debootstrap` + `apt` 等价于「在 chroot 里装 Debian」，**不编译整个 world**
- `image-partition` + `filesystem-deploy` 产出可刷写的分区镜像
- 发布 = 更新 aptly snapshot 的 tag + 重跑 debos

---

## 代码示例 2：Yocto — 许可证排除与镜像定制（何时真的需要 Yocto）

医疗、汽车、部分国防场景可能 **禁止 GPLv3**。Yocto 可用 `INCOMPATIBLE_LICENSE` 在**全镜像范围**排除某类许可证 — 这是「需要 Yocto」的典型论据之一。

在 `local.conf` 或 distro 配置中：

```bitbake
# 禁止 GPLv3 及更高版本进入镜像（示例，需按法务要求调整）
INCOMPATIBLE_LICENSE = "GPL-3.0-only GPL-3.0-or-later AGPL-3.0-only"
INCOMPATIBLE_LICENSE_EXCEPTIONS = "bash"

# 典型产品镜像：只保留运行时需要的包组
IMAGE_INSTALL:append = " \
    openssh \
    python3 \
    your-app \
"

# 缩小体积：去掉文档、locale、静态库 dev 包
INHERIT += "rm_work"
IMAGE_LINGUAS = ""
BAD_RECOMMENDATIONS += "packagegroup-base-extended"
```

对比 Debian 路径：你要 **自己审计** 哪些包装了 GPLv3 依赖并 trim — 可行但繁琐；当排除规则复杂、且还需深度改 compile flags 时，Yocto 的 recipe 模型更擅长**规模化**定制。

---

## 代码示例 3（补充）：mkosi 声明式镜像片段

`mkosi` 近年也常被提及（systemd 生态）。极简 `mkosi.conf` 示意：

```ini
[Distribution]
Distribution=debian
Release=bookworm

[Output]
Format=disk
Bootable=yes

[Content]
Packages=systemd
         openssh-server
         your-app
WithUnifiedKernelImages=yes
```

与 debos 类似：**声明「要什么包」**，工具负责 rootfs + 分区/引导结构；差异在配置风格与 systemd 集成深度，选型看团队现有工具链。

---

## 决策矩阵：什么时候用 / 不用 Yocto

### 用 Yocto（或 Buildroot 等「从源码拼发行版」）

| 场景 | 原因 |
|------|------|
| 深度定制用户空间、编译选项、基础组件 | Recipe 模型为「改一切」而生 |
| 严格的体积 / 启动时间，现成 distro 达不到 | 可剔到只剩必要 bits |
| 许可证政策排除 GPLv3 等，且规则复杂 | `INCOMPATIBLE_LICENSE` 等机制 |
| 需要 musl / uClibc 等非 glibc | Debian 主 archive 围绕 glibc |
| 需要比 Debian stable 新得多的 toolchain/runtime | stable 会「拖后腿」 |
| SoC 官方支持路径就是 Yocto，且 BSP 质量可靠 | 减少 bring-up 风险 |

### 跳过 Yocto

| 场景 | 原因 |
|------|------|
| 只需要现代 Linux 跑应用 | Debian 用户空间 + 厂商 kernel 即可 |
| Flash ≥ 数百 MB、RAM ≥ 256 MiB | 容得下标准 Debian 系镜像 |
| 产品寿命长，愿依赖 Debian Security Team | 避免自建 backport 流水线 |
| 团队没有专职 embedded Linux 工程师 | BitBake 上手成本过高 |

### 跳过 Debian（但仍可能不用 Yocto）

| 场景 | 原因 |
|------|------|
| 需要重编/大改 Debian 里大量包 | 等于把 Debian 维护者的工作抢过来；数十个包时 Yocto 更干净 |
| 强依赖非 glibc | 见上 |
| 强依赖 bleeding-edge 编译器 | Debian stable 不合适 |

**Buildroot** 文章一并点名：比 Yocto 轻，但「自己拼发行版 → 自己维护」的逻辑相同；OTA、fleet 管理、CRA 下的 SBOM 仍要另建。

---

## 与 CRA / 合规的关联（零基础也要知道）

「能刷机启动」不等于「能合法、安全地卖十年」。CRA 等法规把焦点放在：

- **已知漏洞的及时修复**
- **软件物料清单（SBOM）**
- **可追溯的发布物**

Yocto 路径：你负责 recipe 树、补丁队列、LTS 迁移、自研组件 CVE。

Debian + debos 路径：

- 安全更新大量来自 **Debian Security Team / LTS**
- 发布 = aptly snapshot tag + 镜像 rebuild
- `debsbom` 等工具从已安装包生成 SBOM

两条路都能合规；差别在于 **谁替你扛日常 patch 工作**。

---

## 迁移方向：文章的战略建议

> **尽早、有意识地选型** — 产品出厂后很难回头。

- **拿不准时，先上成熟发行版**；真有理由再迁 Yocto，比中途发现「为不需要的控制力付了多年维护税」便宜得多。
- **从 Yocto 迁到 Debian** 往往比反向迁移更痛苦 — 因为前者已嵌入大量本地 recipe 知识。

sigma star 的立场很直白：

- 客户**确实**要 custom distro → 他们推荐 Yocto
- 其余客户 → 持续问：**你真的需要吗？**

---

## 常见误区（零基础自检）

| 误区 | 事实 |
|------|------|
| 「嵌入式 = 必须 Yocto」 | 很多网关、HMI、边缘盒只需「Linux + 我的程序」 |
| 「Yocto LTS = 我不用管安全」 | 本地 patch/pin 使每次维护版都是合并考试 |
| 「Debian 太大装不进」 | minbase + 精选包 + 自定义 kernel 可做到产品级体积 |
| 「debos 是装 Debian 的安装器」 | 它是**构建主机上**生成 flashable image 的工具 |
| 「vendor 内核最省心」 | 常多年落后、少安全修复；LTS + patch queue 通常更可控 |

---

## 动手清单：读完这篇后可以做什么

1. **写一页真实需求**：应用是什么？Flash/RAM？生命周期几年？能否接受 GPLv3？SoC 官方 BSP 形态？
2. **估维护人力**：有没有人能持续跟 BitBake + kernel CVE？还是更愿意 `apt upgrade` + 重打镜像？
3. **做 spike**：同一硬件上并行试 **debos 最小镜像** vs **Poky minimal**，记录 clean build 时间、镜像大小、团队上手天数。
4. **定发布物**：无论哪条路，第一次 release 就带上 **SBOM + 源码归档策略**，别等 CRA 审计临头再补。

---

## 小结

| 要点 | 一句话 |
|------|--------|
| Yocto 本质 | 造发行版的工具箱，不是现成发行版 |
| 最大陷阱 | 不需要的灵活性 → 多年的自建维护 |
| 常见替代 | Debian 用户空间 + SoC kernel/bootloader + debos/mkosi/ELBE |
| 真正需要 Yocto 时 | 深度定制、极端体积/启动、复杂许可证、非 glibc、优质 BSP 绑定 |
| 文章结论 | **You probably don't need Yocto, and that's fine.** |

Yocto 是remarkable engineering；问题在于当你不需要「恰好那一版 Linux」时，它变成 **用极贵的方式解决不存在的问题**。对多数「在 Linux 上跑我的应用」的嵌入式项目，成熟发行版 + 确定性镜像构建，是更省 engineering overhead 的起点 — 而这不是偷懒，是** conscious choice**。

---

## 参考与延伸阅读

- 原文：[You probably don't need Yocto, and that's fine](https://sigma-star.at/blog/2026/05/you-probably-dont-need-yocto-and-thats-fine/)（sigma star gmbh, 2026-05-26）
- Yocto Project 官方文档：https://docs.yoctoproject.org/
- debos：https://github.com/go-debos/debos
- mkosi：https://github.com/systemd/mkosi
- ELBE：https://www.elbe-rfs.org/
- EU Cyber Resilience Act：Regulation (EU) 2024/2847

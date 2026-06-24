---
title: OpenWrt — 把家用路由器变成 Linux 服务器
来源: 'https://github.com/openwrt/openwrt'
日期: 2026-06-24
分类: 嵌入式
难度: 中级
---

## 是什么

想象你买了一台品牌路由器。厂商给你装了一个"精装修"系统——能用，但不能改墙、不能加房间、不能换水管。OpenWrt 就像把精装修全拆了，换成"毛坯房 + 完整工具箱"：你可以自己隔房间（VLAN）、装新水管（VPN 隧道）、加监控（流量统计）、甚至开个小卖部（跑 Docker 容器）。

技术定义：OpenWrt 是一个专为路由器、网关等小型网络设备设计的 Linux 发行版。它把一台一百多块钱的家用路由器变成了一台功能完整的 Linux 服务器，自带包管理器（opkg）、Web 管理界面（LuCI）和统一配置系统（UCI）。如果说 [[buildroot]] 和 [[yocto-poky]] 是"从零搭积木造系统"，OpenWrt 就是"别人已经帮你搭好了一套完整的网络积木城堡，你拎包入住就行"。

项目规模：诞生于 2004 年，GitHub 约 23k stars，主仓库超过 6 万个 commit，支持 1500+ 设备（从几十块的随身 WiFi 到企业级交换机），软件包仓库有 5000+ 个包。主要语言是 C（内核/工具链）、Shell（构建脚本）、Lua（LuCI 界面）。

## 为什么重要

不理解 OpenWrt，下面这些事就解释不了：

- 为什么几十块钱的路由器能跑广告过滤、VPN、Docker，功能超过几千块的商业网关
- 为什么嵌入式 Linux 开发者把它当“网络栈实验场”——iptables/nftables、VLAN、桥接、路由策略，全都能在真实硬件上动手练
- 为什么很多中小运营商和 IoT 公司直接拿它做商用 CPE 固件，而不自己从头写
- 为什么理解了 OpenWrt 的构建系统，再去看 [[buildroot]] 和 [[yocto-poky]] 就不会懵——它们共享交叉编译、feeds、Kconfig 这些核心概念
- 为什么 [[wireguard-2017]] 等现代网络协议的教程里总拿 OpenWrt 当演示平台——因为它是最容易获取的“真实网络设备 + 完整 Linux”组合

## 核心要点

OpenWrt 的架构从下往上分成四层：

**工具链层**：交叉编译器（gcc + musl libc），把你的 x86 电脑变成"路由器芯片的翻译官"，让代码能在 MIPS/ARM 等嵌入式 CPU 上运行。这和 [[buildroot]] 用的交叉编译思路完全相同。

**内核层**：定制的 Linux 内核，针对路由器场景打了大量补丁——比如 NAND flash 磨损均衡、各种无线芯片驱动支持、网络加速（hardware offloading）。内核版本跟随上游但不追最新，稳定优先。

**用户空间层**：BusyBox 替代 GNU coreutils（省空间），procd 替代 systemd（更轻量），UCI（Unified Configuration Interface）统一所有服务的配置格式——学会一套语法就能配所有东西。LuCI 是基于 Lua 的 Web 管理界面，本质上是“UCI 配置文件的图形化编辑器”——网页上勾选的每个选项，最终都变成 `/etc/config/` 下某个文件里的一行文本。

**包管理层**：opkg 是类似 apt 但极度精简的包管理器。典型路由器只有 16MB 闪存，装完内核后可能只剩 3-5MB，所以每个包都按 KB 级精打细算。这是 OpenWrt 和 [[buildroot]]（不支持运行时装包）的关键区别。

构建流程的核心是 `make menuconfig` → 选目标平台和软件包 → `make -j$(nproc)`。feeds 机制让社区包（LuCI、常用工具）独立于主仓库维护，用 `./scripts/feeds update -a` 拉取。

网络子系统是 OpenWrt 的灵魂：netifd 守护进程统一管理所有网络接口，配合 `/etc/config/network`、`/etc/config/firewall`、`/etc/config/wireless` 三个 UCI 文件描述完整的网络拓扑。设备适配的核心工作是写 DTS（Device Tree Source），告诉内核“这块板子的 LED 接哪个 GPIO、Flash 用什么总线、以太网 PHY 地址是多少”。

## 实践案例

### 案例 1：从零构建一个 OpenWrt 固件

```bash
git clone https://github.com/openwrt/openwrt.git
cd openwrt
./scripts/feeds update -a    # 拉取所有软件包源
./scripts/feeds install -a   # 注册到构建系统
make menuconfig              # 选目标设备和软件包
make -j$(nproc)              # 首次编译约 1-2 小时
```

`make menuconfig` 弹出文本界面（和 Linux 内核配置一样），选好后生成 `.config`，整个构建系统围绕这个文件工作。产出在 `bin/targets/` 下，是可以直接刷入设备的固件镜像。

和 [[buildroot]] 的关键区别：Buildroot 生成固件后就"定型"了，不支持运行时装包；OpenWrt 生成的系统自带 opkg，可以动态安装新软件。和 [[yocto-poky]] 的区别：Yocto 是通用嵌入式构建框架，你得自己定义"配方"（recipe）；OpenWrt 是网络设备专用，开箱就有路由、防火墙、无线管理等完整功能。

### 案例 2：UCI 配置网络接口

```conf
config interface 'lan'
    option device   'br-lan'
    option proto    'static'
    option ipaddr   '192.168.1.1'
    option netmask  '255.255.255.0'

config interface 'wan'
    option device   'eth1'
    option proto    'dhcp'
```

所有服务（网络、防火墙、无线、DNS）都用这种 UCI 格式。你既可以用 LuCI 网页点，也可以 SSH 进去直接改文件，两者完全等价。防火墙走 nftables（旧版用 iptables），DNS/DHCP 走 dnsmasq，无线管理走 hostapd——但它们的配置文件全都是同一种 UCI 语法。

### 案例 3：用 opkg 安装智能队列管理

```bash
opkg update
opkg install luci-app-sqm    # 装 SQM 插件，解决"打游戏时家人看视频就卡"
opkg list-installed           # 确认已安装
```

装完后在 LuCI 的 Network → SQM QoS 里填入你的上行/下行带宽，选择 cake 队列规则，保存应用即可。整个过程不需要重启路由器。

## 踩过的坑

1. **闪存空间炸了**：在 16MB flash 设备上装了一堆包，系统启动不了。根因是 overlay 分区写满。解决办法是用 extroot——把 overlay 挂载到外接 U 盘/SD 卡，相当于给路由器“外挂硬盘”。另一个预防手段是构建时用 `make menuconfig` 精确选包，不装不需要的东西。

2. **无线驱动翻车**：买了博通芯片的路由器刷 OpenWrt，WiFi 功能残缺。根因是博通不开源驱动，OpenWrt 只能用逆向工程的 b43 驱动。买设备前必须查 Table of Hardware 确认驱动支持状态。

3. **feeds 和主仓库分离的困惑**：`git clone` 主仓库后找不到 LuCI 源码，以为下载不完整。根因是 LuCI 在独立的 feeds 仓库里，必须跑 `./scripts/feeds update` 才会拉下来。查看 `feeds.conf.default` 文件可以看到所有默认 feeds 源的 URL。这个设计和 [[yocto-poky]] 的 layer 机制类似——核心和扩展分开维护。

4. **sysupgrade 丢包**：升级固件后发现之前装的包全没了。根因是 sysupgrade 只保留 `/etc/config/` 下的配置文件，不保留额外安装的 opkg 包。解决办法是升级前 `opkg list-installed > /tmp/pkg-list.txt` 备份包列表，升级后重新安装。更好的方法是把常用包写进自定义固件的 `.config` 里，这样每次构建就自带了。

## 适用 vs 不适用场景

**适用**：路由器/网关/AP 等网络设备的定制固件，需要运行时装卸软件包的嵌入式场景，Linux 网络栈的学习实验平台，中小企业批量部署 CPE 设备。

**不适用**：非网络类的嵌入式设备（比如工控屏、医疗仪器）选 [[buildroot]] 或 [[yocto-poky]] 更合适；MCU 级别的实时控制（几十 KB RAM）选 [[nuttx]]；需要极致裁剪且不需要运行时装包的场景选 [[buildroot]]；需要企业级构建可追溯性的场景选 [[yocto-poky]]。

| 场景 | 选择 | 原因 |
|------|------|------|
| 路由器/网关/AP | OpenWrt | 网络层开箱即用 |
| 单功能盒子（摄像头、播放器） | [[buildroot]] | 最小化裁剪 |
| 车规/医疗认证设备 | [[yocto-poky]] | 构建可追溯性 |
| MCU 实时控制（STM32） | [[nuttx]] | 几十 KB 级别 |
| IoT 网关（路由 + MQTT + Zigbee） | OpenWrt | 网络 + 容器支持 |

## 历史小故事（可跳过）

2003 年，Linksys 发布了 WRT54G 路由器，用了 Linux 内核。按 GPL 协议，Linksys 被迫公开源码。两个开发者拿到源码后做了第一个第三方固件，这就是 OpenWrt 的前身。名字里的"Wrt"就是从 WRT54G 来的。中间还分裂出 LEDE（Linux Embedded Development Environment）项目，2018 年两个项目重新合并，统一叫 OpenWrt。

二十年后，OpenWrt 支持 1500+ 设备，GitHub 约 23k stars，主仓库超过 6 万个 commit，是路由器领域的事实标准开源系统。一个厂商被迫开源的“事故”，变成了整个行业的基础设施。有趣的是，Linksys 后来反过来利用 OpenWrt 的声誉，推出了 WRT1900AC 等“官方支持 OpenWrt”的路由器。

## 学到什么

1. **"专用发行版"比"通用框架"上手快**——OpenWrt 替你做了网络场景的所有默认选择，[[buildroot]] 和 [[yocto-poky]] 则要求你从空白开始做选择
2. **UCI 统一配置的设计哲学**——一套语法管所有服务，降低了认知负担；类比 Kubernetes 用 YAML 统一管所有资源
3. **feeds 分仓机制**——核心系统和社区扩展分开演进，和 [[yocto-poky]] 的 layer 概念异曲同工
4. **嵌入式的资源约束思维**——16MB 闪存、64MB 内存的限制逼出了 BusyBox、musl、opkg 这些精简替代品
5. **GPL 的意外礼物**——Linksys 被迫开源 → 社区接手 → 反哺整个行业。开源许可证不只是法律条款，它真的能创造生态

## 延伸阅读

- 上手路径：先在虚拟机（VirtualBox/QEMU）里跑 x86-64 镜像体验 UCI 和 LuCI → 找一台二手路由器刷入真实硬件 → 尝试写一个 Hello World opkg 包 → 读 netifd 源码理解守护进程设计
- 官方文档：[OpenWrt User Guide](https://openwrt.org/docs/guide-user/start)（从刷机到高级配置的完整指南）
- 设备兼容表：[Table of Hardware](https://openwrt.org/toh/start)（买设备前必查）
- 开发者指南：[OpenWrt Developer Guide](https://openwrt.org/docs/guide-developer/start)（写 opkg 包、适配新设备）
- 源码仓库：[github.com/openwrt/openwrt](https://github.com/openwrt/openwrt)（主仓库，含内核补丁和核心包）
- [[wireguard-2017]] —— OpenWrt 上最流行的 VPN 方案，内核级实现比 OpenVPN 快很多

## 关联

- [[buildroot]] —— 同为嵌入式 Linux 构建系统，但不支持运行时装包；OpenWrt 的构建流程和它高度相似
- [[yocto-poky]] —— 工业级嵌入式构建框架，layer 机制和 OpenWrt 的 feeds 思路类似
- [[nuttx]] —— RTOS，跑在比路由器更小的 MCU 上；和 OpenWrt 是嵌入式的两个极端
- [[wireguard-2017]] —— 现代 VPN 协议，OpenWrt 是它最常见的部署平台之一
- [[nix]] —— 同样强调"可复现构建"，但面向桌面/服务器；OpenWrt 在嵌入式领域追求类似目标
- [[docker]] —— 容器化思路和 OpenWrt 的 opkg 包管理有共鸣：都在受限环境里做隔离和分发
- [[ethane-2007]] —— 软件定义网络的早期论文，OpenWrt 是 SDN 实验的常用平台
- [[red-1993]] —— 主动队列管理算法，OpenWrt 的 SQM 插件就是它的实践应用

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[buildroot]] —— Buildroot — 最小化嵌入式 Linux 构建器
- [[yocto-poky]] —— Yocto/Poky — 工业级嵌入式构建框架
- [[nuttx]] —— NuttX — POSIX 兼容的实时操作系统

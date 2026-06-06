---
title: OpenWrt — 路由器 / 网关上的可扩展 Linux 发行版
来源: 'https://github.com/openwrt/openwrt'
日期: 2026-06-06
分类: 操作系统
子分类: 嵌入式
难度: 中级
---

## 是什么

OpenWrt 是一套**面向嵌入式路由器和网关设备的开源 Linux 发行版**，核心组件为 Linux 内核 + musl libc + BusyBox，通过 overlayfs 实现可写根文件系统，提供约 8000 个软件包（opkg/apk）和 LuCI Web 管理界面。

日常类比：出厂路由器的固件就像一台锁死的点餐机——只有几个固定菜单，换不了厨师、加不了新菜。OpenWrt 把这台点餐机变成了完整的开放厨房：你可以自己选食材（软件包）、改菜谱（UCI 配置）、聘新厨师（第三方应用）。路由器硬件没变，但上面能跑的功能从原来的 10 项扩展到了 8000+。

**为什么路由器固件与 PC Linux 不同**：家用路由器通常只有 8–256 MB Flash 和 32–512 MB RAM，远低于 PC。普通 Linux 发行版即使是最小安装也要数 GB；OpenWrt 用 SquashFS 压缩只读分区 + JFFS2/ubifs 可写覆盖层，把整个系统塞进 4–16 MB Flash，并在运行时透过 overlayfs 呈现一个统一的可写文件系统视图。

OpenWrt 支持 50+ 指令集平台（ARM、MIPS、x86-64、ARC 等），最新稳定版 24.10 基于 Kernel 6.6，25.12 基于 Kernel 6.12 并将包管理器从 opkg 切换到 apk。

## 为什么重要

不理解 OpenWrt，这些事情都没法解释：

- 为什么路由器能跑 WireGuard VPN、广告过滤、流量统计——这些功能原厂固件没有，是通过 opkg 安装的 OpenWrt 软件包实现的
- 为什么 Ubiquiti、TP-Link 部分型号、小米路由器的固件里有 OpenWrt 代码——因为厂商直接在 OpenWrt 基础上定制，而非从零写网络栈
- 为什么过了保质期停止更新的路由器还能收到安全补丁——OpenWrt 社区独立维护，不依赖厂商
- 为什么"软路由"方案能在 x86 小主机上实现全功能家庭网关——OpenWrt 支持 x86-64，能充分利用 PC 的算力做硬件卸载

## 核心要点

1. **overlayfs 双分区架构**：Flash 被分为两个逻辑分区：只读的 SquashFS（`/rom`，包含出厂软件）和可写的 JFFS2/ubifs（`/overlay`，存放用户修改和新安装的包）。overlayfs 将两者叠加为统一的 `/`。这意味着：删掉某个文件只是在 overlay 里标记"遮挡"，随时可以 `firstboot` 恢复到出厂状态，同时日常使用又完全是一个可写系统。

2. **UCI 统一配置接口**：所有 OpenWrt 网络服务（网络接口、防火墙、DHCP、WiFi……）都用同一套 `/etc/config/` 文本格式描述，并通过 `uci` 命令统一读写。改一个 IP 不需要知道 `/etc/network/interfaces` 还是 `NetworkManager`，只需 `uci set network.lan.ipaddr=192.168.2.1 && uci commit && /etc/init.d/network reload`。LuCI Web UI 实质上是 UCI 的图形前端。

3. **opkg / apk 包管理**：opkg 是 OpenWrt 传统包管理器，支持安装、升级、删除约 8000 个预编译包。25.12 版本起切换为 apk（来自 Alpine Linux 生态），依赖解析更健壮。两者都针对资源受限环境优化：包文件本身极小（通常 10–200 KB），安装到 overlay 分区不影响只读基础系统。

## 实践案例

### 案例 1：家庭软路由——x86 小主机上全功能网关

在 N100/J4125 小主机上安装 OpenWrt x86-64 镜像，配合 Passwall/Mihomo 实现透明代理，通过 VLAN 隔离 IoT 设备：

```bash
# 下载 x86-64 组合镜像（EFI + BIOS 兼容）
wget https://downloads.openwrt.org/releases/24.10.0/targets/x86/64/\
openwrt-24.10.0-x86-64-generic-ext4-combined-efi.img.gz
gunzip openwrt-24.10.0-x86-64-generic-ext4-combined-efi.img.gz

# 将镜像写入目标磁盘（/dev/sdb 是目标盘，谨慎）
dd if=openwrt-24.10.0-x86-64-generic-ext4-combined-efi.img \
   of=/dev/sdb bs=4M status=progress conv=fsync

# 首次启动后扩展根分区（默认只有 ~100 MB）
# 进入 OpenWrt SSH，安装 parted 扩展工具
opkg update && opkg install parted losetup resize2fs
# 用 losetup 重新挂载并扩展
losetup /dev/loop0 /dev/sda
parted /dev/sda resizepart 2 100%
resize2fs /dev/loop0p2
```

**逐部分解释**：

- `ext4-combined-efi.img`：包含引导分区 + 根文件系统的完整磁盘镜像，支持 UEFI 和 Legacy BIOS 双模式
- `dd ... conv=fsync`：直接写裸磁盘，`conv=fsync` 确保缓存数据真正落盘
- 扩展分区步骤是必须的——默认镜像根分区很小，要留出空间给 opkg 包

```bash
# 安装 Passwall 依赖（需先添加第三方 feed）
# 编辑 /etc/opkg/customfeeds.conf 添加源
echo 'src/gz passwall_luci https://raw.githubusercontent.com/\
xiaorouji/openwrt-passwall/packages/aarch64_cortex-a53/luci' \
  >> /etc/opkg/customfeeds.conf
opkg update
opkg install luci-app-passwall

# 配置 VLAN 隔离 IoT 设备（UCI 方式）
uci set network.iot=interface
uci set network.iot.proto=static
uci set network.iot.ipaddr=192.168.10.1
uci set network.iot.netmask=255.255.255.0
uci commit network
/etc/init.d/network reload
```

**逐部分解释**：

- `customfeeds.conf`：opkg 支持多个软件源，第三方 feed 通过这个文件追加
- VLAN 隔离通过新建独立 interface + 防火墙区域实现，IoT 设备的 DHCP 请求只到 iot 接口，不能访问主机网段

### 案例 2：基于 ImageBuilder 批量生成定制固件

ImageBuilder 是 OpenWrt 提供的工具，不需要编译整个系统，直接把预编译包组合进镜像，适合批量部署：

```bash
# 下载 ImageBuilder（注意匹配设备 target/subtarget）
wget https://downloads.openwrt.org/releases/24.10.0/targets/ramips/mt7621/\
openwrt-imagebuilder-24.10.0-ramips-mt7621.Linux-x86_64.tar.xz
tar xf openwrt-imagebuilder-24.10.0-ramips-mt7621.Linux-x86_64.tar.xz
cd openwrt-imagebuilder-24.10.0-ramips-mt7621.Linux-x86_64

# 生成包含 WireGuard、luci-app-wireguard 的固件
# PROFILE 对应具体设备型号
make image \
  PROFILE="xiaomi_redmi-router-ac2100" \
  PACKAGES="kmod-wireguard wireguard-tools luci-app-wireguard \
            luci-i18n-wireguard-zh-cn -dnsmasq +dnsmasq-full" \
  EXTRA_IMAGE_NAME="wireguard-cn"

# 输出在 bin/targets/ramips/mt7621/
ls bin/targets/ramips/mt7621/
```

**逐部分解释**：

- `PROFILE`：对应 `profiles/` 目录下的设备定义，指定 Flash 布局和分区大小
- `PACKAGES`：`+pkg` 追加包，`-pkg` 移除包（如用 dnsmasq-full 替换默认 dnsmasq 以支持 DNSSEC）
- ImageBuilder 生成速度比全量编译快 100 倍，适合 CI/CD 出厂固件流水线

### 案例 3：用 OpenWrt SDK 开发自定义软件包

如果需要把私有程序打包为 opkg 包，用 OpenWrt SDK：

```
my-daemon/
├── Makefile          ← OpenWrt 包描述文件
└── src/
    ├── main.c
    └── CMakeLists.txt
```

```makefile
# my-daemon/Makefile（OpenWrt 包格式）
include $(TOPDIR)/rules.mk

PKG_NAME:=my-daemon
PKG_VERSION:=1.0.0
PKG_RELEASE:=1

PKG_BUILD_DIR:=$(BUILD_DIR)/$(PKG_NAME)-$(PKG_VERSION)

include $(INCLUDE_DIR)/package.mk
include $(INCLUDE_DIR)/cmake.mk

define Package/my-daemon
  SECTION:=utils
  CATEGORY:=Utilities
  TITLE:=My Custom Daemon
  DEPENDS:=+libuci +libubus
endef

define Package/my-daemon/install
	$(INSTALL_DIR) $(1)/usr/sbin
	$(INSTALL_BIN) $(PKG_BUILD_DIR)/my-daemon $(1)/usr/sbin/
endef

$(eval $(call BuildPackage,my-daemon))
```

```bash
# 在 SDK 目录里编译
cd openwrt-sdk-24.10.0-ramips-mt7621.Linux-x86_64
# 把包目录链接到 package/ 目录
ln -s /path/to/my-daemon package/my-daemon
make package/my-daemon/compile V=sc
# 输出：bin/packages/mipsel_24kc/base/my-daemon_1.0.0-1_mipsel_24kc.ipk
```

**逐部分解释**：

- `include $(INCLUDE_DIR)/cmake.mk`：自动处理 CMake 交叉编译，无需手动指定工具链路径
- `DEPENDS:=+libuci +libubus`：声明运行时依赖，opkg 安装时自动拉取
- `.ipk` 格式是 opkg 包，本质是 tar 归档，可以直接 `opkg install` 安装到路由器

## 踩过的坑

1. **Flash/RAM 低于 8/64 MB 变砖风险**：官方已有「8/64 warning」——8 MB Flash + 64 MB RAM 是最低门槛。低于此规格的老设备（如部分 TP-Link 早期型号）安装后极易 OOM 或写满 overlay 导致无法启动。选设备前必查 [Table of Hardware](https://openwrt.org/toh/start)，确认 Flash 和 RAM 规格。

2. **Broadcom WiFi 芯片支持差**：Broadcom 无开源驱动，只能用私有 `wl.o` 模块，功能受限且在新版本内核上频繁出现兼容性问题。选购路由器时优先 Qualcomm Atheros（ath9k/ath10k/ath11k 开源驱动）或 MediaTek（mt76 驱动）芯片组，避开 Broadcom。

3. **跨大版本 sysupgrade 配置失效**：直接从 21.02 升级到 24.10 时，即使勾选"保留配置"，某些服务（nftables 防火墙、DSA 网络架构）的配置格式发生了根本性变化，升级后网络不通。安全做法：备份 `/etc/config/`，升级后全新刷入，手动迁移配置，而不是依赖自动保留。

4. **opkg 无法自动解决冲突**：旧版 opkg 不像 apt/dnf 那样做完整依赖图解析，手动安装大量包时可能出现版本冲突且 opkg 不报错直接覆盖。升级到 25.12 的 apk 可以缓解此问题，或者使用 ImageBuilder 在构建时解决依赖，而非运行时。

## 适用 vs 不适用场景

**适用**：

- 对出厂固件不满意、需要 VPN、广告过滤、流量统计等扩展功能的家用路由器
- 企业出口网关需要精细流量控制、VLAN 隔离、策略路由，且预算有限
- 想把超出保质期的老路由器（但 Flash/RAM 符合要求）继续用并保持安全补丁
- 嵌入式产品团队需要基于 Linux 的网关固件底座，可在 OpenWrt 上叠加业务逻辑

**不适用**：

- Flash < 8 MB 或 RAM < 64 MB 的老旧设备（风险极高，容易变砖）
- 需要稳定商业支持和 SLA 的电信级设备（考虑 prplOS 或商业方案）
- 完全不懂 Linux 命令行的用户（LuCI 能覆盖基础配置，但调试和高级功能仍需 SSH）
- 对 WiFi 性能要求极高且设备是 Broadcom 芯片的场景（驱动限制导致性能和稳定性损失）

## 历史小故事（可跳过）

- **2003 年**：Linksys 因 WRT54G 路由器使用了受 GPL 保护的 Linux 代码，被迫在 Slashdot 压力下开源固件。这是路由器开源固件运动的起点。
- **2004 年**：开发者以 Linksys GPL 代码为基础，创建了 OpenWrt 项目，最初只支持 WRT54G，版本代号以鸡尾酒命名（White Russian、Kamikaze、Backfire……）。
- **2016 年**：部分核心贡献者因对 OpenWrt 内部治理流程不满，分叉出 LEDE（Linux Embedded Development Environment）项目。两个项目并行了约两年。
- **2018 年**：LEDE 与 OpenWrt 重新合并，保留 OpenWrt 品牌，采用 LEDE 的治理规范，从 18.06 版本起以年月命名（YY.MM），告别鸡尾酒代号。
- **2026 年**：25.12（Dave's Guitar）将包管理器从 opkg 迁移到 apk，标志着 OpenWrt 包生态向更现代化的依赖管理演进；同期默认安装 Attended Sysupgrade（ASU），升级时自动重新构建含用户包的固件镜像。

## 学到什么

1. **可写覆盖层（overlayfs）是嵌入式 Linux 可管理性的关键设计**——只读基础系统保证了恢复能力，overlay 可写层保证了可扩展性，两者组合的成本仅是一层文件系统挂载
2. **统一配置接口（UCI）比直接操作配置文件更重要**——异构的网络服务背后有统一的抽象层，才能实现 LuCI 这样的通用 GUI 和脚本自动化
3. **包管理器的设计哲学影响整个生态**——opkg 简单轻量但依赖解析弱，25.12 切换 apk 是在资源约束与工程化之间重新权衡
4. **开源许可证执法是整个嵌入式 Linux 生态的助燃剂**——Linksys WRT54G 事件证明 GPL 不只是法律文本，它直接催生了整个路由器开源固件运动

## 延伸阅读

- 官方文档：[OpenWrt Wiki — Getting Started](https://openwrt.org/docs/guide-user/start)（从刷机到配置的完整指南）
- Table of Hardware：[https://openwrt.org/toh/start](https://openwrt.org/toh/start)（购机前必查，按 Flash/RAM 过滤支持情况）
- OpenWrt Buildroot：[https://openwrt.org/docs/guide-developer/toolchain/use-buildsystem](https://openwrt.org/docs/guide-developer/toolchain/use-buildsystem)（从源码构建自定义固件）
- [[buildroot]] —— OpenWrt 的 Buildroot 系统基于此演化，理解 Buildroot 有助于理解 OpenWrt 构建原理
- [[yocto-poky]] —— 另一套工业级嵌入式 Linux 构建框架，功能更强但复杂度更高

## 关联

- [[buildroot]] —— OpenWrt Buildroot 脱胎于通用 Buildroot，了解后者能更好理解 OpenWrt 固件构建流程
- [[yocto-poky]] —— Yocto/OpenEmbedded 是嵌入式 Linux 另一极，二者常在选型时对比；Yocto 更灵活，OpenWrt 更专注网络设备

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

（暂无反向链接）


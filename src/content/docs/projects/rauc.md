---
title: RAUC — 嵌入式 Linux 的稳健自动更新控制器
来源: https://github.com/rauc/rauc
日期: 2026-06-13
子分类: 嵌入式
分类: 操作系统
provenance: pipeline-v3
---

## 日常类比：给设备换「整箱备件」，而不是现场焊接

想象你在维护一批工业网关，每台跑 Linux，偶尔要换整系统、内核或应用分区。最糟糕的做法是 SSH 进去 `dd` 覆盖正在运行的 rootfs——中途断电就可能变砖。更稳妥的做法像 **飞机换发动机模块**：

| 现实世界 | RAUC 对应 |
| --- | --- |
| 主跑道 + 备降跑道 | **Slot**（A/B rootfs 分区） |
| 整箱发动机（已质检、已封条） | **Bundle**（`.raucb` 更新包） |
| 质检封条与签收单 | **X.509 签名**（强制验签） |
| 塔台指挥「下次从 B 起飞」 | **Bootloader**（U-Boot / GRUB / Barebox bootchooser） |
| 试飞成功签字 | `rauc status mark-good`（commit 启动） |
| 试飞失败回主跑道 | `mark-bad` + bootloader **回滚** |
| 货运清单 | `manifest.raucm`（镜像 → slot 映射） |
| 机务手册 | `/etc/rauc/system.conf`（本机分区布局） |

**RAUC**（Robust Auto-Update Controller，稳健自动更新控制器）由 [Pengutronix](https://www.pengutronix.de/) 主导，仓库 [rauc/rauc](https://github.com/rauc/rauc)（LGPL-2.1）。它 **不是** 完整的 OTA 云平台，也 **不是** 带 GUI 的升级应用——而是跑在设备上的 **更新客户端 + 宿主机打包工具**，通过 **D-Bus** 和 CLI 供你的应用、产线脚本或 `rauc-hawkbit-updater` 等桥接器调用。

典型场景：Yocto/Buildroot 构建的嵌入式 Linux、工控机、车载边缘节点、IoT 网关——需要 **原子、可回滚、可签名** 的镜像级 OTA 时，RAUC 是业界常见选型之一（与 Mender、swupdate 等同赛道）。

---

## 解决什么问题

| 痛点 | 裸脚本 OTA | RAUC 的回应 |
| --- | --- | --- |
| 升级中途断电变砖 | 原地覆盖 active 分区 | 只写 **inactive slot**，写完再切换启动 |
| 包被篡改 | 无验签 | **强制签名**；keyring 验签后才安装 |
| 分区布局各异 | 每台手写 `dd` 路径 | `system.conf` 抽象 slot，manifest 按 **class** 映射 |
| 多镜像一次更新 | rootfs + boot + app 各搞一套 | 一个 bundle 多 image，原子安装 |
| 与构建链割裂 | 手搓 squashfs | **meta-rauc**（Yocto）、Buildroot、PTXdist 集成 |
| 应用只想触发升级 | 自己 fork 子进程 | **D-Bus API** + `rauc install` |

核心问题：**如何在嵌入式 Linux 上，用镜像方式安全、确定地把「目标整机状态」装进去，并在启动失败时回到可用旧版本？**

---

## 架构一览

```
┌──────────────────────────────────────────────────────────────────┐
│  构建主机（CI / Yocto native / 工作站）                           │
│  rootfs.ext4 + manifest.raucm  ──►  rauc bundle  ──►  *.raucb   │
│  （SquashFS 封装 + 签名）                                         │
└────────────────────────────┬─────────────────────────────────────┘
                             │ USB / HTTPS / hawkBit / 自研下发
                             ▼
┌──────────────────────────────────────────────────────────────────┐
│  目标设备：rauc 服务（systemd + D-Bus）                           │
│  · 验签  · 选 inactive slot  · 写镜像  · 改 bootloader 变量       │
│  · reboot  · mark-good / mark-bad                                 │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐                 │
│  │ rootfs.0 A │  │ rootfs.1 B │  │ /data      │  ← 状态、配置    │
│  │ (active)   │  │ (inactive) │  │            │                 │
│  └────────────┘  └────────────┘  └────────────┘                 │
│  Bootloader：bootname / bootchooser / U-Boot env                  │
└──────────────────────────────────────────────────────────────────┘
```

RAUC 是 **镜像导向**（image-based）的更新器：主要把 ext4、vfat、UBI 镜像或 tar 归档写到 slot；也支持 **HTTP(S) 流式安装**（verity bundle，无需先落盘整包）。

---

## 核心概念

### 1. Bundle（更新包）

Bundle 是 RAUC 自有格式：内含 **SquashFS** 封装的镜像/脚本 + **manifest.raucm**（元数据）。manifest 声明：

- `compatible`：必须与目标 `system.conf` 一致，否则拒绝安装；
- `version`：人类可读版本号；
- 每个 `[image.<class>]`：文件名、哈希、目标 slot class。

**签名是强制的**——开发可用自签证书，量产应接入 PKI。Bundle 应 **无歧义描述整机目标状态**，而不是零散文件搬运箱。

### 2. Slot（可更新槽位）

在 RAUC 里，**任何可更新的分区、整盘或 UBI volume 都是一个 slot**。配置写在 `system.conf`，section 名为 `[slot.<class>.<index>]`，例如 `rootfs.0`、`rootfs.1`。

- **class**（如 `rootfs`）：同类冗余槽位；manifest 里写 `[image.rootfs]` 即指向该 class；
- **index**：同类中的第几块（0、1…支持 A/B/C 多冗余）；
- **bootname**：bootloader 侧识别名（如 U-Boot 的 `A`/`B`）；
- **parent**：子 slot（如 boot 分区）可挂在某个 rootfs slot 的 group 上，保证 **根文件系统与应用分区成组切换**。

### 3. Slot 选择与「只写空闲槽」

安装时 RAUC 必须 **只写 inactive slot**，绝不能覆盖当前正在运行的 active 分区。算法概要：

1. 从内核 cmdline 或挂载信息检测 **当前 booted slot**；
2. 同 class 下其余 slot 视为 inactive；
3. 在等价 inactive **slot group** 中选一组（默认可按安装时间戳选最旧，便于 A/B/C）；
4. 将 bundle 里各 image 映射到该组的对应 slot。

### 4. Boot 确认与回滚

写完镜像 ≠ 升级成功。标准流程：

1. 安装前：bootloader 侧 **禁用** 待写 slot 的启动优先级；
2. 写入 inactive slot，校验 SHA-256；
3. 设置下次从新区启动，**reboot**；
4. 新系统起来后执行 `rauc status mark-good`（或集成在启动脚本里）→ bootloader 记为成功启动；
5. 若 watchdog 复位、自检失败或 `mark-bad` → bootloader **回滚**到旧 slot。

这与 [[mender]] 的 commit/rollback 心智模型一致，但 RAUC 更偏 **框架 + 配置**，部署服务器需另选（hawkBit、自研 HTTP 等）。

### 5. Update Handler（镜像如何落盘）

不同存储（eMMC GPT、raw NAND、UBI、NOR flash）和不同镜像格式（ext4 镜像、tar 归档）由 **handler** 匹配表选择写入方式。slot 的 `type=` 与镜像扩展名共同决定 handler。

### 6. Hooks 与 Handlers

| 类型 | 位置 | 用途 |
| --- | --- | --- |
| **Handler** | 目标机 `system.conf` | 系统级：装后脚本、信息提供者 |
| **Hook** | bundle 内、manifest 声明 | 包级：某次更新的迁移、特殊逻辑 |

### 7. Artifact Repository（非 slot 组件）

容器镜像、大模型权重、MCU 固件等 **不宜占双份 rootfs 空间** 的内容，可配置为 **artifact repository**（按名替换、只读使用），与 slot 模型互补。

### 8. 与构建系统集成

生产环境几乎总是通过 **Yocto meta-rauc**、**Buildroot** 或 **PTXdist** 集成：镜像阶段写入 `system.conf`、分区表（`.wks`）、U-Boot env、fstab。主机侧用 **rauc-native** 或 `bundle.bbclass` 产出 `.raucb`。

---

## 代码示例

### 示例 1：目标机 `system.conf`（A/B rootfs + U-Boot）

设备上通常位于 `/etc/rauc/system.conf`（优先级：`/etc/rauc/` > `/run/rauc/` > `/usr/lib/rauc/`）：

```ini
[system]
compatible=MyBoard imx8-evk
bootloader=uboot
mountprefix=/mnt/rauc
activate-installed=true

[keyring]
path=/etc/rauc/ca.cert.pem

[slot.rootfs.0]
device=/dev/disk/by-partlabel/rootfsA
type=ext4
bootname=A
allow-mounted=true
readonly=true

[slot.rootfs.1]
device=/dev/disk/by-partlabel/rootfsB
type=ext4
bootname=B
allow-mounted=true
readonly=true

[slot.boot.0]
device=/dev/disk/by-partlabel/bootA
type=vfat
parent=rootfs.0

[slot.boot.1]
device=/dev/disk/by-partlabel/bootB
type=vfat
parent=rootfs.1
```

**要点**：

- `compatible` 必须与 bundle manifest 完全一致，防止把错误硬件的镜像推上去；
- `bootname` 与 U-Boot `bootloader` 变量联动；Barebox 常用 **bootchooser**；
- `parent=` 把 boot 分区与 rootfs **绑成一组**，更新时 A 组或 B 组整体切换；
- `readonly=true` + `allow-mounted=true` 允许从只读挂载的 active rootfs 旁路更新 inactive 分区。

安装后标记启动成功（常放在 systemd oneshot 或应用自检通过后）：

```bash
rauc status mark-good
# 若自检失败： rauc status mark-bad
```

查看当前 slot 与版本：

```bash
rauc status
rauc info /path/to/update.raucb
```

### 示例 2：构建 bundle（manifest + `rauc bundle`）

在构建主机上准备目录 `input-bundle/`：

```text
input-bundle/
├── manifest.raucm
├── rootfs.img          # ext4 镜像
└── imx-boot.img        # 可选 boot 分区镜像
```

`manifest.raucm` 示例：

```ini
[update]
compatible=MyBoard imx8-evk
version=2026.06.13-1
description=Monthly security + kernel bump

[bundle]
format=verity

[image.rootfs]
filename=rootfs.img

[image.boot]
filename=imx-boot.img
```

使用开发证书签名并打包（宿主机已安装 `rauc` 或 Yocto `rauc-native`）：

```bash
rauc bundle \
  --cert=openssl-ca/dev/development-1.cert.pem \
  --key=openssl-ca/dev/private/development-1.key.pem \
  input-bundle/ \
  deploy/update-2026.06.13-1.raucb
```

**参数说明**：

- `input-bundle/` 内 **所有文件** 都会打进 SquashFS，不只 manifest 列出的；
- `format=verity` 支持 **HTTP(S) 流式安装**（需内核 NBD、服务端 Range 请求）；
- 输出 `.raucb` 拷到设备或通过 URL 安装：

```bash
# 本地安装
rauc install deploy/update-2026.06.13-1.raucb

# 流式安装（RAUC ≥ 1.7）
rauc install https://updates.example.com/releases/update-2026.06.13-1.raucb
```

安装完成后 **reboot**，新系统自检通过后执行 `rauc status mark-good`。

### 示例 3：Yocto `bundle.bbclass` 片段（自动化打包）

在 `meta-your-bsp/recipes-core/bundles/update-bundle.bb`：

```bitbake
inherit bundle

RAUC_BUNDLE_COMPATIBLE = "MyBoard imx8-evk"
RAUC_BUNDLE_VERSION = "2026.06.13-1"
RAUC_BUNDLE_FORMAT = "verity"
RAUC_BUNDLE_SLOTS = "rootfs boot"
RAUC_SLOT_rootfs = "core-image-minimal"
RAUC_SLOT_boot = "imx-boot"
```

BitBake 会生成 manifest、调用 `rauc bundle` 签名，产出与示例 2 同格式的 `.raucb`，适合 CI 流水线。

### 示例 4：D-Bus 触发安装（应用集成）

RAUC 服务暴露 D-Bus 接口，应用可在不直接 shell 的情况下触发升级（需系统已启用 `rauc.service`）：

```bash
# 查询状态
busctl get-property com.pengutronix.rauc / com.pengutronix.rauc.Operation progress

# 通过 dbus-send 安装（简化示例；生产建议用专用库）
dbus-send --system --print-reply \
  --dest=com.pengutronix.rauc \
  / \
  com.pengutronix.rauc.InstallBundle \
  string:"/mnt/usb/update.raucb"
```

进度、错误码可通过 D-Bus 信号订阅，便于 UI 或运维 agent 展示。

---

## 一次完整 OTA 生命周期

```
CI 构建 rootfs.img + boot.img
    → 编写 manifest.raucm（compatible/version）
    → rauc bundle 签名 → update.raucb
    → 上传到 HTTPS / hawkBit / U 盘
    → 设备 rauc install（或 D-Bus / hawkBit updater）
    → 验签 → 选 inactive slot group → 写镜像 → 改 U-Boot env
    → reboot → 新系统启动
    → 自检通过 → rauc status mark-good
    → （可选）上报部署服务器成功
```

若 **写入中断**：active 分区未动，旧系统仍可启动。若 **新系统无法 boot**：bootloader 根据 bootcount / mark-bad 回到旧 slot。若 **能 boot 但未 mark-good**：下次重启可能仍试新 slot 或按 bootloader 策略回滚——因此 **mark-good 必须纳入启动流程**。

---

## 与相近方案对比

| 维度 | RAUC | Mender | swupdate |
| --- | --- | --- | --- |
| 定位 | 更新框架 + 打包工具 | Client + 开源 Server | 嵌入式更新引擎 |
| 部署服务器 | 需自建或 hawkBit 桥接 | 内置 Server 生态 | 通常自建 |
| 签名 | 强制 X.509 | Artifact 签名 | 支持 |
| 集成 | meta-rauc、Buildroot | meta-mender | Yocto/Buildroot |
| API | D-Bus + CLI | HTTPS poll + CLI | Lua/C API、Web |

RAUC 优势在于 **灵活 slot 模型**（不限 A/B，可 A/B/C、recovery、artifact repo）与 **LGPL 客户端**；若需要开箱即用的 fleet 管理 UI，常配合 **hawkBit + rauc-hawkbit-updater**，或与 [[mender]] 对比选型。

---

## 上手路径（零基础）

1. **读文档**：[rauc.readthedocs.io](https://rauc.readthedocs.io/) — Basics → Integration → Reference。
2. **跑 QEMU 示例**：meta-rauc 的 `core-bundle-minimal` + 虚拟机镜像，体验 `rauc install` + reboot + `mark-good`。
3. **理解两份配置**：`system.conf`（目标机地图）与 `manifest.raucm`（单次更新清单）的 `compatible` 必须对齐。
4. **练签名链**：用 meta-rauc 自带 `openssl-ca` 脚本生成开发证书，再规划量产 PKI。
5. **接下发通道**：产线 U 盘 / `rauc install URL` / hawkBit；应用侧用 D-Bus 集成进度。

---

## 常见坑

| 现象 | 原因 | 建议 |
| --- | --- | --- |
| `compatible mismatch` | manifest 与 system.conf 字符串不一致 | 构建与目标用同一 `compatible` 宏 |
| 更新后配置丢失 | 写在 rootfs 内 | 数据放独立 `/data` 分区或 artifact |
| 反复回滚 | 未 `mark-good` 或启动脚本失败 | systemd 自检后再 mark-good |
| Bundle 安装报签名错误 | keyring 与签名证书链不匹配 | 核对 `/etc/rauc/ca.cert.pem` |
| 流式安装失败 | 非 verity bundle 或服务器无 Range | 检查 `format=verity` 与 HTTP 头 |
| 误用 `rauc extract` | bundle 不是通用容器 | 用 `install` 或 D-Bus，定制走 hook |

---

## 小结

RAUC 把嵌入式 Linux OTA 拆成：**宿主机** 用 manifest 描述目标状态并签名打包，**目标机** 用 system.conf 描述分区与 bootloader，**安装器** 只写 inactive slot 并协作 boot 确认。零基础学习者应先建立「双槽位 + 签名集装箱 + 试飞签字」类比，再在 Yocto QEMU 或实体板上走通 **`bundle` → `install` → reboot → `mark-good`** 全链路，比死记命令表更有效。

---

## 延伸阅读

- 官方仓库：[rauc/rauc](https://github.com/rauc/rauc)
- 文档：[RAUC Basics](https://rauc.readthedocs.io/en/latest/basic.html)、[Integration](https://rauc.readthedocs.io/en/latest/integration.html)
- Yocto layer：[meta-rauc](https://github.com/rauc/meta-rauc)
- 部署桥接：[rauc-hawkbit-updater](https://github.com/rauc/rauc-hawkbit-updater)
- 同领域笔记：[[mender]]、[[buildroot]]、[[zephyr]]、[[esphome]]

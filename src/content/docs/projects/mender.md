---
title: Mender — 嵌入式 Linux 的 OTA 空中升级管家
来源: https://github.com/mendersoftware/mender
日期: 2026-06-13
分类: 操作系统
子分类: 嵌入式
难度: 中级
provenance: pipeline-v3
---

## 日常类比：给远程设备装「双保险换机系统」

想象你在全国有 500 台自动售货机，每台跑 Linux，软件偶尔要修 bug、换版本。传统做法是：

1. 派工程师带着 U 盘逐台刷机；
2. 或者 SSH 进去 `apt upgrade`，中途断电就可能变砖；
3. 出问题时没人知道哪台还在跑旧版本。

**Mender 换了一种思路**：每台设备磁盘上划 **两个 rootfs 分区（A/B）**——平时从 A 启动，升级时把新系统整盘写到 **空闲的 B**，重启切到 B；若新系统起不来或没向服务器「报平安」，bootloader 自动 **回滚到 A**。类比成：

| 现实世界 | Mender 对应 |
| --- | --- |
| 飞机备降跑道 | 备用 rootfs 分区（inactive） |
| 塔台调度航班 | Mender Server 下发部署、分组、灰度 |
| 机长定期无线电签到 | Client 轮询 HTTPS，上报状态 |
| 新机长试飞 24 小时 | 首次启动后须 **commit**，否则回滚 |
| 货运集装箱（整箱换） | **Artifact**（`.mender` 更新包） |
| 只换零件不整架换 | **Update Module**（应用级增量更新） |

Mender 由 [Northern.tech](https://northern.tech/) 维护，客户端与服务器端均为 **Apache 2.0 开源**（[mendersoftware/mender](https://github.com/mendersoftware/mender)）。典型场景：工业网关、零售终端、能源监测、车队设备——凡是需要 **大规模、可回滚、可审计** 的嵌入式 Linux OTA，都是它的主场。

---

## 解决什么问题

| 痛点 | 裸写 OTA 时 | Mender 的回应 |
| --- | --- | --- |
| 升级中途断电变砖 | 原地覆盖 rootfs，写坏即死 | A/B 分区 + bootloader 回滚 |
|  fleet 版本不可见 | 每台设备各自为政 | Server 仪表盘：版本、在线、部署进度 |
| 一次性全量推送风险大 | 一发全更，一台 bug 拖垮全网 | 分组、分阶段（phased）部署 |
| 应用 vs 系统更新需求不同 | 一种脚本打天下 | rootfs 镜像 + Update Module 框架 |
| 内网设备无法直连云 | 每台开入站端口不安全 | Client **出站 HTTPS 轮询**，无需开放端口 |
| 与现有 Yocto/Debian 栈割裂 | 自研 updater 与构建链脱节 | `meta-mender` Yocto layer、Debian 镜像转换 |

核心问题：**如何在不可物理接触的设备上，安全、原子地更新整个 Linux 系统或选定应用，并在失败时自动恢复？**

---

## 架构一览

```
┌─────────────────────────────────────────────────────────────────┐
│  构建侧（CI / Yocto / Jenkins / 工作站）                          │
│  rootfs.ext4 / 应用包  ──►  mender-artifact  ──►  *.mender       │
└───────────────────────────────┬─────────────────────────────────┘
                                │ 上传
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│  Mender Server（微服务：API Gateway、deployments、deviceauth…）   │
│  · 存储 Artifact  · 设备 inventory  · 调度 deployment           │
│  · 分组 / RBAC / 审计（企业版增强）                               │
└───────────────────────────────┬─────────────────────────────────┘
                                │ HTTPS 轮询（出站）
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│  设备：Mender Client（managed 守护进程 或 standalone CLI）         │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐                       │
│  │ rootfs A │  │ rootfs B │  │ /data    │  ← 状态、配置放 data   │
│  │ (active) │  │(inactive)│  │ 分区     │                       │
│  └──────────┘  └──────────┘  └──────────┘                       │
│  U-Boot/GRUB：bootcount + mender.conf 控制 A/B 切换与 commit      │
└─────────────────────────────────────────────────────────────────┘
```

与容器化方案（如 resin.io / Balena）不同，Mender 主打 **整镜像 rootfs 更新**，更薄、更易嵌入已有 Yocto/Buildroot 栈；也支持通过 Update Module 做 **单文件、目录、Docker Compose** 等应用级更新。

---

## 核心概念

### 1. Artifact（更新包）

Mender 不直接传「裸 ext4」，而是把 payload 与元数据（设备类型、软件版本、依赖关系、签名）打成一个 **`.mender` Artifact**。Server 按 **device type** 匹配该发给谁。

常用工具：`mender-artifact`（与 Client 配套，可独立安装）。

### 2. Device Type（设备类型）

字符串标识硬件/镜像系列，例如 `raspberrypi4`、`qemu-x86-64`。设备上写在 `/var/lib/mender/device_type`；Artifact 用 `-t` / `-c` 声明兼容类型。**类型不一致则不会下发**，避免把 ARM 镜像推给 x86。

### 3. A/B Rootfs 与 Commit/Rollback

1. Client 把新 rootfs 写入 **inactive** 分区；
2. 校验 checksum，设置 bootloader 下次从 B 启动，**reboot**；
3. 新系统起来后，Client 向 Server **上报成功** 并执行 **commit**（持久化启动分区）；
4. 若在 commit 前再次 reboot 或上报失败 → **自动回滚** 到旧分区。

因此 **rootfs 应无状态**：`/etc` 里改的配置、业务数据应放 **独立 data 分区**，否则整盘更新会被覆盖。

### 4. Managed vs Standalone

| 模式 | 行为 | 适用 |
| --- | --- | --- |
| **Managed** | `mender` 守护进程连 Server，自动 poll、下载、安装、重启、commit | 大规模 fleet、云端/自建 Server |
| **Standalone** | 本地 CLI 或 USB 触发更新，不连 Server | 工厂产线、离线现场、调试 |

内网设备可通过 **Mender Gateway** 代理出站，仍用 managed 模式。

### 5. Update Module（应用更新）

OS 更新适合动 kernel、glibc、系统库；应用更新（单个二进制、配置目录、容器栈）走 **Update Module** 插件框架。官方与社区提供 `single-file`、`dir-install`、`docker-compose` 等模块。

### 6. meta-mender 与构建集成

嵌入式团队多在 **Yocto Project** 里加 `meta-mender-core`（及 `meta-mender-raspberrypi` 等 BSP layer），在镜像阶段就配好分区表、U-Boot/GRUB env、`mender.conf`。Buildroot 也有 `BR2_PACKAGE_MENDER` 与 host `mender-artifact` 集成。

---

## 代码示例

### 示例 1：用 `mender-artifact` 打包 rootfs 镜像

假设 CI 已产出 `rootfs.ext4`（且该 rootfs 在构建时已集成 Mender Client 与 A/B 布局）：

```bash
# 安装工具（macOS 示例；Linux 可从 GitHub Releases 下载）
# brew install mendersoftware/tap/mender-artifact

mender-artifact write rootfs-image \
  -t raspberrypi4 \
  -n release-2026.06.13 \
  --software-version 1.2.0 \
  -f rootfs.ext4 \
  -o deploy/release-1.2.0.mender
```

**参数说明**：

- `-t raspberrypi4`：仅匹配 `device_type` 为 `raspberrypi4` 的设备；
- `-n release-2026.06.13`：Artifact 名称，需与 rootfs 内 `/etc/mender/artifact_info` 策略一致；
- `--software-version 1.2.0`：上报给 Server 的版本号，便于仪表盘对比；
- `-f rootfs.ext4`：整分区镜像 payload；
- `-o …mender`：输出 Artifact，上传到 Mender Server 后即可创建 deployment。

查看已有 Artifact 元数据：

```bash
mender-artifact read deploy/release-1.2.0.mender
# 输出 Compatible devices、Updates 类型、文件大小等
```

### 示例 2：设备端 `mender.conf`（Managed 模式连 Hosted Mender）

设备上主配置通常在 `/etc/mender/mender.conf`（路径因发行版略有差异）：

```json
{
  "InventoryPollIntervalSeconds": 300,
  "RetryPollIntervalSeconds": 30,
  "ServerURL": "https://hosted.mender.io",
  "TenantToken": "YOUR_TENANT_TOKEN_FROM_SERVER_UI",
  "UpdatePollIntervalSeconds": 1800,
  "ServerCertificate": "/etc/ssl/certs/ca-certificates.crt"
}
```

**要点**：

- **TenantToken**：把设备「认领」到你的租户；自建 Server 则改为你的 `ServerURL` 并使用设备认证证书；
- **Poll 间隔**：Client 仅 **出站 HTTPS**，不监听公网端口；
- 首次启动或 provisioning 后，设备出现在 Server UI，可划入 **静态/动态分组**，再对分组创建 **deployment**。

Standalone 本地试更新（不连 Server，适合产线）：

```bash
# 将 Artifact 拷到设备，例如 /var/mender/storage/
mender install /var/mender/storage/release-1.2.0.mender
reboot
# 确认系统正常后
mender commit
# 若异常则： mender rollback  （或再次 reboot 触发未 commit 回滚）
```

### 示例 3：Yocto 中声明 Device Type 与 Artifact 名

在 `local.conf` 或 machine 配置里（简化摘录）：

```bitbake
# 与 mender-artifact -t 保持一致
MENDER_DEVICE_TYPES_COMPATIBLE = "raspberrypi4"

# 部署到 Server 时显示的 Artifact / 软件版本
MENDER_ARTIFACT_NAME = "release-${DISTRO_VERSION}"
MENDER_ARTIFACT_EXTRA_ARGS = "--software-version ${DISTRO_VERSION}"

# 存储布局：A/B rootfs + data 分区大小等
MENDER_STORAGE_TOTAL_SIZE_MB = "4096"
MENDER_DATA_PART_SIZE_MB = "512"
```

BitBake 构建完成后，`tmp/deploy/images/<machine>/` 下会生成 **`.mender` Artifact** 与可烧录 SD 镜像；这与示例 1 的 CLI 打包是同一格式，只是自动化在 Yocto `mender-artifactimg` class 里完成。

### 示例 4：单文件应用更新（Update Module）

只更新 `/home/user/.ssh/authorized_keys` 而不动整盘 rootfs：

```bash
./single-file-artifact-gen \
  --device-type raspberrypi4 \
  -o authorized-keys-1.1.mender \
  -n updated-authorized_keys-1.1 \
  --software-name authorized_keys \
  --software-version 1.1 \
  --dest-dir /home/user/.ssh \
  authorized_keys
```

Server 下发后，Client 调用 **single-file** Update Module 写入目标路径；适合配置、脚本、小型二进制的高频迭代，与 rootfs 大版本更新配合使用。

---

## 一次 Managed 部署的生命周期

```
开发者 push 新 rootfs
    → CI 运行 mender-artifact write …
    → 上传 *.mender 到 Mender Server
    → 在 UI 创建 Deployment（目标：分组 "field-test"）
    → 设备 Client poll 到 pending update
    → 下载 Artifact → 写入 inactive 分区 → reboot
    → 新系统启动 → Client 连 Server 上报 success → commit
    → Server 显示该设备 software version = 1.2.0
```

若 **下载中断**：下次 poll 续传或重试。若 **刷写后无法 boot**：bootloader 切回旧分区。若 **能 boot 但应用崩溃**：在 commit 前 reboot 仍会回滚——因此自动化测试常放在 **canary 分组**，commit 前人工或脚本验收。

---

## 与相近方案对比

| 维度 | Mender | OSTree / rpm-ostree | 容器/Balena 类 |
| --- | --- | --- | --- |
| 更新单元 | 整 rootfs 镜像为主 | 原子包/层 | 容器镜像 |
| 回滚 | A/B 硬件分区 | 引用切换 | 容器版本回退 |
| 开源 Server | 是（微服务自建） | 视发行版 | 多为商业云 |
| 典型集成 | Yocto meta-mender | Fedora IoT 等 | Dockerfile 栈 |
| 内核/驱动升级 | 自然支持（整镜像） | 支持 | 需 host OS 配合 |

Mender 还支持与 **AWS IoT Core**、**Azure IoT Hub** 等集成，便于已有云 IoT 管线的团队接入。

---

## 上手路径（零基础）

1. **读文档**：[docs.mender.io](https://docs.mender.io/) — Introduction → Get started（QEMU 虚拟设备最快）。
2. **Hosted Mender 试用**：注册租户，拿 TenantToken，跑官方 Docker 虚拟设备镜像体验 UI 下发。
3. **真实硬件**：Raspberry Pi + `meta-mender-raspberrypi` 构建带 Mender 的 SD 镜像。
4. **产线/离线**：练熟 `mender install` + `commit`/`rollback` standalone 流程。
5. **生产**：自建 Server（Docker Compose 或 Kubernetes）、Artifact 签名（`-k private.key`）、分阶段部署与监控 Add-on。

---

## 常见坑

| 现象 | 原因 | 建议 |
| --- | --- | --- |
| Deployment 一直 pending | device type 不匹配 | 核对 `/var/lib/mender/device_type` 与 Artifact `-t` |
| 更新后配置丢失 | 配置写在 rootfs | 迁到 data 分区或 `/etc/mender/mender.conf.d` 外置 |
| 无法 commit 反复回滚 | 新镜像缺 Client 或 bootloader 集成错误 | 用官方 meta-mender 模板构建，勿手搓分区 |
| Artifact 过大 | 全量 rootfs | 启用 **delta updates**（Mender 支持差分包） |
| 内网无法出网 | 无直连 Server | 部署 **Mender Gateway** |

---

## 小结

Mender 把嵌入式 OTA 拆成清晰三层：**构建侧** 产出标准 Artifact，**Server** 管 fleet 与部署策略，**Client** 在设备上完成 A/B 原子切换与 commit/rollback。对零基础学习者，先建立「双分区换系统 + 塔台调度」的心智模型，再用 QEMU 或树莓派走通一条 **artifact write → upload → deploy → commit** 链路，比死记 API 更有效。

---

## 延伸阅读

- 官方仓库：[mendersoftware/mender](https://github.com/mendersoftware/mender)（Client）；Server 为多 repo 微服务
- 文档：[How Mender works](https://mender.io/engineers/how-mender-works)
- Yocto layer：[meta-mender](https://github.com/mendersoftware/meta-mender)
- 同领域笔记：[[esphome]]（MCU 级 OTA）、[[zephyr]]（RTOS 侧 DFU）、[[buildroot]] / [[ansible]]（构建与配置管理）

---
title: Mender — 给 IoT 设备做不会刷砖的 OTA 升级
来源: 'https://github.com/mendersoftware/mender'
日期: 2026-07-08
分类: 嵌入式系统
难度: 中级
---

## 是什么

Mender 是一套开源的 **OTA 软件更新系统**，让散落在外面的嵌入式 Linux、IoT 设备可以远程、安全、成批地升级。

日常类比：像给全国门店的收银机换系统。你不能让工程师每家店插 U 盘，也不能让一次断电把机器刷坏；Mender 做的事，就是把“新系统包裹”送到设备，并保留一条能退回旧系统的后路。

```bash
sudo systemctl stop mender-updated
mender-update install /mnt/usb1/release1.mender
reboot
mender-update commit
```

这四行背后有三个角色：`.mender` Artifact 是更新包，设备上的 client 负责安装，服务器可选地负责给整个 fleet 排程、分组和回收状态。

## 为什么重要

不用 Mender，嵌入式 OTA 常见的痛点是：

- 断电、网络掉线、写盘失败时，设备可能停在半新半旧状态，现场维护成本很高
- 每个产品线自己写 updater，最后都在重复处理签名、回滚、日志、兼容性检查
- 成千上万台设备无法分批灰度，只能“一把梭”推送，出错范围不可控
- 系统镜像、应用文件、容器、外设固件各走各的通道，版本账本很快混乱

Mender 的价值不是“帮你下载一个文件”，而是把设备升级变成可审计、可回滚、可分批的工程流程。

## 核心要点

1. **Artifact 是带标签的包裹**：普通压缩包只装文件，Mender Artifact 还带设备兼容类型、版本名、依赖、签名等元数据。类比快递面单：不是有东西就能送，还要确认送给哪种设备、由谁签收。

2. **A/B 分区是备用车道**：系统级更新会把新 rootfs 写到非活动分区，再让 bootloader 下次启动切过去。第一次启动成功后 client 才 `commit`；如果没成功，bootloader 退回旧分区，避免刷砖。

3. **managed 与 standalone 是两种调度方式**：managed 模式由服务器统一分组、灰度、记录日志；standalone 模式在设备本地手动安装。类比公司派工单 vs 维修工现场操作，两者都用同一种 Artifact。

这三点合起来，才是 Mender 跟“自己写一个 curl + tar 脚本”的根本差别。

## 实践案例

### 案例 1：把一台 Debian / Raspberry Pi 设备接入 Hosted Mender

官方 Debian 安装页给的核心配置长这样：

```bash
DEVICE_TYPE="raspberrypi4"
TENANT_TOKEN="<tenant-token-from-hosted-mender>"

sudo mender-setup \
  --device-type "$DEVICE_TYPE" \
  --hosted-mender \
  --tenant-token "$TENANT_TOKEN" \
  --demo-polling

sudo systemctl restart mender-updated
```

- `DEVICE_TYPE` 是设备自报的型号，后面 Artifact 的 `-c` 必须匹配它
- `TENANT_TOKEN` 能把设备加入组织，所以要像密码一样保管
- `mender-setup` 写入 server、证书、租户等配置，`systemctl restart` 让 daemon 重新读取配置

这个案例适合先体验 fleet 管理：设备不需要开入站端口，client 会周期性向 server 询问有没有更新。

### 案例 2：从当前设备做一个系统快照 Artifact

官方操作系统更新教程用 `mender-artifact` 从设备抓 rootfs 快照：

```bash
IP_ADDRESS="<device-ip-address>"
USER="<your-user>"
DEVICE_TYPE="raspberrypi4"

mender-artifact write rootfs-image \
  -f ssh://"${USER}@${IP_ADDRESS}" \
  -c "${DEVICE_TYPE}" \
  -n system-v1 \
  -o system-v1.mender \
  -S "-p 22"
```

- `rootfs-image` 表示这是完整根文件系统更新，会走 A/B 分区和重启流程
- `-f ssh://...` 让工具通过 SSH 从运行中的设备抓取快照
- `-c` 是兼容设备类型，写错会被 client 拒绝安装
- `-n` 是 Artifact 名称，Mender 会用它判断“现在装的是哪个版本”

这个案例适合小规模复制环境：先在一台设备上调好软件，再打成 `system-v1.mender` 推给同型号设备。

### 案例 3：用 Update Module 只更新网页文件

官方自定义 Update Module 教程用一个 `web-file` 脚本把 payload 复制到 `/var/www`：

```bash
cd /usr/share/mender/modules/v3

sudo tee web-file >/dev/null <<'EOF'
#!/bin/bash
set -e
STATE="$1"
FILES="$2"
case "$STATE" in
  ArtifactInstall) cp "$FILES"/files/* /var/www ;;
esac
EOF

sudo chmod +x web-file
mkdir -p /var/www
```

然后在工作站打包应用文件：

```bash
echo 'Installed by Mender!' > hello-world
DEVICE_TYPE="raspberrypi4"

mender-artifact write module-image \
  -c "$DEVICE_TYPE" \
  -o web-file-1.mender \
  -T web-file \
  -n web-file-1.0 \
  -f hello-world
```

- `/usr/share/mender/modules/v3/web-file` 的文件名就是 Artifact 的 `-T web-file`
- `ArtifactInstall` 是状态机回调，client 到安装阶段时把 payload 目录交给脚本
- 这种更新不一定重启，适合网页、配置、模型、小服务等应用层内容

## 踩过的坑

1. **把 Debian package 安装当成完整系统级集成**：官方明确说普通 Debian 包安装不能直接做完整 OS 更新，因为缺少 bootloader 和分区布局接入。

2. **忘记 `commit`**：系统更新首次启动后不提交，bootloader 会认为新系统没确认成功，下一次可能回到旧分区。

3. **`DEVICE_TYPE` 写错**：Artifact 的兼容类型和设备 inventory 不匹配时，client 会拒绝安装，这是防止把镜像发给错误硬件的安全阀。

4. **demo 证书进生产**：README 里的 demo 证书只适合演示；真实设备要配置可信 CA、正确时间和服务器证书，否则 TLS 校验会失败或变成安全隐患。

## 适用 vs 不适用场景

**适用**：

- 工业网关、车载盒子、医疗设备、智能楼宇控制器这类长期在外运行的 Linux 设备
- 需要 A/B rootfs 回滚、分批发布、审计日志和失败诊断的 fleet 管理
- Yocto / Debian family / Zephyr 等生态内，愿意按官方方式做 board integration
- 既有系统更新，又有应用、容器、外设固件更新的复杂产品线

**不适用**：

- 只做一次性原型板，设备就在桌上，手动刷机比接入 OTA 更省
- 没有多余存储空间做双 rootfs，也不能接受为 rollback 调整分区
- 只想要“下载文件后执行脚本”，不需要审计、签名、灰度、回滚
- 团队暂时没有能力维护证书、bootloader、Yocto/Debian 镜像构建链

## 历史小故事（可跳过）

- **2010s**：Mender 围绕 embedded Linux 的痛点成长，核心目标一直是“断电也不刷砖”的 robust OTA。
- **后来**：项目扩展出 server、client、Artifact、Update Module、Connect 等组件，逐渐从 updater 变成设备软件运维平台。
- **当前**：GitHub 仓库约 1k+ stars，README 仍强调 Apache 2.0、client-server、A/B rollback、Yocto 和 Debian 路径。

## 学到什么

1. OTA 的难点不是传输，而是失败后设备还能不能回到已知可用状态。
2. A/B 分区把“升级”拆成写入、切换、确认三步，`commit` 是确认新系统可长期运行的按钮。
3. Artifact 是升级系统的合同：payload 只是货物，兼容性、版本、签名、依赖才决定能不能装。
4. Mender 的工程味很重：它把 bootloader、构建系统、服务器排程、设备日志绑成一条端到端链路。

## 延伸阅读

- 官方仓库：[mendersoftware/mender](https://github.com/mendersoftware/mender)
- 官方概览：[Mender Introduction](https://docs.mender.io/overview/introduction)
- 官方教程：[Standalone deployment](https://docs.mender.io/artifact-creation/standalone-deployment)
- 官方教程：[Create a custom Update Module](https://docs.mender.io/artifact-creation/create-a-custom-update-module)
- [[yocto-poky]] —— 理解 Mender 为什么把 Yocto 当系统级集成主路径
- [[zephyr]] —— Mender 文档也覆盖 MCU / Zephyr 场景，适合对比 Linux 与 MCU OTA

## 关联

- [[yocto-poky]] —— Yocto 负责产出镜像，Mender 负责把镜像安全送到设备并回滚
- [[zephyr]] —— MCU OTA 与 embedded Linux OTA 的约束不同，但都要处理断电和兼容性
- [[freertos]] —— 更轻量的 RTOS 世界，适合对比“有无完整 Linux rootfs”的升级策略
- [[mbedtls]] —— 设备到服务器的 TLS 信任链，是 OTA 安全的底座之一
- [[nats]] —— Mender server 架构里用消息 broker 协调后端服务
- [[traefik]] —— README 架构图提到 API gateway，帮助理解 server 入口层
- [[docker-compose]] —— Mender 支持容器类应用更新，和系统级 rootfs 更新形成互补

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

---
title: RAUC — 嵌入式 Linux 的 A/B 更新控制器
来源: 'https://github.com/rauc/rauc'
日期: 2026-07-08
分类: embedded
难度: 中级
---

## 是什么
RAUC 是一个给嵌入式 Linux 做安全系统更新的工具：它在构建机上打包签名，在设备上校验、安装、切换启动分区。

日常类比：像给偏远门店换收银机系统。你不能派人每家店插 U 盘，也不能让断电后的机器停在半新半旧；RAUC 会先把新系统放到备用车道，确认能跑再让它变成主车道。
```bash
rauc bundle --cert=cert.pem --key=key.pem install-content update.raucb
rauc install update.raucb
rauc status mark-good
```
这三行背后是 RAUC 的基本心智模型：`bundle` 是带签名的更新包，`install` 写入非当前槽位，`mark-good` 告诉 bootloader 这次启动成功。

它不是应用商店，也不是包管理器。它更像设备固件更新里的“交通警察”，负责让 rootfs、bootloader、签名、回滚、D-Bus 控制这几件事按顺序发生。

## 为什么重要
不理解 RAUC，嵌入式 Linux 更新里这些问题会很难解释：
- 为什么完整系统更新不能只写一个 `curl | sh` 脚本，断电时状态会不可预测。
- 为什么 A/B 分区要保留旧系统，不是“浪费一半存储”，而是给失败升级留退路。
- 为什么更新包必须签名和校验，否则设备会分不清“官方固件”和“被篡改的文件”。
- 为什么应用界面最好走 D-Bus 触发安装，而不是在 UI 进程里直接 fork 一长串命令。
RAUC 的价值不是把文件复制到分区，而是把“升级能失败”当成默认前提来设计流程。

## 核心要点
1. **Bundle 是带封条的包裹**：RAUC bundle 里有镜像、manifest、签名和可选 hook。类比快递箱：货物重要，但封条和面单决定它能不能被收件人接受。
2. **Slot 是可切换车道**：常见设计有 `rootfs.0` 和 `rootfs.1` 两个槽位，当前从 A 启动时就把新系统写进 B。类比修路：不在正在通车的车道上铺沥青，而是先修旁边的备用路。
3. **Bootloader 是最终裁判**：RAUC 写完镜像后，还要通过 Barebox、U-Boot、GRUB 或 EFI 让下次启动选新槽位。类比值班主管：RAUC 说“新班表好了”，但真正安排谁上岗的是启动链路。
这三点组合起来，RAUC 才能做到“签名可信、写入可控、启动失败可回退”。

## 实践案例
### 案例 1：官方 x86 A/B 演示，从 USB 安装完整 rootfs
官方示例里，设备有两个等价 rootfs 槽位，`system.conf` 大致长这样：
```ini
[slot.rootfs.0]
device=/dev/sda2
type=ext4
bootname=A
[slot.rootfs.1]
device=/dev/sda3
type=ext4
bootname=B
```
然后在构建机上准备 bundle 内容：
```bash
mkdir temp-dir
cp rootfs.ext4.img temp-dir/
cat > temp-dir/manifest.raucm <<'EOF'
[update]
compatible=rauc-demo-x86
version=2015.04-1
[bundle]
format=verity
[image.rootfs]
filename=rootfs.ext4.img
EOF
rauc --cert demo.cert.pem --key demo.key.pem bundle temp-dir update-2015.04-1.raucb
```
逐部分解释：
- `compatible` 必须和目标设备的 `system.conf` 匹配，避免把 x86 镜像刷到别的板子。
- `[bundle] format=verity` 让 bundle 在安装时多一层完整性校验，是今天更推荐的格式。
- `[image.rootfs]` 告诉 RAUC 这份镜像要写进 `rootfs` 这一类槽位。
拿到 U 盘里的 bundle 后，在目标设备上安装并确认启动成功：
```bash
rauc install /mnt/usb/update-2015.04-1.raucb
reboot
rauc status mark-good
```
如果新槽位启动失败，bootloader 会根据自己的尝试计数或状态记录回到旧槽位；如果启动成功，`mark-good` 才把这次更新正式确认下来。

### 案例 2：Yocto 项目用 meta-rauc 自动生成 bundle
RAUC 官方建议在真实产品里接入 Yocto、PTXdist 或 Buildroot 这类嵌入式构建系统。Yocto 路线的核心是加 `meta-rauc` 层：
```bash
git submodule add git@github.com:rauc/meta-rauc.git
bitbake-layers add-layer meta-rauc
```
目标镜像里装 RAUC：
```text
IMAGE_INSTALL:append = " rauc"
```
然后在 BSP 层写一个 bundle recipe：
```text
inherit bundle
RAUC_BUNDLE_COMPATIBLE ?= "Demo Board"
RAUC_BUNDLE_SLOTS ?= "rootfs"
RAUC_BUNDLE_FORMAT ?= "verity"
RAUC_SLOT_rootfs ?= "core-image-minimal"
RAUC_KEY_FILE = "${COREBASE}/meta-my-bsp/files/development.key.pem"
RAUC_CERT_FILE = "${COREBASE}/meta-my-bsp/files/development.cert.pem"
```
逐部分解释：
- `inherit bundle` 表示交给 `bundle.bbclass` 生成 manifest、打包、签名。
- `RAUC_BUNDLE_COMPATIBLE` 仍然是设备兼容字符串，要和 `/etc/rauc/system.conf` 对上。
- `RAUC_BUNDLE_SLOTS` 决定这个 bundle 更新哪些槽位；只写 `rootfs` 就是完整系统镜像。
- `RAUC_KEY_FILE` 和 `RAUC_CERT_FILE` 是签名材料，开发证书只能用于实验，生产要换正式信任链。
最后构建：
```bash
bitbake core-bundle-minimal
```
Yocto 会把签好的 `.raucb` 放到部署目录。这个案例的重点是：产品里不要手工拼 bundle，应该让构建系统把镜像版本、槽位、签名一起纳入可复现流程。

### 案例 3：应用通过 D-Bus 触发安装并看进度
设备上如果有自己的设置界面或后台服务，官方文档推荐走 D-Bus，而不是让应用直接控制 RAUC 内部流程。
```bash
busctl call de.pengutronix.rauc / de.pengutronix.rauc.Installer \
  InstallBundle sa{sv} "https://example.com/update.raucb" 0
busctl get-property de.pengutronix.rauc / de.pengutronix.rauc.Installer Progress
busctl get-property de.pengutronix.rauc / de.pengutronix.rauc.Installer LastError
busctl monitor de.pengutronix.rauc
```
逐部分解释：
- `InstallBundle` 会后台触发安装，参数可以是本地路径，也可以是 HTTP(S) URL。
- `Progress` 不是一个简单百分比，还带消息和层级深度，界面可以展示“校验签名”“写入槽位”等阶段。
- `LastError` 用来给失败原因兜底，真正深挖时还要看 `journalctl -u rauc`。
- `busctl monitor` 适合调试，产品代码通常会用 D-Bus 库订阅信号。
这个案例说明 RAUC 不只是 CLI 工具，它也能作为设备应用的一层系统服务。

## 踩过的坑
1. **`compatible` 字符串不一致**：bundle manifest 和 `system.conf` 对不上时会被拒绝，这是保护机制，不是 RAUC “找不到设备”。
2. **把 `/dev/sda1` 当稳定路径**：存储枚举顺序可能变，官方建议优先考虑拓扑路径或分区表 UUID，避免更新后写错设备。
3. **忘记安装 D-Bus service/config 文件**：应用调用 D-Bus 前，目标 rootfs 里必须有 RAUC 的 service 和权限配置，否则方法调用会失败。
4. **从 FAT U 盘装旧格式 bundle 时权限位异常**：官方迁移文档提醒要检查 `fmask` 挂载选项，否则格式校验可能触发问题。

## 适用 vs 不适用场景
**适用**：
- 工业网关、医疗终端、充电桩、车载盒子这类长期在外运行的嵌入式 Linux 设备。
- 已经有 Yocto、Buildroot 或 PTXdist 镜像构建流程，愿意把 OTA 纳入正式发布链路。
- 需要签名校验、A/B 回滚、HTTP(S) streaming、D-Bus 控制和 bootloader 状态协作。
- 系统更新以镜像为单位，rootfs、appfs、bootloader 等槽位关系可以提前规划清楚。
**不适用**：
- 只想在服务器上升级几个 Debian 包，普通包管理器已经足够。
- 设备没有冗余存储空间，也不能接受重新规划分区和 bootloader。
- 主要更新容器或业务脚本，且不需要系统级回滚；这类需求可能用轻量发布系统更合适。
- MCU 裸机场景，根本没有完整 Linux rootfs 和 D-Bus 服务。

## 历史小故事（可跳过）
- **2017 年**：RAUC 0.1 发布，核心目标就是 embedded Linux 的安全、可回退更新。
- **2018 年**：1.0 版发布，A/B、签名、slot、bootloader 协作逐渐稳定下来。
- **2020 年以后**：verity bundle、Buildroot/PTXdist/Yocto 集成、streaming 和 adaptive update 让它更适合真实产品线。
- **2026 年**：GitHub 仓库约 1.2k stars，README 显示最新稳定版本仍在持续发布。
- **社区形态**：RAUC 官网、Read the Docs、Matrix、GitHub Discussion 和 Pengutronix 支持渠道一起构成主要入口。

## 学到什么
1. OTA 的难点不是“下载”，而是下载后怎么在断电、失败、重启之间保持可恢复状态。
2. A/B 更新把风险从“覆盖当前系统”变成“准备备用系统，再切换启动目标”。
3. 签名和 `compatible` 是更新包的入场券，能防止错误设备和错误来源。
4. 真正落地 RAUC 时，bootloader、分区表、构建系统、D-Bus 应用要一起设计。

## 延伸阅读
- 官方仓库：[rauc/rauc](https://github.com/rauc/rauc)。
- 官方网站：[RAUC Safe and Secure OTA Updates](https://rauc.io/)。
- 官方文档：[Using RAUC](https://rauc.readthedocs.io/en/latest/using.html)。
- 官方文档：[Integration](https://rauc.readthedocs.io/en/latest/integration.html)。
- 官方文档：[Examples](https://rauc.readthedocs.io/en/latest/examples.html)。
- [[mender]] —— 同样面向嵌入式 Linux OTA，可对比 server/fleet 管理和系统更新边界。

## 关联
- [[yocto-poky]] —— Yocto 负责产出可复现镜像，RAUC 负责把镜像安全装到设备上。
- [[buildroot]] —— Buildroot 能启用 `BR2_PACKAGE_RAUC`，适合小型嵌入式 Linux 产品。
- [[mender]] —— 两者都处理 OTA 和回滚，但 Mender 更强调 server 管理，RAUC 更像本机更新控制器。
- [[embedded-hal]] —— 都是嵌入式工程里的抽象层，只是一个抽象硬件外设，一个抽象系统更新。
- [[nuttx]] —— RTOS 场景和 embedded Linux OTA 约束不同，适合对比“有没有完整 rootfs”。
- [[openssl]] —— RAUC 的 bundle 签名和证书信任链离不开加密库与 X.509 概念。

## 反向链接
<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

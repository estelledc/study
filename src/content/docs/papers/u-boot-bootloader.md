---
title: Das U-Boot — Universal Bootloader 零基础学习笔记
来源: https://docs.u-boot.org/en/latest/
日期: 2026-06-13
子分类: 嵌入式与 IoT
分类: 操作系统
provenance: pipeline-v3
---

## 先想成什么事

想象你买了一台**没有操作系统的裸机电脑**——按下电源键之后，CPU 只会从片上 ROM 里跑一小段固化程序，它既不认识 ext4，也不知道「内核」是什么，更不可能帮你选 Ubuntu 还是 Debian。

这时候需要一位**专职门卫 + 搬运工**：

- **门卫**：在操作系统接管之前，决定「从哪块存储、按什么顺序」找可启动的东西（SD 卡、eMMC、USB、网络 PXE）。
- **搬运工**：把内核镜像、initramfs、设备树（FDT）从 Flash/磁盘读到 RAM 的正确地址，再跳过去执行。
- **值班手册**：记住默认启动延迟、IP 地址、上次从哪张卡启动成功——断电后还能恢复。

**Das U-Boot**（Universal Bootloader）就是嵌入式世界里这位门卫。它跑在 Linux / FreeBSD / VxWorks 等操作系统**之前**，在资源极紧的 SoC 上完成硬件最小初始化，并提供可交互的 **U-Boot shell** 供开发调试。官方文档入口：[Das U-Boot Documentation](https://docs.u-boot.org/en/latest/)。

和 PC 上的 GRUB 类比：GRUB 面向 x86 UEFI/BIOS 生态；U-Boot 面向 **ARM、RISC-V、PowerPC、MIPS** 等板级差异巨大的嵌入式平台，且常常要塞进几十 KB 的 SRAM 里先跑一截「迷你版自己」（SPL）。

## 这篇文档在说什么

| 维度 | 内容 |
|------|------|
| 项目 | Das U-Boot — 开源通用引导加载程序 |
| 许可 | GPL-2.0+（部分库另有许可） |
| 维护 | 全球板级厂商、SoC 厂商、发行版共同贡献 |
| 典型平台 | STM32、i.MX、Rockchip、TI Sitara、Xilinx Zynq、Raspberry Pi 等 |
| 核心能力 | 多阶段启动、环境变量、文件系统、网络 TFTP、FIT 镜像、Distro Boot |
| 新架构 | Driver Model (DM)、Standard Boot（bootdev / bootmeth / bootflow） |

U-Boot 不是「一个小程序」，而是**可裁剪的固件框架**：通过 Kconfig 为每块板子关掉用不到的功能，最终链成 `u-boot.bin` 烧进 Flash，或由 SPL 从分区加载。

## 为什么值得学

| 场景 | U-Boot 提供的价值 |
|------|-------------------|
| bring-up 新板卡 | 串口进 shell，手动 `mmc dev` / `fatload` 验证硬件 |
| Yocto / Buildroot 镜像 | 理解 `boot.scr`、`extlinux.conf`、FIT 如何被解析 |
| OTA / A/B 分区 | 环境变量切换 slot，配合 Verified Boot |
| 内核开发 | 临时改 `bootargs` 而不重编内核 |
| 面试「嵌入式启动链」 | ROM → SPL → U-Boot → Linux 是高频考点 |

只要设备上跑的是 Linux 且不是 x86 UEFI 一统天下，十有八九在日志里能看到 `U-Boot 20xx.xx` 字样。

## 核心概念一：启动链（Boot Phases）

现代 SoC 的 Boot ROM 往往**装不下完整 U-Boot**，于是拆成多级：

```
  ┌──────────┐     ┌─────┐     ┌─────┐     ┌────────────┐     ┌─────────┐
  │ Boot ROM │ ──► │ TPL │ ──► │ VPL │ ──► │    SPL     │ ──► │ U-Boot  │ ──► OS
  └──────────┘     └─────┘     └─────┘     └────────────┘     └─────────┘
   芯片固化        可选极早期    可选校验      初始化 DRAM        完整 shell
```

| 阶段 | 全称 | 典型职责 |
|------|------|----------|
| TPL | Tertiary Program Loader | 极小代码，从 SPI NOR 等加载 SPL |
| VPL | Verifying Program Loader | 可选，A/B 校验后选择 SPL |
| SPL | Secondary Program Loader | 初始化 SDRAM，加载 U-Boot proper |
| U-Boot proper | — | 命令行、文件系统、网络、加载内核 |

**PowerPC 历史命名例外**：顺序可能是 SPL → TPL → U-Boot，读文档时注意架构章节。

SPL 可从 MMC、eMMC、NAND、SPI NOR、UART Ymodem 等介质加载下一阶段镜像；支持 **raw binary**、**legacy uImage**、**FIT (Flat Image Tree)** 等格式。完整 U-Boot 才提供交互式 shell 和丰富的 `bootm` / `booti` / `bootz` 命令。

## 核心概念二：环境变量（Environment）

U-Boot 用**环境变量**保存配置，可驻留 Flash，也可只在内存中临时修改。官方说明见 [Environment Variables](https://docs.u-boot.org/en/latest/usage/environment.html)。

常用命令：

| 命令 | 别名 | 作用 |
|------|------|------|
| `env set name value` | `setenv` | 设置变量 |
| `env print` | `printenv` | 打印全部或指定变量 |
| `env save` | `saveenv` | 持久化到 Flash |
| `env erase` | — | 恢复默认环境 |

典型变量：

| 变量 | 含义 |
|------|------|
| `bootcmd` | 自动启动时执行的命令串（常展开为一长串 distro boot 逻辑） |
| `bootdelay` | 倒计时时长，按任意键可中断进 shell |
| `bootargs` | 传给 Linux 内核的命令行 |
| `boot_targets` | 扫描启动设备的顺序，如 `mmc0 usb pxe` |
| `kernel_addr_r` / `fdt_addr_r` / `ramdisk_addr_r` | 各镜像在 RAM 中的加载地址 |

板级默认环境可来自 `include/env_default.h`，或新版 `.env` 文本文件（`var=value` 每行一条）。

### 代码示例一：最小可重复的手动启动脚本

在 U-Boot shell 中，从 FAT 分区加载 ARM64 内核 + FDT 并启动（地址需与板级 `CONFIG` 一致，下列为常见示例）：

```text
# 选择 MMC 0，分区 1
=> mmc dev 0
=> part list mmc 0

# 从 FAT 加载内核与设备树到 DRAM
=> fatload mmc 0:1 ${kernel_addr_r} Image
=> fatload mmc 0:1 ${fdt_addr_r}   rockchip/rk3588-evb.dtb

# 设置内核命令行并启动（ARM64 用 booti）
=> setenv bootargs 'console=ttyS2,1500000 root=/dev/mmcblk0p2 rootwait rw'
=> booti ${kernel_addr_r} - ${fdt_addr_r}
```

说明：

- `${kernel_addr_r}` 等由默认环境展开，避免手写十六进制地址。
- `booti` 用于 **ARM64 Linux Image**；32 位 ARM 常用 `bootz`（zImage）；带 legacy uImage 头用 `bootm`。
- 中间 `-` 表示无 initrd；若有 initrd，写成 `booti ${kernel_addr_r} ${ramdisk_addr_r} ${fdt_addr_r}`。

把上述步骤写入 `bootcmd` 并 `saveenv`，即可实现上电自动启动。

## 核心概念三：Standard Boot 与 Distro Boot

传统上，发行版兼容启动靠**巨型环境脚本** + 大量 `#define`（`config_distro_bootcmd.h`）。新一代 **Standard Boot** 把逻辑收进 U-Boot 本体，引入三个名词（详见 [Standard Boot Overview](https://docs.u-boot.org/en/latest/develop/bootstd/overview.html)）：

| 概念 | 类比 | 职责 |
|------|------|------|
| **bootdev** | 仓库货架 | 可挂载/访问启动介质的设备（MMC、USB、NVMe、Ethernet） |
| **bootmeth** | 盘点方式 | 在货架上**如何找**启动描述（extlinux、PXE、EFI、Android 分区） |
| **bootflow** | 提货单 | 发行版写的「怎么启动」配置文件（如 `extlinux/extlinux.conf`） |

扫描算法（lazy init）：

```
while (还有 bootdev)
    while (还有 bootmeth)
        while (还有 bootflow)
            尝试启动
```

一条命令即可代替数千字节脚本：

```text
=> bootflow scan -lb
```

`-l` 列出发现的 bootflow，`-b` 找到后尝试启动。用 `boot_targets` 控制设备顺序：

```text
=> setenv boot_targets "mmc0 mmc1 usb pxe"
=> saveenv
```

**extlinux.conf** 示例（发行版提供，U-Boot 只负责解析执行）：

```text
label Fedora-Workstation
    kernel /vmlinuz-6.8.0
    append ro root=UUID=9732b35b-4cd5-458b-9b91-80f7047e0b8a quiet
    fdtdir /dtb-6.8.0/
    initrd /initramfs-6.8.0.img
```

U-Boot 的 distro boot 会在磁盘上查找 `/extlinux/extlinux.conf` 或 `/boot/extlinux/extlinux.conf`，网络侧则查找 PXE 配置。

## 核心概念四：FIT 镜像（Flat Image Tree）

**FIT** 用设备树语法描述**一个包里的多个镜像**（内核、多个 DTB、ramdisk、固件），支持签名与多配置。SPL 常用 FIT 在**同一文件**里携带多个 DTB，按板型自动挑选。

`.its` 源文件片段（构建时用 `mkimage` 打成 `.itb`）：

```text
/dts-v1/;

/ {
    description = "FIT image with kernel + FDT";
    #address-cells = <1>;

    images {
        kernel@1 {
            description = "Linux kernel";
            data = /incbin/("Image");
            type = "kernel";
            arch = "arm64";
            os = "linux";
            compression = "none";
            load = <0x80080000>;
            entry = <0x80080000>;
        };
        fdt@1 {
            description = "Board DTB";
            data = /incbin/("rk3588-evb.dtb");
            type = "flat_dt";
            arch = "arm64";
            compression = "none";
        };
    };

    configurations {
        default = "conf@1";
        conf@1 {
            description = "Boot Linux";
            kernel = "kernel@1";
            fdt = "fdt@1";
        };
    };
};
```

构建与启动：

```bash
# 主机侧：生成 itb
mkimage -f kernel_fdt.its kernel_fdt.itb

# U-Boot shell：从 MMC 加载并启动 FIT
=> fatload mmc 0:1 ${loadaddr} kernel_fdt.itb
=> bootm ${loadaddr}
```

`bootm` 解析 FIT 中的 `configurations` 节点，按默认或指定配置加载各组件。Verified Boot 场景下可对 configuration 做 RSA 签名校验。

### 代码示例二：用 `bootcmd` 封装 TFTP 网络启动

开发板常通过网线从开发机拉镜像，典型环境片段（写入 `u-boot.env` 或 `CFG_EXTRA_ENV_SETTINGS`）：

```text
bootcmd_tftp=dhcp \
  && tftpboot ${kernel_addr_r} zImage \
  && tftpboot ${fdt_addr_r} board.dtb \
  && tftpboot ${ramdisk_addr_r} rootfs.cpio.gz \
  && setenv bootargs 'console=ttyS0,115200 root=/dev/ram0 rw' \
  && bootz ${kernel_addr_r} ${ramdisk_addr_r} ${fdt_addr_r}

bootcmd=run bootcmd_tftp
```

要点：

- `dhcp` 获取 IP 后，`tftpboot` 默认使用同一网络参数。
- `run` 展开子脚本，便于在 `bootcmd_mmc` / `bootcmd_tftp` 之间切换。
- 生产环境务必改 `bootdelay`、`bootcmd`，避免误从空 TFTP 服务器启动。

## 核心概念五：Driver Model 与设备树

现代 U-Boot 使用 **Driver Model (DM)**：设备在设备树里描述，驱动按 uclass 绑定。SPL 阶段会使用**裁剪后的 DTB**（`fdtgrep` 去掉非 `bootph-*` 节点），以减小体积。

开发时常见调试命令：

```text
=> dm tree          # 查看设备树绑定关系
=> mmc list         # 列出 MMC 控制器
=> bdinfo           # 板级信息：DRAM 大小、当前 PC 等
=> fdt addr ${fdt_addr_r}
=> fdt print /chosen
```

Linux 启动后，同一 DTB 往往由 U-Boot 原样递给内核（`booti` 第三个参数），因此 **chosen / stdout-path / memory** 等节点需在 U-Boot 与内核间保持一致。

## 与周边工具链的关系

```
  主机侧                          目标板
  ───────                         ──────
  mkimage / dtc        ──烧录──►  SPL / u-boot.bin
  Kconfig + gcc                    │
  Buildroot / Yocto                ├─► 加载 FIT / extlinux
       │                           │
       └─ 生成 rootfs + kernel ◄───┘ bootm / booti → Linux
```

| 工具 | 与 U-Boot 的关系 |
|------|------------------|
| `mkimage` | 打 legacy uImage / FIT |
| `dumpimage` | 解包、查看镜像头 |
| `mkenvimage` | 把文本 `.env` 打成二进制环境镜像 |
| OpenSBI（RISC-V） | 常作为 prior stage，再进 U-Boot |
| ARM Trusted Firmware | BL31 提供 PSCI，U-Boot 作为 BL33 |

## 学习路径建议

1. **串口先连上**：115200 8N1，确认能看到 `Hit any key to stop autoboot`。
2. **手动跑通一次 `fatload` + `booti`**：理解地址、分区、文件系统三要素。
3. **读 `printenv`**：弄清 `bootcmd` 展开后的 distro 扫描逻辑。
4. **读板级 `defconfig`**：`CONFIG_SPL_*`、`CONFIG_BOOTSTD`、环境大小与偏移。
5. **对照发行版 `extlinux.conf`**：理解 bootflow 与 `root=` 的关系。
6. **进阶**：FIT 签名、Measured Boot、UEFI payload、U-Boot 作为 EFI 应用。

## 常见坑

| 现象 | 可能原因 |
|------|----------|
| `Wrong Image Format` | 用 `bootz` 启 uImage，或 ARM/ARM64 混用 |
| `Bad Magic Number` | 加载地址不对、文件损坏、分区选错 |
| `FDT_ERR_BADMAGIC` | DTB 未加载到 `fdt_addr_r` 或地址重叠 |
| 环境变量保存失败 | Flash 擦写块未对齐、`CONFIG_ENV_OFFSET` 与分区表冲突 |
| SPL 起不来 | `CONFIG_SPL_TEXT_BASE` 与链接脚本或 SRAM 布局不符 |

## 小结

U-Boot 是嵌入式 Linux **启动链的中枢**：在操作系统之前完成介质扫描、镜像加载、设备树传递，并用环境变量把「怎么启」变成可配置、可持久化的策略。旧版依赖脚本与 `bootcmd` 宏展开；新版 **Standard Boot** 用 bootdev / bootmeth / bootflow 把 distro 兼容启动内建进框架。零基础上手时，优先在 shell 里**手动复现一次启动**，再回头读 `bootcmd` 和板级 Kconfig，比直接啃几万行 `board/` 代码更有效。

## 参考链接

- [Das U-Boot 官方文档](https://docs.u-boot.org/en/latest/)
- [Environment Variables](https://docs.u-boot.org/en/latest/usage/environment.html)
- [Standard Boot Overview](https://docs.u-boot.org/en/latest/develop/bootstd/overview.html)
- [Flat Image Tree (FIT)](https://docs.u-boot.org/en/latest/usage/fit/index.html)
- [Booting from TPL/SPL](https://docs.u-boot.org/en/latest/usage/spl_boot.html)
- [Generic Distro Configuration](https://docs.u-boot.org/en/latest/develop/distro.html)

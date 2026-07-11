---
title: Firecracker 2020 — 给 serverless 量身定做的极简 microVM
来源: 'Agache et al., "Firecracker: Lightweight Virtualization for Serverless Applications", NSDI 2020'
日期: 2026-06-01
分类: 操作系统
难度: 中级
---

## 是什么

Firecracker 是 AWS 2018 年开源、2020 年发论文的一个**虚拟机管理器**（VMM），用 Rust 写。它做的事一句话：**为 serverless 量身做一台只剩骨架的虚拟机**。

日常类比：普通虚拟机像一辆什么都有的家用车——空调、音响、后备厢、儿童座椅扣，啥都配齐。但你只是想拉一趟快递，95% 的零件都用不上。Firecracker 把这辆车拆到只剩**底盘 + 引擎 + 四个轮子**，跑得又快又省油，专门服务一种场景：**短命、密集、多租户、要强隔离的函数计算**。

它是 AWS Lambda 和 Fargate 背后的引擎。每次你调一次 Lambda 函数，云端某台机器就用 Firecracker 启动一台 microVM，跑完关掉。

## 为什么重要

要懂 Firecracker，先看它解决的矛盾：

- **容器**（Docker）：启动快（百毫秒级）、内存小，但所有容器**共享宿主内核**。一个内核漏洞就能逃逸——多租户场景里这是致命的
- **传统 VM**（QEMU+KVM）：每个 VM 有独立内核，**强隔离**，但启动慢（数秒）、内存开销大（几十到几百 MB），密度上不去

Lambda 这种场景需要：**VM 级隔离 + 容器级密度**。Firecracker 选了 VM 路线，但把 VMM 砍到极致——**125ms 启动、< 5MB 额外内存、单机能跑几千个**。

这个思路重新定义了 serverless 的物理边界，也带火了一个观念：**当工作负载的需求足够窄，专用基础设施可以比通用方案好一两个数量级**。

## 核心要点

### 1. 砍掉 QEMU 99% 的设备模型

QEMU 是通用 hypervisor，模拟了几十种设备：USB、PCI、声卡、显卡、各种磁盘控制器。Firecracker **只保留四样**：

- `virtio-net`：网卡
- `virtio-block`：磁盘
- 串口（serial）：日志输出
- i8042 键盘控制器：仅用来接收一个关机信号

代码量从 QEMU 的约 140 万行降到约 5 万行（大约 **1/28**）。需要信任的代码总量（TCB）跟着大幅收缩，攻击面大约小一个数量级。

### 2. 复用 Linux KVM，不重造轮子

Firecracker 不自己做硬件虚拟化，**底层直接用 Linux KVM 模块**——CPU 虚拟化、内存映射、中断注入这些"难做对"的部分交给内核。Firecracker 自己只做用户态那一层"VMM"——给 guest 暴露设备、处理 I/O、接收 API 请求。

这就是为什么 Rust 写 5 万行就够：硬的部分 KVM 已经做完了。

### 3. Rust + Jailer 双层加固

- **Rust** 杜绝了 C 系 hypervisor 常见的 use-after-free、缓冲区溢出
- **Jailer** 是个独立小程序，在启动 Firecracker 之前先用 `chroot + namespaces + seccomp` 把它关进笼子——即使 Firecracker 本身被攻破，逃出来也只能看到一个空目录、几乎没有 syscall 可用

### 4. 极致启动路径

启动一个 microVM 的流程被压到 4 步：

1. 创建 KVM 实例 + 分配 guest 内存
2. 加载 kernel image（uncompressed，跳过解压）
3. 注册 4 个 virtio 设备
4. KVM_RUN 跳转到 guest 的 `_start`

guest 内核也是定制的——裁掉模块、磁盘从内存镜像加载、init 是个空壳——典型从 API 调用到用户函数开始执行**约 125ms**。

## 实践案例

### 案例 1：一台 i3.metal 上能跑多少个 microVM

论文实测：**单台 72 核、512GB 内存的 i3.metal**，可以稳定运行约 **8000 个 microVM**，每秒新建 **150 个**。同样的机器跑传统 QEMU/KVM 大概能跑几百个，差距 10x+。

### 案例 2：一次 Lambda 冷启动

```
用户发请求
  ↓
Lambda 前端调度到某台 worker
  ↓
worker 上 Firecracker API（Unix socket）收到 PUT /machine-config
  ↓
配置 vCPU=1, mem=128MB, kernel=lambda-rt.bin
  ↓
PUT /actions {"action_type": "InstanceStart"}
  ↓
~100ms 后 guest 内核起来 → init → 用户函数 handler 被调
  ↓
执行完毕，VM 关闭，下一个请求复用或重建
```

整条链路从外面看就是"调一次 Lambda"，里面藏了一台真虚拟机的完整生命周期。

### 案例 3：rust-vmm 生态外溢

Firecracker 团队把通用部分（KVM bindings、virtio 实现、CPUID 处理）抽成 [rust-vmm](https://github.com/rust-vmm) crates，让别人可以拼自己的 VMM。Cloud Hypervisor（Intel）就是这样拼出来的——专攻通用云负载，跟 Firecracker 互补。

## 踩过的坑

1. **不能 live migration**：Firecracker 砍掉了内存快照/恢复的复杂部分（后来用 snapshot/restore 部分补回，但和 QEMU 完整 live migration 还是两码事）。Lambda 的工作负载本来就是"用完就扔"，所以无所谓。

2. **不能跑 GPU 直通 / PCI passthrough**：设备模型只有 4 种，复杂硬件场景一律不行。这就是它**不能替代通用 VM** 的根本原因。

3. **guest 内核必须是定制版**：标准 Ubuntu 的 kernel 启动会卡——它在找各种不存在的设备。Firecracker 用的是裁剪过的 microvm 优化内核。

4. **vsock 是唯一主机-guest 通信**：传统 SSH / 网络都行，但 Firecracker 推荐用 vsock（基于 socket 的虚拟化通道）——更快更难被网络面攻击。新人常踩的坑是想 `ssh` 进去，发现没有网卡（或者网卡是 tap 设备隔离的）。

## 适用 vs 不适用场景

**适用**：

- FaaS / serverless 平台后端（Lambda、Fargate、Fly.io 早期）
- 多租户短任务沙箱（CI runner、在线代码评测、AI 模型推理隔离）
- 强隔离 + 高密度 + 短生命周期 三者同时要

**不适用**：

- 需要 GUI 或图形加速 → 用普通 VMware/QEMU
- 需要 live migration、保存恢复整机状态 → 用 QEMU + libvirt
- 单机就一两个长跑 VM → 杀鸡用牛刀，传统 VM 更合适
- 需要 Windows guest → Firecracker 默认目标是 Linux guest

## 历史小故事（可跳过）

- **2014 年**：AWS Lambda 上线，最初每个函数跑在一个完整 EC2 实例里——密度极低，AWS 自己烧钱补贴
- **2017 年**：内部立项，决定写一个专门的 VMM。选 Rust 是因为 C 写 hypervisor 太容易出 CVE，C++ 团队不熟
- **2018 年 11 月**：Firecracker 在 re:Invent 开源，同时 Lambda 全量切到它的后端
- **2020 年**：NSDI 论文公开了内部数据和设计取舍——这是云厂商少见的把"基础设施账本"摊开给学界看

## 学到什么

1. **窄场景换专用工具**：通用工具的 95% 复杂度对窄场景毫无价值，砍掉它换来的密度和速度才是真生意
2. **用现成的硬骨头**：CPU 虚拟化交给 KVM，I/O 模拟自己写——分清楚什么自己做、什么借力
3. **安全是分层的**：Rust（语言级）+ Jailer（OS 级）+ 设备砍少（架构级），三层都做才像个安全产品
4. **Rust 在系统软件可行**：5 万行写出生产级 hypervisor，这是 Rust 在 OS 圈的一次有力背书

## 延伸阅读

- 论文 PDF：[Firecracker: Lightweight Virtualization for Serverless Applications, NSDI 2020](https://www.usenix.org/system/files/nsdi20-paper-agache.pdf)（17 页，写得很清楚）
- 源码：[firecracker-microvm/firecracker](https://github.com/firecracker-microvm/firecracker)（Rust，约 5 万行）
- [rust-vmm 项目](https://github.com/rust-vmm)（被孵化出来的通用 crates）
- [[kvm-2007]] —— Firecracker 站在 KVM 肩上做用户态那一层
- [[xen-2003]] —— 另一条 hypervisor 路线，Firecracker 的对照组

## 关联

- [[kvm-2007]] —— Linux 内核虚拟化模块，Firecracker 的下层
- [[xen-2003]] —— 类型 1 hypervisor 代表，跟 Firecracker 走相反思路
- [[gvisor-2018]] —— 用户态 syscall 拦截，跟 Firecracker 在 serverless 隔离方案里互为对照
- [[rust-language]] —— Firecracker 选 Rust 的工程原因
- [[unikernel]] —— 另一种"砍掉 OS 多余部分"的思路，更激进但兼容性更差

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[denali-2002]] —— Denali — 在一台机器上同时跑上千个轻量 VM 的早期实验
- [[haven-2014]] —— Haven — 在不信任的云里给程序造一间安全屋
- [[kvm-2007]] —— KVM 2007 — 把 Linux 内核本身变成 hypervisor
- [[xen-2003]] —— Xen 2003 — 让操作系统配合虚拟化，性能直接接近原生


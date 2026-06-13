---
title: gVisor — 容器应用内核
来源: https://github.com/google/gvisor
日期: 2026-06-13
分类: 其他
子分类: security-tools
provenance: pipeline-v3
---

# gVisor — 容器应用内核

## 什么是 gVisor？

想象你住在一栋公寓楼里（这就是你的**物理服务器**）。每个住户就是一个**容器**。

传统做法是给每户装一扇防盗门（Linux 内核的安全隔离机制，如 cgroups 和 namespaces）。但这扇门有个问题：如果门锁设计有缺陷，坏人仍然可以破门而出，闯到其他住户家。

gVisor 的做法是：在每个住户家里**再装一层独立的安保系统**——有独立的门铃、锁、甚至一个迷你保安室。这层安保系统不是整栋楼共享的，每户独立运行。即使有人突破了这层安保，他也仍然在住户的房间里，没法跑到楼外去。

这层"独立的安保系统"，就是 gVisor——一个用 Go 语言写的**应用内核**（Application Kernel），专门跑在容器里面，拦截容器对操作系统的所有请求。

## 核心概念

### 1. 应用内核（Application Kernel）

gVisor 不是一个普通的程序，而是一个**完整的操作系统内核**——但它不是替代 Linux，而是**模拟 Linux 内核的行为**。它实现了 Linux 内核的大约 99% 的系统调用接口（syscall），但所有这些调用都不直接交给宿主机的 Linux 内核处理，而是在 gVisor 自己内部完成。

你可以把 gVisor 理解为一个"翻译官"：

```
应用程序 → gVisor（翻译 syscall）→ 宿主机 Linux 内核（只收到少数必要调用）
```

传统容器的路径是：

```
应用程序 → 宿主机 Linux 内核（所有 syscall 直接到达）
```

### 2. runsc — OCI 运行时

gVisor 提供了一个叫 `runsc` 的二进制程序，它是一个 OCI（Open Container Initiative）容器运行时。这意味着它可以直接和 Docker、containerd、Kubernetes 这些你熟悉的工具链集成。

### 3. 沙箱 vs 普通容器

| 对比项 | 普通容器 | gVisor 沙箱容器 |
|---|---|---|
| 内核共享 | 直接共享宿主机内核 | 隔离的虚拟内核 |
| 逃逸风险 | 内核漏洞即可逃逸 | 需同时突破两层 |
| 性能开销 | 几乎无额外开销 | 少量额外开销 |
| 安全等级 | 基础 | 接近 VM |

## 架构拆解

gVisor 的整体架构可以分成三层：

**第一层：Sentry（哨兵）**

这是 gVisor 的核心。它拦截容器内的每一个系统调用。比如容器里运行 `cat file.txt`，Linux 内核的 `read()` 系统调用会被 gVisor 的 Sentry 拦截，然后 gVisor 在自己的虚拟文件系统中找到这个文件，把内容读出来返回给应用程序。应用程序根本不知道自己没有直接访问真正的 Linux 内核。

**第二层：虚拟文件系统**

gVisor 维护了自己的一套虚拟文件系统（VFS）。容器看到的文件、目录、设备，大部分是 gVisor 模拟出来的。它可以选择性地把宿主机上的真实文件暴露给容器。

**第三层：网络栈**

gVisor 用 Go 语言重写了一个完整的 TCP/IP 网络栈。容器里的 `ping`、`curl`、`wget` 发出的网络请求，都经过 gVisor 自己的网络栈处理，而不直接走宿主机的网络协议栈。这意味着 gVisor 的作者是 Go 程序员——它不是一个 C/C++ 写的内核模块，而是一个可以独立编译运行的 Go 程序。

## 实际使用

### 安装

在 Linux 上安装 gVisor 很简单：

```bash
mkdir -p bin
make copy TARGETS=runsc DESTINATION=bin/
sudo cp ./bin/runsc /usr/local/bin
```

如果你用的是 Google Cloud 的 GKE（Kubernetes 服务），它内置了 gVisor 支持，无需手动安装。Google Cloud Run、DigitalOcean App Platform 等产品都在用 gVisor。

### 和 Docker 配合使用

安装好 `runsc` 后，配置 Docker：

```bash
sudo runsc install
sudo systemctl restart docker
```

然后用 `--runtime=runsc` 来启动一个沙箱容器：

```bash
docker run --runtime=runsc --rm hello-world
```

启动一个交互式终端来探索：

```bash
docker run --runtime=runsc --rm -it ubuntu /bin/bash
```

验证你是否真的运行在 gVisor 中：

```bash
docker run --runtime=runsc -it ubuntu dmesg
```

输出会显示类似这样：

```
[    0.000000] Starting gVisor...
[    1.748935] Generating random numbers by fair dice roll...
[    2.059747] Digging up root...
[    2.613217] Ready!
```

### 和 Kubernetes 配合使用

在 Kubernetes 中，你可以在 Pod 的 `annotations` 里指定使用 runsc 运行时：

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: sandboxed-pod
  annotations:
    io.kubernetes.cri-o.TrustedSandbox: "true"
    sandbox.type: runsc
spec:
  containers:
  - name: my-app
    image: nginx:latest
```

## 调试模式

gVisor 提供了强大的调试选项，可以追踪容器的每一个系统调用：

```bash
sudo runsc install --runtime runsc-debug -- \
  --debug \
  --debug-log=/tmp/runsc-debug.log \
  --strace \
  --log-packets
```

`--strace` 选项会记录容器内进程发出的所有系统调用，类似 Linux 的 `strace` 命令。`--log-packets` 会记录所有网络数据包。

## 不支持什么

gVisor 虽然兼容性好，但并非万能。以下场景无法在 gVisor 沙箱中正常运行：

- 宿主机挂载块设备（ext4、fat32 等）不能在容器内直接挂载
- 容器内不能使用 KVM（不能在 gVisor 里面再开虚拟机）
- `io_uring` 相关系统调用默认禁用（部分支持）
- 资源限制（CPU、内存的硬限制）在沙箱内部不生效

## 为什么它用 Go 语言？

这是一个值得思考的设计决策。传统的 Linux 内核用 C 语言编写，而 gVisor 选择了 Go。

原因很直观：

1. **内存安全**：Go 有垃圾回收和类型系统，不会出现 C 语言中常见的缓冲区溢出、 Use-After-Free 等漏洞。而这些漏洞恰恰是内核攻击中最常见的利用方式。
2. **开发效率**：Go 的语法简洁、标准库丰富，实现一个完整的虚拟内核比用 C 写快得多。
3. **可维护性**：gVisor 的 76.6% 代码是 Go，18% 是 C++（主要用于平台适配），这让它更容易被社区贡献和维护。

## 和其他技术的关系

很多人容易把 gVisor 和以下技术混淆：

- **seccomp-bpf**：这只是个系统调用过滤器，像一个门卫，只允许某些 syscall 通过。gVisor 是完整的内核，不只是过滤。
- **Firejail / AppArmor**：这些是安全模块，给进程加限制。gVisor 是替代内核，不只是加限制。
- **虚拟机（VM）**：VM 模拟整台物理机器，开销大。gVisor 是用户态进程，启动快、开销小，安全接近 VM。

gVisor 走的是中间路线：比单纯的安全模块更安全，比虚拟机更轻量。

## 总结

gVisor 的核心价值可以用一句话概括：**在容器和宿主机内核之间加了一层"翻译官"，让容器无法直接访问宿主机内核。**

它的设计哲学是"由 Linux 实现 Linux"——用用户态进程模拟内核行为，只把必要的请求交给真正的内核处理。这种方式既保留了容器启动快、资源占用少的优点，又大幅提升了安全隔离强度。

对于学习操作系统的人来说，阅读 gVisor 的源码是一个极佳的学习路径：你能看到一个用现代语言写的"操作系统内核"是如何一步步实现系统调用、文件系统、网络协议栈的。

---

来源: https://github.com/google/gvisor

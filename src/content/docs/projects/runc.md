---
title: runc — Linux 容器最底层那个真正在 fork 进程的 CLI
来源: https://github.com/opencontainers/runc
日期: 2026-05-31
子分类: cloud-native
分类: 基础设施
难度: 中级
provenance: pipeline-v3
---

## 是什么

runc 是一个**只做一件事**的命令行工具：读一个目录（叫 OCI bundle），然后在 Linux 上把里面的程序当作"容器"跑起来。

日常类比：runc 像剧院的**灯光师**——你（导演）说"开演"，他按下开关。台前是演员（你的应用），观众看到的是 docker / podman / kubernetes，**幕后真正按开关的永远是 runc**。

```
你 → docker run nginx
       ↓
   dockerd → containerd → runc → clone() / unshare() / pivot_root() → 你的 nginx 进程
```

最右边那一步——真正调 Linux 内核 syscall 把进程关进 namespace 的——就是 runc。

## 为什么重要

- **OCI 标准的参考实现**：runc 是 Open Container Initiative（Docker / Google / Red Hat 等 2015 年共同成立）的官方运行时，不属于任何单一厂商。其他实现（crun / youki）都要对齐它的行为
- **几乎所有 Linux 容器平台最底层都是它**：生产 Kubernetes 集群里每个 Pod 的容器进程，最底层启动它的就是 runc
- **理解 runc = 理解容器到底是什么**：容器不是虚拟机，不是新发明，就是"被 namespace 围起来 + 被 cgroups 限速的普通 Linux 进程"——读 runc 你能看见这句话每个字怎么落地
- **安全攻防的核心战场**：runc 上每一个 CVE 都是教科书级容器逃逸案例（见下面踩坑章节）

## 核心要点

### 1. 输入：OCI bundle

一个目录，里面两样东西：

- `rootfs/` —— 容器看到的根文件系统（解压 nginx 镜像就是它）
- `config.json` —— 描述这个容器要怎么跑：用哪些 namespace、cgroups 限制多少 CPU、挂哪些目录、走哪个 entrypoint

### 2. 三步开演

```
runc create mycontainer    # 准备好 namespace，但还没跑用户进程
runc start  mycontainer    # 真正 exec 用户的 entrypoint
runc delete mycontainer    # 清理
```

containerd 不会让你手动敲这些；它在内部按这个顺序调。

### 3. 双进程接力

runc 启动时其实 fork 出第二个进程叫 `runc init`：

- 父 runc 留在宿主机，负责 setup cgroups / 准备 fd
- 子 runc init 进入新 namespace 后做 `pivot_root`，最后 `exec` 成你的应用

为什么要分两步？因为有些操作（比如 user namespace 映射）必须**在新 namespace 内**做，必须**在 exec 之前**做——只能 fork 一个中间人。

### 4. 调用的 Linux 内核积木

| 积木 | 干什么 |
|---|---|
| `clone()` / `unshare()` | 创建新 namespace（pid / net / mnt / uts / ipc / user / cgroup） |
| `cgroups v2` | 限制 CPU / 内存 / IO |
| `pivot_root()` | 把容器根目录换成 rootfs |
| `capabilities` | 砍掉容器进程的特权（比如 CAP_SYS_ADMIN） |
| `seccomp` | 过滤系统调用白名单（比如禁止 reboot） |
| `AppArmor` / `SELinux` | 强制访问控制 |

runc 不发明任何隔离机制，它只是把这些内核积木**按 OCI spec 拼起来**。

## 实践案例

### 案例 1：手动跑一个 runc 容器

```bash
mkdir mycontainer && cd mycontainer
mkdir rootfs
docker export $(docker create busybox) | tar -C rootfs -xf -
runc spec                  # 生成 config.json 模板
sudo runc run mybox        # 直接跑
```

你会进入一个 busybox shell，里面 `ps -ef` 只看到你自己——这就是 namespace。docker run 的最后一步本质就是这个。

### 案例 2：containerd 怎么调它

containerd 的源码里有个 shim 进程，shim 的代码大概是：

```go
cmd := exec.Command("runc", "create", "--bundle", bundleDir, containerID)
// ... 等创建完
cmd = exec.Command("runc", "start", containerID)
```

containerd 自己**不直接 syscall**，它把脏活全部包给 runc。这是 OCI 分层的核心 —— 让运行时可替换。

### 案例 3：rootless 容器

普通用户没 root 权限怎么跑容器？runc 用 **user namespace**：

- 容器里看到的 uid 0（root）
- 宿主机看到的是你的真实 uid（比如 1000）

容器里的"root"在宿主机上权限**和你普通用户完全一样**——这是 podman 默认能 rootless 的底层支持。

## 踩过的坑

### CVE-2019-5736 —— /proc/self/exe 覆盖宿主机 runc

恶意容器把自己 entrypoint 软链到 `/proc/self/exe`。当 runc 用 `execve` 启动这个 entrypoint 时，容器内进程**反向打开** `/proc/<runc_pid>/exe` 拿到宿主机 runc 二进制的**写句柄**——直接覆盖。下次任何容器启动，跑的都是攻击者的代码。

修复：runc 启动时先把自己拷一份到内存（memfd），从 memfd 跑，避免 `/proc/self/exe` 指向真文件。

### CVE-2024-21626 —— fd 泄漏导致 cwd 在宿主机

runc 内部用了一个 fd 指向宿主机文件系统，**忘了 close**，被泄漏到容器进程。容器进程 chdir 到这个 fd 之后，它的工作目录就在宿主机根 —— 又一次逃逸。

修复：close-on-exec 全部检查一遍。

**学到的两件事**：

1. 容器隔离从来不是"绝对的"，是**多层防线**——namespace + cgroups + seccomp + capabilities + LSM。任何一层有洞都可能逃逸
2. fd / 软链 / `/proc` 是容器逃逸的高频入口，所有边界都要假设容器内是恶意的

### 坑 3：runc 不背镜像，不背网络

runc 不知道镜像是什么（那是 containerd 的事），也不配网络（那是 CNI 插件的事）。它只接 bundle、起进程。新人常以为 runc 是 docker 的小型版，其实它**只占了 docker 整个栈的最底层一小段**。

## 适用 vs 不适用场景

**runc 是你想要的**，当你：

- 学习容器到底怎么实现 → runc 源码是最薄一层，比 containerd / docker 容易读
- 写自己的容器编排工具 / 沙箱 → 直接调 runc CLI 比自己 syscall 安全得多
- 做容器安全研究 / CVE 复现 → 攻击面集中在 runc

**不要直接用 runc**，当你：

- 只想跑应用 → 用 docker / podman / nerdctl
- 要管理多容器 → 用 docker-compose / kubernetes
- 不在 Linux 上 → runc 是 Linux 专用，macOS / Windows 跑不了（Docker Desktop 内部跑了一个 Linux VM）
- 想要更强隔离（不信任内核 namespace） → 用 gVisor / Kata Containers / Firecracker，它们各自换掉了 runc 这一层

## 历史小故事

- **2013 年**：Docker 开源，里面有个内部库 libcontainer，第一次让容器编程接口好用起来
- **2015 年 6 月**：Docker / CoreOS / Google / Red Hat 等成立 OCI，Docker 把 libcontainer 拆出来重命名为 runc，捐出去当参考实现
- **2016 年**：Kubernetes 通过 CRI-O / containerd 接 runc，runc 成为云原生底层默认运行时
- **2019 年**：CVE-2019-5736 震动整个容器圈，所有云厂商紧急打补丁
- **2023 年**：Rust 写的 youki 进入 OCI 认证，runc 第一次有正式同行竞品
- **2024 年**：CVE-2024-21626 又一次提醒大家：容器边界永远在被攻击

## 学到什么

1. **容器 = 普通进程 + namespace + cgroups**，没有魔法。读 runc 你能看见每一步是哪个 syscall
2. **分层架构的好处**：runc 只管启动一个进程，containerd 管多容器，dockerd 管 API，kubernetes 管多机器。每层换掉不影响其他层
3. **OCI 标准的胜利**：因为有 spec，runc 可以被 youki / crun 替换，containerd 不用改一行代码
4. **安全是多层的**：单一防线一定会被破，namespace + seccomp + capabilities + LSM 必须叠加

## 延伸阅读

- 官方仓库：[opencontainers/runc](https://github.com/opencontainers/runc)
- OCI Runtime Spec：[opencontainers/runtime-spec](https://github.com/opencontainers/runtime-spec)
- Liz Rice 演讲 [Containers from Scratch](https://www.youtube.com/watch?v=8fi7uSYlOdc)（30 分钟手写一个迷你 runc）
- CVE-2019-5736 [漏洞分析博客](https://unit42.paloaltonetworks.com/breaking-out-of-coresvc-runc-vulnerability-cve-2019-5736/)
- [[containerd]] —— runc 上面那一层，管多容器生命周期
- [[kubernetes]] —— runc 上面好几层，管多机器调度

## 关联

- [[containerd]] —— runc 的直接调用方，OCI Runtime + Image 的高级胶水
- [[kubernetes]] —— Pod 里每个容器最终落到 runc
- [[docker]] —— 历史源头，runc 是从 Docker libcontainer 拆出来的
- [[gvisor]] —— 同位置的替代品，用 Go 实现的用户态内核做更强隔离
- [[firecracker]] —— microVM 路线的替代隔离，AWS Lambda 在用
- [[cgroups-v2]] —— runc 用来限速限内存的内核机制
- [[linux-namespaces]] —— runc 用来做隔离的内核机制

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[containerd]] —— containerd — Docker 和 Kubernetes 共用的那台容器运行机
- [[cri-o]] —— CRI-O — 只为 Kubernetes 而生的瘦身版容器运行时
- [[kubernetes]] —— Kubernetes — 容器编排平台
- [[moby]] —— Moby — Docker 把引擎拆开后的开源上游


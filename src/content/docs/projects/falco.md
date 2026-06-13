---
title: Falco 零基础入门 —— 云原生时代的应用运行时安全卫士
来源: https://github.com/falcosecurity/falco
日期: 2026-06-13
分类: 安全与隐私
子分类: security
provenance: pipeline-v3
---

# Falco 零基础入门 —— 云原生时代的应用运行时安全卫士

## 一、什么是 Falco？

### 一个生活类比

想象你在管理一栋写字楼。你装了很多监控摄像头（摄像头记录每一帧画面），但这还不够 —— 你还需要一个 24 小时值班的安保主管，他看过所有摄像头画面后，一旦发现有人没刷卡就进入机房、在走廊放可疑箱子、或者半夜偷偷修改门禁系统，就会立刻拉响警报。

Falco 就是这个"安保主管"。它运行在你的 Linux 系统或 Kubernetes 集群中，**实时监控**每一个进程行为，一旦发现不符合你预期规则的异常动作，就会发出告警。

### 一句话定义

Falco 是 CNCF 的毕业项目，专门用于**云原生环境下的运行时安全检测**。它不靠病毒特征库来判断好坏，而是通过观察系统底层的系统调用（syscall），配合你写的"规则"来判断行为是否正常。

---

## 二、核心概念

Falco 的工作模型可以拆成四个关键部分：

### 1. 事件源（Event Source）

Falco 能看到的"眼睛"。最主要的眼睛是 **Linux 内核的系统调用**。

你运行的每个程序，最终都要向操作系统"申请"资源。比如：
- `open()` —— 打开一个文件
- `connect()` —— 发起网络连接
- `execve()` —— 执行一个新程序

这些动作在 Linux 里都叫系统调用。Falco 在极低的层级拦截它们，拿到每一条记录。

此外，Falco 还支持 Kubernetes 审计日志、AWS CloudTrail 等外部事件源。

### 2. 规则引擎（Rules）

规则是 Falco 的"大脑"。每条规则回答一个问题："在什么情况下，我要拉警报？"

一条完整的 Falco 规则包含五个字段：

| 字段 | 作用 |
|------|------|
| `rule` | 规则名称，必须唯一 |
| `desc` | 规则描述，让人知道它在检测什么 |
| `condition` | 核心判断条件（布尔表达式） |
| `output` | 命中后要输出的告警信息 |
| `priority` | 告警严重程度（从 EMERGENCY 到 DEBUG） |

### 3. 宏（Macro）和列表（List）

- **宏**：类似编程里的"函数"，把一段常见的条件写成可复用的片段。
- **列表**：类似"数组"，把一组值（比如所有常见 shell 程序名）打包成一个命名集合。

### 4. 输出通道（Output Channel）

告警发出后，可以推送到多种目的地：stdout 日志、HTTP 回调、Slack、Elasticsearch、SNMP 等等。

---

## 三、核心概念详解：规则系统

规则系统是整个 Falco 最核心的概念。理解了规则，你就理解了 Falco 怎么用。

### 宏（Macro） —— 可复用的条件片段

宏让你把重复写的条件抽取出来。比如下面这段条件会频繁出现：

```yaml
container.id != host
```

把它定义成一个叫 `container` 的宏：

```yaml
- macro: container
  condition: (container.id != host)
```

以后在规则中只需写 `container`，就相当于写了完整的条件。

宏可以嵌套引用之前定义过的宏。这是 Falco 规则"模块化"的基础。

### 列表（List） —— 命名集合

列表把一堆值打包成名字。比如：

```yaml
- list: shell_binaries
  items: [bash, csh, ksh, sh, tcsh, zsh, dash]
```

在条件中你可以直接写 `proc.name in (shell_binaries)`，比手动列出所有 shell 名简洁得多。

### 优先级（Priority）

| 级别 | 什么时候用 |
|------|-----------|
| EMERGENCY | 系统即将崩溃 |
| ALERT | 需要立即响应 |
| CRITICAL | 严重安全事件 |
| ERROR | 写入操作异常（比如文件被恶意修改） |
| WARNING | 未授权的读操作（比如读取了密码文件） |
| NOTICE | 意外行为（比如容器里启动了不该有的 shell） |
| INFORMATIONAL | 违反最佳实践（比如容器以 root 运行） |
| DEBUG | 调试信息 |

---

## 四、代码示例

### 示例 1：检测容器中启动 Shell

这是最常见的安全场景 —— 如果有人入侵了你的容器，第一件事就是尝试拿到一个交互式 Shell。

```yaml
# 定义列表：所有常见的 shell 程序名
- list: shell_binaries
  items: [bash, csh, ksh, sh, tcsh, zsh, dash]

# 定义宏：事件发生在一个容器里
- macro: container
  condition: (container.id != host)

# 定义宏：成功启动了一个新进程
- macro: spawned_process
  condition: >
    evt.type in (execve, execveat) and evt.arg.res = 0

# 规则：在容器内检测到 shell 启动时告警
- rule: Shell in Container
  desc: 检测容器内启动 shell 程序的行为
  condition: >
    spawned_process and container and proc.name in (shell_binaries)
  output: >
    容器内检测到 shell 启动
    (user=%user.name container_id=%container.id
     container_name=%container.name shell=%proc.name
     parent=%proc.pname cmdline=%proc.cmdline)
  priority: WARNING
  tags: [container, shell]
```

**逐行解释：**

- `condition` 说："这是一个新进程 + 在容器里 + 进程名是某个 shell"
- `output` 用 `%字段名` 输出告警详情，包括哪个用户、哪个容器、哪个 shell
- `priority: WARNING` 表示这是"未授权读操作"级别的告警

### 示例 2：检测敏感文件被读取

```yaml
# 定义列表：敏感文件路径
- list: sensitive_files
  items: [/etc/shadow, /etc/passwd, /etc/sudoers]

# 规则：读取敏感文件时告警
- rule: Read Sensitive File
  desc: 检测读取系统敏感文件的行为
  condition: >
    open_read and fd.name in (sensitive_files)
  output: >
    敏感文件被读取
    (file=%fd.name user=%user.name
     container_id=%container.id)
  priority: WARNING
  tags: [filesystem, sensitive_data]
```

**关键说明：**

- `open_read` 是 Falco 内置宏，匹配所有"以读模式打开文件"的系统调用
- `fd.name in (sensitive_files)` 引用了我们定义的列表
- 如果某个进程读取了 `/etc/shadow`，就会触发告警

### 示例 3：检测异常网络连接

```yaml
# 规则：容器内发起出站网络连接
- rule: Outbound Connection from Container
  desc: 检测容器内发起的出站网络连接
  condition: >
    conn and container.id != host and
    fd.sip != "0.0.0.0" and fd.sip != "::"
  output: >
    容器发起出站网络连接
    (connection=%fd.name user=%user.name
     container=%container.name
     image=%container.image.repository)
  priority: NOTICE
  tags: [network, container]
```

这个规则利用 `conn` 宏（匹配所有网络连接事件），过滤出源 IP 不是 `0.0.0.0` 的出站连接。

---

## 五、Falco 能发现什么？

Falco 内置了 100+ 条默认规则，覆盖以下场景：

- **Shell 活动**：容器内启动交互式 shell
- **文件系统**：敏感文件被读取或修改
- **网络连接**：异常的出站/入站连接
- **权限变更**：`sudo`、`chmod 777`、用户切换
- **容器异常**：新容器以 root 运行、挂载了宿主机的敏感目录
- **内核模块**：动态加载未知内核模块
- **加密挖矿**：检测到常见的加密货币挖矿程序名

---

## 六、如何部署？

### Docker 快速体验

```bash
docker run --detach \
  --name falco \
  --volume /var/run:/var/run:ro \
  --volume /dev:/dev:ro \
  --volume /etc:/etc:ro \
  --volume /proc:/host/proc:ro \
  --volume /sys/fs/cgroup:/host/sys/fs/cgroup:ro \
  --volume /etc/machine-id:/etc/machine-id:ro \
  --volume /etc/os-release:/etc/os-release:ro \
  --volume /var/lib/docker:/var/lib/docker:ro \
  falcosecurity/falco:latest
```

### Kubernetes（推荐生产使用）

通过 Helm 部署：

```bash
helm repo add falcosecurity https://falcosecurity.github.io/charts
helm repo update
helm install falco falcosecurity/falco --namespace falco --create-namespace
```

这会以 DaemonSet 的形式在**每个节点**运行一个 Falco 实例，确保全覆盖。

---

## 七、进阶概念

### 事件源多样性

Falco 不止看内核调用。它还能消费：

| 事件源 | 用途 |
|--------|------|
| 内核 syscall | 检测进程、文件、网络等运行时行为 |
| Kubernetes Audit | 检测集群层面的异常操作（如创建 ClusterRole） |
| AWS CloudTrail | 检测 AWS 管理平面的异常 API 调用 |
| Okta | 检测身份认证层面的异常行为 |

### 插件系统

通过插件，Falco 可以把告警转发到：Slack、HipChat、Webhook、Elasticsearch、Splunk、Kafka、Prometheus、Datadog 等二十多种目的地。

### ebpf 驱动

Falco 提供多种内核事件采集方式：

- **内核模块（kmod）**：传统方式，加载一个内核驱动
- **eBPF**：现代方式，用 eBPF 程序在内核中采集，不需要加载内核模块
- **Modern eBPF**：更新的 eBPF 实现，性能更好

生产环境推荐使用 eBPF，因为它不需要编译和安装内核模块，兼容性更好。

---

## 八、为什么 Falco 用 C++ 而不是 Go？

Falco 团队在 FAQ 里回答了这个问题，核心原因有几点：

1. **性能要求极高**：Falco 每秒要处理成千上万个系统调用，C++ 能提供更精细的内存控制
2. **执行模型是单线程的**：Falco 的状态是串行的，Go 的并发优势用不上
3. **底层编程需求**：需要直接操作内核级数据结构
4. **插件系统兼容 C**：保持 C 兼容接口能让插件用任何语言编写

---

## 九、总结

| 要点 | 说明 |
|------|------|
| Falco 是什么 | 云原生运行时安全检测工具 |
| 工作原理 | 在内核层拦截系统调用 → 用规则判断 → 命中则告警 |
| 核心概念 | 事件源、规则（condition/output/priority）、宏、列表 |
| 部署方式 | Docker、Kubernetes（DaemonSet）、裸机 |
| 典型场景 | 容器内异常 Shell、敏感文件读写、异常网络连接 |
| 学习路径 | 官方文档 falco.org/docs → 内置默认规则 → 写自定义规则 |

Falco 的核心理念是"行为异常才报警"，而非"特征匹配才报警"。这意味着它甚至能发现未知的攻击手段 —— 只要那个行为不符合你定义的规则。

---

*本文基于 Falco 官方仓库和文档编写，旨在帮助零基础学习者理解 Falco 的核心概念。*

---
title: Sandlock — 用非特权 Linux 原语为 AI Agent 代码打造牢笼（Wang & Zheng, 2026）
来源: https://arxiv.org/abs/2605.26298
日期: 2026-06-13
分类_原始: 安全 / 操作系统
分类: 安全与隐私
子分类: 安全与隐私
provenance: pipeline-v3
---

## 是什么

这篇论文由 Cong Wang（Multikernel Technologies）和 Yusheng Zheng（UC Santa Cruz）于 2026 年 5 月提交，提出了一种名为 **Sandlock** 的轻量级 Linux 进程沙箱。它的目标场景非常具体：**AI Agent（如 Claude Code、SWE-agent）在开发者机器上执行不可信代码时的隔离问题**。

Sandlock 的核心设计哲学可以用一句话概括：**把"事前就知道"的策略交给内核强制执行，把"只有运行时才知道"的决策交给一个轻量级的用户态监督者。**

## 日常类比：机场安检

想象你是一名机场安检员，面前有一个传送带，上面不断送来旅客的行李：

- **静态规则（Landlock）**：比如"所有液体不能超过 100ml"、"刀具一律禁止"。这些规则在旅客到达安检口之前就已经定好了，不需要看行李里实际有什么。内核就像这条固定不变的安检线，直接拦截违规物品，速度快、成本低。
- **动态决策（seccomp 通知）**：但有些东西没法事先规定——比如某件行李里装的是一个快递包裹，你需要打开看看收件地址是不是黑名单上的国家。这时行李会被送到"人工检查区"（监督者），检查员看一眼地址，放行或没收。关键点是：这个包裹在检查期间是"冻结"的，检查员不会让它在检查过程中被调包。

Sandlock 做的就是把这两条线有机结合起来：大部分东西走快速通道（内核），少数需要判断的走人工通道（用户态），而且整个过程不需要管理员权限（root）。

## 为什么这个问题很重要

AI Agent 正在越来越多地替开发者做这些事：

- 运行 LLM 生成的 shell 命令（可能包含恶意的 `rm -rf`）
- 执行从 npm 仓库下载的安装脚本（可能被植入供应链攻击）
- 调用未知的第三方插件

传统的隔离方案都不够用：

| 方案 | 问题 |
|------|------|
| Docker 容器 | 需要镜像管理，启动慢（~300ms），rootless 还需要额外配置 |
| Firecracker VM | 需要 KVM，启动 ~100ms，太重了 |
| firejail / bubblewrap | 控制粒度粗，没有可编程的运行时策略 |
| gVisor | 用户态内核，兼容性和性能开销大 |

Agent 执行的每个命令通常只跑几十毫秒，如果沙箱本身启动就要几百毫秒，那整个系统的响应时间就不可接受了。

## 核心概念

### 1. 静态规则 + 动态决策的拆分

这是整篇论文的骨架。

**静态规则**——在子进程执行之前就确定好的策略，直接编译进内核：

- 文件系统：哪些目录可读、哪些可写
- 网络：允许连接哪些 TCP 端口
- IPC：允许访问哪些进程间通信通道
- 系统调用：哪些 syscall 无条件拒绝

**动态决策**——只有 syscall 实际发生时才能判断的事情，通过 seccomp 用户通知机制交给用户态监督者：

- `connect` 的真实目标 IP（DNS 解析后的结果）
- `execve` 的参数（LLM 生成的命令到底是什么）
- 文件写入的效果（要不要捕获、回滚还是提交）

### 2. 三大 Linux 原语

Sandlock 组合了三个 Linux 内核原语：

- **Landlock**：一个不需要 root 权限的 LSM（Linux Security Module），可以限制进程的filesystem、网络和 IPC 能力。相当于"静态安检线"。
- **seccomp-bpf**：过滤系统调用，决定哪些 syscall 直接允许、哪些直接拒绝、哪些交给用户态处理。
- **seccomp 用户通知（seccomp\_unotify）**：当一个 syscall 被标记为"通知"时，内核会暂停这个调用，把它发给用户态的监督者，监督者回复"允许"、"拒绝"或"继续"后，内核才恢复执行。

### 3. 写时复制（COW）工作空间

Sandlock 支持"可逆的文件系统效果"：沙箱内的文件写入会被捕获到一个临时层中，退出时可以选择提交（合并到真实文件系统）、丢弃（全部回滚）或保留（供检查）。这不需要 mount namespace，完全在用户态实现。

### 4. 流水线（Pipeline）组合

一个 Agent 任务可以拆成多个阶段，每个阶段有不同的隔离级别。比如：

- 第一阶段：可以读取私密数据，但没有网络
- 第二阶段：可以访问网络 API，但看不到私密数据

两个阶段通过管道连接，即使其中一个被攻破，攻击者也无法获得另一阶段的权限。这解决了 AI 安全领域的"致命三联"（lethal trifecta）问题：私密数据 + 外部通信 + 不可信内容同时存在。

## 代码示例

### 示例 1：定义一个基础沙箱

```python
from sandlock import Sandbox

# 创建一个沙箱：只允许读取 /usr 和 /lib，不允许网络访问
sandbox = Sandbox(
    fs_readable=["/usr", "/lib"],       # 只能读这两个目录
    fs_writable=["/tmp/sandlock-work"],  # 只能写到这里
    network_allowed=[],                  # 不允许任何网络连接
)

# 在其中运行一条命令
result = sandbox.cmd(["python3", "-c", "print('hello')"]).run()
print(result.stdout)
```

这里的关键是**默认拒绝（default-deny）**：除了明确允许的，一切都被阻止。Agent 不需要知道所有可能被用到的资源——只需要声明这个命令需要什么。

### 示例 2：可编程策略回调

```python
def on_event(event, ctx):
    """
    这个回调在每次关键 syscall 发生时被调用。
    event 描述发生了什么，ctx 允许你实时收紧策略。
    """
    if event.syscall == "execve":
        # 如果执行的命令包含 "curl"，就撤销网络权限
        if "curl" in event.argv:
            ctx.restrict_network([])          # 切断网络
            ctx.deny_path("/etc/shadow")      # 保护敏感文件
            ctx.audit("blocked curl with network")

    if event.syscall == "connect":
        # 检查连接的目标地址
        if event.dest_ip.startswith("10.0.0."):
            return False  # 拒绝连接到内网

    return True  # 默认允许
```

这个回调就是论文中的 `policy_fn`。它的作用不是" containment boundary"（ containment 靠的是 Landlock 和 seccomp），而是**检测阶段转换并实时收紧策略**。比如 Agent 从"安装依赖"阶段进入"运行测试"阶段时，可以通过检测到 `pytest` 的执行来撤销之前的网络权限。

### 示例 3：流水线多阶段隔离

```python
# 阶段一：可以读取私密数据，但不能上网
trusted = Sandbox(
    fs_readable=["/usr", "/lib", "/opt/private-data"]
)

# 阶段二：可以上网，但看不到私密数据
restricted = Sandbox(
    fs_readable=["/usr", "/lib"],
    network_allowed=["api.example.com:443"]
)

# 管道连接：阶段一输出 → 阶段二处理
result = (
    trusted.cmd(["cat", "/opt/private-data/report.csv"])
    | restricted.cmd(["curl", "-X", "POST", "https://api.example.com/upload"])
).run()
```

这就是论文中的 pipeline 模式。`trusted` 阶段能看到私密数据但无法外传，`restricted` 阶段能上网但看不到数据。即使 `curl` 被攻破，攻击者也拿不到 `/opt/private-data/` 里的内容。

### 示例 4：写时复制（COW）工作空间

```python
cow = Sandbox(
    fs_readable=["/usr", "/lib"],
    cow_workspace="/tmp/cow-session",  # 启用写时复制
)

# 在这个沙箱里，任何写入都会被捕获
result = cow.cmd(["pip", "install", "some-package"]).run()

# 退出时可以选择：
result.commit()   # 提交所有写入（新文件、修改的文件永久生效）
# 或者
result.abort()    # 丢弃所有写入（沙箱退出后文件系统不变）
# 或者
result.dry_run()  # 预览哪些文件会被修改，不真正执行
```

这类似于数据库的事务：你可以先"模拟运行"看看会产生什么效果，再决定是否"提交"。对 Agent 来说，这意味着可以在安全的环境中尝试安装任何包，确认没问题后再提交变更。

## 性能表现

论文在 AMD Ryzen 5 5500U 上的测试结果：

| 指标 | 裸机 | Sandlock | Docker（rootful） |
|------|------|----------|-------------------|
| 启动延迟 | ~0ms | ~5ms | ~300ms |
| Redis SET 吞吐 | 75.5k rps | 75.2k rps | ~57k rps |
| Redis p99 延迟 | 0.49ms | 0.51ms | ~1.5ms |
| COW fork 速率 | - | ~1,900 fork/s | - |

Sandlock 的启动开销只有 5ms，Redis 吞吐量在测量误差范围内与裸机持平。相比之下 Docker 启动慢了 44 倍，吞吐量只有裸机的 76%。

## 关键创新点

1. **TOCTOU 安全的运行时策略**：`policy_fn` 在读取 `execve` 参数前会"冻结"所有可能共享内存的线程和进程，防止竞态条件导致参数被调包。如果无法冻结（如 Yama 限制了 ptrace），则直接拒绝而非放宽策略。

2. **不需要 root、cgroups 或镜像**：纯用户态操作，开发者在自己的账户下就能用，不需要 `sudo`。

3. **HTTP 级别的访问控制**：不仅限制 IP 和端口，还能限制 HTTP 方法和路径（如只允许 `GET /api/v1` 不允许 `POST`）。HTTPS 检查可选，需要安装沙箱 CA。

4. **DNS 重绑定防护**：域名在沙箱启动时解析一次并锁定，运行时不会重新解析，防止攻击者通过 DNS 记录变化绕过白名单。

5. **无需 mount namespace 的 COW**：通过 seccomp 通知拦截文件写入并重定向到临时层，在用户态实现类似 overlayfs 的效果。

## 局限性与讨论

- **不保护内核漏洞和侧信道攻击**：威胁模型假设内核和 Sandlock 监督者是可信的。
- **资源限制是"合作式"的**：内存和进程数通过 syscall 拦截来计数，不是内核强制的，不如 cgroups 强。
- **HTTPS 检查需要安装 CA**：否则只能靠端点白名单。
- **兼容性仍需调优**：常见工具（python3、make、node、pytest）基本能用，但复杂构建流程可能需要调整允许的临时目录。

## 总结

Sandlock 解决了一个很精准的问题：**AI Agent 在开发者机器上频繁执行短命、不可信代码时的隔离需求**。它没有试图做一个通用的沙箱，而是把 Linux 已有的三个非特权原语（Landlock、seccomp-bpf、seccomp 用户通知）巧妙地组织在一起，实现了：

- 5ms 启动延迟（比 Docker 快 44 倍）
- 零额外 root 需求
- 可编程的运行时策略
- 可逆的文件系统效果
- 多阶段能力分离

对于正在崛起的 Agentic OS 生态来说，这种轻量级、可编程、非特权的进程隔离层可能成为一个基础设施级的构件。

开源地址：https://github.com/multikernel/sandlock

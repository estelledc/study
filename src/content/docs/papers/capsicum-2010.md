---
title: Capsicum — 给 UNIX 进程发"通行证"而不是"万能钥匙"
来源: 'Watson et al., "Capsicum: Practical Capabilities for UNIX", USENIX Security 2010'
日期: 2026-06-24
分类: 操作系统
难度: 中级
---

## 是什么

日常类比：你住酒店，前台给你一张房卡——它只能开你那间房和健身房，不能开所有房间。你拿着房卡根本进不了别人的楼层。这张房卡就是一个 **capability**（能力令牌）。Capsicum 的思路是：与其给进程一把能打开整栋楼的万能钥匙（root 权限、ambient authority），不如只给它"能做什么"的有限通行证。

再换个角度：传统 UNIX 像公司里每个员工都拿着一串钥匙，钥匙能开哪些门取决于你是哪个部门的人。Capsicum 把这个模型改成了"门禁卡"——你手上有几张卡就能进几道门，卡丢了别人也只能进那几道门，不会连带打开整个公司。

技术定义：Capsicum 是一个为 FreeBSD 设计的**轻量级 capability 框架**。它在标准 UNIX 文件描述符上附加权限位（cap_rights），并提供一个 `cap_enter()` 系统调用让进程进入"能力模式"——此后进程只能操作自己**已经拿到**的文件描述符，不能再打开新路径、不能访问全局命名空间。这个设计在 2010 年 USENIX Security 会议发表，作者来自剑桥大学计算机实验室。

## 为什么重要

- **最小权限终于可用了**：之前 UNIX 的安全模型是"用户=权限"，进程一旦 compromised 就能做该用户能做的所有事。Capsicum 让程序员把 tcpdump、gzip 这类工具"锁进沙箱"，即使被攻破也只能碰预先交给它的文件描述符。
- **Chromium 沙箱的真实基座**：FreeBSD 上 Chromium 的渲染进程 sandbox 就基于 Capsicum——比 Linux seccomp-bpf 侵入性更低。
- **改动极小，收益极大**：论文展示 tcpdump 只改 10 行代码就能进入沙箱；gzip 改约 30 行。无需重写整个程序。
- **进入了生产内核**：FreeBSD 10+ 默认开启 Capsicum；后续影响了 CloudABI、Casper 守护进程等设计。
- **安全研究的范式转移**：之前的 OS 安全要么靠 MAC（SELinux 那样写一堆策略文件），要么靠全新 OS（EROS/seL4）。Capsicum 证明了第三条路——在现有内核上加 capability 层，改动小到可以逐步采纳。

## 核心要点

Capsicum 的设计围绕三个概念：

1. **Capability = 文件描述符 + 权限位**：传统 fd 只是一个整数句柄；Capsicum 在内核给每个 fd 贴上 `CAP_READ`、`CAP_WRITE`、`CAP_SEEK` 等细粒度标签。你可以把一个 fd "缩权"（`cap_rights_limit`）但不能"扩权"——权限只能越给越少，单调递减。

2. **cap_enter() 进入能力模式**：进程调用 `cap_enter()` 后进入不可逆的沙箱：不能 `open()` 新路径，不能 `chdir()`，不能访问 `/proc`——只能使用进入前已拿到的 fd。这叫 **ambient authority revocation**。

3. **libcapsicum + 进程分离**：复杂程序把不可信部分 fork 到子进程，父进程把缩权后的 fd 传给子进程，子进程 `cap_enter()`。父子之间用 socket pair 通信。这是"capability 化"已有代码的标准套路。

关键 trade-off：Capsicum 选择**兼容 UNIX fd 语义**而非从零设计全新 OS（像 EROS 那样），代价是表达力略弱，收益是现有程序几乎不用重写。

补充细节：能力模式下被禁止的系统调用包括 `open()`、`socket()`、`bind()`、`connect()`、`chdir()`、`chroot()`、`sysctl()`。但 `read()`、`write()`、`mmap()`、`close()` 这些对已有 fd 的操作仍然允许。内核用一个单比特标志 `TDF_SANDBOX` 在线程结构体中记录"是否已进入能力模式"。

## 实践案例

### 案例 1：tcpdump 沙箱化（10 行改动）

```c
// 1. 正常打开网卡和输出文件
int pcap_fd = open("/dev/bpf", O_RDONLY);
int out_fd  = open("dump.pcap", O_WRONLY | O_CREAT);

// 2. 缩权：pcap_fd 只保留读，out_fd 只保留写
cap_rights_t rights_r, rights_w;
cap_rights_init(&rights_r, CAP_READ, CAP_EVENT);
cap_rights_init(&rights_w, CAP_WRITE, CAP_SEEK);
cap_rights_limit(pcap_fd, &rights_r);
cap_rights_limit(out_fd, &rights_w);

// 3. 进入能力模式 —— 不可逆
cap_enter();

// 4. 此后只能读 pcap_fd、写 out_fd，无法打开任何新文件
```

### 案例 2：Chromium 渲染进程

浏览器主进程（broker）在能力模式外打开网络 socket 和共享内存 fd，然后 fork 渲染子进程，把缩权后的 fd 传过去。渲染子进程 `cap_enter()` 后只能操作这些 fd——即使 JavaScript 触发漏洞，攻击者也无法读磁盘、拨网络。

具体流程：

1. 主进程创建一个 UNIX domain socket pair
2. fork 子进程，子进程继承 socket 的一端
3. 主进程通过 `sendmsg()` + `SCM_RIGHTS` 把缩权后的 fd 发给子进程
4. 子进程收到 fd 后调用 `cap_enter()`
5. 之后子进程需要任何新资源，必须通过 socket 请求主进程代开

### 案例 3：gzip 沙箱化

gzip 的工作模式天然适合 Capsicum——先打开输入/输出文件，再做纯计算（压缩/解压）。论文中只改了约 30 行：打开源文件和目标文件后立即 `cap_enter()`，压缩过程中即使 zlib 有漏洞被利用，攻击者也只能往已打开的输出文件写垃圾，不能读取其他文件或执行系统命令。

## 踩过的坑

1. **cap_enter() 不可逆**：一旦进入能力模式就不能退出。如果程序初始化阶段忘了打开某个文件就进了沙箱，运行时会拿到 `ECAPMODE` 错误而非文件句柄。必须在进入前把所有需要的 fd 准备好。

2. **不能直接用路径 API**：`open("/etc/resolv.conf")` 在沙箱里直接失败。需要改用 `openat(dir_fd, "resolv.conf")` 这类"相对 fd"的版本。很多 libc 函数内部偷偷调 `open()`，不看源码你不知道它会触发沙箱违规。

3. **权限只能单调缩小**：想给子进程"先读后写"的两阶段权限？做不到——你只能一次性决定最终权限集。变通方法是拆成两个 fd（一个只读、一个只写）分别传递。

4. **和 Linux 的差异**：Capsicum 是 FreeBSD 原生特性；Linux 至今没有合并。Linux 上用 seccomp-bpf + namespaces 达到类似效果但更复杂、更碎片化。不要在 Linux 上 `#include <sys/capsicum.h>` 期望能编译。

常见排查思路：如果程序进入能力模式后出现 `ENOTCAPABLE` 或 `ECAPMODE` 错误，首先检查是不是某个库函数内部调用了被禁止的系统调用。可以用 `ktrace` 或 `truss` 跟踪系统调用来定位违规点。FreeBSD 还提供了 `procstat -C` 命令查看进程当前的 capability 模式状态和每个 fd 的权限位。

## 适用 vs 不适用场景

**适用**：

- 处理不可信输入的工具（gzip、图片解码器、PDF 渲染器）——几十行改动就能沙箱化
- 浏览器沙箱架构——主进程持有权限，渲染/插件进程受限
- 网络守护进程——接受连接后 fork 子进程进入能力模式处理单个连接
- 任何"先打开资源、再处理数据"的管道式程序

**不适用**：

- 需要动态发现文件路径的程序（如 `find`、`ls -R`）——它们的核心逻辑就是遍历文件系统
- 需要全局命名空间访问的服务（如包管理器安装阶段）
- Linux 环境（Capsicum 未被 upstream）——得用 seccomp-bpf 或 Landlock 替代
- 需要跨进程共享 capability 且频繁动态授权的场景——Capsicum 的 fd 传递粒度不够灵活

判断标准：如果你的程序可以分成"准备阶段"和"处理阶段"两个清晰的阶段，且处理阶段不需要打开新资源，那它就是 Capsicum 的理想候选。如果程序在整个生命周期内都需要随时访问任意路径，Capsicum 就不合适。

## 历史小故事（可跳过）

- **1966 年**：Dennis 和 Van Horn 在 MIT 首次提出 capability 概念——一个不可伪造的令牌，持有它就有权访问某个对象。
- **1993 年**：EROS（Extremely Reliable Operating System）开始开发，是第一个完整的 capability OS。它证明了 capability 模型能工作，但代价是整个系统从头写，无法复用现有 UNIX 软件生态。
- **2004 年**：剑桥大学的 Robert Watson 开始思考"能不能不重写 OS，只在 FreeBSD 上加一层 capability"。
- **2008-2010 年**：Watson 团队在 Google 资助下实现 Capsicum 原型，论文在 USENIX Security 2010 获 Best Paper 提名。
- **2012 年**：FreeBSD 10 正式合入 Capsicum，成为第一个生产级 capability 增强的通用 UNIX。

这段历史的教训：纯学术路线（EROS）花了十几年没能广泛部署，而"在现有系统上做增量改进"的 Capsicum 两年就进了生产内核。

## 学到什么

1. **安全的关键不是"能做什么"，而是"不能做什么"**——Capsicum 把"去掉权限"变成了一次不可逆的系统调用，简洁有力
2. **兼容性 > 纯粹性**：比起从头建 capability OS（EROS、seL4），Capsicum 选择在现有 UNIX fd 上叠加权限位，落地门槛低几个数量级
3. **最小权限原则的工程化**：Saltzer-Schroeder 1975 年就提了"least privilege"，但 35 年后 Capsicum 才给出"改 10 行代码就能用"的工程方案
4. **进程隔离是最强的安全边界**：Capsicum 的核心模式是"fork → 传 fd → cap_enter"——利用进程边界比同进程内的沙箱（如 SFI）更难绕过
5. **API 设计的力量**：`cap_enter()` 一个函数做一件事、不可逆、无参数——这种"悬崖式"设计让使用者不可能犯"忘记关沙箱"的错误。好的安全 API 应该让正确用法比错误用法更容易
6. **"先准备、后执行"是安全程序的通用模式**：不只是 Capsicum，很多安全设计都遵循"setup phase → restricted phase"的两段式结构

## 延伸阅读

- FreeBSD 官方 Capsicum 手册：`man 4 capsicum`（FreeBSD 10+），含完整 API 参考
- Jonathan Anderson 博士论文：Security Policy in Userspace（2017），详细讲 Capsicum 的形式化安全属性
- Chromium sandbox 设计文档：描述 FreeBSD/macOS/Linux 三平台沙箱实现差异
- Landlock LSM（Linux 5.13+）：Linux 上受 Capsicum 启发的路径权限限制机制
- Mark S. Miller, "Robust Composition"（2006）：capability 安全的理论基础，解释为什么 capability 比 ACL 更适合做细粒度授权
- Capsicum 源码：FreeBSD `/sys/kern/sys_capability.c`，核心逻辑不到 1000 行

## 关联

- [[saltzer-schroeder-1975]] —— 1975 年提出最小权限原则，Capsicum 是 35 年后的工程实现
- [[unix-1974]] —— Capsicum 直接改造 UNIX 的 fd 语义来实现 capability
- [[sel4-2009]] —— seL4 走的是"从零设计 capability 内核"路线，与 Capsicum "改良现有系统"形成对比
- [[eros-1999]] —— 纯 capability OS 的先驱，Capsicum 吸取了它的理念但选择实用主义
- [[multics-1965]] —— 最早的分层安全设计，ring 机制是 capability 思想的前身
- [[ebpf]] —— Linux 上的另一条沙箱/安全扩展路线，seccomp-bpf 是 Capsicum 在 Linux 的替代方案
- [[selinux-2001]] —— 强制访问控制（MAC）路线，与 capability 路线互补但思路不同

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

<!-- 暂无反向链接 -->

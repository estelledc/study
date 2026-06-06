---
title: MULTICS 1965 — 把计算机做成像电力一样的公共服务
来源: Corbató & Vyssotsky, "Introduction and Overview of the MULTICS System", AFIPS FJCC 1965
日期: 2026-05-31
子分类: 内核与虚拟化
分类: 操作系统
难度: 中级
provenance: pipeline-v3
---

## 是什么

MULTICS（Multiplexed Information and Computing Service）是 1964 年 MIT、贝尔实验室、GE 三方启动的一个**操作系统**项目。它的目标用一句话讲：**把计算机做成像电力公司、电话公司一样持续在线的服务**——你随时插一个终端进来，就能用，不用排队、不用等你那批活算完。

日常类比：以前的计算机像**自助洗衣店的烘干机**，你投币、塞衣服、等它转完才能开门拿走。MULTICS 想做的是**家里墙上的插座**——任何时候插上电器都能用，电厂在你看不见的地方持续运转。

这篇 1965 年的论文是项目刚启动一年时的设计总览。系统真正上线是 1969 年，最后一台机器 2000 年才关机。

## 为什么重要

不读这篇，下面这些事都没法解释：

- 为什么今天讲虚拟内存要分**段（segment）**和**页（page）**，谁规定的
- 为什么 Linux 的 `mmap()` 把文件直接映射到内存空间，这种"文件就是内存"的想法从哪来
- 为什么 CPU 有 ring 0 / ring 3 这种保护级别，为什么是"环"而不是"线"
- 为什么 Unix 的名字是反讽——uni 对 multi
- 为什么 1965 年的设计原则今天还在影响 K8s 的 ResourceQuota

它不是某个具体技术，是**整套现代操作系统词汇表的源头**。

## 核心要点

MULTICS 的设计建立在 **6 大支柱**上：

1. **二维虚拟地址 = 段 + 页**：用户和编译器看到的是"段"——一个文件就是一个段，可以用名字访问、可以独立增长。OS 和硬件看到的是"页"——固定大小的物理调度单位。两层独立。

2. **运行时动态链接**：程序里写 `call printf`，**第一次调用时**才去找 printf 在哪、把地址填进来。今天 Linux 的 `ld.so` 是这个思想的简化重生。

3. **共享与可重入过程**：多个用户同时跑同一份代码，代码段在内存只有一份。今天所有 OS 的"共享库"都源于此。

4. **处理器与内存模块化池**：CPU 和内存条都是热插拔的资源池，可以在线加减。一台机器实际上是多机协作。

5. **层级资源预算 + 微秒级计费**：每个用户/项目一个账户树，父账户可以委派一部分预算给子账户。今天 K8s 的 namespace 配额是同款思想，只是换了名字。

6. **硬件 ring 保护**：用 8 个保护环（不是 2 个！），由硬件 descriptor bit 强制，CPU 每次访问内存都检查。跨 ring 调用必须走"调用门"（call gate）。

## 实践案例

### 案例 1：今天的 mmap 是 MULTICS 的退化版

MULTICS 的"单层存储"（single-level store）让程序像访问内存一样访问文件——根本没有 `read()` / `write()` 这种东西。Unix 嫌这套太复杂，选了 `read/write` 系统调用走简单路。但 mmap 等于把那个想法塞回来：

```c
int fd = open("data.bin", O_RDONLY);
char *p = mmap(NULL, size, PROT_READ, MAP_PRIVATE, fd, 0);
// 现在 p[i] 直接读文件第 i 字节，不必先 read 到 buffer
```

MULTICS 1965 年默认就是这样，你打开一个文件就拿到一段虚拟内存。

### 案例 2：ring 保护今天为什么只剩 2 级

MULTICS 用 8 个 ring：内核（最内）→ 系统服务 → 受信用户库 → 普通用户（最外）。每跨一层都有"调用门"检查参数。x86 硬件其实也有 4 个 ring（0/1/2/3），但 Linux/Windows 都只用 0 和 3，剩下两个浪费了。

为什么浪费？因为软件复杂度——分层越多、调用门设计越绕。今天的 seccomp、Linux capabilities、eBPF 是在**软件层**重新引入分层，这是一个 50 年的钟摆。

### 案例 3：动态链接不是 Windows DLL 的发明

很多人以为 DLL（dynamic link library）是 1990 年代 Windows 发明的。其实 MULTICS 1965 年就有 runtime 按符号链接：你的程序里写 `call sin`，链接是在你**第一次跑到那一行**才发生的。代价是符号表必须在内存里、链接器是 OS 一部分。Unix 嫌重砍掉了这个，所以 1990 年代 Linux 的 `ld.so` 看起来像"重新发明"。

### 案例 4：层级账户树 vs K8s ResourceQuota

MULTICS 的资源记账机制：根账户拥有全部 CPU 时间、磁盘配额；可以委派给"MIT 数学系"账户；数学系再委派给具体教授；教授给学生。每一层只能委派**自己拥有的子集**，且系统按微秒粒度记账。

```
root
├── MIT (5000 CPU-sec/day)
│   ├── 数学系 (2000)
│   │   ├── 教授 A (500)
│   │   └── 教授 B (300)
│   └── 物理系 (3000)
└── Bell Labs (3000)
```

把 MIT 改成 namespace、教授改成 sub-namespace，这就是 K8s 的 ResourceQuota。50 年隔出去的同一种思想。

## 踩过的坑

1. **别把 MULTICS 当"失败的 Unix 前身"**：这是后视镜偏差。MULTICS 1985 年仍在 100+ 站点运行，"失败"是相对 Unix 的传播规模，不是设计本身。它的 single-level store 至今没被完全复刻。

2. **别混淆段和页**：段是用户/编译器看到的逻辑单元（文件 = 段，符号命名、可独立增长）；页是 OS/MMU 看到的物理调度单元（固定大小、按需调入）。x86 把段 ID 退化成 selector，分层就丢了。

3. **别以为 ring 是纯软件**：MULTICS 的 ring 是硬件 descriptor bit 强制的，CPU 每次访存都检查。今天 x86 的 ring 0/3 同源，但只用了 2/8。

4. **别低估"持续在线"这个目标的难度**：1965 年的硬件 MTBF 按小时算，要做一个不停机的系统就必须模块化 CPU、模块化内存、自动备份文件系统——这些都是为"24/7"逼出来的，不是为优雅。

## 适用 vs 不适用场景

**适用**（理解这些时回头看 MULTICS）：
- 学操作系统：段/页/虚拟内存/进程隔离的源头
- 学 Linux 高级特性：mmap、ld.so、capabilities、cgroup 都能在 MULTICS 找到祖先
- 学云原生：K8s 的 namespace 配额 = MULTICS 的资源预算树
- 学硬件保护：CPU ring、调用门、descriptor 的来历
- 设计任何"长期在线、多租户、按用计费"的系统——MULTICS 几乎是这类系统的第一个完整设计

**不适用**：
- 想抄一份现成代码——MULTICS 早期用 PL/I 写，今天没人写 PL/I
- 想找性能优化技巧——论文是设计总览，没 benchmark
- 想做嵌入式 / 实时系统——MULTICS 是为通用大型机服务，资源开销太大
- 想读"短小精悍的经典"——这篇是 32 页的设计总览，不是算法 / 定理 / 单一技巧的论文

## 历史小故事（可跳过）

- **1961-1963**：Corbató 在 MIT 做 CTSS（Compatible Time-Sharing System），证明分时系统能跑。
- **1964**：MIT、Bell Labs、GE 三方启动 MULTICS，目标比 CTSS 大十倍。论文标题里的"computing utility"借自当时大家把电力公司叫"electric utility"的说法。
- **1965**：本论文发表。系统还在建造。同期发表的还有另外 5 篇配套论文，分别讲文件系统、调度、I/O 等子系统。
- **1969**：MULTICS 上线第一个站点。同年 Bell Labs 因进度太慢退出，Ken Thompson 和 Dennis Ritchie 回去后做了 Unix——名字是对 multi-CS 的反讽（uni-CS）。
- **1976**：Honeywell 接手 GE 的硬件业务，MULTICS 改跑 Honeywell 大型机。
- **1985**：MULTICS 跑在 100+ 站点（大学、政府、研究所）。
- **1990**：Corbató 获图灵奖，颁奖词里特别提到 MULTICS 和 CTSS。
- **2000**：最后一台 MULTICS 机器（在加拿大国防部）关机。

35 年生命周期，对一个操作系统来说很长。

## 学到什么

1. **"持续在线"是一个设计原则，不只是 SLA 口号**——它会反推你做模块化硬件、热插拔、按需链接、热备份
2. **抽象分层值得花钱**——段 vs 页的二层结构看起来麻烦，但让用户视角和系统视角各自演化，今天还在用
3. **保护机制要做在硬件层**——ring 是 CPU 强制的，不是软件 if-else；这是今天所有 trusted execution 的祖先
4. **OS 设计不是为最快，是为最稳**——MULTICS 牺牲了很多性能换可用性，Unix 反过来牺牲可用性换简洁，两条路各走 50 年
5. **简洁能赢**——但不是因为简洁更好，是因为简洁能传播。Unix 砍掉 MULTICS 的 80% 功能换来易移植，于是占领了世界。MULTICS 的设计今天通过 mmap、cgroup、capabilities **慢慢补回来**。这是工程上的"先放弃再回收"循环。
6. **读旧论文的姿势**——别用今天的术语对比"它做对没做对"，要问"在它的硬件 / 资源 / 用户场景下，这套设计为什么合理"。1965 年 MTBF 几小时、用户全是 MIT 教授，所有看似过度的设计都有当时的成因。

## 一句话回到现在

读完 MULTICS 1965 后再回头看一眼 Linux：你会发现 Linux 不是"从零设计的简洁 OS"，而是"砍掉 MULTICS 80% 后剩下的核"。然后过去 30 年，**Linux 通过 mmap、cgroup、namespace、capabilities、seccomp、eBPF 一点点把那 80% 补回来**。这是计算机系统史上一条很反直觉的曲线——简洁先胜利、复杂再回归。

理解这条曲线，是读这篇 1965 年论文最值得带走的一个视角。

## 延伸阅读

- 论文 PDF：[Corbató-Vyssotsky 1965](https://multicians.org/fjcc1.html)（多人协作整理的 MULTICS 历史站，有原扫描）
- 网站：[Multicians.org](https://multicians.org/)（前 MULTICS 工程师维护，有源码、回忆录、技术细节）
- 视频：[Tom Van Vleck — MULTICS Memories](https://www.youtube.com/watch?v=5sn2dWdVm0E)（亲历者讲怎么从 CTSS 走到 MULTICS）
- 对比阅读：[The Evolution of the Unix Time-sharing System](https://www.bell-labs.com/usr/dmr/www/hist.html)（Ritchie 写 Unix 怎么从 MULTICS 经验里逃出来）

## 关联

- [[dijkstra-goto]] —— 同时期（1968）的另一篇结构化思想论文
- [[lampson-hints]] —— 1983 年系统设计经验总结，多次引用 MULTICS
- [[gray-1978-notes]] —— Jim Gray 系统设计笔记，事务和恢复思想与 MULTICS 文件系统相关
- [[csp-hoare-1978]] —— 进程通信的另一条路，MULTICS 偏共享内存、CSP 偏消息
- [[tomasulo-1967]] —— 同时代硬件创新，把多个执行单元当资源池调度
- [[amdahl-law-1967]] —— 同时代关于"加更多 CPU 能不能更快"的理论
- [[hyperkernel-2017]] —— 现代证明驱动的微内核，回应 MULTICS 的"OS 必须可信"
- [[certikos-2016]] —— 把 MULTICS 的 ring 思想推到形式化证明的极致

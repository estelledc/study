---
title: Haven — 把整个应用装进 CPU 黑盒，让云服务商也看不见
来源: 'Andrew Baumann, Marcus Peinado, Galen Hunt. "Shielding Applications from an Untrusted Cloud with Haven". OSDI 2014'
日期: 2026-06-06
分类: 操作系统
子分类: 内核与虚拟化
难度: 中级
---

## 是什么

Haven 是一套**让你把整个应用程序塞进 CPU 的加密黑盒，云服务商的管理员即便有 root 权限也读不到你的数据**的系统。日常类比：像一个带内置防盗锁的集装箱——港口工人（云服务商）可以搬运它、存放它，但他们打不开，里面装什么完全看不见。

你把 SQL Server 或 Apache 部署到云上，不改一行代码。Haven 会把应用连同一个微型操作系统一起密封进 Intel SGX 的**受保护内存区域**（enclave）。从那一刻起，CPU 硬件接管了门卫的工作：任何特权软件——包括云服务商的 OS、虚拟机监控器、固件，甚至 BIOS——都不能直接读取或修改 enclave 里的内存。

这个想法有个专属名词叫**受保护执行**（shielded execution）：和沙箱「把不可信代码关起来保护外界」恰好相反，这里是「把可信代码关起来保护自己」。

## 为什么重要

不理解 Haven，下面这些事都没法解释：

- 为什么云服务商说「我们不读你的数据」只是一句承诺——Haven 是第一个用硬件把这句承诺变成技术保证的系统
- 为什么「机密计算」（Confidential Computing）这个词在 2015 年后开始频繁出现——Haven 的设计直接催生了这条研究路线
- 为什么 Intel 在 2014 年 10 月修订 SGX 规范加入动态内存分配——Haven 原型跑起来后发现了规范的三处致命缺陷，直接推动了修改
- 为什么把 LibOS 装进 enclave 比只把「密钥处理函数」装进 enclave 难得多——Haven 是第一个直面这个挑战的系统

## 核心要点

Haven 的架构可以拆成 **三层**：

1. **SGX enclave——CPU 的硬件保险柜**：Intel SGX 提供一块叫做 EPC（Enclave Page Cache）的内存区域。数据在 CPU 缓存里是明文，一旦写到 DRAM 就被硬件加密，任何特权软件都拿不到密钥。攻击者就算直接探测内存条上的电信号，也只能看到密文。

2. **LibOS——把 OS 搬进保险柜**：应用程序假设下面有个可信的 OS 来做内存分配、线程调度、文件读写。Haven 把一个完整的 Windows 8 库形态 OS（Drawbridge LibOS）放进 enclave，让应用「以为」自己在和正常 OS 打交道——实际上整个 OS 都在受保护的黑盒里。类比：不是把犯人放进无人看管的牢房，而是把看守也一起带进去。

3. **互不信任接口——只让主机 OS 控制资源数量，不让它控制内容**：enclave 必须和外面的主机 OS 交换 I/O、线程、内存请求。Haven 把这个接口精简到 22 个调用（原始 Drawbridge 有 40 个），并对每个返回值做严格验证。主机 OS 能拒绝服务（denial of service），但不能伪造正确结果来欺骗应用——这个设计从根本上消灭了**Iago 攻击**（让恶意 OS 通过系统调用返回错误值来颠覆应用的一类攻击）。

## 实践案例

### 案例 1：你把 SQL Server 搬到云上，怎么让自己相信数据没被看

用 Haven 时，部署流程是这样的（以下为概念性步骤，实际需要 SGX SDK 和硬件支持）：

```
用户侧：
  1. 把应用 + LibOS 打包进加密虚拟磁盘（VHD，即虚拟硬盘镜像文件），自己留着密钥
  2. 把加密 VHD 发给云服务商

云服务商侧：
  3. 创建 SGX enclave，加载 Shield 模块
  4. SGX 硬件对 Shield 代码做「测量」（生成哈希），
     用 Intel 颁发的密钥签名 → 产生 Quote

用户侧：
  5. 验证 Quote：确认 enclave 里跑的确实是预期的 Shield，
     而不是被篡改的版本
  6. 用 Quote 里的公钥加密 VHD 密钥，发回 enclave
  
enclave 内：
  7. Shield 用私钥解密 VHD，挂载文件系统，加载 LibOS + SQL Server
  8. SQL Server 正常运行，数据全程加密，云服务商看不到
```

关键：**远程证明**（remote attestation）让用户在发出密钥前先验证 enclave 的身份，避免把密钥发给伪装者。

### 案例 2：私有文件系统——存储也得是「密封」的

光保护内存还不够，应用写磁盘时数据也不能暴露。Haven 在 enclave 里实现了一个私有文件系统：

```
Haven 私有文件系统设计：
  - 格式：FAT32，封装在加密虚拟磁盘（VHD）里
  - 加密：AES-GCM（每个磁盘块单独加密且自带防篡改校验码，
           改了内容改了标签，两个都得对才能解密），按块独立加密
  - 完整性：Merkle 树（树状哈希链——叶子是每块数据的哈希，
             父节点是子节点哈希的哈希，改动任何一块数据树根就会变），
             根哈希只有 enclave 知道
  - 崩溃一致性：借鉴 InkTag 的双哈希版本方案

读写流程：
  应用 read("data.db")
    → LibOS 调 VirtualMemoryCommit
    → Shield 从加密 VHD 读块 → AES-GCM 解密 → 验 Merkle → 返回明文
  
  应用 write("data.db", newData)
    → Shield AES-GCM 加密 → 更新 Merkle 树根 → 写回加密 VHD
```

效果：服务端可以看到「某时间某大小的 VHD 文件在变化」，但看不到里面任何一字节的内容。

### 案例 3：线程调度——不让主机 OS 用调度控制应用

一个经典 Iago 攻击变体是：恶意 OS 故意让两个线程同时获得同一个互斥锁，触发数据竞争漏洞。Haven 的应对方案是**私有调度器**：

```
Haven 线程模型：

  外部主机 OS 看到的：N 个"虚拟 CPU 线程"（KVM/Hyper-V 调度）
                      ↓ EENTER/EEXIT
  Enclave 内部：      M 个应用线程（Haven Shield 调度）
  
  Shield 内置：
    - 运行队列（用 atomic 指令保护）
    - 事件、互斥锁、信号量原语
    - 主机 OS 可以延迟唤醒（拒绝服务），
      但不能让两个线程同时拿到同一把锁
```

主机 OS 能影响的只有「什么时候给你 CPU 时间」，不能影响「你的锁和同步逻辑是否正确」。这样一来，即便主机故意制造抖动，应用内部的一致性仍然由 enclave 里的代码保证。

## 踩过的坑

1. **SGX 早期不支持动态内存分配**：Haven 开发时发现无法在 enclave 创建后动态增加页面，只能在启动时一次性声明 64GB 地址空间——Intel 为此在 SGX Rev.2 规范里加入了 `EAUG`/`EACCEPT` 指令

2. **CPUID、RDTSC、IRET 在 enclave 内非法**：这三条指令在 LibOS 和应用二进制里随处可见，Haven 不得不在异常处理器里软件模拟 CPUID、等待 Intel 修改规范允许 RDTSC、并以繁琐的 EEXIT→ERESUME 序列绕过 IRET 限制，单次异常要跨越 8 次 enclave 边界

3. **TCS（线程控制结构）不可变，FS/GS 基址固定**：线程本地存储在 x86 依赖 FS/GS 段，而 SGX 初版不支持在异步退出时保存修改后的 FS/GS，导致 Haven 无法真正做用户态线程复用——只能把应用线程 1:1 映射到 TCS，给主机 OS 留下观察和干预调度的机会

4. **存储回滚攻击在 enclave 生命周期外无解**：enclave 若被强制终止再重启，它看到的 VHD 内容在密码学上一致，但可能已经是旧版本——真正防御回滚攻击需要 enclave 之外的可信持久化存储，Haven 把这个问题留到了未来工作

## 适用 vs 不适用场景

**适用**：
- 把现有的数据库、Web 服务器、分析服务「原封不动」迁移到公有云，且要求即便云服务商也无法读取业务数据
- 多方联邦学习：各方数据不出本地，只在 enclave 里合并计算
- 医疗、金融等对数据主权有强合规要求的场景（GDPR、HIPAA）
- 需要远程证明的场景——用户可以在发出数据前验证 enclave 身份

**不适用**：
- 对延迟极度敏感的应用：enclave 边界每次进出有数千到数万周期开销，频繁 I/O 会累积显著额外延迟
- 需要 fork() 或多进程模型的应用：跨 enclave 通信必须走不可信信道，实现复杂且昂贵
- 侧信道攻击是主要威胁的场景：Haven 明确排除缓存时序攻击、功耗分析等侧信道，SGX 本身在这些攻击面上有已知弱点
- EPC 太小而工作集太大的应用：一旦 EPC 页换出到主存就要加密解密，内存带宽敏感型应用性能将大幅下降

## 历史小故事（可跳过）

- **2013 年**：Intel 发布 SGX 指令集草稿规范（Rev.1），设计初衷是让开发者把密码学密钥或 DRM 逻辑放进小型 enclave，预期使用的代码只有几 KB
- **2013–2014 年**：Baumann、Peinado、Hunt 在微软研究院萌生更激进的想法——把 LibOS + 整个应用塞进 enclave；发现 SGX Rev.1 有三处根本性缺陷（不支持动态内存、不支持页错误上报、IRET/RDTSC/CPUID 非法）
- **2014 年 10 月**：Haven 在 OSDI 2014 发表，斩获最佳论文奖；同月，Intel 发布 SGX Rev.2 规范，融入 Haven 团队提出的三项修复（动态内存、RDTSC 解禁、页错误上报），两篇文章同步公开
- **2015 年后**：Graphene-SGX、SCONE、Panoply 等系统沿用 Haven 的 LibOS-in-enclave 思路，支持 Linux ABI，把机密计算从 Windows 专属推向通用化；2019 年 Linux 基金会成立「机密计算联盟」（Confidential Computing Consortium），Haven 被公认为开山奠基之作

## 学到什么

1. **硬件隔离 + LibOS = 消灭巨大信任面**：把 OS 本身放进 enclave 是关键跳跃——不是只保护密钥，而是保护整个计算过程；代价是更大的 TCB，但 TCB 完全由用户控制
2. **接口越窄，攻击面越小**：从 40 个 Drawbridge 调用精简到 22 个不信任调用，每减少一个调用意味着少一条 Iago 攻击路径；这个「接口最小化」原则在安全系统设计中普遍适用
3. **原型驱动规范**：Haven 跑起来发现 SGX 规范的缺陷，直接推动了 Intel 修改——「先做原型、再改规范」是硬件-软件协同设计中颇为高效的路径
4. **性能开销是真实的**：31–54% 的吞吐下降不是小数字，但论文指出「不需要信任云」对某些用户而言足以弥补这个代价——安全和性能的取舍在工程中永远不会消失

## 延伸阅读

- 论文 PDF（OSDI 2014）：[Shielding Applications from an Untrusted Cloud with Haven](https://www.usenix.org/system/files/conference/osdi14/osdi14-paper-baumann.pdf)
- Intel SGX 开发者文档：[Intel SGX Developer Guide](https://www.intel.com/content/www/us/en/developer/tools/software-guard-extensions/overview.html)（了解 EPC、EENTER/EEXIT 等原语的官方解释）
- 后继工作 Gramine（原 Graphene-SGX）：[Gramine Project](https://gramine.readthedocs.io/en/stable/)（Haven 思路的开源 Linux 版本，可直接运行未修改的 Linux 程序）
- Iago 攻击原始论文：Checkoway & Shacham, "Iago attacks: why the system call API is a bad untrusted RPC interface", ASPLOS 2013（理解 Haven 为什么要用 LibOS 而不是直接防御系统调用返回值）
- [[sgx-2013]] —— Intel SGX 硬件原语设计，Haven 的硬件基础
- [[sel4-2009]] —— seL4 形式化验证的微内核，和 Haven 的「TCB 由用户控制」理念互相呼应

## 关联

- [[sgx-2013]] —— Haven 的硬件基础：EPC 加密内存、EENTER/EEXIT 进出 enclave、远程证明机制
- [[xen-2003]] —— Xen 用软件 hypervisor 隔离虚拟机；Haven 的对立面是连 hypervisor 也不信任
- [[kvm-2007]] —— KVM 是主流云虚拟化层；Haven 的威胁模型明确把 hypervisor 列为不可信组件
- [[sel4-2009]] —— seL4 通过形式化验证消灭内核 bug；Haven 通过硬件隔离绕过对 OS 的信任，两条路殊途同归
- [[barrelfish-2009]] —— Barrelfish 把多核调度建立在「核之间互不信任」上；Haven 把应用与 OS 之间建立在同样的互不信任原则上

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

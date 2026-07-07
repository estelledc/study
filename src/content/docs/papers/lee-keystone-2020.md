---
title: Keystone — 用开源 RISC-V 拼一套可定制 TEE
来源: 'Dayeol Lee et al., "Keystone: An Open Framework for Architecting Trusted Execution Environments", EuroSys 2020'
日期: 2026-07-07
分类: security-privacy
难度: 中级
---

## 是什么

Keystone 是一个**用 RISC-V 基础硬件能力搭出来的开源 TEE 框架**。TEE 可以先理解成“可信执行环境”：把一小段敏感程序放进一个受保护的小房间里，让操作系统、云管理员、普通进程都不能随便读写它。

日常类比：普通 TEE 像厂家卖给你的固定款保险箱，大小、锁、报警器都已经定死。Keystone 更像一套保险箱积木：厂家只给坚固钢板和锁芯，平台方和程序员可以按场景选择小箱子、大箱子、带报警器、带防撬层，甚至换一套内部隔板。

这篇论文的核心不是“又造一个 enclave”，而是提出一个问题：能不能把 TEE 从厂商固定设计，变成可组合、可裁剪、可研究的开放框架？Keystone 的回答是：用 RISC-V 的 M-mode 和 PMP 做最小安全底座，再把复杂功能放到 enclave 自己的 runtime 里。

## 为什么重要

不理解 Keystone，下面这些事都很难解释：

- 为什么 Intel SGX、ARM TrustZone、AMD SEV 都是 TEE，却各自限制不同，开发者常被厂商设计牵着走
- 为什么开源硬件和 RISC-V 对安全研究很重要——你不仅能写软件，还能检查和改造信任边界
- 为什么 TEE 里“谁负责资源管理”会影响安全——OS 管页表会带来 controlled-channel 泄露
- 为什么机密计算不能只看“能不能隔离”，还要看 TCB 大小、性能、可移植性和威胁模型
- 为什么 [[sgx-2013]] 之后，研究者开始寻找更可定制、可审计、可实验的 TEE 路线

## 核心要点

1. **硬件给原语，不给成品答案**。类比：厨房只提供炉子和水电，不替你决定菜谱。Keystone 让硬件只提供内存隔离、可信启动、随机数等基础能力，把“这个 TEE 应该长什么样”交给软件框架组合。

2. **SM 只守门，RT 自己管家务**。SM 是 security monitor，跑在 RISC-V 最高权限的 M-mode，只负责检查边界、设置 PMP、度量和证明。RT 是 enclave 里的 runtime，跑在 S-mode，负责页表、系统调用代理、内存扩展等复杂事务。

3. **PMP 是隔离的关键锁芯**。RISC-V PMP 可以给物理内存区域设置读写执行权限。Keystone 用 PMP 把 SM、host OS、不同 enclave 的内存隔开；切进 enclave 时开自己的门，切回 OS 时再把门锁上。

4. **插件让威胁模型可调**。不是每个场景都要防物理攻击或缓存侧信道。Keystone 用 compile-time plugins 选择动态内存、self-paging、cache partitioning、on-chip memory 等能力，让安全和性能按需求取舍。

## 实践案例

### 案例 1：一个 Keystone enclave 怎么出生

```text
host OS -> SM: create(enclave_image, page_table)
SM      -> SM: check mapping, hash code and config
SM      -> PMP: deny OS access to enclave memory
host OS -> SM: run()
SM      -> PMP: allow enclave, block outside memory
```

逐部分解释：

- host OS 仍然负责找一块物理内存，但它不是可信的
- SM 会检查页表映射是否合法，并把初始内容 hash 成 measurement
- PMP entry 让 OS 之后不能直接读写 enclave 那块内存
- 远端用户看 measurement，确认里面跑的是预期代码

### 案例 2：为什么把页表交给 enclave 自己

```text
SGX style: OS manages page table -> OS can observe page faults
Keystone: RT manages page table -> host sees much less control trace
```

逐部分解释：

- SGX 里不可信 OS 参与 enclave 页管理，容易观察“第几个 4KB 页被访问”
- Keystone 的 RT 在 enclave 内管理页表，页表也放在受保护内存里
- 这样 host OS 不能通过操纵页表来精确追踪 enclave 的控制流
- 代价是 RT 进入 TCB，所以 RT 必须尽量小、可裁剪、可检查

### 案例 3：按场景打开插件

```text
if workload == "small crypto":
    use(base_rt)
elif workload == "large ML inference":
    use(dynamic_memory, edge_calls)
elif threat == "physical attacker":
    use(on_chip_memory, self_paging, page_encryption)
```

逐部分解释：

- 小型密码学程序只需要最小 RT，TCB 更小
- 大模型推理需要动态扩内存和系统调用代理，否则迁移成本太高
- 如果担心有人探测 DRAM，总要把敏感页放进片上内存或加密后换出
- Keystone 的价值就在于这些不是三套系统，而是一套框架的不同配置

## 踩过的坑

1. **把 Keystone 当成“开源 SGX”**：不准确，因为它不是复制 SGX 指令集，而是把 TEE 拆成 SM、RT、eapp 三层可组合框架。

2. **以为 PMP 自动解决所有侧信道**：PMP 防直接读写，不防 timing 和 speculative execution；论文明确建议避免不安全的乱序核或另加防护。

3. **忽略 RT 也在 TCB 里**：SM 很小不代表整个应用信任基都小，打开 libc、syscall、self-paging 插件都会把 RT 代码加进可信边界。

4. **只看平均性能开销**：CPU benchmark 基本无开销，但 I/O、cache partitioning、片上内存分页会很贵；原因是边界拷贝、cache 变小和频繁 page fault。

## 适用 vs 不适用场景

**适用**：

- 想研究 TEE 设计取舍，而不是被某个厂商固定方案限制
- RISC-V 平台上的安全原型、边缘设备、IoT、教学和系统安全实验
- 需要按应用裁剪 TCB：小密码学程序用轻配置，复杂应用再加插件
- 想比较 SGX、TrustZone、SEV、Sanctum 等路线的威胁模型差异

**不适用**：

- 立刻要在主流 x86 云上生产部署机密计算，现成 SGX/TDX/SEV 生态更成熟
- 需要默认抵抗 speculative execution 或 timing side channel，Keystone 本身没有完整解决
- 不愿信任 RT/eapp 代码正确性的场景，因为 enclave 内部 bug 仍会破坏自己
- 追求零迁移成本的大型遗留应用，Keystone 仍需要编译、配置和接口适配

## 历史小故事（可跳过）

- **2013 年**：Intel 公开 SGX，把“云主机上不信任 OS”变成可讨论的硬件能力。
- **2014-2017 年**：Haven、Graphene-SGX、SCONE 等系统把真实应用塞进 enclave，也暴露出 TCB、I/O、页表侧信道等痛点。
- **2016 年**：Sanctum 在 RISC-V 方向展示更可控的 enclave 设计，强调 cache side-channel 防护。
- **2019 年**：Keystone 预印本出现，用 RISC-V PMP 和 M-mode 把 TEE 框架化。
- **2020 年**：EuroSys 论文发表，Keystone 成为开源 RISC-V TEE 研究的重要基线。

## 学到什么

1. **安全系统最怕“固定套餐”**：不同场景的敌人不同，硬件厂商给的一种 TEE 设计很难同时适合云、手机、IoT 和研究原型。

2. **缩小 TCB 不是口号，而是分工问题**：SM 少做事、RT 可裁剪、eapp 只放必要逻辑，才能让可信边界真的变小。

3. **隔离和资源管理要分开想**：谁能分配内存、改页表、处理缺页，谁就可能观察或影响安全边界。

4. **开源 ISA 改变研究方式**：RISC-V 让论文不只停在软件 workaround，而能把硬件原语、监控器和 runtime 一起实验。

## 延伸阅读

- 论文 PDF：[Keystone EuroSys 2020](https://keystone-enclave.org/files/keystone-eurosys20.pdf)（原文最值得看 Figure 1、Figure 4 和 Table 4）
- [[sgx-2013]] —— 先理解厂商固定款 enclave，再看 Keystone 为什么要可定制
- [[costan-sgx-explained-2016]] —— 系统拆解 SGX 的威胁模型和细节，是理解 Keystone 对照面的好材料
- [[haven-2014]] —— 展示把完整应用搬进 enclave 后，系统层会遇到哪些兼容性和 Iago 问题
- [[sanctum-2016]] —— RISC-V enclave 方向的关键前作，强调缓存侧信道和硬件隔离设计
- [[sel4-2009]] —— 另一条缩小信任基路线：不用 TEE，而是把内核证明到代码级别

## 关联

- [[sgx-2013]] —— SGX 是固定硬件 TEE 代表，Keystone 反过来主张开放原语和可组合软件层
- [[costan-sgx-explained-2016]] —— 这篇解释 SGX 的具体限制，正好说明 Keystone 想摆脱什么束缚
- [[haven-2014]] —— Haven 用 LibOS 适配 SGX，Keystone 用 RT 插件适配不同应用需求
- [[sanctum-2016]] —— Sanctum 和 Keystone 都在 RISC-V 上探索 enclave，但 Keystone 更强调框架化和插件化
- [[sel4-2009]] —— seL4 用证明降低软件信任风险，Keystone 用硬件隔离加小 SM 降低信任边界
- [[risc-i-1981]] —— RISC-V 继承 RISC 开放简洁思想，Keystone 把这种开放性用到安全硬件研究里

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

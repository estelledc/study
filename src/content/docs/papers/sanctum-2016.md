---
title: Sanctum 2016 — 用少量硬件改动做强隔离 enclave
来源: 'Victor Costan, Ilia Lebedev, and Srinivas Devadas, "Sanctum: Minimal Hardware Extensions for Strong Software Isolation", USENIX Security 2016'
日期: 2026-07-09
分类: security-privacy
难度: 高级
---

## 是什么

Sanctum 是一个可信执行环境设计：它让程序把敏感代码和数据放进 **enclave**，并假设操作系统、虚拟机管理器和同机其他程序都可能是坏的。

日常类比：SGX 像厂商卖给你的保险箱，钥匙和很多内部机关都在厂商手里；Sanctum 像一张公开图纸，告诉你只要在门、窗、监控摄像头这几个接口加锁，就能自己造出可检查的保险室。

它不是一颗完整新 CPU，而是在 Rocket RISC-V 核心周围加少量硬件接口，再把大部分逻辑放到一个可信软件 security monitor 里。

这篇论文的价值在于：它问的不是“怎么给 SGX 补洞”，而是“如果从威胁模型开始重画，最少需要哪些硬件机制才能挡住软件侧信道？”

## 为什么重要

不理解 Sanctum，下面这些事会很难解释：

- 为什么 “enclave 里内存加密了” 仍然挡不住页表轨迹和缓存计时攻击
- 为什么安全硬件要同时讨论 CPU 核心、LLC、DMA、页表和启动链
- 为什么 RISC-V TEE 方案经常强调“可审计”和“少微码”，这是在回应 SGX 的黑盒复杂性
- 为什么 ORAM 能隐藏访问模式，但在软件攻击模型下可能太重，Sanctum 选择了更便宜的隔离
- 为什么强隔离不等于万能安全：DoS、物理探针、DRAM 带宽计时仍然不在它的承诺里

## 核心要点

Sanctum 可以拆成三件事：

1. **把内存按 DRAM region 分给不同房间**。类比：酒店不是只锁每个抽屉，而是把整层楼划给一个住客。enclave 的代码、数据、页表都放在自己拥有的 DRAM region 里，OS 不能把同一块内存同时分给两边。

2. **把访问路径一起隔离**。类比：只锁房门还不够，电梯记录和监控录像也会泄露行踪。Sanctum 让 enclave 自己持有页表，TLB/L1 在进出时刷新，LLC 用地址变换和 region 分区减少共享缓存侧信道。

3. **把复杂策略放进可信软件，而不是塞进黑盒微码**。类比：门锁只负责“能不能开”，访客登记、房间分配、证明文件由前台系统处理。security monitor 检查 OS 的资源分配，写硬件配置寄存器，并负责 enclave 生命周期和 attestation。

这三点加起来，得到一个比 SGX 更容易分析的设计：硬件改动少，可信软件也尽量短。

## 实践案例

### 案例 1：把外部输入先搬进 enclave

```c
void handle(uint8_t *outside, size_t n) {
  uint8_t inside[MAX];
  copy_from_untrusted(inside, outside, n);
  compute_secret(inside, n);
}
```

**逐部分解释**：

- `outside` 是 OS 和宿主程序都能观察的普通内存
- `inside` 位于 enclave 自己的 DRAM region
- 先复制再计算，避免算法一边读外部地址一边把访问模式暴露出去
- Sanctum 保护的是 enclave 内部计算，不自动保护你主动碰外部内存的行为

### 案例 2：为什么页表必须放进 enclave

```txt
if address in EVRANGE:
  page_table = enclave.eptbr
else:
  page_table = os.ptbr
```

**逐部分解释**：

- `EVRANGE` 是 enclave 私有地址区间
- 访问私有区间时，硬件 page walker 用 enclave 自己的页表
- 访问外部区间时，才用 OS 管理的页表
- 这样 OS 不能通过“看缺页地址、读 accessed/dirty bit”来偷看 enclave 访问了哪些页面

### 案例 3：security monitor 只批准合法资源分配

```txt
os_request: assign region R to enclave E
monitor:
  assert owner[R] == free
  owner[R] = E
  write_hardware_bitmap(E, R)
```

**逐部分解释**：

- OS 仍然负责分配资源，所以系统还能像普通机器一样调度
- monitor 不相信 OS 的决定，只检查“这块 region 是否空闲”
- 通过 `write_hardware_bitmap`，monitor 把结果交给硬件强制执行
- 论文的思路是：OS 可以提建议，但不能越权修改隔离边界

## 踩过的坑

1. **把 Sanctum 当成 SGX 的换皮版本**：它借用了 enclave 编程模型，但关键区别是把页表和 LLC 访问模式也纳入隔离目标。

2. **以为它能挡所有侧信道**：论文明确不处理 DRAM 带宽、cache coherence directory 带宽、功耗传感器和物理攻击。

3. **忽略 DoS 边界**：恶意 OS 仍然可以不给 enclave 分资源，Sanctum 保密和保完整性，不保证一定让你运行。

4. **低估 runtime 的责任**：enclave 不能直接做系统调用，文件和网络 I/O 要由宿主代理，runtime 必须自己处理外部输入输出的安全协议。

## 适用 vs 不适用场景

**适用**：

- 研究 SGX 之外的 TEE 设计取舍，特别是 RISC-V 方向
- 需要理解“访问模式泄露”为什么是机密计算的大问题
- 想学习硬件和可信软件如何共同缩小 TCB
- 想比较 ORAM、cache partitioning、page coloring 这些隐藏访问模式的方法

**不适用**：

- 想找可直接商用的云机密计算产品，SGX、SEV、TDX 文档更直接
- 想保护物理攻击者、内存总线探测或功耗分析，Sanctum 主要讨论软件攻击
- 想运行频繁换入换出的超大 enclave，论文自己也说 demand paging 代价很高
- 想完全摆脱可信硬件根，measurement root 和 monitor 仍然在 TCB 里

## 历史小故事（可跳过）

- **2013 年前后**：Intel 开始公开 SGX 思路，安全社区看到“不信任 OS 的用户态隔离”有了主流硬件入口。
- **2015 年**：Costan 和 Devadas 写出 SGX Explained，指出 SGX 公开文档不足、侧信道威胁模型不完整。
- **2016 年**：Sanctum 在 USENIX Security 发表，用 Rocket RISC-V 原型证明“少量硬件 + 可审计 monitor”是一条可行路线。
- **2018 年以后**：Spectre、Meltdown、Foreshadow 等事件让大家重新意识到，微架构痕迹本身就是安全边界的一部分。
- **后来**：Keystone 等 RISC-V TEE 项目继续沿着“开放 ISA + 小 TCB + 可审计实现”的方向推进。

## 学到什么

1. **安全设计先定威胁模型**：Sanctum 只承诺防软件攻击，因此敢不用 ORAM 去隐藏内存总线地址，也不承诺挡物理侧信道。

2. **保护数据内容不够，还要保护访问路径**：页表、TLB、L1、LLC、DMA 都可能成为观察窗口，隔离要沿着数据走过的路一路检查。

3. **小硬件改动可以换来大分析收益**：论文把硬件放在接口处，避免改 CPU 核心关键路径，让正确性证明更像检查几个小电路。

4. **可信软件不是越少功能越好，而是越少秘密越好**：security monitor 避免用密钥做数据相关访问，把签名交给 signing enclave，降低缓存计时风险。

5. **性能损失主要来自共享缓存变小**：TLB miss 额外几拍几乎不重要，真正的代价是 enclave 被限制在一部分 LLC sets 里。

## 延伸阅读

- 论文 PDF：[Sanctum: Minimal Hardware Extensions for Strong Software Isolation](https://eprint.iacr.org/2015/564.pdf)
- USENIX 页面：[Sanctum 论文、BibTeX 与演讲材料](https://www.usenix.org/conference/usenixsecurity16/technical-sessions/presentation/costan)
- [[costan-sgx-explained-2016]] —— 读 Sanctum 前最好先知道 SGX 的承诺和漏洞边界
- [[sgx-2013]] —— SGX 原始公开设计，Sanctum 很多术语都在回应它
- [[kim-rowhammer-2014]] —— Sanctum 明确假设硬件正确，不处理 Rowhammer 这类故障攻击
- [[kocher-spectre-2019]] —— 说明微架构行为本身为什么会变成安全问题

## 关联

- [[costan-sgx-explained-2016]] —— 同一作者线索：先拆解 SGX，再提出更可审计的替代方案
- [[sgx-2013]] —— Sanctum 保留 enclave 编程直觉，但把页表和缓存侧信道纳入设计目标
- [[haven-2014]] —— Haven 展示“把应用搬进 enclave”的系统愿景，Sanctum 讨论底层硬件该怎么支撑
- [[sel4-2009]] —— seL4 用形式化验证缩小内核信任，Sanctum 用小 monitor 和小硬件改动缩小 TCB
- [[saltzer-schroeder-1975]] —— 最小权限和完全中介原则在 Sanctum 的资源分配检查里很明显
- [[lipp-meltdown-2018]] —— 同样提醒我们：CPU 特权边界之外，还有微架构观察边界
- [[capsicum-2010]] —— 两者都在做隔离，只是 Capsicum 在 OS API 层，Sanctum 在硬件和 monitor 层

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

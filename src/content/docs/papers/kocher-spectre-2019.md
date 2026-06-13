---
title: Spectre 攻击 — 推测执行偷看别人的内存
来源: 'Paul Kocher et al., "Spectre Attacks: Exploiting Speculative Execution", IEEE S&P 2019'
日期: 2026-05-30
分类: 安全与隐私
子分类: 安全与隐私
难度: 中级
---

## 是什么

**Spectre**（幽灵攻击）是一类利用 CPU **推测执行**（speculative execution）的硬件漏洞：处理器为了提速会「先猜分支、提前跑代码」，猜错再撤销；但撤销只恢复寄存器，**缓存里留下的痕迹**可能被攻击者量出来，从而读到本不该看到的秘密。

日常类比：像餐厅服务员听说你要牛排，**还没等你开口确认**就先端来一盘——后来发现你其实点的是鱼，盘子撤走了，但厨房已经按牛排备料、占用了灶台；旁观者看厨房忙了哪口锅，就能猜你差点吃到什么。

论文里把这种「本不该执行、后来被撤销」的指令叫 **瞬态指令**（transient instructions）。攻击者诱导受害程序投机执行这些指令，再用 **Flush+Reload** 等缓存侧信道把秘密一字节一字节读出来。

## 为什么重要

不理解 Spectre，下面这些事都没法解释：

- 为什么 2018 年 Intel / AMD / ARM 全线紧急打补丁，连浏览器都要发版本更新
- 为什么打了 **KPTI**（内核页表隔离，前身 KAISER）防 Meltdown 之后，跨进程读秘密仍可能发生
- 为什么「代码有边界检查、没缓冲区溢出」的程序仍可能被偷密钥
- 为什么云厂商开始强调「同物理核不同租户」的侧信道风险，而不只是网络隔离

## 核心要点

Spectre 可以拆成 **三步**：

1. **诱导错误推测**：攻击者训练分支预测器或污染 BTB（分支目标缓冲），让 CPU 在条件未就绪时走「错路」。类比：反复告诉导航「前面左转」，最后一次故意误导，车已经拐进小巷才踩刹车。

2. **瞬态指令泄露**：错路上的指令会访问受害者的秘密内存，并通过依赖秘密的地址去碰缓存（论文经典片段 `array2[array1[x] * 256]`）。名义 CPU 状态会回滚，**缓存状态不回滚**。

3. **侧信道读出**：攻击者用 Flush+Reload 测某缓存行是快（命中）还是慢（未命中），推断秘密字节的值。类比：看哪扇柜门上有新鲜指纹，反推谁刚开过哪格抽屉。

两种主要变体：**Spectre v1** 误预测条件分支；**Spectre v2** 误预测间接分支，在受害者地址空间里投机执行类似 ROP 的 gadget。

## 实践案例

### 案例 1：边界检查挡不住投机读

受害 C 代码（论文简化）：

```c
if (x < array1_size)
    y = array2[array1[x] * 256];
```

**攻击步骤**：

1. 多次用合法 `x` 调用，训练分支预测器「这个 if 几乎总为真」
2. 下一次传入 **越界** 的 `x`，并让 `array1_size` 不在缓存里（拖慢真正比较）
3. CPU 投机执行 `array1[x]`，用秘密字节 `k` 计算 `array2[k * 256]`，把对应缓存行载入
4. 攻击者对 `array2` 各偏移做 Flush+Reload，**最快命中**的那行对应 `k`

逐部分解释：

- `x < array1_size` 是软件以为的「安全门」
- 推测执行在「门还没核实完」时就进门了
- 撤销只撤销 `y` 的寄存器值，**不会擦掉缓存**

### 案例 2：浏览器里的 JavaScript 沙箱

论文证明：纯 JS 也能训练分支并触发投机读，读到**浏览器进程**里其他标签页的数据。

```javascript
// 概念示意：训练 + 计时探测（非完整 PoC，省略权限与对齐细节）
const probeTable = new Uint8Array(256 * 4096); // 256 个探测页，间距一页

function trainBranch(taken) {
  for (let i = 0; i < 1000; i++) {
    if (taken) { probeTable[0] = 1; } // 反复走「真」分支
  }
}

function probe(index) {
  const offset = index * 4096;
  const t0 = performance.now();
  const v = probeTable[offset]; // 读探测页：在缓存里则更快
  return performance.now() - t0;
}
```

**逐部分解释**：

- `probeTable` 是攻击者自有的探测数组，每个候选秘密值对应一页；秘密字节决定投机时「暖」了哪一页
- `trainBranch` 让 CPU 习惯「条件为真」
- 恶意页与受害页共享微架构（缓存、预测器），沙箱是**逻辑**隔离不是**物理**隔离
- `probe` 用 `performance.now()` 量读取耗时——命中缓存明显更快；侧信道不需要传统「内存越界 bug」

### 案例 3：云主机同核租户

租户 A 与 B 被**反复调度到同一物理 CPU 核心**（攻击者需能长时间与同核共驻），A 无法读 B 的虚拟内存页，但能：

1. 对自身缓存做 Flush
2. 等 B 运行加密代码（如 OpenSSL）
3. Reload 并计时，推断 B 访问了哪些缓存行

**逐部分解释**：

- 虚拟化藏得住**地址**，藏不住**时间**
- 容器共享内核（Docker 默认）比 KVM 硬件虚拟化更共享底层资源
- 缓解靠 CPU 微码、retpoline、隔离调度——没有「装个杀毒就行」的银弹

## 踩过的坑

1. **以为 KPTI 万能**：KPTI 主要缓解 Meltdown 的内核地址泄露；Spectre 仍可在用户态进程之间投机读——补丁组合要分清 CVE-5753/5715 与 5754。

2. **只审计显式越界**：边界检查在**退休流水线**前才生效，投机路径可抢先执行；静态分析工具若不懂微架构，会给出「安全」的假象。

3. **共享核上跑多租户密钥运算**：性能调度把两个 VM 放同一核很常见；侧信道不留下传统日志，事后难取证。

4. **忽略间接分支**：只加固 `if` 数组访问，忘了函数指针 / vtable 也能被 BTB 污染触发 Spectre v2。

## 适用 vs 不适用场景

**适用**（你需要理解 Spectre 时）：

- 写安全敏感代码：密码学、浏览器引擎、沙箱、JIT
- 做云 / 容器多租户隔离评估
- 分析硬件漏洞与软件缓解（retpoline、LFENCE、编译器屏障）
- 读 2018 年后 CPU 微码、内核补丁公告

**不适用**（别用 Spectre 框架硬套）：

- 传统栈溢出、UAF 等**软件内存破坏**——那些不依赖分支预测
- 纯网络层攻击（钓鱼、TLS 配置错误）——Spectre 是**本地/同机**微架构问题
- 指望应用层「再检查一次」就绝对安全——检查本身可能成为投机 gadget

## 历史小故事（可跳过）

- **1990 年代末**：Kocher 等开创缓存计时等**软件侧信道**，证明「不算密码也能偷密钥」。
- **2017 年 6 月**：Kocher 从 ROP 与分支预测联想推测执行风险；同年 Google Project Zero 等独立发现重叠问题。
- **2018 年 1 月 3 日**：论文与 [spectreattack.com](https://spectreattack.com/) 同步披露，与 Meltdown 震动全行业；Intel / AMD / ARM 紧急微码与 OS 补丁。
- **2018–2019**：KAISER 演进为 Linux **KPTI**；编译器引入 **retpoline**；IEEE S&P 正式发表，CVE-2017-5753、5715 定名 Spectre。

## 学到什么

1. **性能优化会留下物理痕迹**：分支预测和推测执行是「看不见的共享状态」，安全模型必须算进微架构。
2. **撤销 ≠ 无副作用**：回滚寄存器不够，缓存、BTB、填充队列都可能泄密。
3. **隔离是分层的**：进程、沙箱、虚拟化各挡一层，Spectre 说明「逻辑隔离」在投机执行面前会穿洞。
4. **缓解要软硬件协同**：单靠内核补丁或单靠编译器都不够，ISA 与 CPU 设计也要定义「允许泄露什么」。

## 延伸阅读

- 官方站与 FAQ：[spectreattack.com](https://spectreattack.com/)
- 论文 PDF：[arXiv:1801.01203](https://arxiv.org/pdf/1801.01203v1.pdf)
- Google Project Zero 博文：Meltdown / Spectre 披露时间线
- 视频：[Computerphile — Spectre & Meltdown](https://www.youtube.com/watch?v=I5mRwzivHXw)（概念动画）
- [[branch-prediction-yeh-patt-1991]] —— 分支预测器如何被训练
- [[moesi-cache-coherence-1986]] —— 缓存一致性协议与侧信道面

## 关联

- [[branch-prediction-yeh-patt-1991]] —— Spectre v1/v2 都依赖「预测器可被训练」
- [[moesi-cache-coherence-1986]] —— 多核共享缓存是 Flush+Reload 的物理基础
- [[gpu-cache-coherence-2013]] —— 同类「一致性 + 计时」思路在 GPU 上也有侧信道研究
- [[xen-2003]] —— 云虚拟化隔离模型；Spectre 后需重新审视同核调度
- [[docker]] —— 容器共享内核，默认隔离弱于硬件 VM
- [[tls-1.3]] —— 加密协议防网络嗅探，不防本机微架构读出密钥
- [[cryptoverif-2008]] —— 形式化证明协议安全，需额外假设「实现环境无侧信道」

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[branch-prediction-yeh-patt-1991]] —— Yeh-Patt 1991 — 用最近 12 条分支的历史给 CPU 算命
- [[cryptoverif-2008]] —— CryptoVerif — 让计算机直接证密码协议在真实计算模型下安全
- [[gpu-cache-coherence-2013]] —— GPU 缓存一致性 — 用时戳代替失效消息
- [[moesi-cache-coherence-1986]] —— Sweazey-Smith MOESI 1986 — 给多核 CPU 一份"谁手里有这块内存"的统一规则
- [[rowhammer-2014]] —— Row Hammer — 不碰邻居也能把邻居的位翻过来
- [[spectre-attack-2018]] —— Spectre Attacks — 推测执行如何绕过边界检查偷读内存
- [[xen-2003]] —— Xen 2003 — 让操作系统配合虚拟化，性能直接接近原生


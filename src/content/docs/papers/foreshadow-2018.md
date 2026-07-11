---
title: Foreshadow 2018 — SGX 保险箱也挡不住瞬态执行脚印
来源: 'Jo Van Bulck et al., "Foreshadow: Extracting the Keys to the Intel SGX Kingdom with Transient Out-of-Order Execution", USENIX Security 2018'
日期: 2026-07-09
分类: 安全与隐私
难度: 高级
---

## 是什么

日常类比：SGX enclave 像放在别人家厨房里的保险箱。房东、物业、清洁工都不能直接打开它，但保险箱每次开合、取东西、放回东西，可能会在厨房台面上留下很短暂的热痕。

Foreshadow 说的就是：攻击者打不开 SGX 的正门，却能利用 CPU 乱序执行留下的 L1 缓存热痕，把 enclave 里的秘密字节一点点读出来。

技术上，Foreshadow 是一类 **Meltdown 型瞬态执行攻击**。它利用 CPU 在权限检查最终失败前，短暂使用了不该被外部代码读到的 enclave 数据；正式寄存器结果会回滚，但缓存状态已经被秘密值改变。

这篇论文的关键定位：它把 2018 年 Spectre / Meltdown 引发的硬件信任危机推进到 Intel SGX。也就是说，就算你把代码放进“硬件可信执行环境”，CPU 微架构自己的中间状态仍然可能泄密。

一句话记住：Foreshadow 不是绕过 SGX API，而是绕过“我们以为硬件隔离就足够”的直觉。

## 为什么重要

不理解 Foreshadow，下面这些事很难解释：

- 为什么 [[sgx-2013]] 说操作系统读不到 enclave 明文，后来仍然出现“读出 SGX 密钥”的攻击
- 为什么 [[lipp-meltdown-2018]] 不只是内核隔离问题，还会波及非层级隔离的可信执行环境
- 为什么远程证明 attestation 一旦密钥泄露，云上机密计算的信任链会从根上断掉
- 为什么“代码写成 constant-time”挡不住所有侧信道：Foreshadow 不要求 victim enclave 自己有 gadget
- 为什么硬件安全补丁常常需要微码、调度策略、HyperThreading 和 L1 cache flush 一起考虑

## 核心要点

Foreshadow 可以拆成 **三步**：

1. **先让秘密进 L1 缓存**：enclave 正常运行时会把自己的密钥、寄存器保存区或页面内容带进 L1。类比：保险箱里的人刚把钥匙放到桌面上，桌面还是热的。

2. **制造一次会失败的外部读取**：攻击者把目标 enclave 页标成不可访问，让 CPU 最终抛异常。关键是异常退休前，乱序执行窗口里可能已经短暂拿到了真实字节。类比：保安最后会拦住你，但你已经瞥见了一眼桌上的号码。

3. **把字节编码成缓存位置**：秘密字节决定访问 oracle 数组的哪一格；异常回滚后，攻击者用 FLUSH+RELOAD 测哪一格变快。类比：不能把号码带走，就踩热 256 块地砖中的一块。

论文真正厉害的地方不只是读到一个 byte，而是把“读 byte”工程化成能抽取完整 128-bit SGX 密钥的流程。

一个限制也要记住：Foreshadow 对 SGX 的基础版本强依赖 **目标数据仍在 L1 cache**。论文附录显示，L1 中的 enclave secret 可稳定读出；同样数据落到 L2 后，实验成功率直接降到 0。

## 实践案例

### 案例 1：最小 Foreshadow 读字节流程

```c
for (i = 0; i < 256; i++) clflush(&oracle[i * 4096]);  // 先擦掉探测数组
mprotect(secret_page, 4096, PROT_NONE);
value = transient_read(secret_ptr);   // 异常前短暂读到秘密字节
touch(oracle[value * 4096]);          // 把字节编码成“哪一格变热”
// 正式状态回滚后，用 FLUSH+RELOAD 测哪一格最快：
for (i = 0; i < 256; i++) {
  t = timed_reload(&oracle[i * 4096]);
  if (t < threshold) recovered = i;   // 命中的那一格就是秘密字节
}
```

**逐部分解释**：

- 先 `clflush` oracle：没有这一步，旧缓存命中会干扰后面的计时判断
- `mprotect` 让目标页变成 not-present，正常执行最终会 page fault
- `transient_read` 是异常退休前的短窗口，不是合法程序语义上的读取
- `touch(oracle[value * 4096])` 把 0–255 映射到 256 个相隔很远的槽位
- 回滚后用 `timed_reload` 找最快的槽：那一格的下标就是恢复出的字节
### 案例 2：为什么它能避开 SGX abort page 语义

```txt
普通外部读 enclave 页  -> SGX 返回固定 abort 值 -1
先清掉 present bit     -> 先走页表异常路径
异常退休前的瞬态指令    -> 可能看到 L1 中的真实 enclave 字节
```

**逐部分解释**：

- SGX 原本设计了 abort page：外部直接读 enclave，读到的应该只是固定假值
- Foreshadow 利用页表权限和 SGX 检查之间的微架构时序差
- 这不是“软件权限写错”，而是 CPU 实现里权限检查和数据使用之间有竞态
- 这也是它比普通 SGX cache attack 更可怕的原因：victim 代码不需要按 secret 分支

### 案例 3：从一个缓存脚印变成 attestation 失效

```txt
LE/QE 调用 egetkey
攻击者精确打断 enclave
Foreshadow 读出 128-bit key
伪造 launch token 或 remote quote
```

**逐部分解释**：

- Launch Enclave（LE）负责生成允许 enclave 启动的 token
- Quoting Enclave（QE）负责把本地 attestation report 签成远端可验证的 quote
- 论文用页错误状态机把 LE/QE 打断在密钥刚生成、还没擦除的窗口
- 实验中 LE 的 128-bit launch key 通过 13 次 page fault 从单次运行中读出，QE 的 report / provisioning seal key 通过 14 次 page fault 读出
- 一旦 QE 相关密钥泄露，攻击者就能伪造远程证明，让远端相信假的 enclave 运行结果

## 踩过的坑

1. **把 SGX 当成“内存加密就完事”**：MEE 保护主存里的密文，不保护 L1 cache 里的明文瞬态痕迹。

2. **以为 KPTI 能顺手修掉 Foreshadow**：KPTI 主要减少用户态页表里的内核映射；SGX enclave 本来就在宿主进程地址空间里，防线不同。

3. **把 Spectre gadget 和 Foreshadow 混在一起**：Spectre 常要诱导 victim 执行某段泄密 gadget；Foreshadow 更接近 Meltdown，不要求 victim enclave 有特定代码路径。

4. **忽略 L1 条件**：Foreshadow 对 SGX secret 的核心窗口很窄，攻击工程重点是让 secret 进 L1、留在 L1、趁它还热时测出来。

5. **只看保密性，不看完整性**：泄露 attestation / sealing key 后，攻击者不只是读秘密，还能伪造报告和篡改 sealed storage 的信任语义。

## 适用 vs 不适用场景

**适用**：

- 理解 SGX、TEE、远程证明为什么需要把微架构也纳入威胁模型
- 分析 Meltdown 型 transient execution 如何突破非内核边界
- 解释 L1 Terminal Fault、L1 cache flush、HyperThreading 隔离这些缓解策略的来源
- 复盘 2018 年硬件安全披露如何影响云上机密计算和 DRM 场景

**不适用**：

- 不适合当作今天直接复现攻击的操作手册：现代 CPU 微码、系统补丁和 SGX 状态都已变化
- 不适合说明所有 SGX 攻击：Plundervolt、LVI、SgxPectre 的机制不同
- 不适合证明 TEE 模型本身失败：论文明确说问题在具体微架构实现，不是“enclave 概念必然错”
- 不适合替代应用层侧信道防护：页表轨迹、分支、cache pattern 仍然需要单独治理

## 历史小故事（可跳过）

- **2013 年**：Intel 公开 SGX 指令和软件模型，让“不要信任操作系统”的 enclave 模型进入 x86 主流。
- **2016 年**：[[costan-sgx-explained-2016]] 系统拆解 SGX，提醒大家直接读写隔离不等于消除所有侧信道。
- **2018 年 1 月**：Meltdown / Spectre 公开，行业第一次大规模意识到 CPU 瞬态执行会跨越软件边界泄密。
- **2018 年 1 月**：Foreshadow 两组团队分别向 Intel 披露，后来被 Intel 归入 L1 Terminal Fault，SGX 场景对应 CVE-2018-3615。
- **2018 年 8 月**：论文公开，重点结果是抽取 Intel 自己的 Launch Enclave 和 Quoting Enclave 密钥。
- **之后**：SGX 生态进入“机密计算可用，但必须默认面对侧信道”的阶段，后续又出现 SGAxe、LVI 等延伸攻击。

## 学到什么

1. **硬件隔离也要问“明文在哪里出现过”**：SGX 把主存加密了，但运算必须在 CPU 内部以明文进行，缓存就是关键暴露面。

2. **架构状态正确不等于微架构状态安全**：异常回滚了寄存器，不代表缓存、TLB、分支预测器也恢复到“没发生过”。

3. **信任链最怕根密钥泄露**：普通应用 secret 泄露是局部事故；attestation key 泄露会让远端验证机制整体失真。

4. **防御要跨层设计**：只让 enclave 开发者“写得更安全”不够，CPU 微码、调度、缓存清理和云平台隔离都要参与。

5. **安全边界不是文档承诺，而是实现细节**：SGX 文档承诺外部读不到 enclave 明文，Foreshadow 说明实现里的瞬态窗口也必须被算进承诺。

## 延伸阅读

- 论文 PDF：[Foreshadow: Extracting the Keys to the Intel SGX Kingdom](https://foreshadowattack.eu/foreshadow.pdf)
- 项目页：[foreshadowattack.eu](https://foreshadowattack.eu/) —— 披露说明、FAQ 和补丁背景
- [[lipp-meltdown-2018]] —— Foreshadow 继承的 Meltdown 型“权限检查竞态”思路
- [[kocher-spectre-2019]] —— 同期推测执行攻击，帮助区分 Spectre gadget 和 Foreshadow/L1TF
- [[sgx-2013]] —— SGX 指令、enclave、attestation 的原始公开设计
- [[costan-sgx-explained-2016]] —— 读 Foreshadow 前最好的 SGX 背景材料

## 关联

- [[sgx-2013]] —— Foreshadow 攻击的目标就是 SGX 的 enclave 隔离和 attestation 机制
- [[costan-sgx-explained-2016]] —— 先解释 SGX 保护什么，Foreshadow 再展示它没保护哪些微架构痕迹
- [[lipp-meltdown-2018]] —— Foreshadow 使用相似的 transient out-of-order 访问控制竞态
- [[kocher-spectre-2019]] —— 同属 2018 年推测执行安全风暴，但攻击触发方式不同
- [[haven-2014]] —— Haven 这类云上机密计算系统依赖 SGX，Foreshadow 直接影响其威胁模型
- [[saltzer-schroeder-1975]] —— “公共机制越少越好”的老原则在共享 L1 cache 上再次应验

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[kocher-spectre-2019]] —— Spectre — CPU 猜错路时也会泄密
- [[lipp-meltdown-2018]] —— Meltdown — 从用户态读到内核内存的硬件漏洞

---
title: 以太坊智能合约攻击综述 — 12 类漏洞的首次系统分类
来源: 'Atzei, Bartoletti & Cimoli, "A Survey of Attacks on Ethereum Smart Contracts", POST 2017'
日期: 2026-06-06
分类: 安全与隐私
子分类: 安全与隐私
难度: 中级
---

## 是什么

这篇论文是**以太坊智能合约安全领域的奠基性综述**，由萨丁尼亚大学三位学者于 2016 年发表预印本、2017 年 POST 会议正式发表。日常类比：想象你把存折放进一台自动贩卖机，机器的代码决定钱怎么流——但如果代码写错了，旁边站着的人可以悄悄把你的钱全取走，而你完全看不出来。

智能合约就是这种"把钱直接锁进代码"的程序：合约一旦部署就无法修改，也不需要任何机构担保，任何人都可以调用它。这让合约既强大，又危险——一行写错的代码可能让几千万美元在几分钟内蒸发。

本文梳理了12类漏洞，按三个层级分类：**Solidity 语言层**（你写代码时埋的坑）、**EVM 字节码层**（编译器带来的风险）、**区块链层**（公链本身的特性带来的问题）。对每类漏洞，作者给出了真实攻击案例，并在测试网复现了所有攻击。

## 为什么重要

不理解这篇论文，下面这些事都没法解释：

- 为什么 2016 年"DAO 攻击"能在几十分钟内盗走约 6000 万美元——这直接引发了以太坊历史上最具争议的硬分叉
- 为什么 Solidity 代码"看起来正确"却在链上行为异常——send/call 的异常处理逻辑和你想象的完全不同
- 为什么 Parity 多签钱包被攻击了**两次**，每次原因不同，加起来损失超过 1.8 亿美元
- 为什么后来所有 Solidity 安全审计工具（Oyente、Mythril、Slither）的漏洞类型都能追溯到本文的分类体系

## 核心要点

本文的三级漏洞分类法可以用一句话总结：**写代码的人、编译的机器、公链本身，都可以是漏洞的来源**。

1. **Solidity 语言层（你写代码时的陷阱）**：共 6 类。最危险的是**重入攻击（Reentrancy）**——合约先把钱转出去，再更新内部余额，而收款方的 fallback 函数趁机在余额更新前反复调用你的合约提款。其次是**异常无序处理（Exception Disorder）**：通过 `call` 调用时被调方抛出异常不会自动回滚调用方，调用方必须手动检查返回值，但绝大多数开发者不知道这一点。

2. **EVM 字节码层（编译器带来的风险）**：共 3 类。最有名的是**调用栈深度限制（Stack Size Limit）**：EVM 最多支持 1024 层调用栈，攻击者可以预先用递归调用把栈堆到 1023 层，再触发受害合约的关键操作，让最后一次调用失败——若受害者没检查返回值，攻击就得手了。这个漏洞在 2016 年 EIP-150 硬分叉中被修复。

3. **区块链层（公链特性带来的不确定性）**：共 3 类。代表是**不可预测状态（Unpredictable State）**：你发出的交易到真正上链可能经过几十秒，矿工可以重排交易顺序，合约状态可能已经变了；以及**随机数生成问题**：矿工控制着区块哈希，而很多合约用区块哈希当随机数种子，这给矿工留了操纵空间。

## 实践案例

### 案例 1：The DAO 攻击——重入漏洞导致 6000 万美元损失

DAO 是 2016 年最大的众筹智能合约，锁定了超过 1.5 亿美元等值 ETH。其 `splitDAO` 函数的伪逻辑如下：

```solidity
// 漏洞版本（重入攻击受害者）
function withdraw(uint amount) {
    if (balance[msg.sender] >= amount) {
        // 先把钱打给调用者
        msg.sender.call.value(amount)();   // ← 触发攻击者的 fallback
        // fallback 里再调 withdraw，此时 balance 还没改！
        balance[msg.sender] -= amount;     // ← 这行来不及跑
    }
}
```

攻击者在自己的合约 fallback 函数里递归调用 `withdraw`：在第一笔转账完成后、余额清零前，fallback 被触发，再次取款——如此循环直到 DAO 合约被榨干。修复方法是"先改状态再转账"（Checks-Effects-Interactions 模式）：

```solidity
// 修复版
function withdraw(uint amount) {
    require(balance[msg.sender] >= amount);
    balance[msg.sender] -= amount;  // 先扣余额
    msg.sender.transfer(amount);    // 再转账
}
```

### 案例 2：Parity 多签钱包——delegatecall 让库合约变成了攻击入口

Parity 多签钱包通过 `delegatecall` 把逻辑委托给一个库合约。库合约有一个 `initWallet` 函数，本来只应该在钱包创建时调用一次，但没有添加"只能调用一次"的防护：

```solidity
// 库合约（被攻击者盯上的函数）
function initWallet(address[] _owners, uint _required) {
    // 没有检查是否已初始化！
    owners = _owners;   // 攻击者把自己设为 owner
    required = _required;
}
```

攻击者直接调用库合约的 `initWallet`，把自己设为所有者，然后调用 `execute` 提走所有资金。第二次 Parity 事故更诡异：另一个攻击者调用 `initWallet` 后误操作调用了 `kill`，导致库合约自毁——而所有依赖这个库的多签钱包里的 ETH（约 51.4 万枚）从此永久冻结，无人能取出。

### 案例 3：用自动化工具检测本文分类的漏洞

本文发表后催生了一批静态分析工具，以 Oyente 为代表：

```bash
# 安装并用 Oyente 扫描合约字节码
pip install oyente
oyente -s MyContract.sol

# 典型输出示例
# [*] Callstack Depth Attack Vulnerability: True
# [*] Reentrancy Vulnerability: True
# [*] Transaction-Ordering Dependency: False
```

工具的漏洞分类直接对应本文的 taxonomy。现代的 Slither（Trail of Bits 出品）更进一步，把本文的每类漏洞都实现为独立 Detector，可以在 CI 流水线里自动拦截有问题的合约。

## 踩过的坑

1. **误以为 `private` 字段真的保密**：Solidity 的 `private` 仅阻止其他合约直接读取，但区块链是公开的——设置这个字段的交易内容本身就在链上可查，任何人都能读到你"私有"的数值。

2. **忽视 `send`/`call` 的返回值**：`send` 失败时不抛出异常，只返回 `false`；如果调用方不检查返回值，会误以为转账成功后继续执行，导致合约状态与实际余额不一致。

3. **相信 `block.timestamp` 是"安全随机数"**：矿工在一定范围内可以操纵区块时间戳，依赖时间戳生成随机数的合约（如抽奖合约）可以被矿工在获利方向上微调——损失不大但让"公平性"破产。

4. **忘记合约部署后无法升级**：开发者常把漏洞修复寄希望于"上线后再打补丁"——但智能合约一旦部署就永久不可变。本文描述的 DAO 攻击之所以只能靠硬分叉收场，正是因为代码无法直接修改。

## 适用 vs 不适用场景

**适用**：

- 审计 Solidity 合约时需要系统性漏洞检查清单
- 理解 The DAO / Parity 等历史事件的技术根因
- 学习以太坊智能合约安全编码规范的出处与理由
- 搭建或评估自动化合约安全扫描工具的覆盖范围

**不适用**：

- 作为最新漏洞参考——2016 年后又出现了 flash loan、price oracle manipulation、MEV 等新型攻击，本文没有覆盖
- 直接照搬代码修复方案——Solidity 版本迭代快，部分漏洞已在语言层修复（如 EIP-150 修了调用栈攻击），旧的修复建议未必适用于最新编译器

## 历史小故事（可跳过）

- **2015 年 7 月**：以太坊主网上线，Solidity 成为编写智能合约的主流语言，但安全文档极度匮乏，漏洞知识散落在论坛帖子和 GitHub issue 里。
- **2016 年 6 月**：The DAO 攻击爆发，攻击者在 3 小时内利用重入漏洞提走约 360 万 ETH（约合 6000 万美元），震惊加密货币社区。
- **2016 年 7 月**：以太坊社区激烈辩论后，以 85% 支持率通过硬分叉提案，强制回滚攻击交易——反对者拒绝升级，另起炉灶形成 Ethereum Classic（ETC）链。
- **2016 年 10 月**：本文作者以 IACR ePrint 预印本形式发布，首次给出系统性漏洞分类，并在意大利萨丁尼亚实验室的 testnet 上复现所有攻击。
- **2017 年 7 月**：Parity 多签钱包第一次被攻击，损失约 3000 万美元；同年 11 月第二次事故冻结 1.5 亿美元，让"不可升级"的代价被写进了区块链历史。
- **2017 年**：本文在 POST（Principles of Security and Trust）会议正式发表，引用量持续增长，成为后续 Oyente、Mythril、Manticore、Slither 等工具论文的必引文献。

## 学到什么

1. **安全漏洞有层次**：编程语言设计缺陷、运行时（EVM）行为、公链不确定性是三个独立的漏洞来源，审计时必须逐层考虑
2. **"代码即法律"是双刃剑**：合约自动执行无需信任，但也意味着 bug 无法修复——上线前的审计比任何其他软件都更关键
3. **重入攻击的防御只需一条原则**：Checks-Effects-Interactions——先检查条件，再改状态，最后才做外部调用；这条规则在 2017 年之后成为 Solidity 编码的铁律
4. **一篇综述可以定义一个领域**：本文发表时既没有提出新理论，也没有新的实现，但系统整理了散落的安全知识——这让它成为整个以太坊安全社区的共同语言

## 延伸阅读

- 原始论文 PDF：[IACR ePrint 2016/1007](https://eprint.iacr.org/2016/1007.pdf)（25 页，包含完整攻击代码）
- Oyente 工具论文：Luu et al., "Making Smart Contracts Smarter", CCS 2016（符号执行自动检测本文分类的漏洞）
- Slither 工具：[Trail of Bits Slither](https://github.com/crytic/slither)（生产级 Solidity 静态分析，直接引用本文分类）
- Ethereum Foundation 安全考量文档：[Solidity Security Considerations](https://docs.soliditylang.org/en/latest/security-considerations.html)（官方编码规范，大量内容源自本文）
- 视频解说：[Smart Contract Security Playlist — Ethereum Foundation DevCon](https://www.youtube.com/c/EthereumFoundation)（多位讲者重现 DAO 攻击流程）
- [[bitcoin]] —— 以太坊的区块链底层技术继承自比特币

## 关联

- [[bitcoin]] —— 以太坊在比特币区块链基础上加入图灵完备合约执行，本文漏洞部分来自这一扩展带来的复杂性
- [[bitcoin-core]] —— Bitcoin Core 同样面临脚本层安全问题，但脚本语言非图灵完备，避免了绝大多数本文所述漏洞
- [[aes]] —— AES 对称加密保护链下通信，但智能合约本身暴露在公链上，密码学无法解决本文所述的链上逻辑漏洞
- [[cryptoverif-2008]] —— CryptoVerif 等形式化验证工具的思路与本文的漏洞分类形成互补：本文告诉你什么地方会出错，形式化验证尝试数学证明它不会出错

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

（暂无反向链接）


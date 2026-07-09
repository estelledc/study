---
title: Making Smart Contracts Smarter — Oyente 用符号执行给智能合约找漏洞
来源: 'Luu, Chu, Olickel, Saxena & Hobor, "Making Smart Contracts Smarter", ACM CCS 2016'
日期: 2026-05-29
分类: security-privacy
难度: 中级
---

## 是什么

Making Smart Contracts Smarter 是一篇早期智能合约安全论文，它提出了 **Oyente**：一个把 Ethereum 合约字节码拿来做符号执行、自动标出潜在漏洞的分析器。

日常类比：智能合约像一台投币后自动工作的售货机。普通测试是你真的投几枚硬币看它出不出货；Oyente 像在机器图纸上把每条齿轮路径都推一遍，问：“如果有人按这个顺序投币、断电、再按退币键，会不会吐出不该吐的钱？”

论文的核心不是“合约一定有 bug”，而是指出：链上程序的环境很特殊，交易顺序、时间戳、外部调用和异常传播都能被攻击者利用。于是安全检查不能只看源码语法，还要理解 EVM 执行语义。

## 为什么重要

不理解这篇，下面这些事都很难解释：

- 为什么 The DAO 攻击让社区意识到“合约正确执行”不等于“合约安全”。
- 为什么智能合约分析器经常从 EVM bytecode 入手，而不是只扫 Solidity 源码。
- 为什么符号执行适合找 reentrancy、timestamp dependence、异常处理这类路径相关漏洞。
- 为什么后来的 Slither、Mythril、Securify、Foundry fuzzing 都绕不开 Oyente 这条早期路线。

这篇也给了一个很直观的安全观：智能合约一旦部署，错误会和资金一起留在链上，所以“上线前多找一次坏路径”比普通后端服务更值钱。

## 核心要点

1. **把输入变成未知数**。类比：不是只试“张三转 1 ETH”，而是把转账金额、调用者、区块时间都写成 `x`。Oyente 沿着合约分支走，收集每条路径需要满足的条件。

2. **把路径条件交给求解器**。类比：侦探把线索写成方程，让数学老师帮忙找一组能成立的值。比如“时间戳能否被矿工轻微调整后改变开奖结果”，就能转成约束问题。

3. **用漏洞模式筛结果**。类比：体检不是只拍片，还要按“骨折、炎症、肿块”清单看。Oyente 在符号执行结果上检查 reentrancy、timestamp dependence、mishandled exception、transaction-ordering dependence 等模式。

三步合起来：**EVM 字节码 → 控制流图 → 符号执行 → 求解器 → 漏洞报告**。

## 实践案例

### 案例 1：重入为什么是“先开门后记账”

```solidity
function withdraw(uint amount) public {
    require(balance[msg.sender] >= amount);
    msg.sender.call{value: amount}("");
    balance[msg.sender] -= amount;
}
```

逐部分解释：

- 第 2 行确认余额够，像柜台先看账户。
- 第 3 行把钱转给调用者；如果调用者是合约，它能在 fallback 里再次调用 `withdraw`。
- 第 4 行才扣账，太晚了；第二次进来时余额还没减少。
- Oyente 会关注“外部调用前后，关键状态有没有先更新”这种路径形状。

安全直觉：先改自己的账本，再把控制权交给别人。

### 案例 2：时间戳依赖为什么像用天气预报开奖

```solidity
function lucky() public view returns (bool) {
    return block.timestamp % 10 == 0;
}
```

逐部分解释：

- `block.timestamp` 不是用户输入，但矿工在允许范围内有一点调整空间。
- 如果输赢、发奖、清算依赖它的最后一位，攻击者可能等到有利区块再发交易。
- Oyente 会把时间戳当作符号值，检查结果是否随它变化。
- 这类问题不是“时间戳不能用”，而是不能把它当强随机源或绝对公平裁判。

安全直觉：墙上的钟可以参考，不能拿来抽奖分钱。

### 案例 3：异常没处理，程序会以为钱已经到了

```solidity
function pay(address winner, uint prize) public {
    bool ok = winner.send(prize);
    paid[winner] = true;
}
```

逐部分解释：

- `send` 失败时返回 `false`，不一定让整笔交易自动回滚。
- 代码把返回值存在 `ok`，却没有检查它。
- 第 3 行仍把 `paid` 标成 true，系统从此以为奖金已发。
- Oyente 的 mishandled exception 检查，就是找这种“调用失败但状态继续前进”的路径。

安全直觉：快递单号生成了，不等于包裹真的送到。

## 踩过的坑

1. **把 Oyente 当成完整审计工具**：它能找典型坏路径，但不能理解所有业务规则，报告通过也不代表合约安全。

2. **忽略误报**：符号执行会保守建模外部世界，某些“理论可行路径”在真实业务约束下可能走不到，需要人工复核。

3. **只看 Solidity 源码**：合约最终执行的是 EVM bytecode，编译器优化、库链接和低级调用都会改变真实检查对象。

4. **把时间戳问题等同于所有随机数问题**：timestamp dependence 只是链上随机性风险的一种，真正安全的随机数还要看 commit-reveal、预言机或 VRF。

## 适用 vs 不适用场景

**适用**：

- 部署前扫描旧式 Solidity / EVM 合约，先找出明显危险路径。
- 学习智能合约安全，建立“状态更新、外部调用、异常传播、区块环境”的基本 checklist。
- 给审计人员做初筛，把人工时间集中到高风险函数。
- 研究符号执行如何落到真实虚拟机，而不是只停留在教科书例子。

**不适用**：

- 想证明合约完全正确；Oyente 是 bug finder，不是完整形式化证明器。
- 需要理解复杂金融不变量，比如“抵押率永远足够”或“AMM 曲线不会被破坏”。
- 大量依赖链下服务、预言机、跨链消息的协议；单合约 bytecode 看不完整系统行为。
- 现代合约的所有风险；Solidity、EVM、库和开发规范已经比 2016 年变化很多。

## 历史小故事（可跳过）

- **2015 年**：Ethereum 主网上线，智能合约从概念变成真实托管资金的程序。
- **2016 年 6 月**：The DAO 攻击发生，约 6000 万美元资产被转走，社区最终选择硬分叉处理。
- **2016 年 10 月**：Making Smart Contracts Smarter 在 ACM CCS 发表，系统展示 Oyente 和若干真实案例。
- **论文实验**：作者扫描 19,336 个现有 Ethereum 合约，Oyente 标出 8,833 个潜在脆弱合约。
- **之后几年**：Mythril、Securify、Slither、SmartCheck 等工具继续发展，智能合约安全从“事故复盘”变成标准上线流程。

这段历史说明：工具不是从课堂里突然冒出来的，而是被真金白银的事故逼出来的。

## 学到什么

- 智能合约漏洞常常不是“语法错”，而是执行环境和开发者直觉不一致。
- 符号执行的价值在于系统地枚举路径，再把“有没有坏输入”交给求解器。
- Oyente 的贡献是把这个方法落到 EVM bytecode，并把结果连到具体安全模式。
- 自动分析器最适合做早期筛查，真正上线还要结合人工审计、测试、形式化规格和成熟库。

一句话记忆：Oyente 像上线前的自动验钞机，能先扫出一批明显假币，但不能替代银行风控。

## 延伸阅读

- 论文页面：[IACR ePrint 2016/633](https://eprint.iacr.org/2016/633) —— 作者、BibTeX、摘要和 PDF 链接都在这里。
- 出版页面：[ACM DOI 10.1145/2976749.2978309](https://dl.acm.org/doi/10.1145/2976749.2978309) —— CCS 2016 版本，页码 254-269。
- 视频：[Hrishi Olickel — ACM CCS 2016 talk](https://www.youtube.com/watch?v=EIEB_FKZLEE) —— 作者之一讲 Oyente 背景。
- 工具仓库：[ethereum/oyente](https://github.com/enzymefinance/oyente) —— 早期工具代码，可看架构但不要直接当现代生产标准。
- 事故复盘：[The DAO 攻击概述](https://blog.chain.link/reentrancy-attacks-and-the-dao-hack/) —— 理解 reentrancy 为什么改变行业。

## 关联

- [[cadar-klee-2008]] —— KLEE 是通用程序符号执行代表，Oyente 把类似思想搬到 EVM。
- [[z3-2008]] —— Oyente 这类工具背后需要 SMT 求解器判断路径条件能否成立。
- [[go-ethereum]] —— 合约最终在以太坊客户端实现的 EVM 语义里执行。
- [[openzeppelin-contracts]] —— 把防重入、权限、暂停等事故经验沉淀成可复用库。
- [[foundry]] —— 现代合约开发常用 fuzz / invariant 测试，与 Oyente 的符号执行形成互补。
- [[bitcoin]] —— 区块链账本的起点；Ethereum 在此基础上加入通用合约，攻击面随之扩大。
- [[atzei-eth-attacks-2017]] —— 后续 survey 把 Ethereum 攻击分层分类，能和 Oyente 的检测模式对照。

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

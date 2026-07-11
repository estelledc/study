---
title: Securify 2018 — 用规则自动查智能合约漏洞
来源: 'Tsankov et al., "Securify: Practical Security Analysis of Smart Contracts", CCS 2018'
日期: 2026-07-09
分类: security-privacy
难度: 中级
---

## 是什么

Securify 是一个**自动分析以太坊智能合约是否安全**的静态分析系统。日常类比：你把一份租房合同交给懂法务的审稿工具，它不会真的去租房试错，而是先拆条款、找依赖关系，再按"危险条款清单"和"合规条款清单"逐条判断。

在智能合约里，"试错"很贵：代码一旦部署到链上，漏洞可能直接变成真钱损失。Securify 的目标不是替代人工审计，而是先把大量合约筛成三类：能证明安全、能证明违规、暂时说不准。

它的核心组合是：**依赖图 + Datalog 规则 + compliance / violation patterns**。依赖图告诉你某条写入是否受调用者控制；Datalog 负责自动推出事实；patterns 则把安全专家的经验写成可执行规则。

一句话：Securify 是 Oyente 之后更可扩展的一类智能合约静态分析系统，它用规则证明"一定安全"或"一定不安全"，而不是只给一堆可能的告警。

## 为什么重要

不理解 Securify，下面这些事都没法解释：

- 为什么智能合约安全工具不只是"跑测试"——链上代码要考虑所有可能交易和所有用户。
- 为什么 Oyente / Mythril 这类符号执行工具会漏掉路径——路径爆炸和 SMT 约束太难会让覆盖率下降。
- 为什么静态分析报告里同时会有 compliance、violation、warning 三种结果——它们代表"证明安全"、"证明不安全"、"没证明出来"。
- 为什么 Datalog 能用于安全分析——它适合表达"如果 A 依赖 B，B 又依赖 C，那么 A 也可能依赖 C"这种传递规则。

## 核心要点

Securify 的工作流可以拆成 **三步**：

1. **把 EVM 字节码翻译成人能分析的形状**。EVM 原本像一叠盘子，push / pop 都在栈上操作；Securify 先反编译成 SSA 形式，让每个中间值有名字。类比：先把口头流水账整理成表格。

2. **用 Datalog 推 semantic facts**。semantic facts 是"这条写入可能依赖 caller""这个变量等于 0"这类事实。类比：从快递记录里自动推导"包裹经过了哪些仓库"。

3. **匹配 compliance / violation patterns**。compliance pattern 是安全的充分条件，violation pattern 是违规的充分条件。类比：体检报告里有"明确健康""明确异常""还要复查"，warning 就是复查。

这三步让 Securify 同时追求两件事：覆盖所有合约行为，且让安全专家能继续加新规则。

## 实践案例

### 案例 1：任何人都能改 owner

```solidity
address owner;

function initWallet(address newOwner) public {
    owner = newOwner;
}

function withdraw(uint amount) public {
    require(msg.sender == owner);
    owner.transfer(amount);
}
```

**逐部分解释**：

- `owner` 是安全关键字段，应该只在初始化时被可信路径写入。
- `initWallet` 是 `public`，如果没有额外限制，任何用户都能调用。
- Securify 会看 `owner = newOwner` 对应的 `sstore` 是否依赖 `caller`。
- 如果这条写入不依赖 `caller`，violation pattern 命中：任何人都有机会把 owner 改成自己。

### 案例 2：外部调用之后又写状态

```solidity
function withdraw(uint amount) public {
    msg.sender.call.value(amount)("");
    balances[msg.sender] = 0;
}
```

**逐部分解释**：

- `call` 会把控制权交给外部地址，对方可能回调当前合约。
- 如果在 `call` 之后才清零余额，就可能出现重入攻击。
- Securify 的 "no writes after calls" 检查会找 `call` 之后的 `sstore`。
- violation 表示它能证明危险顺序存在；compliance 表示它能证明没有这种危险顺序。

### 案例 3：低级调用返回值没检查

```solidity
function pay(address to, uint amount) public {
    bool ok = to.call.value(amount)("");
    // 忘了检查 ok
}
```

**逐部分解释**：

- 低级 `call` 不会自动抛错，它只返回一个布尔值。
- 如果代码没有根据 `ok` 走不同分支，失败转账可能被当成成功。
- Securify 会检查 `call` 后面的控制流是否依赖返回码。
- 如果不依赖，handled exception 的 violation pattern 会命中。

## 踩过的坑

1. **pattern 不是完整业务语义**——它只能证明某个充分条件，不知道"这个字段业务上是否本来就允许所有人写"。

2. **warning 不是漏洞也不是安全**——warning 只表示 compliance 和 violation 都没匹配上，需要人继续看。

3. **Securify 早期不擅长数值属性**——论文版本明确说不处理 overflow 这类数值性质，后续需要接数值抽象域。

4. **可达性假设会影响解释**——它把匹配到的指令当作可达来建立形式对应；真实合约里若有死代码，报告要结合上下文读。

## 适用 vs 不适用场景

**适用**：

- 大批量扫描以太坊 EVM 字节码，先找明显安全和明显危险的点。
- 安全审计前置筛查，把人工注意力放到 warning 和 violation 上。
- 想把新漏洞经验沉淀成可复用规则的团队。
- 需要分析数据依赖、控制依赖、存储写入、外部调用顺序的合约问题。

**不适用**：

- 证明任意业务规则完全正确，例如"拍卖价格一定符合产品规则"。
- 处理纯数值漏洞，例如整数溢出、舍入误差、复杂算术边界。
- 替代人工审计，尤其是合约特定权限模型和经济模型。
- 要找某条具体交易输入的最短攻击路径，这更像符号执行或 fuzzing 的任务。

## 历史小故事（可跳过）

- **2016 年**：The DAO 攻击让智能合约重入问题出圈，"代码即法律"第一次被现实狠狠教育。
- **2016 年**：Oyente 用符号执行分析以太坊合约，是早期代表工具，但会遇到路径覆盖问题。
- **2017 年**：Parity 钱包两次事故造成约 3000 万美元被盗、约 2.8 亿美元被冻结，权限和库合约风险暴露。
- **2018 年**：Securify 在 CCS 发表，把"证明安全 / 证明违规 / warning"作为清晰输出接口。
- **之后**：智能合约分析逐渐分流成静态分析、符号执行、形式化验证、fuzzing、运行时监控多条路线。

## 学到什么

1. **安全分析不一定要枚举路径**——抽象解释可以合并路径，牺牲部分精度换覆盖所有行为。

2. **好的工具输出要分层**——violation、compliance、warning 比单一"有风险"更适合审计工作流。

3. **Datalog 是把专家经验工程化的胶水**——规则写得清楚，求不动点交给成熟 solver。

4. **静态分析的价值是减少人工分类量**——论文报告平均 55.5% 指令证明安全、29.3% 证明违规、15.2% 留作 warning。

## 延伸阅读

- 论文 PDF：[Securify: Practical Security Analysis of Smart Contracts](https://files.sri.inf.ethz.ch/website/papers/ccs18-securify.pdf)（CCS 2018）
- arXiv 页面：[arXiv:1806.01143](https://arxiv.org/abs/1806.01143)（LightRead 搜索命中版本）
- 相关背景：[[bitcoin]] —— 先理解链上账本为什么让合约漏洞变成真实资产风险
- 相关工具：[[souffle-datalog]] —— Securify 使用 Datalog solver 推 semantic facts
- 理论根基：[[cousot-abstract-interpretation]] —— Securify 本质上是面向合约的抽象解释器

## 关联

- [[bitcoin]] —— Bitcoin 解决去中心化账本，Ethereum 在此基础上把"账本"扩展成"可执行合约"。
- [[go-ethereum]] —— Geth 是以太坊主流客户端，Securify 分析的 EVM 字节码最终就在这类客户端里执行。
- [[cousot-abstract-interpretation]] —— Securify 通过抽象解释覆盖所有可能行为，而不是一条条跑路径。
- [[souffle-datalog]] —— Securify 用 Datalog 表达依赖推理，Souffle 是这类分析常用求解器。
- [[avgustinov-codeql-2016]] —— CodeQL 也把程序事实变成可查询关系，和 Securify 的规则化思路相近。
- [[newsome-taintcheck-2005]] —— TaintCheck 追踪数据污染，Securify 追踪 caller / storage / call 返回值依赖。

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

（暂无反向链接）

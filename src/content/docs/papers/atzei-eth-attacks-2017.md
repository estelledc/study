---
title: Atzei Ethereum Attacks 2017 — 给智能合约漏洞做三层分类
来源: 'Atzei, Bartoletti & Cimoli, "A Survey of Attacks on Ethereum Smart Contracts (SoK)", POST 2017'
日期: 2026-05-29
分类: security-privacy
难度: 中级
---

## 是什么

这篇论文是一张**早期 Ethereum 智能合约安全地图**：它把常见漏洞按 Solidity、EVM、区块链三层整理出来，再用真实或仿真的攻击说明这些坑怎么把钱偷走、锁住或转错。

日常类比：普通程序像写一个店铺收银系统，出 bug 还能关门修；智能合约像把自动售货机焊死在广场上，投币口、找零逻辑和维修记录都公开，坏了也不能偷偷补丁。

论文的重点不是发明一个新检测工具，而是回答一个更基础的问题：**为什么看起来正常的合约，会在链上变成攻击入口？**

## 为什么重要

不理解这篇，下面这些事都很难解释：

- 为什么 DAO 攻击不是“黑客改了链”，而是合约自己按错误顺序把钱转出去了。
- 为什么 `private` 在 Solidity 里不等于“秘密”，链上交易记录仍然能被所有人看见。
- 为什么 `send`、`call`、`delegatecall` 这些“转钱/调用”工具，比普通函数调用危险得多。
- 为什么智能合约安全不能只靠“矿工会正确执行”，还必须保证**被正确执行的代码本身没坑**。

## 核心要点

1. **三层分类**：漏洞来源被分到 Solidity、EVM bytecode、Blockchain 三层。类比：房子漏水可能是水龙头、管道，也可能是地基；修错层就会治标不治本。

2. **攻击来自语义差**：很多漏洞不是“语法写错”，而是程序员以为它像 JavaScript，实际 EVM 的异常、gas、回调、交易排序都不一样。类比：同样写“快递已送达”，有的平台代表签收，有的平台只代表到驿站。

3. **不可修改放大后果**：合约部署后难以直接补丁，错误会和资金一起留在链上。类比：合同刻在石碑上，发现错字时，已经有人按错字索赔了。

## 实践案例

### 案例 1：先转钱再记账，为什么会被重入

```solidity
function withdraw(uint amount) public {
    require(credit[msg.sender] >= amount);
    msg.sender.call{value: amount}("");
    credit[msg.sender] -= amount;
}
```

**逐部分解释**：

- 第 2 行检查余额，像银行柜台先看你账户够不够。
- 第 3 行把钱转给调用者；如果调用者是合约，它的 fallback 可能立刻反过来再调用 `withdraw`。
- 第 4 行才扣账，太晚了；第二次进来时账本还没变，于是同一笔余额能被重复领取。

安全写法的第一步是“先改自己账本，再把钱交出去”，也就是后来常说的 checks-effects-interactions。

### 案例 2：`send` 失败但不报大错，钱会悄悄留在原地

```solidity
function pay(address winner, uint prize) public {
    winner.send(prize);
    paid[winner] = true;
}
```

**逐部分解释**：

- `send` 只给接收方很少 gas；如果接收方 fallback 稍微做点事，就可能失败。
- 失败时 `send` 返回 `false`，但不会自动让整笔交易回滚。
- 代码没检查返回值，却把 `paid[winner]` 标成 true，系统从此以为“奖金已发”。

论文用 King of the Ether Throne 说明：一个看似公平的“让位给新国王”游戏，会因为补偿旧国王失败而变成拒绝服务或偷留资金。

### 案例 3：`private` 变量不是保险箱

```solidity
uint private secretNumber;

function play(uint n) public payable {
    secretNumber = n;
}
```

**逐部分解释**：

- `private` 只是不让别的 Solidity 合约直接读这个字段。
- 但设置它的交易参数会写进公开链，任何人都能看交易输入。
- 如果游戏规则依赖“别人不知道我的数字”，攻击者可以先看第一名玩家的交易，再提交必胜答案。

所以链上保密要用 commitment 这类密码学流程，而不是把字段名改成 `private`。

## 踩过的坑

1. **把 `call` 当普通函数调用**：它可能触发陌生合约的 fallback，让控制权临时交给攻击者。

2. **以为异常会一路回滚**：直接调用和 `call/send/delegatecall` 的异常传播不同，不检查返回值就会误判成功。

3. **把链上状态当实时快照**：交易发出后，矿工排序、别人抢先交易、分叉回滚都会改变你真正执行时看到的状态。

4. **相信部署后还能修**：普通软件有热修复，合约没有天然补丁通道，没预留升级/暂停/迁移方案时只能承受损失。

## 适用 vs 不适用场景

**适用**：

- 给 Solidity 初学者建立“智能合约为什么危险”的第一张地图。
- 审计旧合约或教学案例，尤其是 2016-2017 年风格的 DAO、钱包、游戏、庞氏类合约。
- 设计静态分析工具时，用它的漏洞分类当 checklist。

**不适用**：

- 直接照搬旧 Solidity 语法写现代合约；语言、编译器和常用库已经变化很多。
- 只研究共识层攻击；论文主线是合约代码和执行语义，不是完整 P2P 网络安全。
- 想要一个自动检测器；这篇给分类和案例，真正工具要看 Oyente、Securify、Slither 等后续工作。

## 历史小故事（可跳过）

- **2015 年**：Ethereum 上线，把“链上能跑通用程序”从想法推到生产环境。
- **2016 年 6 月**：DAO 攻击发生，约 6000 万美元资产被转入攻击者控制的子合约，社区最后用硬分叉回滚。
- **2016 年**：IACR ePrint 发布这篇 survey，作者把论坛、文档、论文和实操经验整理成 taxonomy。
- **2017 年**：POST 发表正式版本，成为智能合约安全教学和工具论文常引用的起点。
- **之后几年**：OpenZeppelin、形式化验证、静态分析和新语言设计开始围绕这些坑建立工程规范。

## 学到什么

- 智能合约安全的核心不是“矿工会不会诚实执行”，而是“正确执行一段坏代码也会造成坏结果”。
- 漏洞可以按层定位：Solidity 负责语法和抽象，EVM 负责底层调用和 gas，Blockchain 负责排序、公开性和时间。
- 很多攻击都利用同一个套路：让开发者误以为某一步已经成功、某个状态不会变、某个秘密没人知道。
- 好的安全规范来自事故复盘；这篇把零散事故整理成能复用的检查清单。

## 延伸阅读

- 论文 PDF：[Atzei, Bartoletti & Cimoli 2017](https://link.springer.com/content/pdf/10.1007/978-3-662-54455-6_8.pdf) —— 原文最值得看 taxonomy 表和第 4 节攻击案例。
- [[making-smart-contracts-smarter]] —— Oyente 用符号执行自动找 reentrancy、timestamp、异常处理等模式。
- [[formal-verification-smart-contracts]] —— 把 Solidity/EVM 翻译到 F*，用证明工具检查关键性质。
- [[securify]] —— 后续自动分析器，用 compliance/violation patterns 判断合约行为。
- [[slither-static-analysis]] —— 工程里常用的 Solidity 静态分析框架，适合和这篇的分类对照。

## 关联

- [[go-ethereum]] —— 合约最终在以太坊客户端维护的 EVM 语义里执行。
- [[openzeppelin-contracts]] —— 把 reentrancy guard、权限、升级等经验沉淀成库。
- [[safe-contracts]] —— 多签钱包是“合约管理资产”的典型高风险场景。
- [[uniswap-v3]] —— DeFi 合约持有大量资金，更需要理解调用、状态和重入边界。
- [[fstar]] —— 论文讨论的形式化验证路线之一，能把合约性质写成可检查证明。
- [[souffle-datalog]] —— 程序分析常用 Datalog 表达漏洞模式，能和智能合约静态分析连接。
- [[bitcoin]] —— 区块链不可篡改和公开账本的源头，对照理解 Ethereum 为什么多出合约攻击面。

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->


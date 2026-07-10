---
title: Aragon OSx — 一份内核合约管所有 DAO 的乐高套件
来源: 'https://github.com/aragon/osx'
日期: 2026-05-30
分类: blockchain
难度: 中级
---

## 是什么

Aragon OSx 是一套**用 Solidity 写的 DAO 操作系统**——你用它在以太坊上**部署一个去中心化组织**，组织的金库、投票规则、谁能花钱，全部写进合约代码。日常类比：像**注册一家公司**，但没有工商局——章程贴在公示板上，资金锁在保险柜里，谁能开锁、能开多少、要几个签名都用规则机器执行。

它把一个 DAO 拆成 **三块乐高**：

- **DAO 合约**：组织本身，管金库 + 能执行任意交易（转账 / 调用其他合约）
- **Permission Manager**：组织内核的"门禁系统"——记录每个地址能调哪些函数
- **Plugins**：功能模块——token 投票、多签、成员名单、薪资流，挑你要的装上去

部署一次 DAO 大概 3-5 行代码（用 SDK），完成后这个 DAO 就活在链上，永远跑下去。

## 为什么重要

- 不理解 DAO 这层抽象，你看 Uniswap / MakerDAO / ENS 的"治理提案"都不知道背后到底跑了什么
- 不知道权限内核，你以为多签钱包（Safe）和 DAO 是一回事——实际 DAO 是更上层的"组织 + 治理 + 金库 + 插件"
- 不懂 Plugin 模式，你看到合约升级会觉得"必须重新部署 DAO"——OSx 让你换插件不换 DAO
- 不知道 OSx 和老 aragonOS 的差别，你看到两套 SDK 文档会反复踩混版本的坑

## 核心要点

OSx 的设计可以浓缩成 **三层 + 一根权限内核**：

1. **Framework 层（工厂）**：一群"工厂合约"——`DAOFactory` / `PluginRepoFactory` / `PluginSetupProcessor`。用户调一次工厂，它替你部署 DAO + 装好初始插件。类比：宜家家具的"全屋打包配送"。

2. **Core 层（DAO + 权限）**：每个 DAO 是一份独立合约，里面只有金库管理 + `execute(actions)` 一个核心函数。所有"谁能 execute / 谁能装插件 / 谁能改设置"都问 **Permission Manager** —— DAO 内的唯一门禁。类比：公司只有一本印章使用登记表，盖章前必须查表。

3. **Plugin 层**：功能插件，每个插件是一份合约 + 一份 setup 脚本。装的时候 setup 脚本告诉 DAO "请给我 grant 这几个权限"。类比：手机装 app，安装时弹窗要权限。

总结一句：**DAO = 金库 + 执行器；规则 = 权限表 + 插件**。

## 实践案例

### 案例 1：用 SDK 一键部署一个 token-voting DAO

下面是最小调用骨架，`context` 和 `tokenVotingPluginInstallParams` 按官方 SDK 示例先构好：

```ts
import { Client } from '@aragon/sdk-client'
const client = new Client(context)
const steps = client.methods.createDao({
  metadata: { name: 'MyDAO', description: '...' },
  ensSubdomain: 'mydao',
  plugins: [tokenVotingPluginInstallParams], // 投票插件
})
for await (const step of steps) console.log(step)
```

**逐部分**：

- `createDao` 调底层 `DAOFactory.createDao`
- `plugins` 数组传"装哪些功能"——这里只装一个 token-voting
- `for await` 是因为部署涉及多笔交易（建 DAO + 部署插件 + grant 权限），SDK 把过程切成几步流式吐出

### 案例 2：DAO 执行一笔外部交易

```solidity
// 提案通过后，投票插件调 DAO.execute；target/recipient 换成真实地址
address target = 0x1111111111111111111111111111111111111111;
bytes memory data = abi.encodeWithSignature(
  "transfer(address,uint256)",
  recipient,
  1 ether
);
IDAO.Action[] memory actions = new IDAO.Action[](1);
actions[0] = IDAO.Action({
  to: target,
  value: 0,
  data: data
});
dao.execute(bytes32("payroll-1"), actions, 0);
```

DAO 像一个**多功能遥控器**：传一组 `Action`（去哪、转多少、调什么函数），DAO 一次性帮你全打出去。所有"对外动作"都走这一个入口。

### 案例 3：Permission Manager 临时授权

```solidity
// 给 alice 这个地址授权"可以调 DAO.upgradeTo"
dao.grant(address(dao), alice, dao.UPGRADE_DAO_PERMISSION_ID());
// 用完撤销
dao.revoke(address(dao), alice, dao.UPGRADE_DAO_PERMISSION_ID());
```

权限是 `(where, who, permissionId)` 三元组。撤销和授予对称——这让 DAO 可以临时把某个能力"借"出去，不用永久写死。

## 踩过的坑

1. **老 aragonOS 和 OSx 不兼容**：旧 ANT 持有人迁移要走专门的 ANT Migrator，直接搬合约代码会失败（接口、版本、Kernel 抽象都变了）。看到 2018-2022 的旧文档时务必先确认是否 v1 范式。
2. **插件少 grant 一个权限就 revert，且报错只说 `Unauthorized`**：要逐项查 plugin setup 的 `permissions` 数组确认全装上。新人第一次装多签插件经常漏 `EXECUTE_PROPOSAL_PERMISSION`。
3. **插件升级 setupRef 拼错版本**：`PluginSetupProcessor` 用 `(repo, versionTag)` 定位 setup 脚本，新旧版本拼错会卡住——升级前先 `getVersion` 核对。
4. **投票阈值用 1e6 base 表示百分比**：50% 写 `500_000` 不是 `50`；写错位数会让所有提案永远达不到阈值，调试时容易当成"没人投票"。同样的坑也常出现在 quorum 配置里。

## 适用 vs 不适用场景

**适用**：

- 想发 token + 让持币人投票治理（最经典 DAO）
- 多签钱包不够用，想要"提案 → 投票 → 自动执行"完整流程
- 想做插件化的 DAO 模板，未来加功能不重新部署
- 需要 ENS 子域名标识组织身份（OSx 内置）

**不适用**：

- 只想要一个共管钱包 → 用 [[safe-contracts]] 更轻
- 治理只在链下投票，链上不执行 → 用 [[snapshot]]，不需要部署整套 DAO
- L2 上对 gas 极度敏感的小型 DAO → OSx 的多合约模式 gas 偏贵，可能要简化
- 需要 fork 任意 governance 模式做高度定制 → OZ Governor 更接近"白纸"

## 历史小故事（可跳过）

- **2016 年**：Luis Cuende + Jorge Izquierdo 在巴塞罗那创立 Aragon Project，目标是"链上公司注册"
- **2017 年 5 月**：ANT 代币 ICO 募资约 2500 万美元，是早期最热闹的 DAO 叙事之一
- **2018 年**：aragonOS v1 上线，"Kernel + ACL + AppProxy" 设计，但合约非常 monolithic，每加一个功能都要小心动 Kernel
- **2020-2022 年**：治理多次拉扯（金库分配、品牌、解散投票），社区分裂，开发节奏放缓
- **2023 年**：Aragon OSx 主网发布，把 v1 整体重写为 modular 三层；老 aragonOS 主网仍存在但停止迭代
- **2024-2025 年**：插件生态扩展（薪资流、token 流、社区注册等），多条 L2 也部署了 OSx 工厂合约

## 学到什么

1. **DAO 不是多签的同义词**——多签只是"几个人才能动钱"，DAO 是"组织 + 金库 + 治理 + 升级 + 插件"完整体
2. **权限内核 + 插件**比"重新部署"更稳——核心合约不动，新功能装新插件就够
3. **三元组权限模型**（where, who, permissionId）比"角色枚举"灵活，临时借权限直接 grant/revoke
4. **链上组织标准还在演化**——OSx 是 2023 范式，未来会有 v2/v3，看到老 aragonOS 文档要先警觉版本差异

## 延伸阅读

- 官方文档：[Aragon OSx Docs](https://devs.aragon.org/) —— 最新版 SDK + 合约接口
- 视频：[Aragon DAO Tutorial 2024](https://www.youtube.com/results?search_query=aragon+osx+tutorial) —— 30 分钟实操
- 同类对比：[OpenZeppelin Governor 文档](https://docs.openzeppelin.com/contracts/governance) —— 看"白纸版" governance 的简洁
- 审计报告：Halborn / Code4rena 对 OSx 的两份报告（GitHub repo `audits/` 目录）
- [[safe-contracts]] —— 多签钱包对照，了解"轻量共管"和"完整 DAO"的边界

## 关联

- [[safe-contracts]] —— 多签钱包合约，DAO 的轻量版上游
- [[snapshot]] —— 链下投票工具，常和 OSx 配合：链下投、链上执行
- [[openzeppelin-contracts]] —— OSx 大量复用 OZ 的 Upgradeable / AccessControl
- [[compound-v3]] —— 经典 governance Bravo 模式，对照 OSx 看治理两条路线
- [[uniswap-v3]] —— 大型 DAO 治理实战，金库规模观察 OSx 类系统的天花板
- [[ethers-js]] / [[foundry]] —— 与 OSx 交互的常用客户端 + 测试工具
- [[optimism]] / [[arbitrum]] —— OSx 也部署到这些 L2，gas 友好版

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[arbitrum]] —— Arbitrum Nitro — Offchain Labs 的 Optimistic Rollup 客户端
- [[compound-v3]] —— Compound III (Comet) — 单抵押借贷重构
- [[ethers-js]] —— ethers.js — 浏览器和 Node 都能用的以太坊客户端库
- [[foundry]] —— Foundry — Paradigm 出品的 Rust 合约工具链
- [[openzeppelin-contracts]] —— OpenZeppelin Contracts — 以太坊智能合约的事实标准库
- [[optimism]] —— Optimism — 以太坊 L2 旗舰栈，把交易搬到便宜车道再回主网结算
- [[safe-contracts]] —— Safe — 多签智能账户合约
- [[snapshot]] —— Snapshot — DAO 不花 Gas 也能投票的链下治理前端
- [[uniswap-v3]] —— Uniswap V3 — 集中流动性 AMM 核心合约


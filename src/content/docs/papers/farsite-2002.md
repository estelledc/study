---
title: Farsite — 把一群不可信桌面 PC 拼成一台可信文件服务器
来源: Adya et al., "FARSITE — Federated, Available, and Reliable Storage for an Incompletely Trusted Environment", OSDI 2002
日期: 2026-06-01
分类: 操作系统
难度: 中级
---

## 是什么

Farsite 是 Microsoft Research 2002 年发的一个分布式文件系统，核心想法很反直觉：**用一栋楼里上千台单独都不可信的桌面 PC，拼出一台对外行为像 NTFS 服务器的可信文件服务器**。

日常类比：你想让一群陌生路人帮你保管一份重要文件。你不能信任任何一个人——他可能弄丢、可能偷看、甚至可能伪造内容还给你。Farsite 的回答是：

- 把文件**加密后复制多份，分存到多台机器**，少一两份还能从别的副本读回来
- 一份文件想被算"权威版本"，得**目录组里约三分之二的人同时点头**才作数（拜占庭多数）
- 谁说自己存的就是原文？**附加密签名**，签错了一眼识破

把这三招合起来，就把"每个人都不可信"翻译成了"整体可信"。

## 为什么重要

不理解 Farsite，下面这些话题就拼不起来：

- 为什么后来的 Tahoe-LAFS、IPFS、各种"去中心化存储"都长得像它——它是这一支的早期教科书实现
- **拜占庭容错（BFT）+ 加密副本复制**第一次在一个真系统里同时落地，不是论文里的玩具
- 为什么它的去重技术（convergent encryption）变成了现代云备份的标准做法（Dropbox 早期、tarsnap、restic 都用）
- 它给出"对元数据用昂贵协议、对数据用便宜复制"的**分层信任**思路，被后来无数系统抄

那个年代企业里桌面 PC 大量闲置硬盘，这篇论文相当于问了一个朴素问题：**这些硬盘加起来有几百 TB，能不能不买专门的服务器，就用它们当备份？** 工程上没人真敢这么部署，但论文里的协议设计影响了后面 20 年。

## 核心要点

Farsite 解决三个核心问题：**完整性**（文件没被偷改）、**机密性**（别人看不见内容）、**可用性**（部分机器下线还能读）。每个问题都用一招对应。

### 1. 元数据用拜占庭容错（BFT）

文件系统的"目录树"是命脉——谁拥有哪个文件、权限是什么、最新版本是哪个。这部分**不能错**。

Farsite 把目录服务交给一个 **3f+1 台机器组成的小组**（典型 4 台，能容忍 1 台作恶）。任何修改都要走 Castro-Liskov 的 PBFT 协议——多数派投票通过才生效。

类比：四个人共同保管一本账本。要改一笔账，必须三个人同时签字才行。一个人偷偷篡改没用，对不上其他三人就被识破。

代价不小：每次目录修改都要多轮网络往返。但目录操作不频繁（相对读写），值得。

### 2. 文件数据用随机复制 + 加密签名

数据 GB 级，跑 BFT 太贵。Farsite 改成：**每个文件随机选 N 台机器存副本**（N 通常 3 到 5）。

但副本不是裸文件，而是**先按内容哈希派生密钥加密（convergent encryption），再由 owner 签名**后的版本。任何一台机器返回数据时：

- 客户端用 owner 的公钥验签——签名对得上才信
- 内容被加密——存放方根本看不见内容

机器作恶能干什么？最多是**拒绝返回**或**返回旧版本**。它不能伪造。少数几台坏了，就从其他副本读。

### 3. convergent encryption 让加密文件也能去重

公司里"同一份 Office 文档存了 100 份副本"很常见。普通加密会让 100 份变成 100 个不同密文，没法去重。

Farsite 的招：**用文件内容本身的哈希作为加密密钥**。两份相同明文 → 哈希一样 → 密钥一样 → 加密出来的密文也一样 → 系统一眼看出是同一份，只存一份。

类比：每个文件不取流水号，而是按"指纹"分组归档。指纹相同的自动合并。但每份文件被外人翻开时还是密文——只有持有原文件的人能解开。

这一招后来叫 **convergent encryption**，被无数云备份系统继承。

### 4. 客户端缓存：借鉴 AFS 的整文件 + 租约

读写性能怎么办？Farsite 抄 AFS 的招——客户端**整文件缓存到本地**，平时读写完全在本地，只在写回 / 失效时联系 BFT 目录组。

每个缓存对应一个**租约**（lease），到期或被通知失效就标记作废。这一段在 [[afs-1988]] 详细讲过。

## 实践案例

### 案例 1：写一个文件 hello.txt

1. 客户端在本地写好内容
2. **加密**：用文件内容的哈希派生密钥（convergent encryption），相同明文 → 相同密文，方便去重
3. **签名**：再用 owner 的私钥给密文签名，证明"这是我认可的版本"
4. 联系目录组（4 台 BFT 机器）：申请创建 hello.txt 元数据
5. BFT 组多数派同意 → 元数据写入，分配 5 台候选机器存副本
6. 客户端把密文同时发给这 5 台；落盘回 ACK 后写完成

存放方只有密文：解不开内容（缺内容哈希密钥），也伪造不了（缺 owner 私钥）。

### 案例 2：某台存放机被偷了

公司里桌面 PC 被拔走、被重装、被插 U 盘，常见。攻击者拿到硬盘以后呢？

- 看不到内容：硬盘上是密文，没有 owner 密钥解不开
- 改不了内容：动一个 byte，签名就对不上，客户端立刻拒绝
- 阻止不了别人读文件：副本还有 4 份，少这一份不影响

**最多就是少了一个副本**。Farsite 后台进程会发现副本数 < 阈值，自动找新机器再补一份。

### 案例 3：BFT 目录组里有人作恶

假设 4 台目录机里 1 台被入侵，开始返回假元数据（说"hello.txt 被删了"）。

PBFT 协议要求**多数派一致**才生效。这台坏机器声音再大，剩下 3 台说没删就是没删——客户端听多数派的。坏机器最多让协议慢一点（多走一轮），但不能让数据出错。

这就是 BFT 那个 **f = (n-1)/3** 公式的由来：4 台容 1 个坏的，7 台容 2 个，10 台容 3 个。

## 踩过的坑

1. **BFT 协议代价仍然很高**：哪怕只用在元数据上，每次目录修改也要好几轮网络。Farsite 在论文里花大段讲怎么把多个修改打成 batch，怎么让 lease 替代实时通信。
2. **convergent encryption 有侧信道**：攻击者如果**知道**某个文件的明文（比如猜你存了一份《哈利波特》PDF），他能算出它的密文，然后看你那台机器有没有这个密文 → 推断你"存过这本书"。这叫 **confirmation attack**，后来 Tahoe-LAFS 用 per-user 盐避免了。
3. **桌面 PC 实际可用率没有论文乐观**：作者在另一篇论文（Bolosky 2000）测过工业园区桌面 PC 的可用性分布，平均 80% 在线但抖动剧烈。Farsite 副本数得开得不小，否则可用性差。
4. **企业从没真的部署它**：Farsite 是研究项目，没成产品。它的协议设计倒是走进了 Microsoft 内部其他系统、外部学术界，影响远大于自身落地。

## 适用 vs 不适用场景

适用：

- 一群机器**互相不可信但整体多数可信**的环境（企业内网桌面、跨机构联邦存储）
- 写少读多 + 文件系统语义（非数据库）
- 数据冗余 + 隐私保护双要求

不适用：

- 单组织全可信场景（用 NFS / 普通分布式 FS 即可，BFT 是浪费）
- 数据库 / 高频随机写（整文件缓存吃不消）
- 完全去中心、零协调的场景（Farsite 还有 BFT 目录组这层"次中心"，不是 P2P）

## 学到什么

1. **承认不可信，再用密码学转化成可信**——这是 Farsite 最深的哲学，影响了之后所有去中心化存储设计
2. **按代价分层信任**：元数据 BFT，数据普通复制，缓存 lease——每一层用刚刚够的协议
3. **convergent encryption** 是 hash-as-key 的早期典型应用，加密和去重不是天敌
4. **f = (n-1)/3** 这个比例（容少数派作恶）来自 BFT 推导，不是拍脑袋——副本数永远要按它配
5. 一个研究系统**不必落地也能影响 20 年**——Farsite 没人用，但它定义了后人的语汇

## 关联

- [[afs-1988]] —— 客户端整文件缓存 + lease 思路 Farsite 直接继承
- [[castro-liskov-bft]] —— Farsite 元数据组用的就是这套 PBFT
- [[ipfs-2014]] —— 后来的去中心化存储，思路同源
- [[byzantine-generals-1982]] —— BFT 模型的鼻祖
- [[merkle-tree-1979]] —— 内容寻址 + 完整性校验的根，convergent encryption 的近亲

## 延伸阅读

- 论文 PDF：[Farsite OSDI 2002](https://www.usenix.org/legacy/event/osdi02/tech/full_papers/adya/adya.pdf)
- 后续工作：[Reclaiming Space from Duplicate Files in a Serverless Distributed File System (ICDCS 2002)](https://www.microsoft.com/en-us/research/publication/reclaiming-space-from-duplicate-files-in-a-serverless-distributed-file-system/) —— 专讲 convergent encryption 怎么省空间
- Castro 博士论文：[Practical Byzantine Fault Tolerance (MIT 2001)](http://pmg.csail.mit.edu/papers/osdi99.pdf) —— 元数据组用的 PBFT 算法源头
- Bolosky 2000：[Feasibility of a Serverless Distributed File System Deployed on an Existing Set of Desktop PCs](https://www.microsoft.com/en-us/research/publication/feasibility-of-a-serverless-distributed-file-system-deployed-on-an-existing-set-of-desktop-pcs/) —— Farsite 的可行性预研，测了真实桌面 PC 可用率

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[afs-1988]] —— AFS 1988 — 客户端缓存 + 回调失效让分布式文件系统真正能扩展
- [[byzantine-generals-1982]] —— 拜占庭将军问题 — 节点能撒谎时怎么达成一致
- [[ipfs-2014]] —— IPFS — 把"地址"换成"内容本身"的 P2P 文件系统


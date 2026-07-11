---
title: Kademlia — 用 XOR 当距离的 P2P 路由表
来源: 'Maymounkov & Mazières, "Kademlia: A Peer-to-peer Information System Based on the XOR Metric", IPTPS 2002'
日期: 2026-06-01
分类: 网络协议
难度: 中级
---

## 是什么

Kademlia 是一套**让上百万台没中心服务器的机器自己组网、互相帮忙找东西**的协议。日常类比：一个城市里有一千万人，每人手里都有一些信件。你想找编号 0xABCD... 的信，不需要中央台。Kademlia 教你一招：**把你脑子里的"邻居名单"按"和我编号的差异程度"分成 160 个抽屉，每个抽屉装 20 个人，问的时候同时问 3 个最接近目标的邻居，他们再问他们的邻居——一两秒就找到。**

具体一点。Kademlia 把两件东西揉到同一个 160 位编号空间：

- **机器**（node）：每台机器开机时随机选一个 160 位 ID
- **数据**（key）：每条数据 hash 到同一个 160 位空间

规则：**编号 k 的数据由"和 k 的 XOR 距离最近的几台机器"共同存。** 这里 XOR 距离的定义就是按位异或——`d(x,y) = x XOR y`，结果再按无符号整数比大小。

## 为什么重要

不理解 Kademlia，下面这些事都没法解释：

- 为什么 BitTorrent 关掉所有 tracker 还能找到下载源——靠 Mainline DHT，本质是一张全球 Kademlia 路由表
- 为什么以太坊节点开机几秒就能找到全网对等节点——devp2p 的 discovery 协议就是 Kademlia 变种
- 为什么 IPFS / libp2p / Storj 这些新一代 P2P 系统都不用 Chord 而用 Kademlia
- 为什么 2002 年一篇 6 页论文，是被工业界采纳最广的 DHT

## 核心要点

Kademlia 的全部魔力来自**三件东西**：

1. **XOR 距离**：`d(x,y) = x XOR y`（把结果当无符号整数比大小）。它满足度量的基本性质——对称（`d(x,y) = d(y,x)`）、自反（`d(x,x) = 0`）、三角不等式（`d(x,y) ≤ d(x,z) + d(z,y)`）；进一步还是**超度量**：`d(x,y) ≤ max(d(x,z), d(z,y))`。对称这点比 Chord 的圆环重要：Chord 的"我离你"和"你离我"不一样，路由表得专门维护。Kademlia 任意一次消息往返都能顺带更新双方的路由表。

2. **k-bucket 路由表**：每台机器维护 160 个桶，第 i 个桶装"和我 XOR 距离落在 [2^i, 2^(i+1)) 的节点"。每桶最多装 k 个（论文取 k=20）。新节点想进满桶？先 ping 桶里最老的节点——**他还活着就不替换**。这套策略偏向保留老节点，而老节点统计上更可能继续在线（这是论文用 Gnutella 实测数据支撑的）。

3. **α=3 并行查找**：要找 key=K，从最近的桶里挑 α=3 个节点同时发 FIND_NODE，他们各回 k 个他们认识的更近节点，本机合并、再挑前 α 个继续，直到收敛。每轮**至少把 XOR 距离前缀多匹配一位**，所以 O(log N) 轮——10 万节点约 17 跳。

## 实践案例

### 案例 1：XOR 距离怎么算（4 位简化版）

假设我的 ID 是 `1011`，邻居 A 是 `1110`，B 是 `1001`：

```
d(我, A) = 1011 XOR 1110 = 0101 = 5
d(我, B) = 1011 XOR 1001 = 0010 = 2
```

B 比 A 离我近。**直观理解**：XOR 距离就看"前缀有多少位相同"——和我前缀越相同的离我越近。这跟 Trie 树查前缀的思路完全一致。

### 案例 2：k-bucket 长什么样

我的 ID 是 `1011`（4 位简化版，真实是 160 位），我的桶按"和我前缀差异在第几位"分：

```
桶 0：第 0 位就不同（即和我距离 8-15）
桶 1：第 0 位相同、第 1 位不同（距离 4-7）
桶 2：前 2 位相同、第 2 位不同（距离 2-3）
桶 3：前 3 位相同、第 3 位不同（距离 1）
```

每桶最多装 k=20 个节点（按 LRU 排），随时知道附近的人是谁。

### 案例 3：BitTorrent DHT 怎么用 Kademlia

你打开 qBittorrent 加一个 magnet 链接 `magnet:?xt=urn:btih:HASH...`：

1. 客户端拿 HASH 当 key，向 Kademlia DHT 发 GET_PEERS
2. 路由跳转 10 来次，找到"XOR 距离离 HASH 最近的 8 台机器"
3. 这 8 台机器手里存着"谁有这个种子"的列表，返回给你
4. 你直连那些 peer 开始下载

**整个过程没有中央 tracker**。BitTorrent 全网 1000 万 + 节点常年在线靠的就是这个。

### 案例 4：Kademlia 的四个 RPC

整个协议只有 4 个 RPC，简洁得不像分布式系统：

- `PING`：探活，顺便把对方塞进自己的 k-bucket
- `STORE`：让对方存一份 (key, value)
- `FIND_NODE(target)`：返回桶里离 target 最近的 k 个节点
- `FIND_VALUE(key)`：和 FIND_NODE 类似，但如果本机有 key 就直接返回值

每次任意 RPC 的响应里都带发送方的 ID——所以**任意一次通信都顺带在双方更新路由表**。这就是为什么 Kademlia 不需要专门的 stabilization 协议。

## 踩过的坑

1. **k 值没标准答案**：论文给 k=20，BitTorrent 实际用 8，以太坊用 16。k 大了路由表占内存、维护流量大；k 小了 churn 时容易丢可达性。

2. **α 是双刃剑**：α=3 是论文经验值。α=1 退化成串行查找，慢；α 太大每次查询发出网络风暴，且**最终也只用最近的几个回复**——多发是浪费。

3. **XOR 三角不等式比欧式强**：`d(x,y) <= max(d(x,z), d(z,y))`（这叫超度量空间，ultrametric）。好处：每跳保证距离严格递减；坏处：你的"几何直觉"不适用——这空间里没有"中点"概念。

4. **Sybil 攻击防不住**：诚实节点假设破坏后任何 DHT 都不安全。攻击者可以申请大量 ID 包围目标 key 形成"日蚀"。以太坊后来加了 ENR（节点身份签名）+ 子网限速 + 引导节点白名单缓解。

5. **NAT 穿透要额外做**：Kademlia 假设节点能直接互联。家庭路由器后的节点需要 STUN/TURN/UPnP 配合，论文没管这块。

## 适用 vs 不适用场景

**适用**：

- 节点数极大且高度动态（千万级 P2P 网络）
- 没有可信中央协调者（去中心化网络、区块链 P2P 层）
- 查询主要是 key-value 查找，不需要范围扫描
- 节点会频繁进出（churn 高）—— k-bucket 的"留老节点"策略对此鲁棒

**不适用**：

- 范围查询、SQL 类查询（XOR 把相邻 key 完全打散）
- 需要强一致 → Kademlia 只保证最终一致，强一致用 Raft / Paxos
- 节点数小（< 1000）且稳定 → 直接全互联省路由表复杂度
- 内网 / 受控集群 → 用 etcd / ZooKeeper 这种带主选举的方案更省心

## 历史小故事（可跳过）

- **2001 年 SIGCOMM**：Chord、Pastry、Tapestry、CAN 四篇 DHT 论文同期。Maymounkov 当时是纽约大学硕士生，正在导师 Mazières 实验室做 SFS 加密文件系统，看完这些论文觉得 Chord 的圆环路由不优雅——非对称、要专门 stabilize。
- **2002 年 IPTPS**：Maymounkov 和 Mazières 把 Kademlia 投到第一届 IPTPS。论文 6 页，密度极高，几乎没有冗余文字。
- **2005-05**：Azureus（后来的 Vuze）率先上线**自有**的 Kademlia DHT（仅该客户端使用）。
- **2005-05/06**：BitTorrent Inc 推出互不兼容的 **Mainline DHT**；随后多数客户端跟进，2006 年前后由 BEP-5 写成规范并全网铺开。
- **2014 年**：以太坊 devp2p 选 Kademlia 做节点发现，沿用至今（discovery v4 / v5）。
- **2018 年**：libp2p / IPFS 把 Kademlia 模块化、可换距离函数，但默认还是 XOR。
- **现在（2026）**：Kademlia 是部署最广的 DHT。Chord、Pastry、Tapestry 在工业界几乎绝迹，只在课程和论文里出现。

## 学到什么

1. **XOR 当距离**是个反直觉但极度优雅的选择——对称性让路由表能"白嫖"地维护，前缀匹配让收敛分析极简。
2. **k-bucket + LRU + 偏好老节点**：用经验数据（老节点更可能继续在线）反过来设计数据结构。这是"用观测到的行为统计指导算法"的典范。
3. **α 并行查找**：用网络往返冗余换延迟，这是分布式系统常见的取舍。
4. **协议要简单到能在 6 页讲完**：Kademlia 之所以工业广泛采纳，部分因为它的实现门槛低——XOR、桶、并行查找三件事而已。
5. **数据结构契合度量空间**：XOR 距离是超度量（ultrametric），桶按"前缀匹配长度"分天然对应距离区间——结构和度量同源，复杂度证明几乎一行带过。

## 延伸阅读

- 论文 PDF：[Kademlia IPTPS 2002](https://pdos.csail.mit.edu/~petar/papers/maymounkov-kademlia-lncs.pdf)（6 页，正文密度极高）
- 实现参考：[libp2p kad-dht（Go）](https://github.com/libp2p/go-libp2p-kad-dht)
- 实现参考：[BitTorrent BEP-5 规范](https://www.bittorrent.org/beps/bep_0005.html)（Mainline DHT 协议细节）
- [[chord-2001]] —— 同时代另一种 DHT，但工业界败给了 Kademlia
- [[consistent-hashing-1997]] —— 圆环式一致性哈希，更早一代

## 关联

- [[chord-2001]] —— Chord 用圆环 + finger table，Kademlia 用 XOR + k-bucket：同问题不同解
- [[pastry-2001]] —— 同时期 DHT，前缀路由思想和 Kademlia 接近
- [[consistent-hashing-1997]] —— Akamai 1997 一致性哈希，是所有 DHT 的祖师爷
- [[dynamo]] —— 工业 KV 存储用了一致性哈希但不用 Kademlia——节点数小直接全互联
- [[paxos-1998]] —— 强一致协议，与 Kademlia 解决正交问题（共识 vs 路由）

## 一句话总结

**用 XOR 当距离 + k-bucket 路由表 + α 并行迭代**——Kademlia 把 P2P 路由的复杂度压到 O(log N)，并把协议简化到 4 个 RPC。它没有任何专门的"维护协议"，每次普通通信都顺带把路由表更新好。这种"协议本身即维护"的极简思路，让 BitTorrent / 以太坊 / IPFS 全部选了它。

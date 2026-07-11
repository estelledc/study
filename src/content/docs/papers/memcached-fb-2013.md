---
title: Scaling Memcache at Facebook — 万台缓存怎么不被踩塌
来源: Nishtala et al., "Scaling Memcache at Facebook", NSDI 2013
日期: 2026-05-31
分类: 分布式系统
难度: 中级
---

## 是什么

这是 Facebook 工程团队 2013 年写的一篇**实战经验报告**，讲他们怎么把开源的 memcached 从"一台机器加速一个 MySQL"扩到**几千台机器、亿级 QPS、万亿级 key**——并且不被自己的流量打挂。

日常类比：memcached 是**奶茶店点单口的便签贴**——后厨（MySQL）做一杯要 30 秒，但便签上抄一份只要 0.2 秒。一个便签贴墙够用；100 家分店、每家墙上都有便签、还要保证墙上写的是最新菜单——这就是这篇论文的真正难题。

论文的贡献**不是发明新算法**，而是把"在万台规模下用 memcached 不会出大事"这件事，拆成可复制的工程招式。

## 为什么重要

不读这篇你可能踩到的坑：

- 缓存挂一台，DB 被几万 QPS 瞬间打死（**thundering herd**）
- 上线一个新数据中心，cache 全是空的，命中率从 99% 掉到 1%（**cold cluster**）
- 写完 DB 立刻读，读到的是旧 cache（**stale read**）
- 给 cache 加可靠协议（要 ack、要重试），结果延迟翻 10 倍

Facebook 这篇说："这些都遇到过，下面是我们的招"。后来 Twitter、ByteDance、Meituan 做大规模缓存，写的方案大多是这篇的变体。

## 核心要点

整篇论文的招式可以归到一个原则：**把 cache 当不可靠的加速层，可靠性靠周边兜底**。具体三层：

1. **单机层**——用 lease（租约）解 thundering herd
2. **集群层**——用 gutter pool 兜底单机故障；用 cold cluster warmup 解冷启
3. **跨区域层**——用 regional pool 省内存；用 mcsqueal 广播失效

下面拆开看每个招式。

## 实践案例

### 案例 1：lease（租约）—— 解 thundering herd

热门 key 突然失效（比如某条爆款帖的缓存过期），1 万个客户端**同时** miss、同时回源 DB——DB 直接挂。

Facebook 的招：

1. 客户端 A miss，memcached 给 A 一个 64-bit token，告诉 A："你去查 DB，回来用这个 token 写回 cache"
2. 此后 10 秒内，其他客户端 B/C/D 同样 miss——memcached 不发 token，回一个 "**等一下，已经有人在查了**"
3. B/C/D 等 10ms 重试，通常 A 已经把值写回，B/C/D 直接命中
4. 如果中途有 delete 操作（DB 被改），A 的 token 作废，set 被拒，避免写回旧值

这就是 **lease** 的双重作用：限流回源 + 防止 stale set。

### 案例 2：cold cluster warmup —— 新集群不拖死 DB

新建一个 memcached 集群，里面是空的，命中率 0%。如果直接上线接流量——DB 被打死。

Facebook 的招：让新集群（cold）miss 时**不直接查 DB**，而是去同区域的旧集群（warm）拿。warm 集群里 99% 是命中的，cold 集群从它复制过来，几小时后 cold 自己也热了，再切回正常模式。

类比：新便签墙上一片空白，先派人**去隔壁店抄**，而不是让顾客都重下单。

### 案例 3：gutter pool —— 单机挂了不打 DB

集群里几千台 memcached，肯定会有挂的。如果客户端发现 A 机不通就直接打 DB——挂的那部分 key 全打 DB——又是 thundering herd。

Facebook 的招：留一小撮机器作为 **gutter pool**（备用池；论文写 small reserved set，未给固定百分比）。任何 memcached 失联，客户端**临时改路**到 gutter，gutter miss 才回源 DB。gutter 用短 TTL（约 10s 量级），避免承担长期一致性。

要点：gutter **不替代主缓存**——它只接住故障的瞬时流量，等主机恢复或被替换就退出。

### 案例 4：regional pool —— 长尾 key 不每个集群复制

一个区域有十几个前端 cluster。每个 cluster 复制一份 cache 是最快的，但**冷门 key 复制十几份太浪费**——比如某用户三年前的私信，访问极稀疏。

Facebook 的招：把访问频率低的 key 单独放 **regional pool**（区域共享池），所有 cluster 都查它。热门 key 还在每个 cluster 复制（保延迟），冷门 key 共享一份（省内存）。

判断哪些 key 冷？根据 client 端采样的访问计数。

### 案例 5：mcsqueal —— 跨区域失效广播

DB 在 master 区域写完，全球 10 个 cache 集群里的旧值得马上删掉，否则用户在不同区域看到不同内容。

Facebook 的招：在 MySQL 的 commit log 里**寄生一个守护进程**叫 mcsqueal，它解析 binlog，提取出"哪些 key 该删"，然后通过 mcrouter（缓存代理）批量广播 delete 给所有区域的 memcached。

为什么删而不是更新？因为分布式下**广播 delete 是幂等的**（删两次和删一次效果一样），广播 set 不是（顺序错就读到旧值）。这是论文最朴素也最重要的工程心法。

## 踩过的坑

1. **set/delete 协议要不要 ack**：早期版本 set 不等 ack——快但偶尔丢；后来改成可靠 set。教训：cache 的"可靠"不是全有全无，按操作类型分。

2. **UDP 用在 get，TCP 用在 set/delete**：单 key get 量极大、丢一个无所谓（下次重试），用 UDP 省连接数；set/delete 必须可靠用 TCP。混合协议提速 13%。

3. **mcrouter 这个代理层一开始没有**——后来发现客户端直连几千台 memcached，连接数爆炸 + 客户端代码到处复制，才提炼出 mcrouter。**好的中间层是被需求逼出来的**。

4. **lease 的 10 秒窗口怎么定**：太短挡不住雷鸣群；太长用户等太久。论文是 production 测出来的——这种参数没有理论最优解。

5. **stale set 这个名字看着唬人**：本质是"两个 client 都 miss、其中一个查 DB 慢、回来时 DB 已被改写"。lease 的 token 失效机制就是专门为这个场景准备的——没有 lease 之前，这种 race 一天发生几百次。

6. **regional pool 的判定要小心**：把"以为是冷"的 key 推到共享池，结果它突然变热——共享池一台机器扛不住。论文给了个反馈环：定期把 pool 里访问飙升的 key 升级回前端 cluster。

## 适用 vs 不适用场景

**适用**：

- 读远多于写（论文写约两个数量级；不同 pool 的 get:set 大约从个位数到数百倍）
- 容忍秒级最终一致——cache 偶尔 stale 用户感知不到
- 后端是关系型数据库或图数据库，做缓存层加速
- 单数据项小（几 KB），适合 KV

**不适用**：

- 强一致需求（金融账本）——别把 cache 当真相
- 写多于读——cache 的失效成本超过命中收益
- 大对象（几 MB 视频帧）——memcached 不擅长，用对象存储 + CDN
- 需要范围查询——KV cache 不能 scan

## 历史小故事（可跳过）

- **2003 年**：Brad Fitzpatrick 在 LiveJournal 写了 memcached，几百行 C，给自己博客挡 MySQL
- **2008 年**：Facebook 全面用 memcached，但很快撞到几百台规模的故障
- **2013 年**：这篇 NSDI 论文发表，把"几千台规模怎么不挂"的招式系统化
- **2014 年起**：mcrouter 开源，成为 ByteDance、Meituan 等公司缓存代理的参考实现
- **2020 年代**：Twitter Pelikan、ByteDance ByteCache 都借鉴了 lease + gutter 的思路

memcached 本身只是 KV 存储；真正难的是**周围的协议、代理、广播**——这篇论文的真正贡献是这一圈"看不见的脚手架"。

## 学到什么

1. **可靠性不写进核心**——core 协议（memcached）保持快和简单，可靠性靠 lease/gutter/mcsqueal 在外圈兜
2. **失效比更新简单**——分布式系统中广播 delete 是金科玉律
3. **demand-filled**——cache 只在被读时才填，不主动 push，避免容量爆炸
4. **测量驱动设计**——论文里所有参数（lease 窗口、gutter 比例、UDP 阈值）都是用 production trace 验证出来的
5. **代理层是被需求逼出来的**——不要预先抽象 mcrouter，等客户端代码到处复制时再提炼
6. **多层兜底胜过一层完美**——lease 挡 80% 的 thundering herd，gutter 挡剩下 19%，最后 1% 真的打到 DB 也不至于挂。每一层只承担它擅长的那一段，组合起来才稳

## 延伸阅读

- 原论文 PDF：[Scaling Memcache at Facebook](https://www.usenix.org/system/files/conference/nsdi13/nsdi13-final170_update.pdf)（14 页，工程读起来很顺）
- mcrouter 开源代码：[facebook/mcrouter](https://github.com/facebook/mcrouter)
- Brad Fitzpatrick 当年的设计笔记：[memcached design](https://memcached.org/about)
- Twitter Pelikan 论文（思路类似的精简版）：[Pelikan: a unified caching framework](https://twitter.github.io/pelikan/)

## 关联

- [[akamai-2002]] —— 边缘缓存的祖师爷，思路同样是"把热数据搬近用户"
- [[aurora]] —— 云数据库的缓存层取舍，对照看更立体
- [[azure-storage-2011]] —— 大规模存储一致性，另一种"用版本号兜底"思路
- [[art-2013]] —— 单机内存索引，memcached 内部也面临同类选型
- [[gpu-cache-coherence-2013]] —— 缓存一致性在硬件层的另一面镜子

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[farm-2015]] —— FaRM — 把一排机器的内存当成一个低延迟仓库
- [[persistent-memory-2014]] —— PMFS — 第一个为字节寻址持久内存设计的文件系统

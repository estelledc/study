---
title: Karger 1997 一致性哈希 — 加机器不用全员搬家
来源: Karger et al., "Consistent Hashing and Random Trees", STOC 1997
日期: 2026-06-01
分类: 网络协议
难度: 中级
---

## 是什么

**一致性哈希**（Consistent Hashing）是一套**让你加一台机器、删一台机器时，只需要搬动很少一部分数据，而不是全员重排**的哈希方法。

日常类比：想象一个**圆形的钟表盘**，上面写着 0 到 2³² 的数字。

- 你有 3 台缓存机器（A、B、C），先把它们的名字哈希一下，扔到表盘上某个位置
- 来了一个 key（比如 `user:42`），也哈希一下扔到表盘上
- key 沿着**顺时针方向**走，遇到的第一台机器就是它的家

现在加一台机器 D：D 落在表盘上某个位置后，**只有它顺时针上游那一段的 key** 会改换门庭，其他 key 完全不动。

传统的 `hash(key) % n` 在 n 从 3 变 4 时，几乎所有 key 都要换家——缓存集体失效，雪崩。一致性哈希让"换家率"从近 100% 降到 1/n。

## 为什么重要

不理解一致性哈希，下面这些事都没法解释：

- 为什么 Amazon DynamoDB / Cassandra 的"无主分片"能横向扩展
- 为什么 memcached 客户端默认用的 ketama 算法叫"ketama"
- 为什么 Chord、Pastry、Kademlia 这些 DHT 长得都像一个环
- 为什么 Akamai 这家市值百亿美元的公司是从一篇 STOC 论文长出来的——这就是那篇论文
- 为什么"Sharding Key"的设计在所有分布式数据库面试里都是必考题

## 核心要点

一致性哈希做的事情可以拆成 **三步**：

1. **统一哈希到环**：bucket（机器）和 key（数据）都用同一个哈希函数映射到 0 到 2³² 范围内的一个点。整个范围首尾相接，是个**环**。

2. **顺时针找家**：key 落在环上某点后，沿顺时针方向找到第一个 bucket 点，就归它管。

3. **虚拟节点（Virtual Node）**：一台真机器在环上只放一个点会导致负载不均（运气不好这台机器被分到一长段空白）。论文证明：每台真机器在环上**复制 V = O(log n) 个虚拟节点**，方差就降到可接受水平。

加机器、删机器时只影响"环上相邻一小段"，这是一致性哈希区别于普通哈希的根本。

## 实践案例

### 案例 1：传统 `hash % n` 死法

你用 3 台 redis 做 cache，分片规则是 `hash(key) % 3`：

```python
servers = ["redis-A", "redis-B", "redis-C"]
def get_server(key):
    return servers[hash(key) % len(servers)]
```

某天扩容到 4 台。`hash(key) % 4` 和 `% 3` 是**完全不同的两套映射**——所有缓存全失效，请求全部打穿到数据库，**数据库瞬间被压垮**。这就是经典的"扩容引发雪崩"。

### 案例 2：一致性哈希怎么救你

```python
import hashlib, bisect

class ConsistentHash:
    def __init__(self, nodes, vnodes=150):
        self.ring = []  # 排序的 (hash, node) 列表
        for n in nodes:
            for i in range(vnodes):
                h = int(hashlib.md5(f"{n}#{i}".encode()).hexdigest(), 16)
                self.ring.append((h, n))
        self.ring.sort()

    def get(self, key):
        h = int(hashlib.md5(key.encode()).hexdigest(), 16)
        # 顺时针找第一个 >= h 的 vnode
        idx = bisect.bisect_left(self.ring, (h, ""))
        if idx == len(self.ring): idx = 0
        return self.ring[idx][1]
```

加一台机器，只需 `ring` 里插入它的 150 个虚拟节点。约 1/n 的 key 会迁到新机器，其他不动。

### 案例 3：DynamoDB 怎么用它

Amazon Dynamo（2007 论文）直接照搬了这套思路：

- 每个 partition 在环上有位置
- 写入 `key="cart:42"` 时，找顺时针第一个 partition，再写它后面 N-1 个做副本
- 加 / 减 partition 只影响相邻的 N 个 partition 之间的迁移

Cassandra、Riak、Voldemort 都是同样的招式。

## 踩过的坑

1. **不加虚拟节点就用，负载严重不均**：3 台机器每台只放一个点在环上，运气不好某台分到 60% 流量。生产环境 V 至少 100~200 起步。

2. **哈希函数选错（用 `hash()` 内置）**：Python 的 `hash()` 在不同进程返回不同值（PYTHONHASHSEED 随机），分布式必须用 md5 / sha1 / murmurhash 这种**确定性**哈希。

3. **删除节点时副本没补够**：移除一台机器，它原本的 key 顺时针迁到下一台。如果你还在做 N 副本写，要确保下一台不在原来那 N 个里，否则副本数会瞬间降级。

4. **环上数据倾斜**：如果 key 本身分布有偏（比如全是 `user:1`、`user:2`、`user:3`），哈希后还是会聚簇。一致性哈希解决"加机器搬家"问题，**不解决"key 本身热点"问题**——那是论文里 Random Trees 那部分要管的。

## 适用 vs 不适用场景

**适用**：

- 分布式缓存（memcached / redis cluster）
- 分布式存储的 sharding（Cassandra / DynamoDB / Riak）
- DHT（Chord / Pastry / Kademlia）
- L7 负载均衡（nginx upstream hash / envoy ring hash）
- CDN 节点选择（Akamai 全家桶的根基）

**不适用**：

- 数据量很小、机器数固定（直接 `% n` 反而简单）
- 需要范围查询（一致性哈希打散了顺序，`SELECT WHERE id BETWEEN 100 AND 200` 要扫所有 shard）→ 用 range partitioning（HBase / TiKV）
- 强一致性事务跨分片（一致性哈希只解决放哪，不解决跨节点 ACID）

## 历史小故事（可跳过）

- **1997 年**：MIT 的 David Karger 带博士生 Daniel Lewin 等人在 STOC 1997 发表这篇论文。当时背景是 World Wide Web 早期，热门页面（如 1996 奥运官网）会把单台 server 打挂，叫 flash crowd。
- **1998 年**：Lewin 和导师 Tom Leighton 把论文里的算法商业化，创立 **Akamai**（希腊语"聪明"）。
- **2001-09-11**：Lewin 在 American 11 航班上遇害，年仅 31 岁。Akamai 总部至今为他保留座位。
- **2007 年**：Amazon Dynamo 论文公开，让一致性哈希在工业界彻底普及。
- **2010 年代**：所有现代分布式 KV 默认实现。

## 学到什么

1. **"加机器不全员搬家"是分布式扩缩容的最核心问题**——没有它，云时代的弹性扩缩容根本跑不起来
2. **环 + 虚拟节点** 是一个非常优雅的"理论保证 + 工程可调"组合：理论给你 O(log n) 方差，工程把 V 从 1 调到 200 就能要多均匀有多均匀
3. **理论 → 论文 → 公司 → 行业基础设施**，从 STOC 1997 到 Akamai 到 DynamoDB，30 年走下来
4. **数学保证 vs 工程参数**：论文证明的是渐进性质，落地时虚拟节点数、哈希函数选型这些细节才决定是否真用得起来

## 延伸阅读

- 论文 PDF：[Consistent Hashing and Random Trees, STOC 1997](https://www.akamai.com/site/en/documents/research-paper/consistent-hashing-and-random-trees-distributed-caching-protocols-for-relieving-hot-spots-on-the-world-wide-web.pdf)
- 视频讲解：[David Karger 在 MIT 6.854 讲一致性哈希](https://www.youtube.com/results?search_query=david+karger+consistent+hashing)
- 自己写实现：[ketama 算法 C 源码](https://github.com/RJ/ketama)（memcached 客户端默认用的 100 行实现）
- 行业落地：[Amazon Dynamo Paper, SOSP 2007](https://www.allthingsdistributed.com/files/amazon-dynamo-sosp2007.pdf)
- [[akamai-2002]] —— Akamai 2002，这套理论怎么变成全球 CDN
- [[chord-2001]] —— Chord DHT，把一致性哈希做成 P2P 的查找协议

## 关联

- [[akamai-2002]] —— 论文作者的公司，把这套理论商用化
- [[chord-2001]] —— DHT 协议，一致性哈希的 P2P 版
- [[dynamo-2007]] —— Amazon 把它推上工业界主舞台
- [[cassandra-2010]] —— 开源 Dynamo 复刻，默认 partitioner 就是它
- [[bigtable-2006]] —— Google 的对比方案（用 range 分片而非 hash 环）

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[dynamo-2007]] —— Dynamo 2007 — 让购物车在机器故障时也能写入

---
title: Memcached — 经典内存缓存
来源: https://github.com/memcached/memcached
日期: 2026-05-31
子分类: 存储与查询
分类: 数据库
难度: 中级
provenance: pipeline-v3
---

## 是什么

Memcached 是一个把数据放在内存里、用网络协议读写的最小键值缓存。日常类比：办公室门口那张写满电话的便利贴墙——你要哪个号就直接看墙上贴的，不用每次都翻通讯录。

它只做四件事：

- 接收 `set key value`：把一段字节存进内存，挂上过期时间
- 接收 `get key`：返回那段字节，不存在就回 `END`
- 接收 `delete key`：把那条扔掉
- 满了就按最近最少使用（LRU）淘汰旧的

没有数据结构、没有事务、没有持久化、没有复制。整个 server 进程一旦重启，缓存全部清空。这种『极简』正是它在 2003 年到 2010 年代被全球网站普遍采用的原因——简单到运维不会出错，快到 1Gbps 网卡先饱和。

## 为什么重要

- 不理解 Memcached，就不知道『把数据库结果缓存在内存』这个最朴素的扩容手法是怎么落地的
- 不理解 slab allocator，就读不懂任何高性能服务器为什么不直接用 `malloc`
- 不理解『服务端不分片、客户端一致性哈希』，就不明白早期分布式缓存怎么做横向扩展
- 不理解 Memcached 与 Redis 的边界，就分不清什么时候该选『字节 KV』、什么时候该选『数据结构服务器』
- 不理解多线程 + libevent 的事件循环，就读不懂同时代很多 C 服务的并发骨架

## 核心要点

1. **极简 ASCII 协议**：每个命令一行文本，`set foo 0 0 5\r\nhello\r\n` 这种格式，用 telnet 就能调试。这种朴素让任何语言实现客户端都不到 200 行。
2. **Slab Allocator**：把内存切成若干 slab class，每个 class 只装某个固定 chunk 大小（例如 96B / 120B / 152B…）。新数据按大小落进对应 class，避免反复 `malloc/free` 产生碎片。
3. **每个 class 独立 LRU**：每条记录挂在所属 class 的双向链表上；写入推到表头，淘汰从表尾砍。class 之间互不影响。
4. **服务端无状态分片**：多台 Memcached 之间不通信。客户端用一致性哈希决定 `key → server`，加节点只把一小部分 key 重新分布。
5. **多线程 + libevent**：一个 main 线程监听端口，把新连接 round-robin 派给 N 个 worker 线程，每个 worker 自己跑事件循环。这是 2003 年就达到多核可扩展的关键。

## 实践案例

### 案例 1：用 telnet 直接和 server 对话

```
$ telnet 127.0.0.1 11211
set greeting 0 60 5
hello
STORED
get greeting
VALUE greeting 0 5
hello
END
```

`set greeting 0 60 5` 四个数字分别是：flags（客户端自己用，server 透传）、过期 60 秒、value 长度 5 字节。这个协议从 2003 年到现在没动过，所有客户端库都按这个格式封装。

### 案例 2：在 Python 里把数据库查询缓存住

```python
import pymemcache.client.base as mc
cache = mc.Client(('127.0.0.1', 11211))

def get_user(uid: int):
    key = f'user:{uid}'
    raw = cache.get(key)
    if raw is not None:
        return json.loads(raw)
    row = db.query('SELECT * FROM users WHERE id=%s', uid)
    cache.set(key, json.dumps(row), expire=300)  # 5 分钟
    return row
```

这是『Cache-Aside』模式的最小写法——读先查缓存，miss 再查数据库并回填。生产里要再加一层『写库时 invalidate 对应 key』，否则会读到旧数据。

### 案例 3：slab class 在源码里长什么样

```c
// slabs.c（节选思想）
typedef struct {
    unsigned int size;       // 这个 class 的 chunk 大小
    unsigned int perslab;    // 每个 slab 装多少 chunk
    void *slots;             // 空闲 chunk 链表
    unsigned int sl_curr;    // 当前空闲多少
    unsigned int slabs;      // 已分配多少 slab
    void **slab_list;        // 所有 slab 的指针数组
} slabclass_t;
static slabclass_t slabclass[MAX_NUMBER_OF_SLAB_CLASSES];
```

启动时按一个增长因子（默认 1.25）算出 64 档 chunk 大小，每档预留管理结构。需要内存时从对应 class 摘一个 chunk；释放时挂回 `slots` 链表。整个过程**不调用 `free`**，所以零碎片。

## 踩过的坑

1. **slab calcification（钙化）**：流量结构变了，热点搬到别的 chunk 大小，但已分配给老 class 的内存收不回去——新 class 只能挤剩下的。生产里要么调 `slab_reassign`，要么定期重启。
2. **大 value 直接被拒**：默认单个 value 上限 1MB，超过 server 直接回 `SERVER_ERROR object too large`。要么压缩、要么拆 chunk、要么调 `-I` 参数。
3. **没认证 = 必须放内网**：默认协议明文、零鉴权，谁都能 `flush_all` 把缓存清空。把 11211 端口暴露公网会被秒挖矿。
4. **重启即丢**：把 Memcached 当『便宜的小数据库』用，重启一次系统就雪崩——所有请求穿透到数据库，DB 直接被打挂。任何依赖必须能从源头回填。
5. **客户端哈希算法不一致**：同一组 key 在不同客户端库（libmemcached / pymemcache / spymemcached）的哈希结果可能不同，混用客户端会命中率暴跌。
6. **过期时间陷阱**：`expire` 传一个 > 30 天的整数，server 会**当成绝对 Unix 时间戳**解释，结果立刻过期。永远传相对秒数 ≤ 30 天，或用 `time.time() + N`。
7. **多线程不等于无锁**：worker 之间共享 hash table 和 LRU 链，热点 key 会触发互斥锁竞争。极端情况下 16 核反而比 4 核慢。

## 适用 vs 不适用场景

适用：

- 数据库查询结果缓存（用户资料、商品详情、计数器中间值）
- 会话 ID → session 字节流的快速读取
- 渲染好的 HTML 片段、API 响应体
- 跨进程共享的轻量计算结果（rate limiter 计数也行）
- 流量超过单机数据库 QPS 上限时的横向缓冲带

不适用：

- 需要持久化的『轻量数据库』场景 → 选 Redis（带 AOF/RDB）或 SQLite
- 需要数据结构（list / hash / sorted set）→ 选 Redis
- 需要主从复制 / 高可用 → 选 Redis Sentinel / Cluster
- 需要发布订阅、Stream、Geo、Lua 脚本 → 选 Redis
- value 经常 > 1MB → 用 S3 / 对象存储更合适
- 公网暴露的服务 → Memcached 没认证不能裸跑

## 历史小故事（可跳过）

- **2003 年**：Brad Fitzpatrick 在 LiveJournal 被 MySQL 压力压垮，写了第一版 Memcached，几百行 C 跑在 Perl 网站前面
- **2004 年**：Danga Interactive 把它开源，迅速被 Slashdot / Wikipedia / Facebook / YouTube 采用
- **2008 年**：Facebook 把 Memcached 用到几千台机器，写了一系列优化（UDP 协议、多 get 批量、warm-up）回馈社区
- **2010 年**：libevent 替换为多线程 + libevent 组合，单机吞吐进一步上去
- **2013 年**：Twitter 出 Twemcache（带分桶淘汰）；Facebook 写了著名论文 *Scaling Memcache at Facebook* 复盘十年经验
- **2014 年**：Redis 普及后，新项目大量改投 Redis，Memcached 进入『稳定但不再火爆』状态
- **2020 年代**：Memcached 仍是 AWS ElastiCache 的两个引擎之一，作为『纯 KV 缓存』的首选未被淘汰

## 学到什么

- 『把热数据搬到内存』是最朴素也是最强的扩容手段——这条 2003 年到 2026 年没变
- 『服务端不知道集群存在，把分片决策推给客户端』是去中心化设计的极致简化
- 协议简单到 telnet 能玩，是工程教育的活教材：每个命令都看得见、摸得着
- Slab Allocator 教会人『定长 chunk 分桶』比通用 `malloc` 在长期运行的服务里更稳
- 极简的代价是钙化与单点丢失——简单不等于免费，是把复杂度推给了运维和客户端
- 与 Redis 并存这件事本身就值得思考：『纯字节 KV』和『数据结构服务器』是两条不同的产品线，不是谁取代谁

## 延伸阅读

- 官方 wiki：<https://github.com/memcached/memcached/wiki>
- Facebook 论文：*Scaling Memcache at Facebook*（NSDI 2013）—— 大规模实战经验
- 协议规范：<https://github.com/memcached/memcached/blob/master/doc/protocol.txt>
- 关联：[[redis]] —— 同生态对手，数据结构服务器路线
- 关联：[[libevent]] —— Memcached 的事件循环底座
- 关联：[[mysql]] —— 最常被 Memcached 挡在前面的数据库

## 关联

- [[redis]] —— 后起的数据结构服务器，覆盖了 Memcached 大量场景
- [[libevent]] —— C 语言事件循环库，Memcached 的并发骨架
- [[mysql]] —— Memcached 最常被部署在它前面挡读流量
- [[nginx]] —— 同时代的 C 高性能服务器，事件驱动思路相通
- [[consistent-hashing]] —— 客户端分片的算法基础
- [[lru-cache]] —— 淘汰策略，Memcached 在每个 slab class 内独立维护

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[mysql]] —— MySQL — 全球最流行关系数据库
- [[nginx]] —— nginx — 高性能 Web 服务器
- [[redis]] —— Redis — 内存键值数据库


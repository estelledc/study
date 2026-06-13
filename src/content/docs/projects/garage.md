---
title: Garage — 去中心化 S3 兼容对象存储
来源: https://git.deuxfleurs.fr/Deuxfleurs/garage
日期: 2026-06-13
子分类: databases-storage
分类: 数据库
难度: 中级
provenance: pipeline-v3
---

## 是什么

Garage 是 Deuxfleurs（法国非营利组织）用 Rust 写的轻量级分布式对象存储，2020 年发布。API 兼容 AWS S3，但设计理念和 MinIO 走了完全不同的路——Garage 不追求性能极致，而是追求"在地理分散、网络不可靠的环境里也能自愈、不掉数据"。

日常类比：

- AWS S3 = **公共仓库**，按用量付费，钥匙在亚马逊手里
- MinIO = **公司大车库**，性能好、空间大，但假设你的服务器放在同一个机房
- Garage = **社区里每家每户的私人储物间**，每家存一份副本，即使有几家断电出门了，东西还在

MinIO 靠 Erasure Coding 省空间，Garage 靠全量副本（默认 3 份）+ CRDT 自动同步求稳。二者不是竞争关系——MinIO 适合单机房高性能场景，Garage 适合跨城市 / 跨大陆的自建小集群。

## 为什么重要

S3 协议是过去十年云存储的事实标准，但"自建 S3"这件事一直有个矛盾：想省云费用，但又怕自己的服务器挂掉丢数据。MinIO 解决了"省费用"的问题，但多机房部署仍然要配外部工具同步。Garage 把这个矛盾从根上解了：

- **去中心化**：没有 leader 节点，每个节点平权。关掉任意一台机器，系统继续工作——不像 Raft 集群要等 leader 选举
- **CRDT 元数据系统**：并发写入自动合并，不会因为"两个用户同时改同一条元数据"就报冲突。这是 Garage 最核心的架构创新
- **跑在树莓派上**：Rust 编译后内存占用低，一台树莓派 4 就能跑完整节点。用在后院、学校机房、社区网络这些"非机房环境"
- **自愈能力**：节点离线后自动重平衡数据，节点回来后自动补齐缺失副本。运维可以"先换硬盘再管他"，不用半夜爬起来救
- **K2V API**：除了 S3 协议，还内置了一个基于 CRDT 的键值存储 API，适合存"需要合并的并发修改"（如协作编辑、邮箱元数据）

理解 Garage，就理解了一个重要设计决策：**有时候不用 consensus（共识算法）反而是更好的架构选择**。

## 核心要点

Garage 能撑起"无 leader、多机房自建 S3"，靠的是五件事拼在一起：

### 1. 零共识算法 —— 用 CRDT 替代 Raft

这是 Garage 最激进也最核心的设计选择。官方论文第一句话："我们在 Garage 的设计中做了一个激进的选择：不使用任何共识算法。"

为什么不用 Raft？因为 Raft 依赖一个 leader 协调所有操作——leader 挂了要等选举（网络不稳时可能任意长时间），leader 网络慢了拖慢整个集群。地理分散场景下这是天然劣势。

Garage 的替代方案：
- 元数据（bucket、对象、版本、API key）用 **CRDT（Conflict-free Replicated Data Types）**存储——LWW Map / LWW Register / Deletable 包装
- 数据块用内容寻址（content-addressed）+ 引用计数管理
- 写入走 Dynamo 风格的 **quorum**（写多数节点 + 读多数节点），不是 linearizability

日常类比：Raft 像一个餐厅只有一个经理，所有服务员都要问他"这个菜能上吗"——经理请假了就全停。Garage 像每个服务员手里都有同样一份菜单，上菜前互相确认一下"这道菜 3 个人里有 2 个人说可以就上"。

### 2. Merkle 树反熵同步

既然没有 leader 广播变更，节点之间怎么知道"我缺了哪些数据"？

Garage 用 **Merkle 树反熵（Anti-Entropy）** 同步：

- 每张表（Buckets / Objects / Versions）各维护 65536 棵 Merkle 树，按 partition hash 的前 2 字节分桶
- 节点间定期交换根哈希，哈希不同 → 递归比对子树 → 找到差异条目 → 交换缺失数据
- 类比：两个图书管理员定期核对自己的书单（Merkle 树根），发现对不上就一本一本对（递归），找到缺的书就补

### 3. 双复制策略

不是所有数据都一样重要。Garage 区分两类表：

| 策略 | 适用表 | 特点 |
|------|--------|------|
| **Full Replication** | BucketTable, KeyTable | 每条数据在所有节点存完整副本 |
| **Sharded Replication** | ObjectTable, VersionTable | 按 hash 分片，每份数据只在 N 个节点存（N = replication_factor）|

小表全量复制（本来数据量就不大），大表按分片存（省空间）。这是"该省就省"的工程实用主义。

### 4. 多存储后端

Garage 不绑定特定的数据库引擎，目前支持三种：

- **LMDB**（内存映射 key-value 存储）——最快，但单文件
- **SQLite**（WAL 模式）——最通用，几乎所有系统自带
- **Fjall**（Rust LSM-tree 引擎）——LSM 树结构，适合写密集

生产环境默认推荐 LMDB，但想简单调试时 SQLite 一行配置即可。

### 5. 静态网站托管 + K2V 双协议

除了标准 S3 API（PutObject / GetObject / ListBucket / Multipart Upload / 预签名 URL），Garage 还自带两项附加能力：

- **S3 Web**：直接暴露 bucket 为静态网站（类似 AWS S3 Static Website Hosting），`index.html` + 404 页面
- **K2V API**：基于 CRDT 的因果一致性键值存储，用 Dotted Version Vector Sets (DVVS) 追踪并发写入的因果关系。适合需要"我知道你基于哪个版本改的"的应用场景（比如协作编辑、邮件元数据）

## 实践案例

### 案例 1：Docker 单机上手

最小的能用的 Garage，两分钟跑起来：

```bash
# 1. 生成密钥
RPC_SECRET=$(openssl rand -hex 32)
ADMIN_TOKEN=$(openssl rand -base64 32)

# 2. 写配置文件 garage.toml
cat > garage.toml <<EOF
metadata_dir = "/var/lib/garage/meta"
data_dir = "/var/lib/garage/data"
db_engine = "sqlite"
replication_factor = 1
rpc_bind_addr = "[::]:3901"
rpc_public_addr = "127.0.0.1:3901"
rpc_secret = "$RPC_SECRET"

[s3_api]
s3_region = "garage"
api_bind_addr = "[::]:3900"
root_domain = ".s3.garage.localhost"

[admin]
api_bind_addr = "[::]:3903"
admin_token = "$ADMIN_TOKEN"
EOF

# 3. 启动容器
docker run -d --name garage \
  -p 3900:3900 -p 3901:3901 -p 3903:3903 \
  -v $(pwd)/garage.toml:/etc/garage.toml \
  -v garage_meta:/var/lib/garage/meta \
  -v garage_data:/var/lib/garage/data \
  dxflrs/garage:v2.1.0

# 4. 配置布局（即使是单节点也要配）
NODE_ID=$(docker exec garage garage node id -q)
docker exec garage garage layout assign -z dc1 -c 1G $NODE_ID
docker exec garage garage layout apply --version 1

# 5. 创建 key + bucket
KEY_ID=$(docker exec garage garage key create demo-key | jq -r '.accessKeyId')
SECRET=$(docker exec garage garage key create demo-key | jq -r '.secretAccessKey')
docker exec garage garage bucket create demo-bucket
docker exec garage garage bucket allow --read --write --owner demo-bucket --key demo-key
```

Garage 比 MinIO 多了一步"配置布局"——因为它是为多节点设计的，即使单节点也要指定这个节点的 role 和容量。

### 案例 2：用 aws-cli 测试

配好 key 后，S3 客户端无缝接入：

```bash
aws configure set aws_access_key_id $KEY_ID
aws configure set aws_secret_access_key $SECRET
aws configure set region garage

aws s3 cp hello.txt s3://demo-bucket/ --endpoint-url http://localhost:3900
aws s3 ls s3://demo-bucket/ --endpoint-url http://localhost:3900
```

和 MinIO 完全一样——改 endpoint 即可，代码不用动。`forcePathStyle` 同样需要设为 true（因为 Garage 也用路径风格 URL）。

### 案例 3：多节点集群（三台树莓派）

多节点只需要在 `garage.toml` 里互相知道对方的 RPC 地址：

```toml
# 每个节点都配同样的 rpc_secret + 同样的种子节点
rpc_secret = "<三台机器一样>"

# 第一台机器的 ID 作为 bootstrap
bootstrap_peers = ["192.168.1.10:3901"]
```

启动后三台机器各自 `garage node id` 拿到 ID，然后在一台上 `layout assign` 分三台，`layout apply`。之后任一台挂了，另外两台继续服务——客户端改为连另一台的 3900 端口即可。

## 踩过的坑

**单节点也要 layout apply**：这是首次接触 Garage 最常见的"卡住"点——Docker 跑起来了，bucket 建不了，报 `no nodes available`。原因是没有 `layout assign` + `layout apply`。Garage 的任何节点必须先被"分配到布局"才能工作，即使是单节点。

**replication_factor 不能超过节点数**：`replication_factor = 3` 但只有 2 个节点 → layout apply 失败。这和 MinIO 的 EC 模式要求"至少 N+M 块盘"类似——副本数不能大于可用节点数。

**大对象上传注意 multipart**：和 MinIO 一样，大文件（超 100MB）应该走 multipart upload。Garage 的 S3 API 支持 multipart，但默认 chunk size 建议 16MB（比 MinIO 的 5MB 大），因为 Garage 的网络往返可能跨城市，chunk 太小会放大开销。

**内网时钟同步**：Garage 的 LWW CRDT 依赖时间戳做"最后写入胜出"判断。如果三台机器的时钟差超过几秒，"后写"的数据可能被"先写"的数据覆盖。生产环境必须配 NTP（Network Time Protocol），这是 CRDT 方案的代价。

**容量规划按副本算**：3 份 replication、每份 10GB 数据 = 实际占 30GB。不要按 MinIO 的 EC 思维（N 份数据 + M 份校验）来估算磁盘——Garage 是全量副本，空间开销更大。

## 历史小故事

- **2020**：Deuxfleurs 发布 Garage 0.1。背景是他们对现有的自建对象存储（MinIO、Ceph）在多机房部署时的运维成本不满，决定自己写一个"没有 leader 节点"的版本
- **2021**：获得 NLnet（欧盟 NGI 基金）资助，CRDT 元数据系统定型。同期推出 K2V API 原型
- **2022**：v0.8 带来完整的 S3 API 兼容 + 静态网站托管，开始被家庭服务器社区关注
- **2023**：在法国计算机学会期刊《1024》发表论文《Garage：一个为地理分布式自托管设计的轻量 S3 对象存储》，明确"零共识"哲学。同年 LMDB 后端 GA
- **2024**：v1.0 正式版发布，SQLite 后端稳定，Fjall LSM 后端加入实验性支持。GitHub 镜像获得 3000+ stars
- **2025-2026**：v2.x 迭代——Fjall 后端成熟、K2V API 加入 DVVS 因果一致性、多 zone 布局优化

六年时间从"法国几个人的业余项目"变成"开源自建存储的重要一极"，靠的不是性能碾压，而是"解决了一个 Ceph/MinIO 都没认真解决的问题"。

## 学到什么

- **不用共识算法有时候是对的**：计算机科学教材里大部分分布式系统都以 Raft/Paxos 为前提，但 Garage 证明——如果你的场景不需要 strong consistency（S3 API 本身就不保证），CRDT + quorum 可能更稳健
- **CRDT 是地理分布的天然搭档**：并发写入自动合并、不需要中心协调、网络分区期间各自正常工作——这正是多机房、边缘计算的理想模式
- **全量副本 vs Erasure Coding 是两种不同的哲学**：MinIO 选 EC（省空间但要更多 CPU 算校验），Garage 选全量副本（费空间但简单可靠）。没有绝对的好坏，只看你的瓶颈是磁盘还是复杂度
- **Rust 在基础设施里的优势**：无 GC（没有 JVM / Go runtime 的停顿风险）、编译成单个 binary（部署简单）、内存安全（CRDT 这类复杂数据结构的 bug 更难写出来）
- **S3 API 兼容 = 生态复用**：Garage 没发明新的对象存储 API，只实现了 S3 协议的标准子集，结果 boto3 / aws-cli / rclone / s3cmd 全都能直接用——这和 MinIO 的策略一致，但 Garage 用更少的代码（Rust + 更小 scope）实现了

## 延伸阅读

- 官方文档：[Garage Documentation](https://garagehq.deuxfleurs.fr/)
- 论文（法语）：[Garage : un stockage objet léger pour l'autohébergement géo-distribué](https://cnrs.hal.science/hal-04387879v1/file/1024_22_2023_171.pdf) — 《1024》期刊，2023
- GitHub 镜像：[github.com/deuxfleurs-org/garage](https://github.com/deuxfleurs-org/garage) — 主仓库在 git.deuxfleurs.fr，这里是镜像
- CRDT 入门：[crdt.tech](https://crdt.tech/) — 通俗解释 CRDT 原理和常见类型
- Dynamo 论文：[Dynamo: Amazon's Highly Available Key-value Store](https://www.allthingsdistributed.com/files/amazon-dynamo-sosp2007.pdf) — Garage 的 quorum 读写风格源自这篇经典
- 相关项目：[[minio]] — 同为自建 S3，理念不同（EC vs 全量副本），场景不同（单机房高性能 vs 多机房自愈）

## 关联

- [[minio]] —— 同为自建 S3 对象存储，但设计哲学不同：MinIO 追求单机房高性能 + EC 省空间，Garage 追求多机房无 leader 自愈 + 全量副本
- [[docker]] —— 本地跑 Garage 最快路径，官方提供 `dxflrs/garage` 镜像
- [[kubernetes]] —— 第三方 Operator (`rajsinghtech/garage-operator`) 支持 K8s 部署，适合自建多节点集群
- [[rclone]] —— S3 兼容的对象存储通用客户端，连接 Garage 只需改 endpoint
- [[sqlite]] —— Garage 的三种存储后端之一（最通用），另外两种是 LMDB 和 Fjall

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->


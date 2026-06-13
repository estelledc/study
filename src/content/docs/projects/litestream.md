---
title: Litestream — 把 SQLite 的每一次改动实时流式备份到 S3
来源: https://github.com/benbjohnson/litestream
日期: 2026-06-13
分类_原始: 数据库与存储
子分类: databases-storage
分类: 数据库
难度: 中级
provenance: pipeline-v3
---

## 是什么

**Litestream** 是一个开源命令行工具，以**旁路进程**（sidecar）的方式运行在你的应用旁边，持续把 SQLite 数据库的每一次改动**实时流式复制到云存储**（S3 / GCS / Azure Blob / SFTP 等），实现秒级灾难恢复。

日常类比：大楼里的**监控摄像头**。你的 SQLite 应用在"办公室"里正常工作，Litestream 就像摄像头，**默默盯着每一笔改动**，实时传到云端录像机。万一办公室着火（服务器挂了），你随时能从云端把最后一秒的录像调出来，毫发无损。

底下踩三块基石：

- **SQLite WAL 模式**：SQLite 不改原文件，所有改动先写到一个单独的 WAL（Write-Ahead Log）文件，再定期合并回去
- **页级复制**：SQLite 以 4096 字节的"页"为最小存储单位，Litestream 跟踪被修改的页，而不是 SQL 语句
- **LTX 文件格式**（v0.5+）：把 WAL 变更打包成有序的、可压缩的、支持层级合并的不可变文件

作者 Ben Johnson 在 Fly.io 开发了它，同时也是 LiteFS（分布式 SQLite 文件系统）的作者。Litestream 目前有超过 17k GitHub stars，Go 语言编写，Apache 2.0 协议。

## 为什么重要

没有 Litestream 时，给 SQLite 做实时备份会碰到几个硬骨头：

- **`sqlite3 .backup` 是快照，不是连续流**——你只能定期（例如每小时）跑一次，两次备份之间的数据全丢了
- **直接复制 db 文件需要全局锁**——复制过程中数据库不能写，对线上服务等于每次备份都停一次机
- **`litestream` 之前的方案不是太重就是太糙**——要么自己写 WAL 解析 + S3 上传几百行代码，要么干脆不管备份裸奔
- **SQLite 常用于边缘 / 嵌入式场景**——这些地方往往没有专业 DBA，出了事连恢复的人都没有

Litestream 一次性解决：

- **零代码侵入**——不改你的应用代码，不改 SQL 语句，不改 ORM，启动一个旁路进程就行
- **秒级 RPO**（Recovery Point Objective）——默认每 1 秒检查一次 WAL，改动几乎是实时传到云端
- **按时间点恢复**——出问题后能恢复到"事故前 5 秒"的状态，精确到毫秒
- **成本极低**——S3 对象存储按用量计费，一个中小型 SQLite 数据库每天几分钱

## 核心要点

Litestream 的心智模型是 **"给 SQLite 配一个 24 小时不停歇的备份秘书"**：

### 工作流程

```
你的应用 → SQLite (WAL 模式) → Litestream 旁路进程 → S3/GCS/Azure
  │            │                       │
  │   INSERT   │   写入 WAL 文件        │  读 WAL → 打包成 LTX → 上传
  │  UPDATE    │   ...                  │  定期 checkpoint → 合并 LTX
  │  DELETE    │   ...                  │  定期 snapshot → 全量快照
```

1. **WAL 拦截**：Litestream 打开一个长事务阻止 SQLite 自己做 checkpoint，然后构建一个"影子 WAL"记录所有被改的页
2. **页级流式上传**：只传被修改的 4096 字节页面（物理复制），不传 SQL 语句（逻辑复制），效率极高
3. **LTX 层级合并**：30 秒内的改动打成 L1 文件 → 5 分钟内的 L1 合成 L2 → 按小时合成 L3，以此类推。最终恢复只需要读大约 12 个文件，而不是重放几万个 WAL 碎片
4. **周期性快照**：默认每 24 小时把当前完整数据库拍一张快照，加速恢复

### 核心配置（litestream.yml）

```yaml
dbs:
  - path: /data/production.sqlite3       # 要备份的数据库路径
    replica:
      type: s3                            # 目标类型
      bucket: my-backups                  # S3 桶名
      path: litestream/mydb               # 桶内路径
      endpoint: https://s3.amazonaws.com  # S3 endpoint
      retention: 720h                     # 保留 30 天
      sync-interval: 10s                  # 每 10 秒同步
      snapshot-interval: 24h              # 每 24 小时快照
```

启动后一行命令跑起来：

```bash
litestream replicate -config litestream.yml
```

### 支持的存储后端

S3（含 MinIO / R2 / Tigris 等兼容实现）、Google Cloud Storage、Azure Blob Storage、SFTP、NATS JetStream、WebDAV、阿里云 OSS、本地文件系统。

### v0.5 关键变化

- 去掉 CGO（用 `modernc.org/sqlite` 纯 Go 实现），交叉编译更简单
- **代际（generations）换 TXID**——从多代并行改成一个单调递增的事务 ID，更易理解
- 新增 NATS JetStream 后端
- 级别压缩大幅减少恢复时需下载的文件数

## 实践案例

### 案例 1：Docker 部署最小化配置

最简场景——把容器里的 SQLite 实时备份到 S3：

```dockerfile
FROM alpine:latest
RUN apk add --no-cache litestream sqlite

COPY litestream.yml /etc/litestream.yml
COPY start.sh /start.sh

CMD ["/start.sh"]
```

`start.sh`——应用和 Litestream 同时启动，一个死了另一个也停：

```bash
#!/bin/sh
# 先恢复最新备份（如果本地没有数据库）
litestream restore -if-db-not-exists -o /data/app.db s3://my-backups/app
# 启动 Litestream 复制进程
litestream replicate &
# 启动你的应用
./myapp
# 应用退出后清理 Litestream
kill %1
wait
```

关键点：`-if-db-not-exists` 表示本地已有数据库就跳过恢复（幂等），新容器冷启动才从 S3 拉。

### 案例 2：恢复到指定时间点

服务器在 15:30 被人误删了数据，你要恢复到 15:29:50：

```bash
litestream restore \
  -timestamp '2026-06-13T15:29:50Z' \
  -o /tmp/recovered.db \
  /data/production.sqlite3
```

把恢复出来的 `/tmp/recovered.db` 验证无问题后替换原库即可。Litestream 从 S3 拉最近一次快照 + 对应时间段的 LTX 增量文件，按页重放到指定时间点。

### 案例 3：多数据库备份 + 监控

一个跑多个 SQLite 实例的服务（例如 SAAS 给每个租户一个 SQLite 文件）：

```yaml
dbs:
  - path: /data/tenant_*.sqlite3     # 通配符匹配所有租户库
    replica:
      type: s3
      bucket: my-backups
      path: litestream/tenants
      retention: 168h

  - path: /data/shared.sqlite3
    replica:
      type: s3
      bucket: my-backups
      path: litestream/shared
      retention: 720h
```

检查复制状态：

```bash
litestream status          # 列出所有数据库的复制健康度
litestream databases       # 列出所有被管理的数据库
```

### 案例 4：使用 Go Library 嵌入应用

不想跑单独进程，也可以用 Go 库直接把复制逻辑嵌入应用：

```go
import (
    "github.com/benbjohnson/litestream"
)

func main() {
    db := litestream.NewDB("mydb", "/data/app.db")
    db.Replicas = []litestream.Replica{
        &litestream.S3Replica{
            Bucket: "my-backups",
            Path:   "litestream/mydb",
        },
    }
    db.Open()
    defer db.Close()
    // 正常用 SQLite，Litestream 在后台自动复制
}
```

注意：库 API 尚不稳定，CLI 模式更适合生产环境。

## 踩过的坑

1. **v0.5+ 去掉了 Age 加密**——v0.3.x 支持 Age 文件加密，v0.5 因 LTX 格式重构去掉了。从 v0.3.x 升级后旧加密备份无法恢复。替代方案：在 S3 侧开 SSE-KMS 加密，或使用 SQLCipher 加密数据库本身。

2. **时间点恢复大库会卡住**（v0.5.1-v0.5.5）——LTX 文件超 100 个时，`restore -timestamp` 需要逐个调 S3 `HeadObject` 取元数据，卡死。v0.5.6 修了（改成并行批量查询）。如果卡住，先确认版本 ≥ 0.5.6。

3. **超大数据库（50GB+）恢复可能失败**——个别 S3 兼容后端（如 Tigris）在恢复超大库时出现 `unexpected EOF` 页解码错误。超大库建议先用 `litestream snapshot` 手动生成快照再加增量。

4. **WAL 段过多导致超时**——写负载极高的库可能一天产生上千个 WAL 子段，下载单个 WAL 要 20+ 分钟导致超时。v0.3.x 没有内置重试逻辑。

5. **多进程不能共享同一个 SQLite 文件**——Litestream 需要独占 WAL checkpoint 控制权。如果另一个进程也在操作同一个 db 文件的 WAL，会导致复制中断。

6. **Library 模式只支持 `modernc.org/sqlite` 驱动**——混用其他 SQLite 驱动（如 `mattn/go-sqlite3`）会在 POSIX 系统上导致锁冲突。如果必须嵌入库模式，统一用纯 Go 驱动。

## 适用 vs 不适用

**适用场景**：

- 单机 / 单容器部署的 SQLite 应用（博客、个人项目、边缘设备、Raspberry Pi）
- 需要一个"不用动代码、不用改 ORM"的实时备份方案
- 中小型数据库（几十 MB 到几 GB），写频率每秒钟几十到几百次
- 对 RPO（数据丢失窗口）要求 < 1 分钟的场景
- 灾难恢复而非多活——只需要"出事能恢复"，不需要多节点读写

**不适用场景**：

- 需要多节点同时写入（分布式 SQLite）→ 用 LiteFS 或 rqlite
- 超大写入量（每秒几千次写）→ WAL 段过多会导致恢复困难，考虑专门的数据库
- 需要多区域低延迟读 → 用 Turso 或 Cloudflare D1，Litestream 只做备份不做分发
- 需要数据库层面加密 → v0.5+ 没有内置加密，需要外部方案

### Litestream vs LiteFS vs 传统备份

| 特性 | Litestream | LiteFS | 传统 cron + cp |
|------|-----------|--------|----------------|
| RPO | 秒级 | 秒级 | 小时级 |
| 备份目标 | 对象存储 | 其他节点 | 本地/网络盘 |
| 多读副本 | 不支持 | 支持 | 不支持 |
| 侵入性 | 零代码 | FUSE 文件系统 | 零代码 |
| 复杂度 | 低（一个二进制） | 中（需 Consul） | 低（一行脚本） |
| 恢复粒度 | 按时间点 | 按时间点 | 上一次备份时间 |

## 历史小故事

Litestream 诞生于 Fly.io 的"边缘计算"理念：把应用部署在全球各节点，就近服务用户。但 SQLite（他们的主力边缘数据库）的备份一度是块心病——边缘节点极多、运维极薄，不可能每台机器都配 DBA。

Ben Johnson 的答案是：**"SQLite 本身就是完美的文件格式，为什么还要再包装一层？直接把它的变更流推到对象存储就行了。"** 这个思路简洁到几乎粗暴，但恰好击中了痛点。

后来 Ben 又做了 LiteFS——基于 FUSE 文件系统实现 SQLite 多节点实时复制，理念更激进但复杂度也更高。做 LiteFS 的过程中他把 LTX 格式反向移植到 Litestream，形成了 v0.5 的大升级。他自己说："Litestream 是更受欢迎的那个项目。" 原因很简单——够用、够简单、不用改代码。

## 学到什么

1. **WAL 是 SQLite 的"变更日志"**，不只是性能优化——它天然适合做实时复制的数据源。理解 WAL 机制是掌握 SQLite 进阶的关键。

2. **页级复制（物理复制）比语句级复制（逻辑复制）更高效**——不用解析 SQL、不用处理方言差异、直接复制原始存储页面，缺点是不跨数据库版本兼容。

3. **"分层合并"（L0→L1→L2...）是处理流式数据的经典模式**——LSM-Tree、RocksDB、Litestream 都在用。核心思想：热数据频繁写小文件，冷数据慢慢合成大文件，取一个"写入速度"和"读取效率"的平衡。

4. **旁路进程（sidecar）是给老系统加能力的优雅模式**——不用改代码、不用重新编译、不用升级 ORM，一个独立二进制在旁边默默干活。Kubernetes 的 Pod 多容器、Envoy 代理、Litestream 都是这个思路。

5. **S3 的"无限存储 + 按量计费"改变了备份的经济模型**——以前做实时备份要自建存储集群，现在几行配置 + 几分钱一天就能做到秒级 RPO。

## 延伸阅读

- 官方文档：[litestream.io](https://litestream.io/)——Getting Started、Guides、Reference 三部分结构清晰
- GitHub 仓库：[benbjohnson/litestream](https://github.com/benbjohnson/litestream)——源码 + Issue 讨论 + Release Notes
- 作者博客：Fly.io 博客上 Ben Johnson 的 Litestream 系列文章（Getting Started、Revamped、Writable VFS）
- 兄弟项目：[LiteFS](https://github.com/superfly/litefs)——分布式 SQLite 文件系统，支持多节点实时复制和故障转移
- Simon Willison 的 Litestream 使用笔记——多个真实项目的部署经验和踩坑记录

## 关联

- [[sqlite]] —— Litestream 存在的全部前提，理解 SQLite WAL 模式是理解 Litestream 的基础
- [[litestream]] —— 本页
- [[litefs]] —— 同作者的分布式 SQLite 方案，适合需要多节点读写的场景
- [[rqlite]] —— 基于 Raft 共识的分布式 SQLite，理念不同但解决相似的问题
- [[turso]] —— 托管 SQLite 服务，边缘分发 + Litestream 级别的持久化
- [[cloudflare-d1]] —— Cloudflare 的分布式 SQLite（基于 Durable Objects），和 Litestream 一样用 WAL 复制思路

---
title: Conduit — Rust 写的极简 Matrix homeserver，单二进制 + 嵌入式数据库
来源: 'https://github.com/famedly/conduit'
日期: 2026-05-30
分类: communication
难度: 中级
---

## 是什么

Conduit 是 **Matrix 协议**的另一种 homeserver 实现——一个 Rust 二进制 + 一份配置文件，跑起来就是一台你自己的 Matrix 聊天服务器。日常类比：[[synapse]] 像一家"全功能邮局"——分拣、长途运输、客户柜台分别有专人（多个 worker 进程 + PostgreSQL + Redis）；Conduit 像"村口邮政代办点"——一个人一台机器把所有活包了，规模不大但够用。

具体说，Synapse 默认部署要 Python 解释器 + PostgreSQL + Redis + 反代 + 多个 worker 进程；Conduit 只要把二进制丢上去：

```bash
docker run -d --name conduit \
  -v conduit-data:/var/lib/matrix-conduit \
  -e CONDUIT_SERVER_NAME=chat.example.com \
  -p 6167:6167 \
  matrixconduit/matrix-conduit:latest
```

底层用 **RocksDB**（嵌入式 LSM-tree 数据库）直接读写文件系统，不需要外置数据库进程。整个服务器跑起来 128MB 内存够用。

## 为什么重要

- 不理解 Conduit 这种"极简实现"路线，就解释不清"为什么同一个协议能有重得跑不动的实现也能有 128MB 内存的实现"——架构选择决定运维门槛
- 它证明了 **单二进制 + 嵌入式 KV** 是 self-host 时代的可行解——不需要把每个组件都拆成微服务
- Rust + tokio 在长连接异步服务器场景的代表作之一——和 [[axum]] 同栈，可对照学
- 看清"参考实现 vs 替代实现"的取舍——Synapse 求全求兼容、Conduit 求轻求快

## 核心要点

Conduit 的设计哲学可以拆成 **三件事**：

1. **单进程 + 嵌入式数据库**：所有用户、房间、事件、媒体都写到一份 RocksDB 目录里，没有 PostgreSQL 也没有 Redis。日常类比：像 SQLite vs MySQL——SQLite 把数据库当一个文件，进程退出文件还在；Conduit 把整个 Matrix server 折叠成一个进程 + 一个数据目录。

2. **Rust 类型系统替代运行时校验**：[[synapse]] Python 版本里大量"传错类型 → 运行时崩"由 Rust 编译期就拦了。配合 ruma（Matrix 协议的 Rust 实现库），协议层错误几乎不会到生产。

3. **同步联邦解析（不拆 worker）**：Synapse 把 federation_sender 拆成专门 worker，Conduit 在主进程内联做完。优点是简单，缺点是大房间联邦时主进程被吃满，影响其他客户端响应。

## 实践案例

### 案例 1：一台廉价 VPS 跑朋友圈 Matrix

最小配置：1C 512M 的 VPS，加域名、HTTPS 反代和 `_matrix._tcp` SRV 或 `.well-known/matrix/server` 后就能联邦：

```toml
# conduit.toml
[global]
server_name = "chat.example.com"
database_backend = "rocksdb"
database_path = "/var/lib/matrix-conduit/"
port = 6167
max_request_size = 20_000_000  # 20MB 上传上限
allow_registration = false      # 关注册避免被滥用
trusted_servers = ["matrix.org"]
```

跑起来后用 Element 客户端连上，邀请朋友进同一个 homeserver 就能聊。整月 VPS 成本 30 元以内。

### 案例 2：树莓派/NAS 上做家庭 IM

单二进制特别适合 ARM 设备。在树莓派 4B 上，稳妥做法是让 Docker/OCI 镜像自动拉取 arm64 层：

```bash
docker run -d --name conduit \
  --restart unless-stopped \
  -v /srv/conduit:/var/lib/matrix-conduit \
  -e CONDUIT_SERVER_NAME=home.example.com \
  -e CONDUIT_DATABASE_BACKEND=rocksdb \
  -p 6167:6167 \
  matrixconduit/matrix-conduit:latest
```

家里 4-5 个人聊天 + 简单文件分享完全够。RocksDB 文件直接随 NAS 备份策略走，不用额外管 PG dump；升级前先停容器、备份 `/srv/conduit`，再换镜像。

### 案例 3：替代 Synapse 减运维（小团队）

10-30 人的工作室原本跑 Synapse 累得不行——PostgreSQL 升级、Redis 监控、worker 拆分调优。换 Conduit 后：

```yaml
# docker-compose.yml
services:
  conduit:
    image: matrixconduit/matrix-conduit:latest
    volumes: ["./data:/var/lib/matrix-conduit"]
    environment:
      CONDUIT_SERVER_NAME: chat.studio.com
      CONDUIT_ALLOW_FEDERATION: "true"
    ports: ["6167:6167"]
```

一份 compose 文件结束，监控只看一个进程一份磁盘。代价是大房间联邦慢、某些高级特性（详细 push 规则）暂缺。

## 踩过的坑

1. **联邦加入大房间慢**：和 [[synapse]] 同款问题——加 `#matrix:matrix.org` 这种 1 万人房间要拉完整 state，单进程 Conduit 反而更明显，可能十几分钟。生产环境给用户预期管理写清楚。

2. **beta 期升级破坏性强**：Conduit 仍在 beta，某些版本之间 RocksDB schema 不兼容。**升级前必须备份 data 目录**，别"docker pull latest"直接上。

3. **某些 Matrix 特性缺失**：presence（在线状态推送）、部分 push 通知规则、高级房间 ACL 在某些版本不全。Element 客户端会**安静降级**——你以为消息发出去了，对方其实没收到通知。需要在客户端检查送达回执。

4. **单进程不能水平扩展**：用户量到 200+ 单进程 CPU 就紧张，Conduit 没有 Synapse 那种 worker 拆分方案，**只能垂直扩展**（升 CPU）。再大就要回头走 Synapse 或 Dendrite。

## 适用 vs 不适用场景

**适用**：

- 个人/家庭/小团队（<100 用户）自托管 Matrix
- 树莓派 / 低配 VPS / NAS 这种内存受限设备
- 想体验 Matrix 协议但不想搞 PG 调优的运维新手
- 强调"一份二进制 + 一份数据"的简单备份模型

**不适用**：

- 千人以上的大型部署 → 用 [[synapse]] worker 拆分模型
- 需要全部 Matrix spec 特性（高级 push / presence / 复杂 ACL）→ Synapse 仍是参考实现
- 需要联邦大量人气房间且要求秒级加入 → 任何 homeserver 都吃力，Conduit 更甚
- 完全没有运维兜底的非技术用户 → 用商业 Matrix 服务（Element Cloud）更省心

## 历史小故事（可跳过）

- **2020 年 10 月**：Timo Kösters 在 famedly（德国做数字医疗 IM 的公司）开始写 Conduit，目标是给医院自托管一个轻量 Rust homeserver
- **2021 年**：第一个公开 release，Apache 2.0，借助 ruma（Rust Matrix 协议库）快速补齐基础 federation
- **2022-2023 年**：稳定 beta，社区里"小规模自托管"用户量起来；性能上单二进制 vs Synapse 多进程的对比开始流传
- **2024 年初**：社区对开发节奏不满，分叉出 **conduwuit**（girlbossceo 维护），用更激进的节奏补齐 federation 特性、修 bug
- **2024 年末**：conduwuit 维护者退出归档，社区接力 continuwuity 项目；上游 Conduit 仍由 famedly 维护，迭代更稳但慢

## 学到什么

1. **协议规范 vs 实现选择是两件事**——同一个 Matrix 协议，可以是 Python 多进程也可以是 Rust 单二进制，运维门槛差几个数量级
2. **单二进制 + 嵌入式 KV** 是 self-host 时代的关键模式——SQLite 思路从数据库扩散到整个应用层
3. **Rust 编译期类型替代运行时校验**——能把 Python 版本里"传错类型崩在第 1000 个请求"的 bug 直接消灭
4. **小规模实现的真实价值**：不是所有用户都需要"扛得住百万 DAU"——50 人的家庭 IM 也是 Matrix 生态的一部分
5. **fork 是开源里的反馈机制**：conduwuit 分叉证明上游迭代慢时社区会用脚投票

## 延伸阅读

- 官方仓库：[famedly/conduit (GitLab)](https://gitlab.com/famedly/conduit)（GitHub mirror 同步）
- 官网：[conduit.rs](https://conduit.rs/)（部署指南 + 配置说明）
- Matrix 协议：[Matrix Spec](https://spec.matrix.org/)（理解 homeserver 必须先理解协议）
- ruma 库：[ruma/ruma](https://github.com/ruma/ruma)（Rust Matrix 协议层，Conduit 的核心依赖）
- Dendrite 对照：[matrix-org/dendrite](https://github.com/matrix-org/dendrite)（Go 写的官方下一代实现，比 Conduit 重）

## 关联

- [[synapse]] —— Matrix 参考 homeserver，全功能但运维重；Conduit 走相反极简路线
- [[chatwoot]] —— 客服向 IM，闭环团队场景，与 Matrix 联邦定位形成两端
- [[axum]] —— 同样基于 tokio 的 Rust 异步 web 框架，可对照看 Rust 长连接服务器写法
- [[rocksdb-2017]] —— Conduit 默认的嵌入式 KV，理解 LSM-tree 才理解 Conduit 的存储延迟特征
- [[rocksdb-lsm]] —— LSM-tree 原理，Conduit 长期用户量增长后的关键性能因素

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[dendrite]] —— Dendrite — Go 写的第二代 Matrix homeserver，组件可拆可合

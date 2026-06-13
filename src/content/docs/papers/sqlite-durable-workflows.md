---
title: SQLite is All You Need for Durable Workflows — 用单文件数据库做持久化工作流
来源: 'Obelisk Blog, "SQLite is All You Need for Durable Workflows", https://obeli.sk/blog/sqlite-is-all-you-need-for-durable-workflows/, 2026-05-29（延伸 DBOS「Postgres is all you need for durable execution」论点）'
日期: 2026-06-13
子分类: 存储与查询
分类: 数据库
provenance: pipeline-v3
---

## 从日常类比开始：快递单 + 可替换的快递员

想象你在经营一个**多步骤代办业务**：帮客户订机票、填表、发邮件、最后归档。每一步都可能失败——网站超时、表单填错、邮件服务器宕机。

传统做法像雇一个**专职调度中心**（Temporal、Cadence、Restate 这类 orchestrator）：单独租办公室、配专线电话、养一支调度员团队，专门记录「客户 A 做到第几步了」。可靠，但**基础设施本身就很重**。

DBOS 在 2026 年提出另一条路：**Postgres is all you need**——如果你已经信任数据库的事务与持久化，就不必再叠一层专用编排集群；工作流状态直接写进 Postgres，计算节点可以是廉价的、可随时销毁的。

Obelisk 的博客文章把这条思路**再推进一步**：

> 对很大一类持久化系统来说，**SQLite 就够了**。

类比升级成：**快递单（workflow state）必须留在档案柜里，但送快递的人（compute）可以随时换人**。

- 档案柜 = 本地 SQLite 文件，ACID 写入，进程挂了文件还在。
- 快递员 = Worker 容器 / 微 VM，挂了换一台，从档案柜读出进度继续干。
- 档案柜每晚复印一份到云存储 = **Litestream** 异步备份到 S3。
- 每个 AI Agent 单独一个小档案柜 = **故障隔离**，A 搞砸了不影响 B。

核心洞察：**需要持久的是工作流状态，不是编排基础设施本身**。计算可以便宜、可丢弃；状态必须事务性、可回放、可检查。

---

## 是什么

**Durable workflow（持久化工作流）** 指：长生命周期、多步骤、可能跨进程/跨机器的任务编排；某一步失败后能从**已保存的状态**恢复，而不是从头重来。

典型能力包括：

| 能力 | 含义 |
|------|------|
| Execution log | 记录每一步输入/输出/时间戳 |
| Replay | 从日志重建工作流，用于恢复或调试 |
| Activity retry | 单步失败自动重试，不污染已完成步骤 |
| Checkpoint | 在昂贵步骤之间保存进度 |

文章主张：对 **AI Agent、实验性流水线、单租户 burst 任务**，用 **SQLite + Litestream + 廉价 Worker** 就能构成足够 durable 的系统，**不必**第一天就上 Postgres 集群或 Temporal。

Obelisk 是实践这一思路的开源工作流引擎（SQLite 默认，Postgres 可选）。Cloudflare Workflows V2 也在生产环境用 SQLite 存储 per-instance 状态，并发实例从约 4,500 扩到 50,000——说明「SQLite 不 scale」需要分场景讨论。

---

## 为什么重要

### 1. 降低「 durable execution 必须很重」的默认假设

很多人听到 durable workflow 就想到：

- 独立的 history service
- Cassandra / 专用事件存储
- 常驻 orchestrator 集群 + 复杂运维

文章指出：对 **day one** 的系统，这往往是**过度设计**。工作流真正要持久的是**状态机 + 执行日志**，不是一整套分布式中间件。

### 2. 与 AI Agent 工作负载天然契合

Agent 任务常见特征：

- **突发（bursty）**：跑几分钟就停，不是 7×24 常驻。
- **实验性强**：频繁改 prompt、改工具链，需要可复制的状态快照做 post-mortem。
- **单租户隔离**：每个 agent run 一份独立状态，比多租户共享 Postgres 更简单。

「一 Agent 一 SQLite 文件 + S3 备份」比「共享大库 + 复杂租户隔离」更贴合这类负载。

### 3. 可检查性（inspectability）是隐藏优势

SQLite 状态是一个**普通文件**：

- 用 `sqlite3 workflow.db` 直接查表
- 复制到笔记本离线分析 Agent「到底做了什么」
- 配合 Litestream 从 S3 拉历史版本做审计

专用 orchestrator 的 internal state 往往要专用 UI 或 API 才能看；文件级状态对调试更友好。

### 4. 成本与运维面

| 方案 | 典型额外成本 |
|------|----------------|
| Temporal 自托管 | 多组件集群、持久化存储、版本升级 |
| 托管 Postgres | 实例费、连接池、备份策略 |
| SQLite + Litestream | 几乎零：Worker 磁盘 + 廉价 S3 |

对初创团队和研究型 Agent 系统，**先把状态 durable 起来**，比**先把基础设施 enterprise 化**更合理。

---

## 核心概念

### 1. Durable execution vs durable infrastructure

**Durable execution（持久化执行）**：任务中断后，已完成的步骤不丢，可从 checkpoint 继续。

**Durable infrastructure（持久化基础设施）**：数据库集群、消息队列、专用编排层本身高可用。

文章强调：前者是**业务需求**，后者只是**实现手段之一**。SQLite 文件在单节点上已经是 durable 的（配合 WAL + `synchronous=FULL`）；你缺的是**跨节点 HA** 时才需要 Postgres。

### 2. 工作流状态 = 执行日志（event log）

Obelisk 模型里，workflow progress 活在 **execution log** 里：

```text
workflow_id | step | status   | input_json | output_json | created_at
------------|------|----------|------------|-------------|------------
wf-001      | 1    | completed| {...}      | {...}       | ...
wf-001      | 2    | failed   | {...}      | NULL        | ...
wf-001      | 2    | completed| {...}      | {...}       | ...  ← retry
```

恢复时：**replay** 已提交步骤，从第一个未完成或失败步骤继续。这与 Temporal 的 event history 思想同源，只是存储从专用服务换成了 **本地 SQL 表**。

### 3. SQLite 为何适合当「档案柜」

| 特性 | 对工作流的意义 |
|------|----------------|
| **ACID 事务** | 一步完成 = 日志行要么全写入要么全不写入，不会半条状态 |
| **嵌入式** | 无网络 hop、无独立 DB 进程、无额外 control plane |
| **单文件** | 备份 = `cp`，迁移 = 上传文件，调试 = 打开客户端 |
| **WAL 模式** | 读状态（调度器）与追加日志（Worker）可并发，少锁竞争 |

推荐生产向配置（社区共识）：

```sql
PRAGMA journal_mode = WAL;
PRAGMA synchronous = FULL;  -- 每事务 fsync，断电不丢已 commit 步骤
```

`FULL` 比 `NORMAL` 慢，但对 workflow checkpoint 来说，**丢一步的代价通常远大于多一次 fsync**。

### 4. Litestream：把本地文件变成可移植资产

Litestream 是 SQLite 的**异步连续备份**工具：监听 WAL，把变更页流式复制到 S3 / GCS / 兼容对象存储。

```
Worker 进程                Litestream sidecar           S3
    │                            │                      │
    ├── 写 workflow.db ──────────►│── 复制 WAL 页 ──────►│ workflow.db.lz4
    │   (本地热数据)              │   (异步)             │ (冷备份 / 审计)
```

**重要 caveat（文章明确写出）**：复制是**异步**的。若本地磁盘在最新 WAL 页复制前彻底消失，恢复可能**少最后几条写入**。这对实验 Agent、staging 通常可接受；对**计费、合规强一致**场景则不够，应上 Postgres 或同步复制。

需显式定义 **RPO（可接受丢多少数据）** 和 **RTO（多久恢复）**：

- SQLite + Litestream async：RPO > 0（秒级到分钟级），RTO = 拉快照 + 启动 Worker
- Postgres HA：RPO ≈ 0，RTO 取决于 failover 机制

### 5. 「一 Worker 一库」回避多写者问题

SQLite 的已知限制：**同一时刻 essentially 一个写者**。分布式系统里这是硬伤；但 Agent 场景常常是 **每个 run 独立进程、独立 DB 文件**——没有跨 Worker 争写同一文件，限制自然消失。

```
                    ┌─ agent-run-1.db ─► Litestream ─► s3://runs/1/
VM / Container 1 ───┤
                    └─ worker 只写自己的库

                    ┌─ agent-run-2.db ─► Litestream ─► s3://runs/2/
VM / Container 2 ───┤
                    └─ 故障只影响 run 2
```

Cloudflare Workflows V2 的 per-instance SQLite 是同一模式在超大规模下的验证。

### 6. 何时该用 Postgres 而不是 SQLite

文章**不**声称 SQLite 万能。Obelisk 保留 Postgres 路径，适用于：

| 需求 | 为何 SQLite 不够 |
|------|------------------|
| 多 Worker **并发写同一工作流状态** | 文件锁成为瓶颈 |
| 跨 AZ **高可用**、自动 failover | 单文件 + 异步备份 ≠ HA |
| **同步复制** durability 模型 | Litestream 是 async |
| 超大共享状态、复杂跨 workflow 查询 | 网络 DB + 连接池更合适 |

原则：**状态需求到了再升级**，不要「以防万一」第一天就 Postgres。

---

## 代码示例 1：最小持久化工作流日志（Python + sqlite3）

下面是一个**零基础可读**的最小实现：用两张表模拟 workflow + step log，展示 checkpoint 与 retry。

```python
import json
import sqlite3
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone

DB_PATH = "workflow.db"

SCHEMA = """
PRAGMA journal_mode = WAL;
PRAGMA synchronous = FULL;

CREATE TABLE IF NOT EXISTS workflows (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'running',
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS step_log (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  workflow_id  TEXT NOT NULL,
  step_name    TEXT NOT NULL,
  attempt      INTEGER NOT NULL DEFAULT 1,
  status       TEXT NOT NULL,
  payload      TEXT,
  result       TEXT,
  recorded_at  TEXT NOT NULL,
  FOREIGN KEY (workflow_id) REFERENCES workflows(id)
);

CREATE INDEX IF NOT EXISTS idx_step_log_wf
  ON step_log(workflow_id, id);
"""

@contextmanager
def connect():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        conn.executescript(SCHEMA)
        yield conn
        conn.commit()
    finally:
        conn.close()

def utcnow():
    return datetime.now(timezone.utc).isoformat()

def start_workflow(conn, name: str) -> str:
    wf_id = str(uuid.uuid4())
    conn.execute(
        "INSERT INTO workflows (id, name, created_at) VALUES (?, ?, ?)",
        (wf_id, name, utcnow()),
    )
    return wf_id

def append_step(conn, wf_id, step_name, attempt, status, payload=None, result=None):
    conn.execute(
        """INSERT INTO step_log
           (workflow_id, step_name, attempt, status, payload, result, recorded_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)""",
        (wf_id, step_name, attempt, status,
         json.dumps(payload), json.dumps(result), utcnow()),
    )

def last_completed_step(conn, wf_id: str) -> str | None:
    row = conn.execute(
        """SELECT step_name FROM step_log
           WHERE workflow_id = ? AND status = 'completed'
           ORDER BY id DESC LIMIT 1""",
        (wf_id,),
    ).fetchone()
    return row["step_name"] if row else None

def run_activity(fn, payload, max_attempts=3):
    """模拟可重试的 activity：失败则抛异常，由上层记录并重试。"""
    last_err = None
    for attempt in range(1, max_attempts + 1):
        try:
            return fn(payload), attempt
        except Exception as e:
            last_err = e
    raise last_err

# --- 模拟业务步骤 ---
def fetch_flights(_):
    return {"options": ["CA123", "MU456"]}

def book_flight(data):
    if data["choice"] == "INVALID":
        raise ValueError("no seats")
    return {"pnr": "ABC123", "flight": data["choice"]}

STEPS = [
    ("fetch_flights", fetch_flights),
    ("book_flight", book_flight),
]

def execute_workflow(wf_id: str, initial_input: dict):
    with connect() as conn:
        resume_after = last_completed_step(conn, wf_id)
        skipping = resume_after is not None
        data = initial_input

        for step_name, fn in STEPS:
            if skipping:
                if step_name == resume_after:
                    skipping = False
                continue  # replay：已完成步骤不再执行

            result, attempt = run_activity(fn, data)
            append_step(conn, wf_id, step_name, attempt, "completed",
                        payload=data, result=result)
            data = result

        conn.execute(
            "UPDATE workflows SET status = 'completed' WHERE id = ?",
            (wf_id,),
        )

if __name__ == "__main__":
    with connect() as conn:
        wf = start_workflow(conn, "travel-booking")
    # 第一次运行可能在 book 失败；修复 input 后再次 execute_workflow(wf, ...)
    execute_workflow(wf, {"choice": "CA123"})
    print(f"workflow {wf} done — inspect with: sqlite3 {DB_PATH}")
```

**要点**：

1. 每步 `completed` 写入 `step_log`，进程崩溃后靠 `last_completed_step` **断点续跑**。
2. `WAL + synchronous=FULL` 保证 commit 后断电不丢日志。
3. 整个 durable 层**零外部依赖**，只有一个 `.db` 文件。

---

## 代码示例 2：Litestream 备份与恢复（运维配置）

逻辑代码之外，**便携性**靠 Litestream 配置。典型 `litestream.yml`：

```yaml
# litestream.yml — 将本地 workflow.db 持续复制到 S3 兼容存储
dbs:
  - path: /data/workflow.db
    replicas:
      - type: s3
        bucket: my-agent-workflows
        path: backups/${HOSTNAME}/workflow.db
        region: ap-east-1
        sync-interval: 1s
        # 可选：保留快照便于按时间点恢复
        retention: 168h
```

启动 sidecar（与 Worker 同 Pod / 同 VM）：

```bash
# 1. 初始化本地库（Worker 启动前）
sqlite3 /data/workflow.db "PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;"

# 2. 启动 Litestream 复制
litestream replicate -config litestream.yml

# 3. Worker 正常运行，读写 /data/workflow.db
python worker.py

# --- 灾难恢复：本地盘没了，从 S3 还原 ---
litestream restore -o /data/workflow.db s3://my-agent-workflows/backups/host-7/workflow.db
python worker.py   # 从 step_log 继续 replay
```

**运维检查清单**：

```bash
# 查看 Litestream 复制滞后（lag 过大 = RPO 风险上升）
litestream databases

# 人工拉一份用于调试「Agent 昨晚做了什么」
litestream restore -o /tmp/debug.db s3://my-agent-workflows/backups/host-7/workflow.db
sqlite3 /tmp/debug.db "SELECT step_name, status, recorded_at FROM step_log ORDER BY id;"
```

---

## 与 Temporal / DBOS 的对比（心智模型）

| 维度 | Temporal 类 orchestrator | DBOS (Postgres) | SQLite + Litestream (本文) |
|------|--------------------------|-----------------|------------------------------|
| 状态存储 | 专用 history store | 已有 Postgres | 本地 `.db` 文件 |
| 基础设施 | 重（多组件） | 中（需 DB 服务） | 轻（嵌入式 + S3） |
| 多 Worker 共享写 | 原生支持 | 原生支持 | 需「一库一 Worker」或只读副本 |
| 调试体验 | UI + CLI | SQL 查 Postgres | 直接打开文件 |
| 典型起点 | 成熟微服务、长流程 | 已有 Postgres 的企业 | AI Agent、实验、边缘 |

文章立场不是「Temporal 错了」，而是：**很多系统 day one 不需要 Temporal 的复杂度**；在 DBOS 谱系上，SQLite 是更轻的默认项。

---

## 适用场景与反模式

### 适合

- 单 Agent / 单租户 run 的状态隔离
- 研发 staging、可接受秒级 RPO 的实验流水线
- CI/CD 步骤编排（单 runner 写本地库）
- 边缘 / IoT：本地 durable，有网时 Litestream 同步
- 需要**频繁复制状态给人类调试**的场景

### 不适合（应直接 Postgres / 专用引擎）

- 数十 Worker **同时更新同一 workflow 实例**
- 金融级 **RPO = 0**、跨 region 同步读
- 超大全局调度器（所有状态一张表、极高 QPS 写）
- 已有成熟 Temporal 投资且团队熟悉其语义

---

## 设计原则（文章提炼 + 实践补充）

1. **Durable ≠ distributed**：单节点上 durable 的 workflow state 已经是真正的持久化；分布式是下一层需求。
2. **先匹配状态的复杂度**：没有 HA 需求就不要先上 HA 架构。
3. **显式 RPO/RTO**：Litestream async 备份前签字认可「可能丢最后一秒」。
4. **保持 log 可 inspect**：选 SQLite  partly 因为文件即 artifact。
5. **计算 disposable，状态 precious**：Worker 随时可杀；杀之前确保 step commit。
6. **升级路径清晰**：SQLite → Postgres（Obelisk 双模式）→ 必要时 Temporal，按阈值演进。

---

## 常见误区

| 误区 | 澄清 |
|------|------|
| 「SQLite 只能做原型」 | WAL + 正确 pragma 下，单机 durable workflow 可长期生产；Cloudflare 已有大规模实例 |
| 「没有 K8s + Postgres 就不 durable」 | Durable 指状态 survive 进程崩溃，不是指你必须有 3 节点 DB |
| 「Litestream = 实时 HA」 | 它是**备份**，不是同步双活；磁盘瞬间全毁可能丢未复制 WAL |
| 「一个 SQLite 服务全公司 Agent」 | 多写者会痛；应 **一 run 一文件** 或 sharding |
| 「永远不需要 Postgres」 | 当共享写、HA、同步复制成为硬需求时必须升级 |

---

## 延伸阅读

- [Obelisk 原文](https://obeli.sk/blog/sqlite-is-all-you-need-for-durable-workflows/)
- DBOS：Postgres is all you need for durable execution（本文的 upstream 论点）
- [Litestream 文档](https://litestream.io/) — SQLite → S3 连续复制
- Cloudflare Workflows V2 — SQLite-backed per-instance state at scale
- Obelisk 项目 — SQLite 默认、Postgres 可选的工作流引擎实现

---

## 一句话总结

**持久化工作流真正要保存的是「执行日志」这份档案，不是编排器大楼；对大量 AI Agent 与实验型系统，本地 SQLite（WAL + 全同步）+ Litestream 备份到 S3 + 可丢弃的 Worker，就是 day one 足够 durable、足够便宜、足够可调试的默认方案——等共享写与高可用成为硬需求，再升级到 Postgres 或专用 orchestrator，而不是反过来。**

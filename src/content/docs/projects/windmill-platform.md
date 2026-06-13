---
title: Windmill — 把脚本变成 API、工作流和 UI 的开发平台
来源: https://github.com/windmill-labs/windmill
日期: 2026-06-13
分类: 基础设施
子分类: DevOps 与运维
provenance: pipeline-v3
---

## 是什么

Windmill 是一个**开源的开发者平台，让你用任意语言写脚本，它自动帮你生成 UI、排程、工作流编排和 API 路由**。

日常类比：你手里有一堆 Bash / Python / TypeScript 脚本——有的查数据库，有的调外部 API，有的做数据处理。以前每加一个新脚本就得手动搭路由、写前端、设定时任务、处理错误重试。Windmill 的做法是：你把脚本写进去（或者从 GitHub 同步过来），它自动读参数生成一个可以点按钮跑的前端页面，还能把脚本串成工作流、挂上定时器和 Webhook。**你只写函数，UI 和调度它自动生成。**

类比成厨房：脚本是切好的菜，Windmill 是自动化料理机——把菜丢进去，它自动安排"何时切、何时炒、何时装盘"，还给你一个按钮让你一键开火。

它自称"Retool + Temporal 的开源平替"。Retool 偏内部工具低代码（闭源），Temporal 偏工作流持久化（偏重），Windmill 取中间路线——脚本先行、UI 自动生成、轻量级工作流编排，而且可以自托管。GitHub 上 16.8k Star，Rust 写的后端，Svelte 5 前端，社区版 AGPLv3 协议。

## 为什么重要

- **脚本到产品的最后一公里**：大量团队有"内部脚本"，但没人愿意为每个脚本手动搭前端和路由。Windmill 把脚本参数自动变成前端表单，省掉 80% 的"包装"工作
- **多语言统一入口**：Python、TypeScript、Go、Bash、SQL、PowerShell、Rust、PHP 等全部跑在同一平台上，不同语言的脚本可以互相调用串成流
- **自托管优先**：不像 Retool / Pipedream 主要做 SaaS 版本，Windmill 从第一天起就设计为 Docker / K8s 自部署，数据不出境，适合对数据敏感的团队
- **性能强**：官方 Benchmark 对比 Airflow、Prefect、Temporal，在 40 个轻量任务和 10 个长任务场景下都最快，轻量作业端到端延迟约 100ms

## 核心概念

Windmill 的心智模型只有 **五个关键词**：

1. **Script（脚本）**：最小的可执行单元。你写一个函数，它自动解析参数类型、生成 UI、提供执行环境。这是所有东西的原子——API、工作流、UI 都是脚本的组合
2. **Flow（工作流）**：把多个 Script 串起来，定义数据流和控制流（串行、并行、条件分支）。Flow 编辑器是可视化的，但底层也是脚本
3. **Resource（资源）**：凭证和连接的抽象。数据库连接、API Key、OAuth Token 都存在这里，脚本通过资源名引用，不用硬编码
4. **Variable（变量）**：密钥和配置的值，和 Resource 类似但更通用。支持按路径（folder-like）组织，权限控制
5. **Trigger（触发器）**：脚本怎么被调用——HTTP 路由、定时调度、Webhook、Kafka 消息、WebSocket、邮件，都可以触发一个脚本

## 实践案例

### 案例 1：写一个最简单的脚本 + 自动生成的 UI

在 Windmill 里写一个 Python 脚本，接收两个参数，返回结果。Windmill 自动生成交互界面。

```python
# script: hello.py
from windmill_client import Windmill

def main(name: str, times: int = 3) -> list[str]:
    """给一个名字，重复问候指定次数。"""
    return [f"Hello, {name}!" for _ in range(times)]
```

不需要写一行 HTML 或路由。Windmill 读到了 `name` 和 `times` 参数，自动生成前端表单（文本框 + 数字选择器），点击按钮就执行函数。结果以 JSON 展示。

如果你想通过 HTTP 调用它，Windmill 自动生成一个 REST 端点。不需要配置路由。

### 案例 2：带资源 + 状态 + 日志的完整脚本

```typescript
// script: process_user.ts
import * as wmill from "windmill-client";

// 定义一个类型安全的数据库资源引用
type Postgres = {
  host: string;
  port: number;
  user: string;
  password: string;
  dbname: string;
};

export async function main(
  userId: string,
  db: Postgresql,
  dryRun: boolean = false
) {
  // 读取 Windmill 存储的变量（密钥）
  const apiToken = await wmill.getVariable("f/company/api/token");

  // 读取上次执行时间
  const lastRun = await wmill.getState();
  console.log(`上次运行: ${lastRun}`);

  // 用资源连数据库
  const result = await queryDatabase(db, userId);

  // 写状态供下次读取
  await wmill.setState(Date.now());

  // 返回 JSON
  return { user: result, tokenUsed: !!apiToken, dryRun };
}
```

在这个脚本里，`db: Postgresql` 是资源引用——实际连什么数据库不在代码里写，而是在 Windmill 平台的 Resources 页面配好。`wmill.getVariable` 读取加密存储的密钥。`wmill.getState/setState` 提供跨执行的持久化状态。所有 `console.log` 输出持久化可查。

### 案例 3：把脚本串成 Flow（工作流）

假设你有三个脚本：`fetch_data.py`、`transform_data.py`、`send_report.py`。在 Flow 编辑器里把它们拖拽连接：

```
[fetch_data.py] → [transform_data.py] → [send_report.py]
       ↓
  [如果失败] → [send_alert.py]
```

Flow 编辑器是可视化的，但每个节点就是普通的脚本。你可以在 `transform_data.py` 里直接调用 `fetch_data.py` 返回的结果，数据自动传递。不需要写"消息队列"或"回调 URL"。

Flow 还支持条件分支、并行执行、循环等控制流。一个 Flow 里的脚本可以用不同语言——`fetch_data` 用 Python、`transform_data` 用 TypeScript、`send_report` 用 Go，数据在中间自动序列化传递。

## 架构速览

Windmill 架构不复杂：

- **数据库**：PostgreSQL（支持 Aurora、Cloud SQL、Neon 等兼容版本），存脚本定义、执行历史、资源、权限
- **后端**：Rust 写的无状态 API Server + Worker。Worker 从 Postgres 队列拉任务执行
- **运行时**：TypeScript → Bun（默认）/ Deno，Python → uv 管理依赖，Go / Bash / Rust 等直接调用系统二进制
- **沙箱**：nsjail + PID namespace 隔离，防止脚本访问宿主机内存和文件系统越权
- **前端**：Svelte 5 编写，自动生成脚本的 UI 界面

Worker 和 Server 都无状态，所以可以横向扩。一个 job 从入队到出队的延迟约 50ms。

## 部署方式

Windmill 支持三种自部署路径：

```bash
# 方式 1：Docker Compose（最快，3 个文件）
curl https://raw.githubusercontent.com/windmill-labs/windmill/main/docker-compose.yml -o docker-compose.yml
curl https://raw.githubusercontent.com/windmill-labs/windmill/main/Caddyfile -o Caddyfile
curl https://raw.githubusercontent.com/windmill-labs/windmill/main/.env -o .env
docker compose up -d
# 访问 http://localhost，默认 admin@windmill.dev / changeme

# 方式 2：Kubernetes (Helm)
helm repo add windmill https://windmill-labs.github.io/windmill-helm-charts/
helm install windmill-chart windmill/windmill --namespace=windmill --create-namespace
```

部署后你可以用三种方式开发脚本：
- **Web IDE**：浏览器里直接写
- **CLI (wmill)**：命令行同步本地文件到 Windmill 实例
- **VS Code 扩展**：在编辑器里写和调试

## 踩过的坑

- **参数类型推断**：Windmill 根据函数签名自动推断 UI 控件类型。如果你写 `x: number` 生成数字输入框，写 `x: "a" | "b" | "c"` 生成下拉选择。但 TypeScript 的复杂泛型类型有时候解析不出来，建议用简单类型 + JSDoc 注释描述
- **资源 vs 变量别搞混**：Resource 是带 Schema 的结构化连接（比如 PostgreSQL 连接），Variable 是纯键值对（比如 API Token）。两者都可以加密存储和权限控制，但 Resource 支持"连接测试"
- **沙箱逃逸**：默认启用 nsjail，但如果你用 `NATIVE_MODE=true` 跑原生类型脚本（PostgreSQL、MySQL），这些脚本在宿主机直接执行，不受沙箱保护。生产环境慎用
- **状态存储有限**：`wmill.getState/setState` 存的值很小（KV store），不适合存大量数据。如果要传大结果，应该返回给 Flow 节点，或者存到外部存储
- **版本差异**：社区版和企业版功能有区别。部分高级功能（SSO、审计日志、无限工作流）需要企业授权。部署前确认自己的场景是否在企业版特性范围内

## 适用 vs 不适用

**适用**：
- 内部工具 / 运维自动化：把零散脚本统一管理，自动生成 UI 和权限
- 数据 pipeline 编排：多脚本串联的 ETL/ELT 流程，比 Airflow 轻量
- 快速原型：写完脚本立刻有 API 和 UI 可以分享给团队测试
- 需要自托管的 SaaS 替代方案：不想用 Retool / Pipedream 的 SaaS 版本

**不适用**：
- 超高 QPS 的请求—响应（Windmill 设计目标是自动化和编排，不是 API 网关）
- 纯数据湖 / 大规模分布式批处理（用 Spark / Flink）
- 需要复杂 SQL 迁移管理的数据库平台（用 Flyway / Alembic）
- 对脚本语言有严格限制只能一种语言的场景（Windmill 的灵活性反而是负担）

## 历史小故事

- **2021 年**：Windmill Labs 创立，初衷是解决"公司内部脚本太多太散"的问题。创始人来自法国，团队规模小但迭代极快
- **2022-2024 年**：快速迭代，GitHub Star 从几千涨到 16k+。发布 Flow 编辑器、VS Code 扩展、Git Sync 等功能
- **2025-2026 年**：强化 AI 辅助开发（Claude Code 集成）、原生类型（PostgreSQL、MySQL 直接写 SQL 脚本）、K8s 部署体验。社区版和企业版功能区分明确
- **现在**：v1.723+，每周发布，Discord 社区活跃。自托管用户覆盖从个人开发者到大型企业

## 学到什么

- **脚本优先 > 代码优先**：Windmill 的核心洞察是——大多数内部工具的本质就是"一个函数 + 输入输出"，不必一开始就搭完整项目。脚本是最低门槛的抽象
- **自动生成 UI 的价值**：参数即 UI 不是新概念，但 Windmill 把它和脚本执行、资源管理、工作流编排整合在一起，形成闭环
- **Rust + Bun 组合的实用性**：Rust 做后端 API 和 Worker（高性能、低内存），Bun 做 TypeScript 运行时（快启动、内置包管理），比 Node.js 更适合"每脚本一个容器"的模式
- **自托管和 SaaS 的平衡**：Windmill 同时提供自托管和 SaaS，且社区版功能足够核心场景使用。这种模式降低了企业采用门槛

## 延伸阅读

- 官方文档：[Windmill Docs](https://www.windmill.dev/docs/intro/)（比 README 详细，从入门到高级全覆盖）
- 在线试用：[app.windmill.dev](https://app.windmill.dev)（注册就有实例，不用自己部署）
- 脚本市场：[WindmillHub](https://hub.windmill.dev)（社区共享的资源类型和脚本模板）
- 架构对比：[Benchmarks — Windmill vs Airflow / Prefect / Temporal](https://www.windmill.dev/docs/misc/benchmarks/competitors)（官方 Benchmark 数据）
- Docker Compose 部署：[docker-compose.yml](https://github.com/windmill-labs/windmill/blob/main/docker-compose.yml) + [Caddyfile](https://github.com/windmill-labs/windmill/blob/main/Caddyfile)（最小部署只需这两个文件）

## 关联

- [[temporal]] —— 同样是工作流引擎，但 Temporal 偏"持久化执行"（重）、Windmill 偏"脚本 → UI/API"（轻）
- [[airflow]] —— Apache Airflow 用 Python 代码画 DAG，偏数据 pipeline；Windmill 更通用，任何语言脚本都能进
- [[prefect]] —— Prefect 也是 Python 工作流引擎，和 Windmill 的 Flow 概念类似但生态更小
- [[clack]] —— 也是"脚本变 API"的思路，但更轻量单机版；Windmill 是多租户平台
- [[marimo]] —— 也是"代码变交互界面"，但 marimo 偏 notebook/数据探索；Windmill 偏自动化/编排

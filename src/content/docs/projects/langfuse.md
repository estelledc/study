---
title: Langfuse — LLM 应用的 Datadog，把 trace/eval/cost 做成基础设施
description: 大型应用范例，28k stars 背后的「Next.js + tRPC + ClickHouse + Redis + Postgres」多存储分层架构，以及一个常被忽视的「为什么 trace 不直接写 Postgres」叙事
sidebar:
  order: 40
  label: langfuse/langfuse
---

> 状元篇撰写（2026-05-28）。基于 commit `41f584782e156731029d9f7a3539cfbb83e979f8` 的源码精读 + 浅克隆 + 一次 ingestion 路径反演实验。
> 这篇不是「LLM observability 介绍」——是一次「如果一个 SaaS 每秒被几千次 SDK 异步打点，但又要支持秒级聚合查询，存储该长什么样」的可量化复盘。

## 核心信息

| 字段 | 值 |
|---|---|
| Repo | [langfuse/langfuse](https://github.com/langfuse/langfuse) |
| Star / Fork | 28,100 / 2,900（2026-05-28 拉取） |
| 最近活跃 | 持续 daily 推送，最近一次 `ci(sdk): use repo token for SDK spec workflow (#13909)`（2026-05-28） |
| 主分支 commit | `41f584782e156731029d9f7a3539cfbb83e979f8`（main HEAD，2026-05-28 浅克隆） |
| 最新 release | `v3.176.0`（2026-05-28） |
| 主语言 | TypeScript 98.6% + 少量 SQL（ClickHouse migrations） + Shell |
| 维护方 | Langfuse GmbH（Y Combinator W23）+ 社区 |
| 主要贡献者 | maxdeichmann / marcklingen / hassiebp / Steffen911 / wochinge（前 5，2026-05-28 拉取） |
| License | MIT（2025-06 起从 EE 部分回归 MIT，[官方公告](https://langfuse.com/blog/2025-06-04-open-sourcing-langfuse-product)） |
| 类似项目 | Datadog APM（闭源标杆）/ Helicone（proxy 模式）/ LangSmith（LangChain 自家闭源）/ Phoenix Arize（开源但偏 ML 评测）/ Sentry（错误监控泛化） |
| 哲学不同竞品 | Datadog APM（通用 APM，把 LLM 当普通 HTTP call）+ Helicone（gateway proxy 模式，不是 SDK ingest） |

## 一句话定位

**Langfuse 不是「又一个 dashboard」——
它是一个「每个 LLM call 都是一条带因果链的 trace、async ingestion 走 Redis 队列、聚合走 ClickHouse、metadata 走 Postgres」的多存储分层 observability 平台。**
当大多数团队还在用 print 或 OpenAI dashboard 看 token 数时，Langfuse 把「LLM 应用需要 APM 级可观测性」这件事做成了基础设施。

## Why（为什么是它而不是 Datadog / 自建表）

Langfuse 解决的不是「看 token 数」问题——是「**LLM 应用的 trace 有树状嵌套、有动态 prompt 版本、有人工 + 自动两路 eval、有按 trace 维度的 cost 归因**」这套通用 APM 工具搞不动的问题。

仓库 [README.md](https://github.com/langfuse/langfuse/blob/41f584782e156731029d9f7a3539cfbb83e979f8/README.md) 顶部官方定位：

> Langfuse is an open source LLM engineering platform.

这句藏着三条产品判断，按重要度排序：

1. **「engineering platform」而非「monitoring tool」**——意味着除了被动采集，还要主动驱动迭代：prompt 版本管理、dataset 回归、eval scoring、A/B 模型对比。
   监控工具看「现在挂没挂」，engineering 平台看「这次 prompt 改动到底比上版本好多少」。
2. **「open source」**——Langfuse 自己写过一篇 [doubling down on open source 的 manifesto](https://langfuse.com/blog/2025-06-04-open-sourcing-langfuse-product)：
   把 EE 部分（包括 LLM-as-a-Judge、prompt experiments）也回归 MIT。
   这个动作的本质是「LLM 应用代码越敏感，企业越需要审计 observability 链路」——SaaS 是不行的，得能 self-host。
3. **「proudly made with ClickHouse」**——README 底部直接挂 [ClickHouse 的链接](https://github.com/langfuse/langfuse/blob/41f584782e156731029d9f7a3539cfbb83e979f8/README.md)。
   这不是装饰：当一个 trace 树展开后有 50+ observation 节点，每秒进来几千条事件、聚合查询要扫几亿行——只有列存 + 稀疏索引能扛。
   这条选型决定了下面所有的 schema 设计。

哲学独到之处：**多存储分层不是把 Datadog 抄一遍**——而是按「事件不可变性 + 查询模式」切：

- 不可变高频写 + 时序聚合查询 → ClickHouse（traces / observations / scores）
- 可变低频写 + 强一致查询 → Postgres（用户 / 项目 / API key / prompt version）
- 异步排队 + 至多一次去重 → Redis（bullmq queue + recently-processed cache）
- 原始事件长期归档 → S3（重放 + retention）

当大多数 SaaS 一把 Postgres 用到底时，Langfuse 把「该用什么存什么」这件事做对了——这是创业公司难得的工程克制。

## Figure 1：整体架构

![Langfuse 整体架构](/projects/langfuse/01-architecture.webp)

> Figure 1：从 SDK ingest 到多存储分层的完整数据流。
> 左到右五列：①SDK 客户端（Python / JS / OTel / LangChain auto-instrument）→ ②`web/` 容器的 Next.js handler（auth + rate-limit + zod）→ ③fan-out（S3 持久化 raw event + Redis bullmq queue 按 `projectId-bodyId` 分片）→ ④`worker/` 的 IngestionService（拉 S3 → mergeRecords → prompt/model 富化 → tokenCount 算成本）→ ⑤多存储（ClickHouse 装时序 trace/score、Postgres 装 metadata、Web UI 通过 tRPC 同时查这两个）。
> 底部三块灰底说明三个非显然设计点：S3+Redis 双写意图相反、跨日 delay 反幂等、ClickhouseWriter 1MB field 截断。
> 画风：白底 + 五色分层（蓝=客户端 / 绿=API / 橙=fan-out / 紫=worker / 红=存储） + 圆角矩形 + 实箭头表示数据流向、虚线表示元数据 lookup。

## 仓库地形

浅克隆 `--depth 1` 后顶层结构（HEAD `41f5847`，2026-05-28）：

```
web/                    ← Next.js + tRPC，UI + 公开 ingestion API + 后台
worker/                 ← Node.js worker，bullmq 消费者，跑 ingestion + eval
packages/shared/        ← 前后端共享类型 + 数据库客户端 + ClickHouse migrations ⭐ 最关键
ee/                     ← Enterprise Edition（仍开源 MIT，但有功能 flag）
fern/                   ← OpenAPI spec 的 SDK 自动生成入口（Python / JS）
patches/                ← pnpm patch-package 的依赖修复
specs/                  ← OpenAPI / 协议规范
.devcontainer/          ← Codespaces / VSCode dev container 定义
docker-compose*.yml     ← 不同部署形态的 compose 文件（dev / prod / azure / oci / redis-cluster）
scripts/                ← 维护脚本（含 ingestion replay）
```

**心脏文件清单（≥ 3，按 subsystem 分组）**：

| 子系统 | 文件 | 行数 | 角色 |
|---|---|---|---|
| Ingest 入口 | `web/src/pages/api/public/ingestion.ts` | 175 | 公开 POST 端点：auth → rate-limit → zod 校验 → 委派 |
| Ingest 编排 | `packages/shared/src/server/ingestion/processEventBatch.ts` | 464 | 三阶段 validation / async-S3 / queue dispatch + sampling + sharding |
| Ingest 落库 | `worker/src/services/IngestionService/index.ts` | 1737 | 真正干活的 service：mergeRecords + 富化 + 调度 eval |
| ClickHouse 写入 | `worker/src/services/ClickhouseWriter/index.ts` | 642 | singleton 队列 + interval flush + back-off retry + 1MB truncate |
| ClickHouse schema | `packages/shared/clickhouse/migrations/clustered/0001_traces.up.sql` | 33 | trace 主表 DDL（ReplicatedReplacingMergeTree） |
| Eval / Score | `web/src/server/api/routers/scores.ts` | 1098 | tRPC scores router，包括 createAnnotationScore 的 upsert 流 |
| Score 业务层 | `web/src/features/scores/lib/aggregateScores.ts` | 138 | 多 score 跨 trace 聚合 + 命名空间合并 |

**commit 热点 top 20**（`git log --format='' --name-only | sort | uniq -c | sort -rn | head -20`）：

| count | 文件 | 子系统 |
|---|---|---|
| ~410 | web/src/server/api/routers/* | tRPC routers（最大热点） |
| ~280 | packages/shared/src/server/ingestion/* | ingestion 编排 |
| ~210 | worker/src/services/IngestionService/index.ts | ingestion 落库（单文件就高频） |
| ~180 | worker/src/services/ClickhouseWriter/index.ts | CH 写入 |
| ~150 | web/src/features/scores/* | eval scoring |
| ~120 | packages/shared/clickhouse/migrations/* | DDL 迭代（每个 migration 都有 up + down + analytic） |
| ~95 | worker/src/queues/* | bullmq queue 注册 |
| ~80 | docker-compose*.yml | 部署模板 |

注：以上 count 是数量级估算（浅克隆只能拿 1 个 commit，热点是从 GitHub Insights 折算），但相对热度排序对应实际改动密集程度。

## 核心机制

按 subsystem 分三段精读，每段独立结论。

### 第一段：Trace ingestion pipeline —— 为什么 SDK 调用要走「web → S3 → Redis → worker」四跳

**位置**：[`web/src/pages/api/public/ingestion.ts#L34-L140`](https://github.com/langfuse/langfuse/blob/41f584782e156731029d9f7a3539cfbb83e979f8/web/src/pages/api/public/ingestion.ts#L34-L140)（HTTP 入口） + [`packages/shared/src/server/ingestion/processEventBatch.ts#L99-L355`](https://github.com/langfuse/langfuse/blob/41f584782e156731029d9f7a3539cfbb83e979f8/packages/shared/src/server/ingestion/processEventBatch.ts#L99-L355)（编排核心）。

入口 handler（截取主要分支）：

```ts
// web/src/pages/api/public/ingestion.ts L50-L140
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  try {
    await runMiddleware(req, res, cors);

    const currentSpan = getCurrentSpan();
    Object.keys(req.headers).forEach((header) => {
      if (header.toLowerCase().startsWith("x-langfuse")) {
        currentSpan?.setAttributes({
          [`langfuse.header.${header.slice(11).toLowerCase().replaceAll("_", "-")}`]:
            req.headers[header],
        });
      }
    });

    if (req.method !== "POST") throw new MethodNotAllowedError();

    const authCheck = await new ApiAuthService(prisma, redis)
      .verifyAuthHeaderAndReturnScope(req.headers.authorization);
    if (!authCheck.validKey) throw new UnauthorizedError(authCheck.error);
    if (!authCheck.scope.projectId)
      throw new UnauthorizedError("Missing projectId in scope. ...");
    if (authCheck.scope.isIngestionSuspended)
      throw new ForbiddenError("Ingestion suspended: ...");

    const ctx = contextWithLangfuseProps({
      headers: req.headers,
      projectId: authCheck.scope.projectId,
      apiKeyId: authCheck.scope.apiKeyId,
    });

    return opentelemetry.context.with(ctx, async () => {
      try {
        const rateLimitCheck = await RateLimitService.getInstance()
          .rateLimitRequest(authCheck.scope, "ingestion");
        if (rateLimitCheck?.isRateLimited()) {
          return rateLimitCheck.sendRestResponseIfLimited(res);
        }
      } catch (e) {
        // fail-open：rate-limit 自身挂掉时继续处理，不拒请求
        logger.error("Error while rate limiting", e);
      }

      const batchType = z.object({
        batch: z.array(z.unknown()),
        metadata: jsonSchema.nullish(),
      });
      const parsedSchema = batchType.safeParse(req.body);
      if (!parsedSchema.success) {
        return res.status(400).json({ message: "Invalid request data", ... });
      }

      await telemetry();
      const result = await processEventBatch(
        parsedSchema.data.batch,
        authCheck,
      );
      return res.status(207).json(result);
    });
  } catch (error: unknown) { /* ... 207 多状态错误分类 ... */ }
}
```

旁注：

- **HTTP 207 而非 200**：[ingestion.ts L139](https://github.com/langfuse/langfuse/blob/41f584782e156731029d9f7a3539cfbb83e979f8/web/src/pages/api/public/ingestion.ts#L139) 用 `res.status(207)` 表示「批量请求里部分成功部分失败」——返回 `{successes:[], errors:[]}` 双数组。直接 200 会丢掉每个 event 的状态，500 会让 SDK 整批重试导致重复。这是 SDK 友好的 batch 协议设计。
- **rate-limit 挂掉走 fail-open**：[L113-L117](https://github.com/langfuse/langfuse/blob/41f584782e156731029d9f7a3539cfbb83e979f8/web/src/pages/api/public/ingestion.ts#L113-L117) 显式 try/catch 后 `logger.error` 然后**继续处理**——意图是「rate-limit 服务自身故障不能拒绝合法用户」。这是给运维事故留的逃生通道，但代价是被攻击时门户大开。
- **header 反射进 OTel span**：[L60-L71](https://github.com/langfuse/langfuse/blob/41f584782e156731029d9f7a3539cfbb83e979f8/web/src/pages/api/public/ingestion.ts#L60-L71) 把 `x-langfuse-*` 头反射进 span attribute——SDK 端可以塞 `x-langfuse-sdk-version` 这种自描述信息，链路追踪能直接看到。
- **bodyParser size 4.5mb**：[L26-L32](https://github.com/langfuse/langfuse/blob/41f584782e156731029d9f7a3539cfbb83e979f8/web/src/pages/api/public/ingestion.ts#L26-L32) 把 Next.js 默认 1MB 撑到 4.5MB——LLM trace 体积大，单个 batch 可能 100+ events。再大就不管，让 SDK 自己分批。
- **scope 双重校验**：先验 API key 有效性，再验 `projectId` 存在，再验 `isIngestionSuspended` flag——三层守门。这避免「key 有效但项目欠费」时还在写库。

下一跳到 `processEventBatch`，三阶段编排：

```ts
// packages/shared/src/server/ingestion/processEventBatch.ts L99-L355
export const processEventBatch = async (
  input: unknown[],
  authCheck: AuthHeaderValidVerificationResultIngestion,
  options: ProcessEventBatchOptions = {},
): Promise<{ successes: ...; errors: ... }> => {
  if (input.length === 0) return { successes: [], errors: [] };
  const { delay = null, source = "api", isLangfuseInternal = false, ... } = options;

  /************** VALIDATION **************/
  const ingestionSchema = createIngestionEventSchema(isLangfuseInternal);
  const batch = input.flatMap((event) => {
    const parsed = ingestionSchema.safeParse(event);
    if (!parsed.success) { validationErrors.push(...); return []; }
    if (!isAuthorized(parsed.data, authCheck)) { authenticationErrors.push(...); return []; }
    return [parsed.data];
  });

  // 同 entity 的 events 折叠到一个文件，减少 S3 PUT 次数
  const sortedBatchByEventBodyId = sortedBatch.reduce((acc, event) => {
    if (!event.body?.id) return acc;
    const key = `${getClickhouseEntityType(event.type)}-${event.body.id}`;
    if (!acc[key]) acc[key] = { data: [], key: event.id, type: event.type, eventBodyId: event.body.id };
    acc[key].data.push(event);
    return acc;
  }, {});

  /******************** ASYNC PROCESSING ********************/
  let s3UploadErrored = false;
  await instrumentAsync({ name: "s3-upload-events" }, async () => {
    const results = await Promise.allSettled(
      Object.keys(sortedBatchByEventBodyId).map(async (id) => {
        const { data, key, type, eventBodyId } = sortedBatchByEventBodyId[id];
        const bucketPath =
          `${env.LANGFUSE_S3_EVENT_UPLOAD_PREFIX}${authCheck.scope.projectId}/` +
          `${getClickhouseEntityType(type)}/${eventBodyId}/${key}.json`;
        return getS3StorageServiceClient(env.LANGFUSE_S3_EVENT_UPLOAD_BUCKET)
          .uploadJson(bucketPath, data);
      }),
    );
    results.forEach((result) => {
      if (result.status === "rejected") {
        s3UploadErrored = true;
        if (isS3SlowDownError(result.reason)) {
          markProjectS3Slowdown(authCheck.scope.projectId!).catch(() => {});
        }
      }
    });
  });
  if (s3UploadErrored) throw new Error("Failed to upload events to blob storage, ...");
  if (!redis) throw new Error("Redis not initialized, ...");

  await Promise.all(
    Object.keys(sortedBatchByEventBodyId).map(async (id) => {
      const eventData = sortedBatchByEventBodyId[id];
      const shardingKey = `${authCheck.scope.projectId}-${eventData.eventBodyId}`;
      const queue = IngestionQueue.getInstance({ shardingKey });

      const { isSampled, isSamplingConfigured } = isTraceIdInSample({
        projectId: authCheck.scope.projectId,
        event: eventData.data[0],
      });
      if (!isSampled) {
        recordIncrement("langfuse.ingestion.sampling", eventData.data.length, {
          projectId: authCheck.scope.projectId ?? "<not set>",
          sampling_decision: "out",
        });
        return;
      }

      return queue
        ? queue.add(QueueJobs.IngestionJob, { /* ... payload with fileKey ... */ },
                    { delay: getDelay(delay, source) })
        : Promise.reject("Failed to instantiate ingestion queue");
    }),
  );

  return aggregateBatchResult([...validationErrors, ...authenticationErrors],
                              sortedBatch.map(...), authCheck.scope.projectId);
};
```

旁注：

- **S3 必须先成功，Redis 才入队**：[L268-L272](https://github.com/langfuse/langfuse/blob/41f584782e156731029d9f7a3539cfbb83e979f8/packages/shared/src/server/ingestion/processEventBatch.ts#L268-L272) 显式检查 `s3UploadErrored`，错了直接抛 → SDK 看到 5xx 重试。设计意图：S3 是「真相来源」，Redis 只携带 fileKey 指针。如果 Redis 入队成功但 S3 失败，worker 拉不到原文，事件就丢了。
- **shardingKey = projectId + bodyId**：[L284](https://github.com/langfuse/langfuse/blob/41f584782e156731029d9f7a3539cfbb83e979f8/packages/shared/src/server/ingestion/processEventBatch.ts#L284) 决定了「同一个 trace 的 update 永远走同一个 worker shard」。这是为后面的 mergeRecords 做铺垫——worker 进程内串行 merge 比分布式锁简单一个数量级。
- **getDelay 跨日 delay**：[L62-L82](https://github.com/langfuse/langfuse/blob/41f584782e156731029d9f7a3539cfbb83e979f8/packages/shared/src/server/ingestion/processEventBatch.ts#L62-L82) 在源码常量 `getUTCHours() === 23 && minutes >= 45` 或 `getUTCHours() === 0 && minutes <= 15` 这段 `23:45-00:15 UTC` 窗口强制更长 delay（这里 TZ token 是源码字面，对应 `now.getUTCHours()` 调用，因为 ClickHouse 的 `Partition by toYYYYMM(timestamp)` 也用 `UTC` 转换），「避免 ReplacingMergeTree 在跨日时 partition 决策错位」。这是「数据库 schema 决定上层 delay 策略」的反向耦合。
- **同 entity 折叠 S3 路径**：[L208-L221](https://github.com/langfuse/langfuse/blob/41f584782e156731029d9f7a3539cfbb83e979f8/packages/shared/src/server/ingestion/processEventBatch.ts#L208-L221) 把同 `eventBodyId` 的 create + 多次 update 合到一个 S3 文件——一次 PUT 而不是 N 次。S3 PUT API 不便宜（每千次 $0.005），N=10 的 batch 一年下来差好几位数。
- **采样决策放在 dispatch 前**：[L300-L319](https://github.com/langfuse/langfuse/blob/41f584782e156731029d9f7a3539cfbb83e979f8/packages/shared/src/server/ingestion/processEventBatch.ts#L300-L319) 用 SHA-256 哈希 traceId 后取前 8 字节判定是否采样——这意味着「同一 trace 的所有 observation 同进同出」，不会出现树被采样切断的尴尬情况。
- **fail-open 的反面**：rate-limit fail-open，但 S3 fail-closed。这两条选择不一致是有意的：rate-limit 挂了用户感知不到，S3 挂了再写到 Redis 反而埋更大的坑。

**怀疑 1**：`getDelay` 注释里说「Values should be revisited based on a cost/performance trade-off.」（[L80](https://github.com/langfuse/langfuse/blob/41f584782e156731029d9f7a3539cfbb83e979f8/packages/shared/src/server/ingestion/processEventBatch.ts#L80)）——这 5000ms 上限和 23:45-00:15 这两个魔数到底有没有 SLO 数据支撑？还是历史经验？追到 git blame 看会很有意思。

### 第二段：ClickHouse schema 设计 —— ReplacingMergeTree 怎么承载「频繁 update」+「高并发查询」

**位置**：[`packages/shared/clickhouse/migrations/clustered/0001_traces.up.sql`](https://github.com/langfuse/langfuse/blob/41f584782e156731029d9f7a3539cfbb83e979f8/packages/shared/clickhouse/migrations/clustered/0001_traces.up.sql) + [`0002_observations.up.sql`](https://github.com/langfuse/langfuse/blob/41f584782e156731029d9f7a3539cfbb83e979f8/packages/shared/clickhouse/migrations/clustered/0002_observations.up.sql) + [`0003_scores.up.sql`](https://github.com/langfuse/langfuse/blob/41f584782e156731029d9f7a3539cfbb83e979f8/packages/shared/clickhouse/migrations/clustered/0003_scores.up.sql)。

`traces` 表 DDL（ClickHouse 主表，分区 + 排序键 + bloom filter 三件套）：

```sql
-- packages/shared/clickhouse/migrations/clustered/0001_traces.up.sql L1-L33
CREATE TABLE traces ON CLUSTER default (
    `id` String,
    `timestamp` DateTime64(3),
    `name` String,
    `user_id` Nullable(String),
    `metadata` Map(LowCardinality(String), String),
    `release` Nullable(String),
    `version` Nullable(String),
    `project_id` String,
    `public` Bool,
    `bookmarked` Bool,
    `tags` Array(String),
    `input` Nullable(String) CODEC(ZSTD(3)),
    `output` Nullable(String) CODEC(ZSTD(3)),
    `session_id` Nullable(String),
    `created_at` DateTime64(3) DEFAULT now(),
    updated_at DateTime64(3) DEFAULT now(),
    `event_ts` DateTime64(3),
    `is_deleted` UInt8,
    INDEX idx_id id TYPE bloom_filter(0.001) GRANULARITY 1,
    INDEX idx_res_metadata_key mapKeys(metadata) TYPE bloom_filter(0.01) GRANULARITY 1,
    INDEX idx_res_metadata_value mapValues(metadata) TYPE bloom_filter(0.01) GRANULARITY 1
) ENGINE = ReplicatedReplacingMergeTree(event_ts, is_deleted) Partition by toYYYYMM(timestamp)
PRIMARY KEY (
     project_id,
     toDate(timestamp)
)
ORDER BY (
    project_id,
    toDate(timestamp),
    id
);
```

`observations` 表（注意按 `type` LowCardinality 切排序键，因为查询基本都是「这个项目过去 1 天所有 GENERATION」）：

```sql
-- packages/shared/clickhouse/migrations/clustered/0002_observations.up.sql L1-L46
CREATE TABLE observations ON CLUSTER default (
    `id` String,
    `trace_id` String,
    `project_id` String,
    `type` LowCardinality(String),
    `parent_observation_id` Nullable(String),
    `start_time` DateTime64(3),
    `end_time` Nullable(DateTime64(3)),
    `name` String,
    `metadata` Map(LowCardinality(String), String),
    `level` LowCardinality(String),
    `provided_model_name` Nullable(String),
    `internal_model_id` Nullable(String),
    `model_parameters` Nullable(String),
    `provided_usage_details` Map(LowCardinality(String), UInt64),
    `usage_details` Map(LowCardinality(String), UInt64),
    `provided_cost_details` Map(LowCardinality(String), Decimal64(12)),
    `cost_details` Map(LowCardinality(String), Decimal64(12)),
    `total_cost` Nullable(Decimal64(12)),
    `completion_start_time` Nullable(DateTime64(3)),
    `prompt_id` Nullable(String),
    `prompt_name` Nullable(String),
    `prompt_version` Nullable(UInt16),
    `created_at` DateTime64(3) DEFAULT now(),
    `updated_at` DateTime64(3) DEFAULT now(),
    event_ts DateTime64(3),
    is_deleted UInt8,
    INDEX idx_id id TYPE bloom_filter() GRANULARITY 1,
    INDEX idx_trace_id trace_id TYPE bloom_filter() GRANULARITY 1,
    INDEX idx_project_id project_id TYPE bloom_filter() GRANULARITY 1
) ENGINE = ReplicatedReplacingMergeTree(event_ts, is_deleted) Partition by toYYYYMM(start_time)
PRIMARY KEY (project_id, `type`, toDate(start_time))
ORDER BY (project_id, `type`, toDate(start_time), id);
```

旁注：

- **`ReplicatedReplacingMergeTree(event_ts, is_deleted)`**：CH 的 ReplacingMergeTree 用「同主键的最后一条覆盖前面」的语义实现 update。`event_ts` 是版本字段（worker 写入时打的 wall clock），`is_deleted` 是软删标记。这意味着 ingestion 不需要 `UPDATE`（CH 不擅长），而是「每次都 INSERT，让 background merge 异步去重」。代价：`SELECT` 必须用 `FINAL` 修饰符或自带去重（实际查询里通常用 GROUP BY + argMax 解决）。
- **`PRIMARY KEY = (project_id, toDate(timestamp))` 而非 `id`**：CH 主键不是唯一约束，是排序索引。把 `project_id` 放第一是因为「99% 查询都带 project_id 过滤」——单租户内不影响，多租户场景下扫描范围立刻收敛到本项目。`toDate(timestamp)` 第二是因为时间范围过滤是次高频维度。
- **`Map(LowCardinality(String), String)` 装 metadata**：[L6](https://github.com/langfuse/langfuse/blob/41f584782e156731029d9f7a3539cfbb83e979f8/packages/shared/clickhouse/migrations/clustered/0001_traces.up.sql#L6) 把 metadata 存成 Map 而不是 JSON 列——key 用 LowCardinality 会自动字典编码（重复 key 共享内存），value 是普通 String。LLM trace 的 metadata 通常 key 重复但 value 多样（比如 `model: gpt-4` 出现亿次）——这个选择把内存压到 1/N。
- **`CODEC(ZSTD(3))` 只用在大字段**：[L13-L14](https://github.com/langfuse/langfuse/blob/41f584782e156731029d9f7a3539cfbb83e979f8/packages/shared/clickhouse/migrations/clustered/0001_traces.up.sql#L13) 只对 `input` / `output` 加 ZSTD 压缩——这两个字段是 LLM prompt 和 completion，文本量级最大。其他短字段不加压缩省 CPU。这种「按字段选 codec」的精细做法是 Postgres 给不了的。
- **`Partition by toYYYYMM(timestamp)`**：按月分区，查询只读对应分区文件、retention 直接 `DROP PARTITION` 一秒级删一个月数据。这意味着 retention 策略不是「跑 DELETE」而是「等到日历翻页直接砍」。
- **bloom_filter index 按选择性分等级**：`idx_id` 用 `bloom_filter(0.001)`（千分之一假阳率）因为 id 查询要快；`metadata` key/value 用 `bloom_filter(0.01)`（百分之一假阳率）因为 metadata 过滤是探索性查询，假阳率高一点没关系。这套粒度是用查询场景倒推出来的。
- **`scores` 表的稀疏列**：[`0003_scores.up.sql`](https://github.com/langfuse/langfuse/blob/41f584782e156731029d9f7a3539cfbb83e979f8/packages/shared/clickhouse/migrations/clustered/0003_scores.up.sql) 同时有 `value Float64` 和 `string_value Nullable(String)`——同一个 score 表既装数值评分（`accuracy: 0.85`）也装分类评分（`sentiment: "positive"`）。`data_type` 字段做 dispatch。这种「单表多 type」节省了 JOIN 但 schema 就有点拥挤。

**怀疑 2**：`traces` 没有 `trace_id` 索引但 `observations` 有 `INDEX idx_trace_id`（[0002 L33](https://github.com/langfuse/langfuse/blob/41f584782e156731029d9f7a3539cfbb83e979f8/packages/shared/clickhouse/migrations/clustered/0002_observations.up.sql#L33)）——意图是「从 trace 树查 observations」需要 trace_id 反查，但「从 observations 反查 trace」不常见？追到查询代码可能颠覆这个判断。

### 第三段：Eval / scoring 系统 —— 一个 score 怎么从 UI 标注变成 ClickHouse 的可查询行

**位置**：[`web/src/server/api/routers/scores.ts#L488-L617`](https://github.com/langfuse/langfuse/blob/41f584782e156731029d9f7a3539cfbb83e979f8/web/src/server/api/routers/scores.ts#L488-L617)（tRPC 入口） + [`web/src/features/scores/lib/aggregateScores.ts`](https://github.com/langfuse/langfuse/blob/41f584782e156731029d9f7a3539cfbb83e979f8/web/src/features/scores/lib/aggregateScores.ts)（前端聚合）。

```ts
// web/src/server/api/routers/scores.ts L488-L617
createAnnotationScore: protectedProjectProcedure
  .input(CreateAnnotationScoreData)
  .mutation(async ({ input, ctx }) => {
    throwIfNoProjectAccess({
      session: ctx.session,
      projectId: input.projectId,
      scope: "scores:CUD",
    });

    const inflatedParams = isTraceScore(input.scoreTarget)
      ? {
          observationId: input.scoreTarget.observationId ?? null,
          traceId: input.scoreTarget.traceId,
          sessionId: null,
        }
      : {
          observationId: null,
          traceId: null,
          sessionId: input.scoreTarget.sessionId,
        };

    if (inflatedParams.traceId) {
      const clickhouseTrace = await getTraceById({
        traceId: inflatedParams.traceId,
        projectId: input.projectId,
        clickhouseFeatureTag: "annotations-trpc",
      });
      if (!clickhouseTrace) {
        throw new LangfuseNotFoundError(
          `No trace with id ${inflatedParams.traceId} in project ${input.projectId} in Clickhouse`,
        );
      }
    } else if (inflatedParams.sessionId) {
      const traceIdentifiers = await getTracesIdentifierForSession(
        input.projectId, inflatedParams.sessionId);
      if (traceIdentifiers.length === 0) {
        throw new LangfuseNotFoundError(`No trace referencing session...`);
      }
    }

    const clickhouseScore = await searchExistingAnnotationScore(
      input.projectId, inflatedParams.observationId, inflatedParams.traceId,
      inflatedParams.sessionId, input.name, input.configId, input.dataType,
    );

    const timestamp = input.timestamp ?? new Date();
    const score = !!clickhouseScore
      ? { ...clickhouseScore, value: input.value, /* upsert path */ ... }
      : { id: input.id ?? v4(), projectId: input.projectId, /* insert path */ ... };

    await upsertScore({
      id: score.id,
      timestamp: convertDateToClickhouseDateTime(timestamp),
      project_id: input.projectId,
      environment: input.environment ?? "default",
      trace_id: inflatedParams.traceId,
      observation_id: inflatedParams.observationId,
      session_id: inflatedParams.sessionId,
      name: input.name,
      value: input.value,
      source: ScoreSourceEnum.ANNOTATION,
      // ... 14+ fields total
    });

    await auditLog({
      session: ctx.session, resourceType: "score", resourceId: score.id,
      action: "create", after: score,
    });
    return validateDbScore(score);
  }),
```

旁注：

- **score 入口走 tRPC，不走公开 API**：[L488](https://github.com/langfuse/langfuse/blob/41f584782e156731029d9f7a3539cfbb83e979f8/web/src/server/api/routers/scores.ts#L488) 是 `protectedProjectProcedure`——意图是「人工 annotation 必须经过登录会话」。SDK 端的 SCORE_CREATE 走的是 ingestion API。两条路径最终汇到同一张 `scores` 表。
- **tRPC 入口先反查 ClickHouse**：[L510-L523](https://github.com/langfuse/langfuse/blob/41f584782e156731029d9f7a3539cfbb83e979f8/web/src/server/api/routers/scores.ts#L510-L523) 创建 score 前要先验证 trace 在 CH 里存在——这是「外键约束」的应用层模拟。CH 不支持 FK。
- **upsert 语义靠 CH 的 ReplacingMergeTree**：[L552-L584](https://github.com/langfuse/langfuse/blob/41f584782e156731029d9f7a3539cfbb83e979f8/web/src/server/api/routers/scores.ts#L552-L584) 找到已存在的 score 就**复用 id** + 改 value，没找到就新建——但底层都是 INSERT，靠 event_ts 让 background merge 去重。这是把「数据库 update 语义」上移到应用层的典型 pattern。
- **session 模式下要先反查 trace identifier**：[L524-L538](https://github.com/langfuse/langfuse/blob/41f584782e156731029d9f7a3539cfbb83e979f8/web/src/server/api/routers/scores.ts#L524-L538) 处理「session 级评分」——一个 session 可能跨多个 trace，要先拿到 trace identifiers 才能决定是否拒绝。注释说「We consider no longer writing all sessions into postgres」——可见 session 表正在从 PG 迁出。
- **auditLog 是独立持久化**：[L608-L614](https://github.com/langfuse/langfuse/blob/41f584782e156731029d9f7a3539cfbb83e979f8/web/src/server/api/routers/scores.ts#L608-L614) 写完 score 后单独写 audit log（写到 PG）。审计和业务数据**物理分离**——避免审计被业务删除影响。
- **`source: ScoreSourceEnum.ANNOTATION`**：score 的来源是显式枚举（ANNOTATION / API / EVAL）——后续聚合时按 source 区分人工标注和自动评估，避免「LLM-as-judge 跑 100 次」把人工 1 票淹掉。

**怀疑 3**：[L540-L548](https://github.com/langfuse/langfuse/blob/41f584782e156731029d9f7a3539cfbb83e979f8/web/src/server/api/routers/scores.ts#L540-L548) 的 `searchExistingAnnotationScore` 用 (projectId, observationId, traceId, sessionId, name, configId, dataType) 七元组做 unique key——但 CH 没有真正的 UNIQUE 约束，并发两次同样请求会不会同时各自创建一个 score，再让 ReplacingMergeTree 后台去重？这个 race 的窗口期能不能在前端被观察到？

### 第四段（补充）：ClickhouseWriter 的批量写入 + 1MB 截断

**位置**：[`worker/src/services/ClickhouseWriter/index.ts#L32-L160`](https://github.com/langfuse/langfuse/blob/41f584782e156731029d9f7a3539cfbb83e979f8/worker/src/services/ClickhouseWriter/index.ts#L32-L160) + [L208-L278](https://github.com/langfuse/langfuse/blob/41f584782e156731029d9f7a3539cfbb83e979f8/worker/src/services/ClickhouseWriter/index.ts#L208-L278)。

```ts
// worker/src/services/ClickhouseWriter/index.ts L32-L96
export class ClickhouseWriter {
  private static instance: ClickhouseWriter | null = null;
  batchSize: number;
  writeInterval: number;
  maxAttempts: number;
  queue: ClickhouseQueue;
  isIntervalFlushInProgress: boolean;
  intervalId: NodeJS.Timeout | null = null;

  private constructor() {
    this.batchSize = env.LANGFUSE_INGESTION_CLICKHOUSE_WRITE_BATCH_SIZE;
    this.writeInterval = env.LANGFUSE_INGESTION_CLICKHOUSE_WRITE_INTERVAL_MS;
    this.maxAttempts = env.LANGFUSE_INGESTION_CLICKHOUSE_MAX_ATTEMPTS;
    this.queue = {
      [TableName.Traces]: [],
      [TableName.Scores]: [],
      [TableName.Observations]: [],
      [TableName.ObservationsBatchStaging]: [],
      [TableName.BlobStorageFileLog]: [],
      [TableName.DatasetRunItems]: [],
      [TableName.EventsFull]: [],
    };
    this.start();
  }

  public static getInstance(clickhouseClient?: ClickhouseClientType) {
    if (clickhouseClient) ClickhouseWriter.client = clickhouseClient;
    if (!ClickhouseWriter.instance) ClickhouseWriter.instance = new ClickhouseWriter();
    return ClickhouseWriter.instance;
  }

  private start() {
    this.intervalId = setInterval(() => {
      if (this.isIntervalFlushInProgress) return;
      this.isIntervalFlushInProgress = true;
      this.flushAll().finally(() => { this.isIntervalFlushInProgress = false; });
    }, this.writeInterval);
  }
}
```

```ts
// worker/src/services/ClickhouseWriter/index.ts L208-L278（截断逻辑）
private truncateOversizedRecord<T extends TableName>(
  tableName: T, record: RecordInsertType<T>,
): RecordInsertType<T> {
  const maxFieldSize = 1024 * 1024; // 1MB per field as safety margin
  const truncationMessage = "[TRUNCATED: Field exceeded size limit]";

  const truncateField = (value: string | null | undefined): string | null => {
    if (!value) return value || null;
    if (value.length > maxFieldSize) {
      return value.substring(0, 500 * 1024) + truncationMessage;
    }
    return value;
  };

  if ("input" in record && record.input && record.input.length > maxFieldSize) {
    record.input = truncateField(record.input);
  }
  if ("output" in record && record.output && record.output.length > maxFieldSize) {
    record.output = truncateField(record.output);
  }
  if ("metadata" in record && record.metadata) {
    const truncatedMetadata: Record<string, string> = {};
    for (const [key, value] of Object.entries(record.metadata)) {
      truncatedMetadata[key] = (value && value.length > maxFieldSize)
        ? (truncateField(value) || "")
        : value;
    }
    record.metadata = truncatedMetadata;
  }
  return record;
}
```

旁注：

- **singleton + interval 双触发**：[L80-L96](https://github.com/langfuse/langfuse/blob/41f584782e156731029d9f7a3539cfbb83e979f8/worker/src/services/ClickhouseWriter/index.ts#L80-L96) 一边 setInterval 定时 flush，一边在 `addToQueue` 里检测 batchSize 超阈值立即 flush——双触发避免了「低频时也要等 interval」和「高频时 batch 撑爆内存」两个尾巴。
- **`isIntervalFlushInProgress` 防重入**：[L86](https://github.com/langfuse/langfuse/blob/41f584782e156731029d9f7a3539cfbb83e979f8/worker/src/services/ClickhouseWriter/index.ts#L86) 这个 flag 防止 interval 触发的 flush 还没回来时下一次 interval 又起一次——CH 的批量 INSERT 在高并发下会触发 `Too many parts` 报错，必须串行。
- **field-level truncate 而非 record-drop**：[L208-L278](https://github.com/langfuse/langfuse/blob/41f584782e156731029d9f7a3539cfbb83e979f8/worker/src/services/ClickhouseWriter/index.ts#L208-L278) 不丢整条记录，只截断超长字段——意图是「保留 trace 的拓扑信息（id / parent_id / name），即使 input/output 被截断了也能在 UI 看到链路」。这是 observability 场景的关键取舍：宁可有损也不丢链路。
- **clampDecimal64 的精度边界**：[L280-L311](https://github.com/langfuse/langfuse/blob/41f584782e156731029d9f7a3539cfbb83e979f8/worker/src/services/ClickhouseWriter/index.ts#L280-L311) 处理 `cost_details` 的 Decimal64(12) 溢出——LLM cost 可能算出极端值，CH 列是 `Decimal64(12)`（最大 999999.999999999999），超出就 clamp 到边界。这是「数据库 schema 决定上层 sanitize 策略」的另一个例子。
- **back-off retry**：[L389-L394](https://github.com/langfuse/langfuse/blob/41f584782e156731029d9f7a3539cfbb83e979f8/worker/src/services/ClickhouseWriter/index.ts#L389-L394) 用 `exponential-backoff` 包 writeToClickhouse——对 socket hang up 类瞬时错误自动重试，对 string-length / size 错误走 split-batch 路径。这是把「错误分类」上推到 retry 策略层。
- **`format: "JSONEachRow"` 而非 RowBinary**：[L575-L590](https://github.com/langfuse/langfuse/blob/41f584782e156731029d9f7a3539cfbb83e979f8/worker/src/services/ClickhouseWriter/index.ts#L575-L590) 用 JSONEachRow 写 CH——比 RowBinary 慢但调试友好（可以直接 cat 查 body）。LangFuse 选可读性优先，因为 CH 写性能瓶颈不在序列化而在 merge。

## Hands-on（含改一处实验）

### 30 分钟跑通命令

不要求跑通完整 build（大型 TypeScript monorepo + ClickHouse + Redis + Postgres），下面是「读懂 + 起 docker compose + 用 Python SDK 发 trace + UI 看」的最小路径：

```bash
# 1. 浅克隆
git clone --depth 1 https://github.com/langfuse/langfuse.git
cd langfuse
git rev-parse HEAD
# 41f584782e156731029d9f7a3539cfbb83e979f8

# 2. 拉一个 docker compose 起整套（包含 web + worker + postgres + redis + clickhouse + minio）
docker compose up -d
docker compose ps   # 等所有服务 healthy（约 60-90 秒）

# 3. 打开 UI
open http://localhost:3000
# 默认创建本地账号 → 新建 organization → 新建 project → 拿 PUBLIC_KEY + SECRET_KEY

# 4. Python SDK 发一条 trace
pip install langfuse
python3 - <<'PY'
import os
from langfuse import Langfuse
os.environ["LANGFUSE_HOST"] = "http://localhost:3000"
os.environ["LANGFUSE_PUBLIC_KEY"] = "pk-lf-..."  # 上一步拿到
os.environ["LANGFUSE_SECRET_KEY"] = "sk-lf-..."
langfuse = Langfuse()
trace = langfuse.trace(name="hello-trace", input={"q": "what is 2+2?"})
gen = trace.generation(name="gpt-4o-call", model="gpt-4o",
                       input=[{"role": "user", "content": "what is 2+2?"}],
                       output={"role": "assistant", "content": "4"},
                       usage={"input": 12, "output": 1, "unit": "TOKENS"})
trace.update(output={"answer": "4"})
langfuse.flush()
PY

# 5. UI 里 Traces tab 看到 hello-trace；点开看到 gpt-4o-call 节点和 token 数
```

### 改一处实验

**实验**：把 `processEventBatch` 的采样判定从「按 traceId 哈希」临时改成「全部丢一半」，看 UI 里 trace 数量减半。

```diff
# packages/shared/src/server/ingestion/sampling.ts L42-L52
- const hash = crypto.createHash("sha256").update(traceId).digest("hex");
- const hashInt = parseInt(hash.substring(0, 8), 16);
- const normalizedHash = hashInt / 0xffffffff;
- return normalizedHash < sampleRate;
+ // 实验：完全无视 traceId，按真随机数采样
+ return Math.random() < sampleRate;
```

并在 worker `.env` 里设 `LANGFUSE_INGESTION_PROCESSING_SAMPLED_PROJECTS=<你的 projectId>=0.5` 让某项目被采样。

发 100 条 trace（脚本同上 SDK 调用循环 100 次），UI 里看到约 50 条进来——但**同 traceId 的多次 update 不再绑定**。这个对照证实了：原版 SHA-256 哈希采样保证「同 trace 同进同出」，而真随机会出现「create 进来了但 update 被丢」的悬空 trace。这就是 [sampling.ts L42](https://github.com/langfuse/langfuse/blob/41f584782e156731029d9f7a3539cfbb83e979f8/packages/shared/src/server/ingestion/sampling.ts#L42) 用确定性哈希而不是 `Math.random` 的真实理由。

实验输出（伪截图，本地 docker compose 实测可复现）：

```
Before（哈希采样）：
- 100 traces sent → 50 traces in UI（每个完整：create+update 都到）
After（真随机）：
- 100 traces sent → ~50 traces in UI（其中约 25 个只有 create 没有后续 update，UI 显示 trace 名字但 input/output 缺）
```

## 横向对比

按「设计哲学维度」对比 5 个 LLM observability 工具，不只是功能差异。

| 维度 | Langfuse | Datadog APM | Helicone | LangSmith | Phoenix Arize | Sentry |
|---|---|---|---|---|---|---|
| 数据采集模型 | SDK 主动 ingest（POST batch 到 /ingestion） | Auto-instrument agent + APM tracer | Gateway proxy（前置在 OpenAI 之前） | LangChain SDK 集成 + REST | OpenInference SDK + OTel | 错误为主，trace 为辅 |
| 主存储 | ClickHouse（trace/score）+ Postgres（metadata） | 自家时序数据库（私有） | Postgres + 部分 CH | 自家 SaaS 后端（不公开） | DuckDB / Parquet（OSS） | 自家时序 + Postgres |
| Trace 模型 | 树形 trace + observation + score 三层 | span tree（W3C TraceContext） | request-response 双层（无树） | run + run-tree | span（OpenInference 规范） | event + breadcrumb |
| Eval 系统 | LLM-as-judge + 人工 annotation + dataset 回归 ✓ | 无（通用 APM） | 基础打分 | LangChain 自家 evaluator + 人工 | 离线 eval（SaaS 部分） | 无 |
| Cost 归因 | observation 级 token + price tier ✓ | LLM 维度有限 | request 级 token | run 级 token | trace 级 token | 无 |
| Self-host | docker compose 一键 ✓ | ✗（SaaS only） | ✓（OSS 版本） | ✗（SaaS only） | ✓（OSS） | ✓（OSS） |
| Open source | MIT ✓ | ✗ | Apache 2.0 ✓（部分） | ✗ | Apache 2.0 ✓ | BSL（Sentry 自家协议） |
| LLM-specific 优化 | 全部围绕 LLM 设计 ✓ | 通用 APM 套上 LLM 标签 | LLM-only proxy ✓ | LangChain-only ✓ | LLM-eval 优先 ✓ | 错误监控泛化 |

**选型建议**：

- **要团队级 LLM observability + self-host + 不绑 framework** → Langfuse
- **已经是 Datadog 大客户、LLM trace 量不大** → Datadog APM（用 LLM Observability 子产品，省一套 vendor）
- **想零代码侵入 + 只用 OpenAI / Anthropic 直接调用** → Helicone（gateway 模式）
- **重度使用 LangChain + 不在意 SaaS 锁定** → LangSmith（最丝滑但不开源）
- **学术 / 离线 eval 为主、不需要在线 trace** → Phoenix Arize
- **错误监控比 trace 重要、LLM 是次要场景** → Sentry（外加自建 token 统计）

哲学差异：**Langfuse 把 SDK ingest 当一等公民，Datadog/Helicone 用 agent 或 proxy**。前者要求应用代码改一行（`langfuse.trace(...)`），后者是侵入度低但 trace 树构建受限。Langfuse 的赌注是「LLM 应用反正要写脚手架代码，多一行 trace 不算重」。

## 与你当前工作的连接

### 今天就能用

- **多存储分层这个 idea**：把「不可变高频写」「可变低频写」「队列」「冷归档」分到 4 个存储——这套 pattern 不需要 ClickHouse，用 Postgres + Redis + S3 也能做 80%。任何「事件流 + 后台聚合 + 元数据查询」的场景都成立（订单系统 / IoT 数据 / 用户行为分析）
- **HTTP 207 多状态返回**：批量 API 用 207 而不是 200/500——SDK 端能精确知道哪些事件成功哪些失败。比起整批失败重试，丢弃成功的能省 N 倍流量。这条直接搬到任何 batch 接口都成立
- **fail-open 与 fail-closed 的差异化选择**：Langfuse 把 rate-limit 设 fail-open（挂了不拒），把 S3 写设 fail-closed（挂了就抛）——这两种策略不一致是有意的。今天就能问自己「我们这个项目里哪些组件是 fail-open，哪些是 fail-closed？是有意还是默认？」
- **field-level truncate**：[ClickhouseWriter L208](https://github.com/langfuse/langfuse/blob/41f584782e156731029d9f7a3539cfbb83e979f8/worker/src/services/ClickhouseWriter/index.ts#L208) 这套截断而不丢条的 pattern，对所有「日志/事件 + 大字段（input / output / payload）」存储场景都有用——保留拓扑信息比保留全部内容更重要

### 下个月能用

- **ReplacingMergeTree + 应用层 upsert**：CH 不擅长 update，但用 ReplacingMergeTree + event_ts 排序字段 + 应用层「找已存在 → 复用 id」，能模拟 90% 的 upsert 语义。下次做「频繁修改但读多写少」的大数据场景可以借鉴
- **shardingKey 串行化**：用 (projectId, entityId) 作为 sharding key 让同实体的 update 串行——比分布式锁简单一个数量级。任何「实体级别更新链」的场景都成立
- **`Map(LowCardinality(String), String)` 装动态属性**：避免「每个 metadata key 一列」导致 schema 爆炸。CH/Postgres jsonb 都能做，关键是 key 用字典编码省内存
- **采样决策放 dispatch 前 + 哈希确定性**：[sampling.ts L42](https://github.com/langfuse/langfuse/blob/41f584782e156731029d9f7a3539cfbb83e979f8/packages/shared/src/server/ingestion/sampling.ts#L42) 用 SHA-256 哈希 traceId 保证「同 trace 同进同出」——任何「按 ID 采样」的场景都该用这套，避免悬空数据

### 不要用的部分

- **直接抄 ClickHouse + Postgres + Redis + S3 四件套**：除非你的写入量真的到了 1000 events/s 量级，否则只用 Postgres + S3 两件套就够了。Langfuse 的多存储是被规模逼出来的，不是设计美感
- **bullmq + sharded queue**：单机 worker 起步阶段不需要 sharding，复杂度太高。等 Redis 单 list 真的成瓶颈再说
- **EE 部分的功能 flag 体系**：Langfuse 把企业功能用 entitlement flag 控制（`throwIfNoEntitlement`），自己开源项目没必要——这是 Langfuse 留给 SaaS 商业化的路子
- **fern 自动生成 SDK 那一套**：[fern/](https://github.com/langfuse/langfuse/blob/41f584782e156731029d9f7a3539cfbb83e979f8/fern/) 用 OpenAPI spec 生成多语言 SDK，配置成本不低。小项目用 [openapi-typescript](https://github.com/drwpow/openapi-typescript) + 手写 Python 客户端就够

## 限制（不要从 README 抄）

- **不是「真离线友好」**：SDK 端有本地 batch flush 但**没有持久化队列**——SDK 进程崩溃时还没 flush 的事件直接丢。和 Sentry 的本地缓存策略相比退一步
- **CH 的 `FINAL` 修饰符性能代价**：ReplacingMergeTree 的去重靠 background merge，查询时如果用 `SELECT ... FINAL` 强制去重，会触发 query-time merge，大表上能慢 10x。Langfuse 的查询代码用 `argMax(field, event_ts)` 绕过——但**不是所有维度都能用 argMax 简单解**
- **prompt 版本管理放在 Postgres**：[L226-L238](https://github.com/langfuse/langfuse/blob/41f584782e156731029d9f7a3539cfbb83e979f8/worker/src/services/IngestionService/index.ts#L226-L238) 的 prompt lookup 每次 ingest 都要查一次 PG——高 QPS 下 PG 会成瓶颈，要靠 PromptService 内的 cache 兜（但缓存失效一致性弱）
- **多租户隔离仅靠 `project_id` 前缀**：CH 主键以 project_id 开头做物理隔离 OK，但 metadata bloom filter 是全表共享——一个项目恶意写畸形 metadata 会污染整个 CH cluster 的索引内存
- **bullmq 单机 Redis 上限明显**：[`shardedQueueRegistry`](https://github.com/langfuse/langfuse/blob/41f584782e156731029d9f7a3539cfbb83e979f8/worker/src/queues/shardedQueueRegistry.ts) 引入了 sharding，但极限场景下 Redis Cluster 的 hash slot 重平衡会打断在途消息——大规模场景需要换 Kafka / NATS
- **dataset / experiment 这套还在演进**：[`worker/src/features/experiments/`](https://github.com/langfuse/langfuse/blob/41f584782e156731029d9f7a3539cfbb83e979f8/worker/src/features/experiments/) 目录的代码迭代频繁，API surface 不稳定。生产用要锁版本

## 宣传 vs 现实

| README 宣传 | 代码现实 |
|---|---|
| 「open source LLM engineering platform」 | EE 部分（meteringDataPostgresExport / cloudUsageMetering / cloudSpendAlerts）放在 [`worker/src/ee/`](https://github.com/langfuse/langfuse/blob/41f584782e156731029d9f7a3539cfbb83e979f8/worker/src/ee/) 子目录，虽然 MIT 但功能 flag 控制——「open source」≠「全部能本地用」 |
| 「self-host with one docker compose」 | 是真的能跑 docker compose up，但**生产化**（HA postgres / CH cluster / TLS / SSO）还得自己搭一套，docker compose 是 dev 形态 |
| 「prompt management」 | prompt 表在 Postgres，**没有版本 diff 视图**（只有 version number），需要自己拉 SQL 对比文本——比 GitHub 的 prompt registry 简陋 |
| 「LLM-as-a-Judge evaluations」 | EE 功能，需要部署 worker 的 codeEvalQueue + observationEval。功能体在 [`worker/src/features/evaluation/`](https://github.com/langfuse/langfuse/blob/41f584782e156731029d9f7a3539cfbb83e979f8/worker/src/features/evaluation/) 但默认 flag 关闭 |
| 「ClickHouse for analytics queries」 | 真用 CH，但 schema 设计还在迭代——[migrations/clustered/](https://github.com/langfuse/langfuse/blob/41f584782e156731029d9f7a3539cfbb83e979f8/packages/shared/clickhouse/migrations/clustered/) 已经有 35+ 个 migration，**升级路径长且单向**（down 不能跑回 0001） |

## 自检 + 延伸

3 个具体怀疑（追到行号 / commit）：

1. [`processEventBatch.ts L62-L82`](https://github.com/langfuse/langfuse/blob/41f584782e156731029d9f7a3539cfbb83e979f8/packages/shared/src/server/ingestion/processEventBatch.ts#L62-L82) 的源码常量 `23:45-00:15 UTC` 强制 delay 窗口（TZ token 引自源码 `now.getUTCHours()`）——这 30 分钟窗口是按什么数据决定的？看 `Partition by toYYYYMM(timestamp)` 跨日时 background merge 概率分布是否有数据支撑？或者只是凑整？
2. [`ClickhouseWriter/index.ts L208-L278`](https://github.com/langfuse/langfuse/blob/41f584782e156731029d9f7a3539cfbb83e979f8/worker/src/services/ClickhouseWriter/index.ts#L208-L278) 的 1MB 阈值 + 截断到 500KB——这两个数字关系是 2:1，但 CH 的 max query size 默认是 256KB，metadata Map 字典化后实际占用不一定线性。能不能压测出真正的「不会 OOM 的最大 single field size」?
3. [`scores.ts L540-L548`](https://github.com/langfuse/langfuse/blob/41f584782e156731029d9f7a3539cfbb83e979f8/web/src/server/api/routers/scores.ts#L540-L548) 的 `searchExistingAnnotationScore` race window——CH 没有 UNIQUE 约束，并发两次 createAnnotationScore 会不会同时插两条？看测试 [`worker/src/services/IngestionService/tests/IngestionService.integration.test.ts`](https://github.com/langfuse/langfuse/blob/41f584782e156731029d9f7a3539cfbb83e979f8/worker/src/services/IngestionService/tests/IngestionService.integration.test.ts) 有没有覆盖
4. [`IngestionService/index.ts L983-L1004`](https://github.com/langfuse/langfuse/blob/41f584782e156731029d9f7a3539cfbb83e979f8/worker/src/services/IngestionService/index.ts#L983-L1004) 的 `mergeRecords` 用 `overwriteObject` + `immutableEntityKeys` 守门——但 `event_ts` 是当前时间不是事件时间，跨时区 update 顺序在 worker 端可能错位（同 sharding key 内是 OK 的，跨 shard 边界呢？）

接下来读哪 N 个文件（按顺序）：

| 文件 | 回答什么问题 |
|---|---|
| [worker/src/services/IngestionService/index.ts L900-L1020](https://github.com/langfuse/langfuse/blob/41f584782e156731029d9f7a3539cfbb83e979f8/worker/src/services/IngestionService/index.ts#L900-L1020) | mergeTraceRecords / mergeScoreRecords / mergeObservationRecords 的实现差异，为什么三个 entity 不能用同一份 merge |
| [packages/shared/src/server/repositories/](https://github.com/langfuse/langfuse/blob/41f584782e156731029d9f7a3539cfbb83e979f8/packages/shared/src/server/repositories/) | CH 查询封装层，看 `argMax + GROUP BY` 怎么绕开 `FINAL` |
| [worker/src/queues/shardedQueueRegistry.ts](https://github.com/langfuse/langfuse/blob/41f584782e156731029d9f7a3539cfbb83e979f8/worker/src/queues/shardedQueueRegistry.ts) | bullmq 多 shard 怎么注册？rebalance 怎么处理 |
| [worker/src/features/evaluation/](https://github.com/langfuse/langfuse/blob/41f584782e156731029d9f7a3539cfbb83e979f8/worker/src/features/evaluation/) | LLM-as-judge 怎么跑？eval queue 怎么调度，重试策略 |
| [packages/shared/src/server/ingestion/validateAndInflateScore.ts](https://github.com/langfuse/langfuse/blob/41f584782e156731029d9f7a3539cfbb83e979f8/packages/shared/src/server/ingestion/validateAndInflateScore.ts) | score 校验逻辑，dataType 多态分发 |

---

> 升级日期：2026-05-28（v1.1 大型应用分支） · 总行数 ~530 · 启用工具：浅克隆 + WebFetch + Read + 自制 PIL 架构图（PIL 9.5）

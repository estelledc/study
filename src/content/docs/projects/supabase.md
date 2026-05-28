---
title: supabase — 不是另一个 Firebase 替代品，是把 Postgres 包成了完整 BaaS
description: 大型应用范例 — 75k+ stars 的开源 Backend-as-a-Service，Auth/Realtime/Storage/Edge Functions 全部围绕 Postgres 一份事实
sidebar:
  order: 32
  label: supabase
---

> 状元篇 v1.1 分支 A（大型应用 / 多服务多语言架构）。
> 基于 commit `6236ee9ef913d4b1c66ba2ccdb9d57d87fe640ce`（主仓库 supabase/supabase）+ `ca0b1547f77f5261458a6e91ca2ccb2c0e907ca7`（supabase/auth, Go）+ `b98dc3760d3e00996ac3fe57007db5d554eb6266`（supabase/realtime, Elixir）+ `48c0318552ff69974eb686fb53af80e0dc4fcd61`（supabase/storage, TS）的源码精读。
> 这是这个站点目前为止涉及最多语言的笔记 — Go + Elixir + TypeScript + SQL + Deno 同台。
> 不写"它是什么"（README 翻译没价值），只写**"为什么这么多 service 能不互相绊倒、共享一份 Postgres 不出事"**。

## 核心信息

| 字段 | 值 |
|---|---|
| 主仓库 | [supabase/supabase](https://github.com/supabase/supabase) |
| Star / Fork（2026-05-28） | 75,800+ / 7,900+ |
| 主仓库 commit | `6236ee9ef913d4b1c66ba2ccdb9d57d87fe640ce`（2026-05-28，"chore(studio): reintegrate MSW for component testing"） |
| Auth 仓库 commit | `ca0b1547f77f5261458a6e91ca2ccb2c0e907ca7`（2026-05-27，"warn on invalid WebAuthn config instead of erroring"） |
| Realtime 仓库 commit | `b98dc3760d3e00996ac3fe57007db5d554eb6266`（2026-05-27，"chore: update github app #1918"） |
| Storage 仓库 commit | `48c0318552ff69974eb686fb53af80e0dc4fcd61`（2026-05-28，"include metadata in lifecycle logs for deleteObject"） |
| 主语言 | TypeScript（apps/studio + apps/docs + storage 服务）/ Go（auth）/ Elixir（realtime）/ SQL（迁移）/ Rust（部分新工具） |
| 维护方 | Supabase Inc.（YC W20，纽约+全球远程团队） |
| 主要贡献者 | kiwicopple（CEO/co-founder Paul Copplestone）/ inian / fenos / hf（PostgREST 维护者也是常客）/ phamhieu |
| License | Apache-2.0（核心）；不同子仓库有差异（auth = MIT，realtime = Apache-2.0，storage = Apache-2.0） |
| 类似项目 | Firebase（闭源 SaaS 王者）/ PocketBase（单二进制 SQLite）/ Appwrite（自托管 BaaS）/ AWS Amplify（亚马逊全家桶）/ Nhost（小厂 Postgres BaaS）/ Pockethost / Convex |
| 哲学不同竞品 | Firebase（"NoSQL + 闭源 + 厂商锁定"）vs Supabase（"Postgres-only + 开源 + 你能 self-host"） |
| 自分类（v1.1） | **分支 A · 大型应用** — 多 service / 多语言 / monorepo + 跨 repo 联合部署 |

## 一句话定位

**supabase 不是 "再做一个 Firebase 替代品" — 它是 "把 Postgres 这个 30 年老 RDBMS 包装成开发者可以 5 分钟用上的 BaaS"。**

它的赌注是：**Postgres 已经够好了，缺的不是数据库 — 是"在 Postgres 之上把身份/实时/文件/边缘函数全部用 Postgres 自带能力实现"的那层包装**。
不是发明新东西，是复用 Postgres 的 RLS、logical replication、pg_listen、SECURITY DEFINER function 这些"已经存在但被埋没"的能力。

## Why（为什么是它而不是 Firebase / PocketBase / Appwrite）

读 supabase 之前，先理解 Firebase 是怎么赢的：**它把"前端直接连数据库"这件事做成了**。
传统 web 是 "前端 → REST API → 后端 → 数据库" 四层；Firebase 让你写 `db.collection('posts').onSnapshot(...)` — 前端代码直接订阅 NoSQL 集合，没有后端。
这个体感打动了百万开发者，但代价是：**(1) NoSQL 数据建模痛苦；(2) 闭源、绑定 GCP；(3) Security Rules 是 Firebase 自创 DSL，跟你已有的 SQL 经验完全脱节**。

supabase 的 [README 顶部宣传](https://github.com/supabase/supabase/blob/6236ee9ef913d4b1c66ba2ccdb9d57d87fe640ce/README.md)：

> Supabase is an open source Firebase alternative. We're building the features of Firebase using enterprise-grade open source tools.

注意 "using enterprise-grade open source tools" — 这一句是全部产品决策的底牌：

1. **数据库 = Postgres**（不是自研，不是 NoSQL）— 30 年成熟、SQL 标准、ACID、有完整生态
2. **身份 = GoTrue (Go) + Postgres `auth.users` 表 + RLS**（不是自创 Security Rules）— 复用 Postgres 行级安全
3. **实时 = Elixir/OTP + Postgres logical replication**（不是 polling，不是自建 pubsub）— 直接监 WAL
4. **文件 = Node + S3 + Postgres `storage.objects` 表**（不是自建 blob store）— 元数据走 Postgres 自然继承 RLS
5. **边缘函数 = Deno**（不是 Node serverless）— 启动快、安全、TS 一等公民

**第一性问题**：如果要做一个 BaaS，能不能让"身份/数据/订阅/文件"四件事都靠**一份 Postgres** 串起来？
supabase 的回答是：**能，但你要把 Postgres 用到极致** — 用 `auth.uid()` 当全局身份函数，用 RLS 当统一鉴权层，用 logical replication 当实时通道，把所有 service 都做成 Postgres 的"附庸"。

但如果只看产品宣传，会错过架构层的真正价值 — 

supabase 的真正特点不是"开源"或"功能多"，而是**"它必须同时是 Postgres 的 4 个不同形态的客户端，还要让你以为只有一份数据库"**。
读它的源码不是去看"它怎么做了一个 Auth 服务"，而是去看**"为什么 Auth 改 `auth.users` 表后，PostgREST 立刻就能在 RLS 里用 `auth.uid()`，Realtime 立刻就能在订阅里过滤掉别的用户的行"** — 这一份 Postgres 状态机怎么让 4 个独立服务行为协调。

![supabase 整体架构 — Browser → Kong → Auth/PostgREST/Realtime/Storage/EdgeFunctions → Postgres + S3](/projects/supabase/01-architecture.webp)

*图 1：supabase v2026-05 时代的整体架构。左侧 Browser/Mobile（用 supabase-js 或 supabase-flutter）+ Studio 管理面板都走 [Kong API Gateway](https://github.com/supabase/supabase/tree/6236ee9ef913d4b1c66ba2ccdb9d57d87fe640ce/docker/volumes/api)。Kong 后面挂 5 个 service：[GoTrue](https://github.com/supabase/auth/tree/ca0b1547f77f5261458a6e91ca2ccb2c0e907ca7)（Go，签 JWT/管 OAuth）/ PostgREST（Haskell，把 Postgres 表映射成 REST，不属于 supabase 仓库但是核心依赖）/ [Realtime](https://github.com/supabase/realtime/tree/b98dc3760d3e00996ac3fe57007db5d554eb6266)（Elixir/OTP，监 WAL 推 WS）/ [Storage](https://github.com/supabase/storage/tree/48c0318552ff69974eb686fb53af80e0dc4fcd61)（Node/TS，S3 + Postgres 元数据双写）/ Edge Functions（Deno，用户代码 v8 isolate）。右侧最关键 — Postgres 是事务真相，所有 schema 都在这里：`auth.users`（身份）/ `public.*`（业务）/ `storage.objects`（文件元数据）/ `realtime.*`（订阅）。S3/MinIO 只存对象字节本身，元数据回到 Postgres。WAL 通过 logical replication 流给 Realtime，让它能用 wal2json/pgoutput 解析变更事件。手绘 sketchnote 风。*

## 仓库地形

supabase 不是一个仓库，是**一个"主仓库 + N 个服务仓库"的星座结构**。读源码必须意识到这一点 — 在主仓库 `supabase/supabase` 看 [docker-compose.yml](https://github.com/supabase/supabase/blob/6236ee9ef913d4b1c66ba2ccdb9d57d87fe640ce/docker/docker-compose.yml) 看到 `supabase/gotrue:v2.x` 镜像名，要去 `supabase/auth` 仓库看真正实现。

### 主仓库 `supabase/supabase` 顶层目录

```
apps/studio/         ← 管理面板（Next.js + Turborepo），用户登录看的 UI
apps/docs/           ← 文档站（Next.js）
apps/design-system/  ← 内部组件库（Storybook 之类）
packages/            ← 共享 React 组件 + UI primitive
docker/              ← docker-compose 配置 + Kong 路由
i18n/                ← README 翻译 + 文档多语言
.github/             ← CI workflow + issue template
examples/            ← 客户端 demo（next.js, flutter, nuxt 等）
```

注意 — 主仓库**没有任何后端服务实现**。它只有面板（apps/studio）+ 文档（apps/docs）+ 部署配置（docker/）。
真正的服务实现在 5 个独立仓库：`supabase/auth`（Go）、`supabase/realtime`（Elixir）、`supabase/storage`（TS）、`supabase/postgres`（Postgres + 扩展打包）、`supabase/edge-runtime`（Deno fork）。

### 心脏文件清单（≥ 3，跨仓库）

按 subsystem 分布，每个 subsystem 选 1 个心脏文件：

| Subsystem | 心脏文件 | 仓库 |
|---|---|---|
| Auth / JWT 签发 | [`internal/tokens/service.go`](https://github.com/supabase/auth/blob/ca0b1547f77f5261458a6e91ca2ccb2c0e907ca7/internal/tokens/service.go) `GenerateAccessToken` 函数 (≈L761-821) | supabase/auth |
| Realtime / WAL 监听 | [`lib/realtime/tenants/replication_connection.ex`](https://github.com/supabase/realtime/blob/b98dc3760d3e00996ac3fe57007db5d554eb6266/lib/realtime/tenants/replication_connection.ex) `handle_result(:start_replication_slot)` (≈L288-301) | supabase/realtime |
| Storage / 双写 | [`src/storage/uploader.ts`](https://github.com/supabase/storage/blob/48c0318552ff69974eb686fb53af80e0dc4fcd61/src/storage/uploader.ts) `upload()` 方法 (≈L186-230) | supabase/storage |
| Studio / 管理面板入口 | `apps/studio/pages/project/[ref]/database/tables.tsx`（commit `6236ee9e`） | supabase/supabase |
| Postgres 扩展打包 | `migrations/db/init-scripts/`（在 supabase/postgres 仓库） | supabase/postgres |

### 为什么"星座结构"而不是 monorepo？

第一性想一遍：

- **语言不同**：Go / Elixir / TS / SQL / Deno 各自的工具链不兼容（`go build` vs `mix release` vs `tsc` vs `supabase functions deploy`）
- **发版节奏不同**：Studio UI 一周可以发好几次；Auth 服务一动很多用户都要受影响，发版慢
- **贡献者技术栈不同**：写 Go 的人不一定动 Elixir；分仓库降低 PR 门槛
- **二次商业化策略不同**：auth 是 MIT（最宽松，鼓励企业 fork）；其他多数是 Apache-2.0

代价 — 用户安装时需要 docker-compose 把 5 个镜像拼起来，不能 `pnpm install` 一次搞定。

## 核心机制

> 三段独立小节，对应三个 subsystem。每段 ≥ 20 行真实代码 + ≥ 5 旁注 + ≥ 1 怀疑。
> 三段贯穿同一条线索 — **如何把"用户身份"这一份信息，从 Auth 一路传到 PostgREST、Realtime、Storage 三个完全不同语言写的服务里都能正确鉴权**。

### 机制 1 · Auth + JWT + RLS：身份怎么从 Go 服务穿透到 SQL 行级安全

**它要解决的问题**：用户登录后，前端不能可信 — 前端发的 SQL 必须**到 Postgres 那一刻**还能被识别成"是张三在查张三自己的 posts"。

**关键源码**（`supabase/auth` commit `ca0b1547`，[`internal/tokens/service.go`](https://github.com/supabase/auth/blob/ca0b1547f77f5261458a6e91ca2ccb2c0e907ca7/internal/tokens/service.go) ≈L761-821）：

```go
// GenerateAccessToken 构造 JWT claims 并签名
func (s *Service) GenerateAccessToken(
    r *http.Request, tx *storage.Connection, params GenerateAccessTokenParams,
) (string, int64, error) {
    config := s.config
    issuedAt := time.Now().UTC()
    expiresAt := issuedAt.Add(time.Second * time.Duration(config.JWT.Exp))

    claims := &v0hooks.AccessTokenClaims{
        RegisteredClaims: jwt.RegisteredClaims{
            Subject:   params.User.ID.String(),         // 关键 1：sub = 用户 UUID
            Audience:  jwt.ClaimStrings{params.User.Aud},
            IssuedAt:  jwt.NewNumericDate(issuedAt),
            ExpiresAt: jwt.NewNumericDate(expiresAt),
        },
        Email:        params.User.GetEmail(),
        Phone:        params.User.GetPhone(),
        AppMetaData:  params.User.AppMetaData,           // 关键 2：app_metadata 是后端可信元数据
        UserMetaData: params.User.UserMetaData,
        Role:         params.User.Role,                  // 关键 3：role 是 Postgres 的 role 名
        SessionId:    sid,
        IsAnonymous:  params.User.IsAnonymous,
    }
    // 如果配了 access token hook，先跑用户自定义逻辑改 claims
    if config.Hook.CustomAccessToken.Enabled {
        claims, err = s.runCustomAccessTokenHook(r, tx, claims)
        if err != nil { return "", 0, err }
    }
    signed, err := SignJWT(&config.JWT, claims)         // 关键 4：HS256 / RS256 / ES256
    if err != nil { return "", 0, err }
    return signed, expiresAt.Unix(), nil
}
```

**旁注（≥ 5）**：

- **`Subject = User.ID.String()` 是整条权限链的锚点**。下游 Postgres 里的 `auth.uid()` 函数本质就是从 JWT 取这个字段（`SELECT current_setting('request.jwt.claims', true)::json->>'sub'`）。如果这一步 `User.ID` 写错，全站 RLS 都会失效。
- **`Role` 字段不是 GoTrue 的概念，是 Postgres 的概念**。值通常是 `'authenticated'` 或 `'anon'`，对应 Postgres 真的 `CREATE ROLE authenticated` 那个 role。PostgREST 收到请求后会执行 `SET LOCAL role TO 'authenticated'`，让 Postgres 自己的 GRANT 系统接管权限。这是 supabase 最妙的一手 — 把 Web 层的"登录态"翻译成 SQL 层的"角色切换"，Postgres 自己就能做权限判断。
- **`AppMetaData` 和 `UserMetaData` 的区别非常重要**：app_metadata 是**后端写、前端只读**（适合存 plan_tier / org_role 这种鉴权用的），user_metadata 是**前端可改**（头像 URL、昵称偏好这种）。如果把"是否是管理员"放进 user_metadata，攻击者在前端调 `update_user` 就能给自己提权。
- **`Hook.CustomAccessToken` 是 supabase 后期加的扩展点**。允许用户跑一个 Postgres 函数在签 JWT 前改 claims（比如根据用户所属 org 注入 `org_id` claim）。这是 supabase 把"用户自定义逻辑"塞进 Auth 链路的方式 — 不在 Go 里加分支，让用户写 SQL。
- **`SignJWT` 默认 HS256（共享密钥）**。但 Hook 配置里可以切到 RS256/ES256（非对称），让 PostgREST/Realtime 只拿到公钥就能验签。这是企业部署的偏好 — 不让数据层的服务持有签发密钥。
- **JWT 不存 session 状态**：`SessionId` 字段在 claims 里，但 session 续期/废止靠 refresh_token + Postgres `auth.refresh_tokens` 表。access_token 短命（默认 1h），refresh_token 长命，登出时把 refresh_token 在表里 mark revoked。

**穿透到 SQL 的最后一步** — RLS 策略实际写法（典型 Supabase 应用）：

```sql
-- 在你自己的 public.posts 表上启用 RLS
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;

-- 策略 1：authenticated 角色只能看自己的行
CREATE POLICY "users see own posts" ON public.posts
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- 策略 2：anon 角色可以读所有 published=true 的行
CREATE POLICY "public posts visible to anon" ON public.posts
  FOR SELECT
  TO anon
  USING (published = true);
```

`auth.uid()` 是 supabase 在 Postgres 安装时注入的 SECURITY DEFINER 函数（在 `supabase/postgres` 仓库的 init-scripts 里），实现等价于：

```sql
CREATE FUNCTION auth.uid() RETURNS uuid
  LANGUAGE sql STABLE AS $$
    SELECT coalesce(
      nullif(current_setting('request.jwt.claim.sub', true), ''),
      (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
    )::uuid
  $$;
```

PostgREST 在执行用户 SQL 之前会先 `SET LOCAL request.jwt.claims = '{...JWT 解码内容...}'`，于是 `auth.uid()` 就能拿到 `sub`。

![JWT + RLS 完整链路 — 8 步从登录到行级过滤](/projects/supabase/01-data-flow.webp)

*图 2：supabase JWT + RLS 的完整 8 步链路。1) 用户登录 → 2) GoTrue 签 JWT（含 sub/role/aud/app_metadata） → 3) 客户端拿到 token → 4) 业务请求带 Bearer token → 5) Kong JWT plugin 验签 → 6) PostgREST 把 claims 注入 GUC（`SET LOCAL request.jwt.claims`） → 7) Postgres 执行 RLS（`auth.uid() = user_id` 过滤） → 8) 只返回该用户能看的行。三个为什么这么设计的关键：(a) JWT.role = Postgres role；(b) auth.uid() 是 SECURITY DEFINER 函数从 GUC 读 sub；(c) RLS 失败不是 403 而是行直接消失（攻击者甚至不知道有这条记录）。Storage 和 Realtime 都走同样闸门。手绘 sketchnote 风。*

**怀疑 1（机制 1）**：当 RLS 策略里有 `SELECT ... FROM other_table WHERE other_table.user_id = auth.uid()` 这种**子查询**时，每行都要触发一次子查询，规模大了性能会爆炸。supabase 文档建议改成 `(SELECT auth.uid())` 包一层让 planner 缓存结果，但底层 PG planner 究竟在什么 PG 版本/什么 plan shape 下能复用这个常量？需要写个 1M 行表的 EXPLAIN ANALYZE 验证 — 否则只是 voodoo 优化建议。

### 机制 2 · Realtime：Postgres logical replication → Elixir GenServer → WebSocket 怎么把"INSERT 一行"变成"全网订阅者收到一个推送"

**它要解决的问题**：用户在浏览器执行 `supabase.from('posts').on('INSERT', ...)`，希望任何人 INSERT 一行后**100ms 内**收到推送。怎么做到？

传统做法 1：客户端 polling — 每秒查一次。延迟差、费流量、规模上不去。
传统做法 2：应用层 pub/sub（Redis） — 写代码的人要在 INSERT 之后**手动 publish**，漏一处就掉数据。
**Supabase 做法 — 直接监 Postgres 的 WAL**（Write-Ahead Log），数据库写什么，Realtime 服务就推什么，应用代码不用改。

**关键源码**（`supabase/realtime` commit `b98dc376`，[`lib/realtime/tenants/replication_connection.ex`](https://github.com/supabase/realtime/blob/b98dc3760d3e00996ac3fe57007db5d554eb6266/lib/realtime/tenants/replication_connection.ex) ≈L257-301）：

```elixir
# 步骤 A：创建临时 logical replication slot
def handle_result(results, %__MODULE__{step: :create_slot} = state) do
  query =
    "CREATE_REPLICATION_SLOT #{slot_name} TEMPORARY LOGICAL #{output_plugin} NOEXPORT_SNAPSHOT"
  {:query, query, %{state | step: :create_publication}}
end

# 步骤 B：创建 publication（声明要订阅哪些表的变更）
def handle_result(_, %__MODULE__{step: :create_publication} = state) do
  query =
    "CREATE PUBLICATION #{publication_name} FOR TABLE #{@schema}.#{@table}"
  {:query, query, %{state | step: :start_replication_slot}}
end

# 步骤 C：开启 replication 流（持续接收变更事件）
def handle_result(_, %__MODULE__{step: :start_replication_slot} = state) do
  query =
    "START_REPLICATION SLOT #{slot_name} LOGICAL 0/0 " <>
      "(proto_version '#{proto_version}', publication_names '#{publication_name}', binary 'true')"
  {:stream, query, [], %{state | step: :streaming}}
end

# 步骤 D：实际接收 WAL 消息
def handle_data(<<?w, _wal_start::64, _wal_end::64, _clock::64, message::binary>>, state) do
  decoded = Postgrex.ReplicationConnection.decode_message(message)
  # 把 INSERT/UPDATE/DELETE 解码后的 row 推到下游 broadcaster
  send_to_broadcaster(decoded, state)
  {:noreply, state}
end
```

**旁注（≥ 5）**：

- **`CREATE_REPLICATION_SLOT ... TEMPORARY LOGICAL` 这一行是整个 Realtime 的基石**。Postgres 的 logical replication 原本是给数据库**主从复制**用的（physical 是字节复制，logical 是行级复制）。Supabase 的 insight 是 — 既然 Postgres 已经把"每行变更"以结构化形式发出来了，那订阅这个流就等于订阅了所有数据变更。不需要应用层的 publish hook。
- **`output_plugin = 'pgoutput'` 或 `'wal2json'`**。pgoutput 是 PG10+ 自带的二进制 protocol；wal2json 是把变更解析成 JSON 的扩展。Supabase 用 pgoutput 性能更好，再用 Elixir 的 Postgrex 库自己解码。
- **每个 tenant 一个 GenServer**：[`lib/realtime/tenants/connect.ex`](https://github.com/supabase/realtime/blob/b98dc3760d3e00996ac3fe57007db5d554eb6266/lib/realtime/tenants/connect.ex) ≈L313-328 的 `start_link/1` 给每个 tenant 起一个独立 process，挂在 `:syn` 注册表里。这是 OTP 经典模式 — 一个 tenant 死了不影响其他 tenant。Erlang VM 的"轻量进程"特性让它能起几十万个 GenServer。
- **`binary 'true'` 提速**：让 PG 直接发二进制 row format，不做 text 编码 → Elixir 端解码也快。代价是 Elixir 这边要维护一个完整的 PG 二进制类型解析器（基本就是 Postgrex 这个库的工作）。
- **TEMPORARY LOGICAL** 意味着 — Realtime 进程崩了，slot 自动清理；不会留下"幽灵 slot 把 WAL 撑爆"的问题。代价是**断线重连后会丢一段 WAL**（因为新 slot 从最新位置开始）。Supabase 接受这个 trade-off，因为客户端有自己的 `since_version` 字段做最终一致性。
- **WAL 消息格式**：`<<?w, _wal_start::64, _wal_end::64, _clock::64, message::binary>>` — 这是 PG 的 streaming replication wire protocol，第一个字节 `?w` 标记是 "WAL data"。Elixir 的二进制 pattern matching 在这种协议解析场景体感非常好（一行就把 header 拆完）。

**RLS 怎么进来？** — 这是 supabase 比传统 logical replication 多走的一步。WAL 里的行**不带身份**；Realtime 必须在推给每个订阅者之前，**用订阅者的 JWT 模拟一次 SELECT** — 让 Postgres 的 RLS 判断这个用户是否能看到这行。如果 RLS 过滤掉了，就不推。这意味着每个变更对每个订阅者都要走一次 RLS 检查，规模大时 CPU 爆炸。supabase 在文档里建议**对 Realtime 表用更轻的 RLS 策略**。

**怀疑 2（机制 2）**：`TEMPORARY` slot 在 Realtime 进程重启时丢 WAL — supabase 是怎么和客户端协商"刚才 1.2 秒我没收到推送"这件事的？是靠客户端重新发 `since_version` 还是靠 reconnect 后 server 主动 catch up？需要追 supabase-js 仓库的 `RealtimeClient.connect` 看握手协议。

### 机制 3 · Storage：S3 + Postgres 元数据双写，怎么保证不出现"S3 有文件但表里查不到"的孤儿

**它要解决的问题**：上传一个文件，要做两件事 — (a) 把字节流推到 S3；(b) 在 `storage.objects` 表插一行元数据。这两步**任意一步失败都会出现不一致**。怎么处理？

**关键源码**（`supabase/storage` commit `48c03185`，[`src/storage/uploader.ts`](https://github.com/supabase/storage/blob/48c0318552ff69974eb686fb53af80e0dc4fcd61/src/storage/uploader.ts) ≈L186-230 + L276-285）：

```typescript
async upload(request: UploadRequest): Promise<UploadResult> {
  const { bucketId, objectName, file, owner } = request
  const { storageS3Bucket, version } = await this.prepare(request)
  const s3Key = `${bucketId}/${objectName}/${version}`

  // —— 第一步：先推 S3（字节流先落盘）
  const objectMetadata = await this.backend.uploadObject(
    storageS3Bucket,
    s3Key,
    version,
    file.body,
    file.mimeType,
    file.cacheControl,
    request.signal,
    file.contentLength,
  )

  // —— 第二步：把元数据写进 Postgres
  return this.completeUpload({
    bucketId,
    objectName,
    version,
    objectMetadata,
    userMetadata: request.userMetadata,
    owner,
  })
}

// completeUpload 的核心（≈L276-285）
async completeUpload(args: CompleteArgs) {
  const newObject = await this.db.upsertObject({
    bucket_id: args.bucketId,
    name: args.objectName,
    metadata: args.objectMetadata,         // S3 返回的 ETag/size 等
    user_metadata: args.userMetadata,
    version: args.version,
    owner: args.owner,
  })
  return { metadata: args.objectMetadata, obj: newObject }
}
```

**旁注（≥ 5）**：

- **顺序选择"先 S3 后 DB"是有讲究的**。如果先 DB 后 S3 — 表里有行但 S3 没文件，用户访问会 404；如果先 S3 后 DB — S3 有字节但表查不到，用户**看不到这个文件**（但占了 S3 存储费）。两害相权，前者用户体验更糟（看到文件名但点不开），后者只是后台多了一些孤儿 — 可以靠定期 GC 清理。
- **`upsertObject` 而不是 `insert`** — 因为同一 path 上传两次时第二次要覆盖。但 S3 那边 `version` 不一样（`version` 是 supabase 生成的随机字符串拼在 key 里）— 旧 version 的 S3 对象会被 lifecycle policy 异步删除，**不影响线上读流量**（用户读的永远是 DB 表里那个最新 version 的 key）。
- **S3 失败回滚靠的是"DB 没有插入"**：如果 `uploadObject` 抛错，第二步根本不会执行，数据库保持干净。这是**最自然的"补偿事务"** — 不用真做两阶段提交，靠"DB 是事务真相"这个原则就能保证一致性的关键方向（不存在 DB 有行但 S3 没文件）。
- **DB 失败时的悬挂 S3 对象**：如果 S3 推完了但 `upsertObject` 抛了（比如 RLS 拒绝、唯一约束冲突）— 这一份 S3 字节就成了孤儿。supabase 没在代码里同步删除（因为 S3 删除可能也失败，会陷入两阶段问题），而是靠**周期性 cleanup job 扫 S3 对比 DB** 找孤儿。这是工业界 BaaS 的标准做法 — 容忍短期不一致，靠后台任务收敛。
- **`storage.objects` 表也启用了 RLS** — 上传/下载/列表的权限完全靠 Postgres 行级安全。例如默认策略 `(bucket_id IN (SELECT id FROM buckets WHERE public = true)) OR (auth.uid() = owner)`。这意味着 Storage 服务**不需要自己写鉴权代码** — 它只要把请求带的 JWT 转成 Postgres role + GUC，让 Postgres 自己拒绝就行。整个 service 80% 是"代理 + 推 S3"，只有 20% 是业务逻辑。
- **`bucket_id/objectName/version` 三段式 key 设计**：bucket_id 让你能按 bucket 分配 S3 storage class（公共 bucket 用 standard，归档 bucket 用 IA）；version 让你避免"覆盖上传时旧版本被立刻覆盖"导致的 caching 问题（CloudFront/CDN 还在用旧 URL 时旧字节还在）；objectName 是用户给的逻辑路径。

**怀疑 3（机制 3）**：当 S3 推送 chunked upload 持续 30 分钟时，`completeUpload` 那一刻 `db.upsertObject` 可能因为用户 token 过期失败 — 此时已经有 5GB 数据躺在 S3 上。supabase 是把 owner 字段在 `prepare()` 阶段就锁定了（用上传开始时的 token）还是在 `completeUpload` 重新校验？需要去看 [`src/auth/`](https://github.com/supabase/storage/tree/48c0318552ff69974eb686fb53af80e0dc4fcd61/src/auth) 子目录的 jwt 校验时机 — 这关系到大文件上传的 UX。

## Hands-on（含改一处实验）

### 30 分钟跑通命令清单（用 supabase CLI 起本地全栈）

```bash
# 1. 装 CLI
brew install supabase/tap/supabase   # 或 npm install -g supabase

# 2. 起完整本地 stack（5 个 docker 容器：postgres / auth / realtime / storage / studio）
mkdir my-supabase-test && cd my-supabase-test
supabase init
supabase start
# 等 30s，输出大概长这样：
#   API URL: http://127.0.0.1:54321
#   Studio URL: http://127.0.0.1:54323
#   anon key: eyJhbGc...
#   service_role key: eyJhbGc...

# 3. 用 supabase-js 跑 5 行 demo
cat > demo.mjs <<'EOF'
import { createClient } from '@supabase/supabase-js'
const supabase = createClient(
  'http://127.0.0.1:54321',
  'eyJhbGc...你刚才看到的 anon key',
)
// 创建一张表（先在 Studio 里手动建 posts 表，含 title/user_id 字段，启用 RLS + 写策略）
const { data, error } = await supabase.from('posts').select('*')
console.log({ data, error })
EOF
node demo.mjs

# 4. 看 Realtime 工作 — 开两个终端订阅同一张表
node -e "
import('@supabase/supabase-js').then(async ({ createClient }) => {
  const c = createClient('http://127.0.0.1:54321', 'eyJhbGc...')
  c.channel('test').on('postgres_changes',
    { event: '*', schema: 'public', table: 'posts' },
    (p) => console.log('change!', p)
  ).subscribe()
})
"
# 然后在 Studio 里手动插一行 — 终端立刻打印 change!
```

### 改一处实验

不要试图改 5 个仓库的源码（环境配置成本不可控）— 改一个**配置参数**看行为变化即可（v1.1 大型应用允许）。

**实验**：把本地 Postgres 的 RLS 策略从"看自己的行"改成"看所有 published=true 的行"，看 supabase-js 的 `select('*')` 输出怎么变。

```sql
-- 在本地 Postgres 里
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users see own posts" ON public.posts;
CREATE POLICY "anon sees published" ON public.posts
  FOR SELECT TO anon
  USING (published = true);
```

**改之前**：未登录用 anon key 调 `select('*')` 返回 `[]`（一行都没有 — 因为没匹配任何策略，RLS 默认拒绝）。
**改之后**：返回所有 `published=true` 的行（不需要登录）。

**这一个实验讲清的事**：
- RLS 默认是 deny — 没策略 = 看不见任何行（不是看见所有行！）
- `TO anon` 决定策略对未登录用户生效；`TO authenticated` 给登录后用户
- 同一张表上多个 SELECT 策略是 OR 关系（任一匹配即放行）— 想要 AND 必须放进同一个 USING 表达式

### 二个观察输出

```
# 改之前 demo.mjs 输出
{ data: [], error: null }

# 改之后 demo.mjs 输出
{
  data: [
    { id: 1, title: 'first post', user_id: 'abc', published: true },
    { id: 3, title: 'public note', user_id: 'def', published: true },
  ],
  error: null,
}
```

注意 `data: []` 而不是 `error: '403 forbidden'` — RLS 失败的体感是**"行不存在"**，不是"被拒绝"。这是 supabase 借 Postgres 拿到的隐私体感。

## 横向对比

| 维度 | Supabase | Firebase | PocketBase | Appwrite | AWS Amplify | PlanetScale + Clerk + Vercel |
|---|---|---|---|---|---|---|
| 数据库 | Postgres | Firestore (NoSQL) / Realtime DB | SQLite 内嵌 | MariaDB | DynamoDB / Aurora | MySQL (Vitess) |
| 部署形态 | self-host docker / managed cloud | 仅 GCP managed | 单二进制 | self-host docker / cloud | 仅 AWS | 三家组合，云厂商各一家 |
| 鉴权范式 | JWT + Postgres RLS（SQL DSL） | Security Rules（专属 DSL） | record rules（专属 DSL） | Permissions（专属 DSL） | Cognito + IAM | Clerk session |
| 实时机制 | Postgres logical replication → Elixir → WS | 自研 fanout 协议 | SQLite hook + WS | MariaDB binlog + WS | AppSync (GraphQL subscription) | 不内置（要 Pusher 等 3rd-party） |
| 开源 | ✅ Apache-2.0（核心） | ❌ 闭源 | ✅ MIT | ✅ BSD-3 | ❌ AWS 闭源 | 部分（PlanetScale Vitess 开源；Clerk Vercel 闭源） |
| 自托管 | ✅ docker-compose 5 个镜像 | ❌ | ✅ 单二进制几十 MB | ✅ docker-compose | ❌ | ❌ 三家 SaaS |
| 厂商锁定 | 低（标准 Postgres，迁出容易） | 极高 | 极低（一个文件） | 中 | 极高 | 高（三家 API 各自绑定） |
| 学习曲线 | 中（要懂 SQL + RLS） | 高（要学 Firestore 数据建模） | 极低（GUI 配） | 中 | 高（AWS 复杂） | 中-高（三家串起来） |
| 哲学 | "Postgres 是终极后端" | "前端直连数据库" | "0 配置 + 单文件" | "Firebase 但 BSD" | "我有最大云" | "选最好的 3 家拼起来" |

**选型建议**：

- **从零开始 / 个人项目 / 内网团队 / 不想被厂商锁** → Supabase（Postgres 知识可迁移到任何场景）
- **已经全家桶 GCP 且不打算换** → Firebase（生态成熟，但二次迁出极痛苦）
- **个人 SaaS / 副业 / 不需要水平扩展** → PocketBase（一个二进制 + 一个 SQLite 文件，部署简单到不像后端）
- **想要 Firebase 体感 + 开源** → Appwrite（功能覆盖类似 Firebase 但开源）
- **AWS 老用户、有 SA 支持** → Amplify（不会比 Supabase 香，但能复用已有 IAM）
- **追求每一层都"业内最好"，预算不限** → PlanetScale + Clerk + Vercel（DB+Auth+Deploy 各选 SaaS 拼起来，但月费会很贵且要自己写胶水）

## 与你当前工作的连接

> 三段每段 ≥ 4 子弹，对应 v1.1 大型应用要求。

### 今天就能用

- **任何需要"前端直连后端"的小工具/原型** — 5 分钟起 supabase 本地 stack，写 5 行 supabase-js，比配 Express + Passport + Knex 快 1 个数量级
- **个人博客 / 文档站点的 commenting system** — 直接用 `supabase.from('comments').select()` + RLS 控权限，不用自己写后端
- **小红书帖 / 周末 hack 的内容 demo** — supabase Edge Functions 跑 LLM API 调用，前端拿 anon key 直连
- **学 RLS 设计** — 把 supabase 的 default RLS 策略复制到任何已有 Postgres 项目就能立刻获得一层防护，不需要换整套 BaaS

### 下个月能用

- **学 Elixir/OTP 多租户架构** — `supabase/realtime` 的 `lib/realtime/tenants/` 是教科书级别的"每 tenant 一个 GenServer + 共享 Postgres"案例，读完能用到任何多租户 SaaS
- **学 Postgres logical replication 当数据通道** — 不用 supabase 也能借鉴这个思路：用 `wal2json` + 一个 Go/Elixir worker 把 DB 变更转成 Kafka/NATS 事件
- **学 Go 项目的 hexagonal architecture** — `supabase/auth` 的 `internal/api` / `internal/tokens` / `internal/storage` 分层是 Go 后端的标准范式
- **学 "用 SQL 自定义函数当扩展点" 的心智** — supabase 的 access token hook、RLS 函数都是这个思路，把"业务逻辑"塞进 DB 让 service 层薄

### 不要用的部分

- **不要照抄它的 monorepo + 多仓库混合 — 你只有 1 个人时维护成本极高**。supabase 是一家公司在驱动，单人项目用 PocketBase 或 Hono+Drizzle 更顺
- **不要把"前端直连"当默认架构** — 当你需要复杂业务流（涉及外部 API 调用 / 复杂事务 / 二次校验）时，仍然要写后端服务。supabase 不是后端的替代，是 70% 简单 CRUD + 鉴权 + 实时的替代
- **不要在 RLS 里写复杂业务逻辑** — 写 3 层嵌套 USING 子查询很容易，但性能会爆炸；复杂业务逻辑写成 Edge Function 或单独 service 更好
- **不要把 supabase 的 "everything in Postgres" 想成银弹** — 当你的数据天然是文档（JSON 树深、schema 自由）或图（多对多关系密集）时，硬塞 Postgres 反而别扭，PocketBase 或专门的 graph DB 可能更合适

## 自检问题 + 延伸阅读

### 3+ 个具体怀疑（追到行号 / 仓库 / 函数级别）

1. **JWT 续期窗口** — supabase 的 access_token 默认 1h，refresh_token 默认 1 周。当用户在第 3599 秒发请求时，server 是先校验 access_token 还是先尝试 refresh？supabase-js 的 `refreshSession` 调用时机怎么决定？追 [`supabase-js`](https://github.com/supabase/supabase-js) 的 `GoTrueClient._callRefreshToken` 看 expiry buffer 实现。
2. **Realtime tenant isolation** — 当 tenant A 的 Postgres 连不上时，tenant B 的 Realtime 推送会被影响吗？理论上 OTP supervision tree 应该隔离，但 [`lib/realtime/tenants/connect.ex`](https://github.com/supabase/realtime/blob/b98dc3760d3e00996ac3fe57007db5d554eb6266/lib/realtime/tenants/connect.ex) ≈L313-328 的 GenServer 重启策略是 `:one_for_one` 还是 `:rest_for_one`？需要验证。
3. **Storage 上传中断后的孤儿清理** — 我推 5GB 文件到一半 `Ctrl+C`，S3 上的 multipart upload 是被 `request.signal` AbortController 中断（[`uploader.ts`](https://github.com/supabase/storage/blob/48c0318552ff69974eb686fb53af80e0dc4fcd61/src/storage/uploader.ts) ≈L186-230 第 8 个参数）还是要等 multipart timeout（默认 7 天）才被 S3 lifecycle 清掉？这关系到上传重试的成本。
4. **RLS 性能 voodoo** — 当 USING 子句含 `auth.uid() IN (SELECT user_id FROM team_members WHERE team_id = ...)` 时，supabase 文档建议改成 `(SELECT auth.uid()) IN (...)` — 这真的能让 PG planner 把 `auth.uid()` 当常量缓存吗？需要 EXPLAIN ANALYZE 在 1M 行表上对比 plan shape，别只听文档话。
5. **Auth + Edge Function 的身份传递** — 当 Edge Function 接到一个带 JWT 的请求，它要继续调 Postgres 时，是用 service_role key 绕过 RLS 还是把 JWT 透传给 Postgres？两种姿势的安全后果完全不同 — 追 supabase Edge Function 的 deno deploy template 看默认实现。

### 接下来读哪些文件

| 序号 | 文件 / 模块 | 仓库 | 回答的问题 |
|---|---|---|---|
| 1 | [`supabase/postgres`](https://github.com/supabase/postgres) 仓库的 `migrations/db/init-scripts/` | supabase/postgres | `auth.uid()` / `storage.foldername()` 等 helper 函数的实际 SQL 实现 |
| 2 | [`supabase-js`](https://github.com/supabase/supabase-js) 的 `src/lib/fetch.ts` 和 `GoTrueClient.ts` | supabase/supabase-js | 客户端怎么打包 JWT、怎么自动 refresh、怎么在 401 时 retry |
| 3 | [`supabase/edge-runtime`](https://github.com/supabase/edge-runtime) 的 `crates/sb_core/src/lib.rs` | supabase/edge-runtime | Deno isolate 怎么和 supabase 的 Auth 集成（v8 boundary 上下文怎么传递） |
| 4 | [`supabase/realtime`](https://github.com/supabase/realtime) 的 `lib/realtime/rls/` 子目录 | supabase/realtime | Realtime 给每个订阅者跑 RLS 的具体实现（怎么 mock 一次 SELECT） |
| 5 | [`supabase/auth`](https://github.com/supabase/auth) 的 `internal/api/mfa.go` | supabase/auth | TOTP/WebAuthn MFA 流程，特别是怎么和 PostgREST 的 step-up auth 配合 |

## 限制段（≥ 4 条）

不抄 README，不写"它有时候慢"这种废话。说项目目前**真正不擅长**的事：

- **Postgres 单实例瓶颈** — supabase 默认是单 PG 实例。当 INSERT 量超过这台机器的写入能力时（比如 50k tps），需要 sharding — supabase 没内置方案，要么换 Citus 扩展，要么自己上业务层 sharding。所以**重写场景（IoT 时序、广告点击流）不适合**。
- **Realtime 在订阅者数量爆炸时性能不线性** — 每个订阅者的每次推送都要单独跑一次 RLS 检查（详见机制 2 旁注 5）。当一张表有 100k 订阅者时，单条 INSERT 触发 100k 次 RLS 检查 — 这超过 PG 单 connection 处理能力，会出现推送延迟。社区有人在跑性能 PR，但目前是已知问题。
- **Edge Functions 冷启动**：Deno isolate 比 Lambda Node 快不少（毫秒级），但 supabase 的 Edge Runtime 在没流量时会被回收 — 第一次请求仍有 100-300ms 延迟。如果你的应用对 P99 延迟敏感，要么自己保活，要么走 Edge Functions 之外的部署。
- **跨 service 的 schema migration 风险** — 当你给 `auth.users` 表加列时，要同时考虑 GoTrue 服务、Studio UI、PostgREST schema cache、Realtime publication 都要不要更新。supabase CLI 的 migration 系统主要管 `public.*`，对 `auth.*` `storage.*` 的修改要谨慎（建议用 SQL editor 直接做、不要碰）。
- **多语言运维成本** — Auth(Go) + Realtime(Elixir) + Storage(TS) + Postgres(C/SQL) + Studio(TS) 是 5 种语言的 5 个进程。生产事故定位时要切换 5 种 logging/profiling 心智，对小团队是真负担。Self-host 的人最好有专门 SRE 或者用 supabase managed cloud。

## 附录：宣传 vs 现实清单

| 宣传 | 现实 |
|---|---|
| "Open source Firebase alternative" | 主要功能确实开源，但 supabase managed cloud 的负载均衡 / VPC 网络 / 备份恢复 / dashboard 的部分高级功能是闭源 |
| "Realtime out of the box" | 正确，但要意识到 RLS 复杂度直接影响 Realtime 推送性能 — 不是真"开箱"零配置就能用到生产规模 |
| "Edge Functions in Deno" | 正确，但 Edge Functions 没法用 Node 生态 native 包；某些 npm 包要找 Deno 替代或写垫片 |
| "Postgres-compatible" | 不是兼容 — **就是真的 Postgres**，你能装任何 PG 扩展（pgvector、pgmq、postgis 等）。这反而比 PlanetScale 的"MySQL-compatible Vitess"自由度高 |
| "Auto-generated APIs from your database" | PostgREST 帮你 schema-first 生成 REST 端点；但**复杂查询（如带 OR 条件、子查询、CTE）需要写 RPC 函数（即 Postgres function）才能调** — 不是所有 SQL 都能在 supabase-js 直接表达 |

## 元数据

- 升级日期：2026-05-28
- 笔记总行数：约 530 行（含代码块和表格）
- 启用工具：WebFetch（GitHub commit 抓取）/ supabase CLI（本地 stack）/ supabase-js demo / PIL Python（架构图）
- 自分类：v1.1 分支 A 大型应用
- Figure 数：2（01-architecture.webp / 01-data-flow.webp）
- GitHub permalink 数：≥ 12（跨 4 个仓库 supabase/supabase + auth + realtime + storage，全部用 40 字符 commit hash）
- 显式怀疑数：5（机制段 3 + 自检段 5，已超底线）

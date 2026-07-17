# 11. 零基础实验：从聊天请求到可恢复的 Agent Run

> 目标：不用模型、API Key、Redis 或 Docker，亲手观察 tenant、session、run、event、
> workspace、quota 和 side-effect receipt 的最小合同。
>
> 代码：[`labs/minimal_platform.py`](labs/minimal_platform.py)

## 1. 先建立生活类比

把 Agent 平台想成一家能接长期订单的餐厅：

| 餐厅 | Agent 平台 |
|---|---|
| 顾客所属公司 | tenant |
| 桌号和对话上下文 | session |
| 一张正在执行的订单 | run |
| 厨房工单 | background task |
| 每一步出餐记录 | event log |
| 大堂叫号屏 | SSE/live stream |
| 专属储物柜 | workspace/sandbox |
| 当日可点次数 | quota |
| 支付小票 | side-effect receipt |

顾客离开叫号屏，不等于厨房应该扔掉订单；叫号屏坏了，也不等于订单记录消失。

类比边界：真实平台还有模型、工具、队列、凭证、数据库副本和容器，本实验只保留最小
控制语义。

## 2. 先分清五层

```text
Product Plane
  Web / mobile / desktop / admin
        |
        v
Run Control Plane
  identity / session / run / event / quota
        |
        v
Agent Harness
  model / skills / todo / subagent / graph
        |
        v
Governance Gateway
  policy / approval / credential / audit
        |
        v
Execution Plane
  tool / MCP / sandbox / filesystem / network
```

LambChat 跨越五层，但主要学习价值在产品化整合；DeepAgents 和 LangGraph 是它复用的
内层能力，不负责完整的多用户产品。

## 3. 请求主链

一个可靠的聊天请求不是“浏览器直接等模型吐字”：

```text
1. JWT 恢复 tenant_id / user_id
2. 检查 session 所有权
3. 创建稳定 run_id
4. 后台 task 认领 run
5. graph / agent 产生事件
6. event 先进入 durable log
7. live stream 把同一事件投影给在线客户端
8. 断线客户端按 sequence 重放
```

四种身份不要混用：

| 身份 | 回答的问题 |
|---|---|
| `session_id` | 这是哪段长期对话？ |
| `run_id` | 这是哪次执行？ |
| `event_id` | 这条事件是否已经处理？ |
| `operation_id` | 外部副作用是否已经执行？ |

## 4. 实验对象

实验使用 SQLite 表示 durable control plane，使用内存 `StreamHub` 表示可能断开的实时层：

```text
sessions
runs
workspaces
events
quotas
checkpoints
side_effect_receipts
```

所有核心查询都带 `tenant_id`。只在 API 入口检查 tenant 不够，因为内部 job、缓存或
重试路径也可能绕过入口。

## 5. 运行实验

从仓库根目录：

```bash
cd explorations/research/lambchat-ecosystem-study/labs
PYTHONDONTWRITEBYTECODE=1 python3 minimal_platform.py
```

2026-07-17 实测：

```text
live=hello
replay=hello world
run_after_disconnect=running
quota=blocked
```

逐行解释：

1. 在线浏览器先收到 `hello`。
2. 浏览器断开后，第二个 event 已落 SQLite，但模拟 live publish 失败。
3. replay 仍按 sequence 恢复出 `hello world`。
4. 断线没有取消 run。
5. MCP quota 用完后拒绝调用。

## 6. 运行七个测试

```bash
PYTHONDONTWRITEBYTECODE=1 \
python3 -m unittest -v test_minimal_platform.py
```

结果：

```text
Ran 7 tests
OK
```

| 测试 | 证明什么 |
|---|---|
| tenant workspace isolation | tenant B 不能用同名 session 读取 tenant A 文件 |
| event idempotency | 相同 event 重试只落一次；复用 ID 做不同操作会报错 |
| live/replay reducer | 实时与历史重放使用同一归约函数和 sequence |
| quota fail closed | 未配置或耗尽都拒绝，不默认无限放行 |
| disconnect independence | subscriber 消失不改变 run 状态 |
| publish failure recovery | live publish 失败后 durable event 仍可重放 |
| receipt separation | checkpoint 不冒充外部副作用成功证据 |

## 7. 为什么 live 和 replay 必须使用同一个 reducer

如果实时 UI 和历史加载各写一套逻辑：

```text
live: message.delta -> append text
history: message.delta -> replace text
```

刷新前后就会看到不同结果。

实验只定义一个：

```python
reduce_projection(state, event)
```

`StreamHub.publish()` 和 `replay_projection()` 都调用它。这里的 reducer 是产品事件
协议的一部分，不是前端随意拼接字符串的工具函数。

## 8. 为什么 event 要先持久化

实验顺序是：

```text
SQLite COMMIT
  -> StreamHub.publish
```

如果 publish 失败，调用方收到 `PublishError`，但 reconnect 能从 SQLite 恢复。

反过来先 publish：

```text
用户已经看见 token
  -> 数据库写失败
  -> 刷新后 token 永久消失
```

需要注意：commit 后 publish 仍不是跨系统事务。真实系统可加入 outbox、publisher
retry 和 delivery cursor，但必须保留一个权威事实源。

## 9. 为什么断线不能取消 run

连接是短命对象：

- 浏览器刷新；
- 手机切换网络；
- 代理超时；
- SSE server 重启。

run 是业务对象，可能持续几分钟或几小时。正确关系是：

```text
connection subscribes to run
connection does not own run
```

显式 cancel 必须携带用户身份、run ID 和授权，并进入可审计状态机。

## 10. 多租户不是一个布尔值

可以按六级检查：

| 等级 | 边界 |
|---|---|
| L0 | UI 上能切用户 |
| L1 | 数据查询带 user/tenant filter |
| L2 | cache、event、workspace 和 quota key 带 tenant |
| L3 | credential、policy、audit 和 budget 带 tenant |
| L4 | Worker、filesystem、network 或 container 隔离 |
| L5 | 组织治理、导出、保留、合规和 blast radius |

LambChat 已有用户资源、角色、quota 和 user sandbox，但组织根模型与强执行隔离仍需按
场景验证。Loomcycle 新 builder sidecar 已有 per-session container，却明确仍使用一个
shared bearer；它证明执行隔离机制，不证明 tenant identity 已完成。

## 11. Checkpoint 为什么不是支付小票

实验分别保存：

```text
checkpoint:
  next = send-email

side_effect_receipt:
  operation_id = email-operation-1
  status = succeeded
  provider_receipt = mail-42
```

checkpoint 回答“Agent 走到哪里”；receipt 回答“外部世界发生了什么”。若只看
checkpoint，崩溃恢复后可能重复发邮件、付款或创建工单。

## 12. 三张分诊卡

### 卡 1：刷新后少了一段回复

先按层检查：

```text
durable event 是否存在
  -> sequence 是否连续
  -> replay cursor 是否正确
  -> reducer 是否一致
  -> React state 是否重复覆盖
```

不要第一步就归因于模型或 LangGraph。

### 卡 2：tenant B 看到了 tenant A 文件

检查每一层的 key：

```text
database query
cache key
workspace path
sandbox binding
artifact URL
credential lookup
```

只修 API route 的 filter 不能证明后台 worker 已安全。

### 卡 3：工具超额调用

工具列表过滤只是 discovery policy。真正调用前还要：

```text
restore authoritative identity
  -> resolve current role/policy
  -> atomic quota consume
  -> credential injection
  -> execute
  -> audit result
```

否则模型可通过缓存、旧列表或其他入口绕开治理。

## 13. 初学者常见误区

1. **有 Redis stream 就是 durable。**  
   正确理解：还要看 TTL、持久化配置、consumer/replay cursor 和终态合同。

2. **写 MongoDB 和 Redis 两份就是事务。**  
   正确理解：需要权威源、失败可见性、outbox/补偿和重放策略。

3. **JWT 中有 user ID 就完成多租户。**  
   正确理解：tenant 必须贯穿所有存储、缓存、凭证、执行与审计边界。

4. **有 sandbox 就能运行不可信代码。**  
   正确理解：还要检查 identity、network、filesystem、runtime、resource、cleanup 和
   container-engine exposure。

5. **checkpoint 成功，所以 tool 只执行一次。**  
   正确理解：外部副作用需要独立 operation ID 和 receipt。

## 14. 应用题与检查点

### 题 1

用户刷新页面后带 `Last-Event-ID=41` 重连，服务端应返回什么？

检查点：从同一 run 的 42 开始按 sequence 重放，并按 event ID 去重；不能重启 run。

### 题 2

同一个 `event_id` 以不同 payload 重试，应该覆盖旧值吗？

检查点：不能。它表示调用方混用了幂等 identity，应 fail closed 并告警。

### 题 3

一个用户的两个 session 可以共享 sandbox 吗？

检查点：取决于威胁模型。可信个人环境可降低成本；不互信代码和敏感数据应使用
per-session Worker/container，并隔离 network 和 credential。

### 题 4

MCP server 已按角色从列表隐藏，为什么调用时还要检查？

检查点：列表可能缓存、过期或被其他入口绕过；执行边界才是最终 enforcement。

### 题 5

支付 API 超时，能否直接标记 failed 并重试？

检查点：不能确定请求是否已在服务端成功。应标记 uncertain，用 operation ID 查询
provider receipt，再决定重试或人工处理。

### 题 6

什么时候 Dify 比 LambChat 更合适？

检查点：当核心需求是可视、可审查的确定性 workflow，而不是高度动态的
DeepAgents-style 自主执行时。

## 15. 完成标准

- [ ] 能在 5 分钟内画出 request -> run -> event -> replay 主链。
- [ ] 七个实验测试通过。
- [ ] 能解释连接、session 和 run 的不同生命周期。
- [ ] 能区分 checkpoint、event log 和 side-effect receipt。
- [ ] 能用 L0-L5 评估多租户，而不是只找一个 `multi_tenant=true`。
- [ ] 能为一个真实工具调用指出 policy、quota、credential 和 audit 的执行位置。

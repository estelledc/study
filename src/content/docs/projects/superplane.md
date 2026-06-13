---
title: SuperPlane — 开源控制面，让平台工程不再散落
来源: https://github.com/superplanehq/superplane
日期: 2026-06-13
分类: 基础设施
子分类: DevOps 与运维
provenance: pipeline-v3
---

## 一、从"散落的脚本"说起

你有没有经历过这种事：

每次发布代码，你需要手动做一堆事——先看 CI 有没有过，再去检查监控有没有告警，然后等产品经理在 Jira 上点"批准"，最后才去触发部署。每一步都靠 Slack 消息、邮件或口头沟通来确认。

这些流程通常散落在 GitHub Actions 的 YAML 里、Jenkins 的 pipeline 脚本中、运维人员的脑子里。换个新人来，根本不知道发布还需要等那个"下午四点后才能批"的规则。

**SuperPlane 做的事情，就是把这一堆散落的流程，放到一张"画布"上。**

## 二、SuperPlane 是什么

SuperPlane 是一个**开源的控制面（control plane）**，用于**平台工程（platform engineering）**。它让你能够定义和运行**基于事件的自动化工作流**，跨你已经使用的各种工具——Git、CI/CD、可观测性、事件管理、基础设施、通知系统——编排多步骤操作。

一句话总结：**你画一张图，图里的每个节点代表一个动作，动作之间连上线，整个流程就自动跑起来了。**

项目处于 alpha 阶段，Apache 2.0 协议，技术栈涵盖 Go、Python、React，支持 Docker 单节点部署和 Kubernetes 部署。

## 三、核心概念

### 3.1 Canvas（画布）

画布是你设计和运行工作流的地方。它是一张**有向图**——节点代表步骤，连线（subscriptions）代表事件的流动方向。一张画布可以表达多个可能的 Workflow，取决于哪个触发器被激活、事件走哪条路径。

### 3.2 Component（组件）与 Component Node

- **Component** 是一个能力定义，比如"发送 Slack 消息"、"监听 GitHub push 事件"。
- **Component Node** 是你把组件放到画布上的一个**具体实例**，有自己独立的配置和名称。

类比：Component 像是乐高积木的"标准件图纸"，Node 是你实际搭上去的那一块。

组件分两类：

| 类型 | 作用 | 举例 |
|------|------|------|
| Trigger（触发器） | 启动工作流，监听外部事件 | Manual Run、GitHub onPush、Schedule |
| Action（动作） | 响应上游事件，执行操作 | HTTP Request、Approval、Slack sendMessage |

### 3.3 Payload（载荷）与 Message Chain（消息链）

每个节点执行后都会产出一个 **payload**（JSON 数据）。后续节点可以订阅上游的 payload，并通过 `$` 变量引用它。所有节点输出的 payload 累加起来就形成了一条 **message chain**。

```
$['Node Name'].data.field         // 访问某个节点的 payload 字段
$['Node Name'].config.url         // 访问某个节点的运行时配置
root().data.ref                   // 访问启动这个 run 的根事件
previous().data.status            // 访问上一个节点的 payload
```

### 3.4 Run（运行）与 Run Item（运行项）

- **Run Item** 是单个节点的一次执行。比如 GitHub 收到一次 push，就产生一个 run item。
- **Run** 是一组 run item 及其依赖关系的集合，代表一次完整的工作流执行。

### 3.5 Memory（内存）

SuperPlane 内置了 Memory 功能，用于在多次 run 之间**持久化存储结构化数据**。它按 namespace 组织，支持 Add、Read、Update、Delete、Upsert 五种操作。

典型用途：灰度发布的当前阶段记录、事故处理的上下文接力、去重判断。

### 3.6 Expressions（表达式）

SuperPlane 使用 [Expr](https://expr-lang.org) 作为表达式引擎，支持：

- 标准算术和比较运算符
- `contains`、`startsWith`、`endsWith`、`matches` 等字符串操作
- `in` / `not in` 集合判断
- `??` 空值合并
- `?.` 可选链
- `#` 闭包语法处理数组（filter、map、reduce 等）
- 丰富的内置函数（日期、类型转换、JSON 等）

两种语法场景：

| 场景 | 语法 | 示例 |
|------|------|------|
| 文本字段（URL、消息体等） | `{{表达式}}` | `Deployment of {{root().data.ref}} failed` |
| 条件字段（If、Filter） | 裸表达式 | `$['Get cat fact'].data.body.length <= 160` |

## 四、代码示例

### 示例 1：Hello World — 获取猫咪知识并条件分支

这是官方 quickstart 里的"你好世界"流程，不用连接任何第三方服务：

1. **Manual Run**（触发器）→
2. **HTTP Request**（获取随机猫咪知识，URL: `https://catfact.ninja/fact`）→
3. **If**（判断猫咪知识长度是否 ≤ 160）→ 两个 No Operation 节点结束

If 节点的表达式（条件字段，无需 `{{ }}`）：

```
$['Get cat fact'].data.body.length <= 160
```

节点输出到 True 分支表示"这条知识很短，可以当推文发"，到 False 分支表示"太长了需要截断"。

### 示例 2：策略控制的灰度发布

这是一个更贴近实际运维的场景：CI 构建通过后，在工作日白天自动部署到生产，非工作时间或周末需要人工审批才能发布。

流程设计：

```
GitHub onPush → CI Build
                    ↓（仅 CI passed 时）
                  If（是否工作日 9-17 点？）
                  /            \
              True             False
                |                |
          Deploy（自动部署）   Approval（等人工批准）
                               |
                           Deploy
```

If 节点的表达式：

```
$['GitHub onPush'].data.ref == "refs/heads/main"
    && hour(now()) >= 9
    && hour(now()) <= 17
    && dayOfWeek(now()) >= 1
    && dayOfWeek(now()) <= 5
```

### 示例 3：使用 Memory 实现部署进度追踪

在灰度发布场景中，你需要记住"当前发布到了第几步"。Memory 组件就是为此设计的：

**步骤 1：Upsert 当前阶段**

在首次部署时，用 Upsert Memory 组件记录进度：

```
Namespace: "deployments"
Key: project = "my-service" AND env = "prod"
Value:
  stage: "10_percent"
  version: {{root().data.build_version}}
  started_at: now()
```

**步骤 2：读取并决策**

下次运行工作流时，用 Read Memory 组件检查：

```
Namespace: "deployments"
Match: project = "my-service" AND env = "prod"
Result mode: latest
```

根据返回的 `stage` 字段决定下一步：

```
// If 条件字段 — 判断是否需要继续灰度
$['Read Memory'].data.stage == "10_percent"
    && $['Health Check'].data.healthy == true
```

如果满足条件，就推进到 30%；否则回滚。

### 示例 4：事件驱动的首批 5 分钟故障响应

事故发生时，SuperPlane 可以在几分钟内自动收集信息：

```
PagerDuty onIncident
        ↓
  +-----+-----+
  |           |
Fetch       Fetch
Recent      Health
Deploys     Signals
  |           |
  +-----+-----+
        ↓
   Merge（汇聚）
        ↓
   Claude（AI 生成证据包）
        ↓
   Slack sendMessage
   （发到 #incident 频道）
```

关键表达式 — 在 Claude 节点中引用之前收集的数据：

```
"以下是 #{root().data.title} 的证据包：
最近部署: #($['Fetch Recent Deploys'].data.commits[]?.message ?? "无")
健康状态: $['Fetch Health Signals'].data.overall
请立即查看。"
```

## 五、SuperPlane 的集成生态

SuperPlane 已支持数十个集成，覆盖：

- **AI/LLM**：Claude、OpenAI、Perplexity、Cursor
- **版本控制与 CI/CD**：GitHub、GitLab、Bitbucket、CircleCI、Harness、Octopus Deploy、Render、Semaphore
- **云平台**：AWS（ECR、Lambda、CloudWatch、SNS、CodeArtifact）、GCP、Azure、Cloudflare、DigitalOcean、Hetzner
- **可观测性**：Datadog、Grafana、Prometheus、Sentry、Honeycomb、New Relic、Elastic、Dash0
- **事件管理**：PagerDuty、Incident.io、FireHydrant、Rootly、Statuspage
- **通信**：Slack、Discord、Teams、Telegram、SendGrid、SMTP
- **工单**：Jira、ServiceNow
- **开发者工具**：Daytona、JFrog Artifactory、LaunchDarkly

每个集成通常提供两类组件：**Trigger**（触发器，监听事件）和 **Action**（动作，执行操作）。

## 六、安装与上手

最简单的开始方式是 Docker 单节点：

```bash
docker pull ghcr.io/superplanehq/superplane-demo:stable
docker run --rm -p 3000:3000 -v spdata:/app/data -ti ghcr.io/superplanehq/superplane-demo:stable
```

然后打开 `http://localhost:3000` 即可开始。

生产部署支持：
- **单节点**：AWS EC2、GCP Compute Engine、Hetzner、DigitalOcean、Linode、通用服务器
- **Kubernetes**：GKE、EKS 等

## 七、关键设计要点回顾

| 要点 | 说明 |
|------|------|
| 事件驱动模型 | 每个节点接收事件、处理、产出 payload，下游节点订阅继续 |
| 可视化画布 | 有向图形式，节点 + 连线 = 完整工作流 |
| 消息链 | 所有节点的 payload 自动累积，任何节点都能引用上游数据 |
| 输出通道 | 节点可以有多个输出（passed/failed、approved/rejected），按语义路由 |
| 版本控制 | 画布支持草稿-编辑-发布的工作流，修改后手动发布 |
| 暂停恢复 | 可以暂停某个节点，事件仍会排队，恢复后继续处理 |
| 运行时分离 | 每次 run 独立，payload 不自动跨 run 共享 — 需要 Memory 持久化 |
| 表达式引擎 | 基于 Expr，支持丰富的数据处理和转换能力 |

## 八、下一步

SuperPlane 的核心价值在于：**把分散在各处的工作流集中管理，用可视化方式让团队共享运营意图，而不是散落在一堆脚本和文档里。**

对于零基础学习者，建议按以下顺序深入学习：

1. 先用 Docker 跑起来，完成官方 Quickstart
2. 理解 Canvas → Component Node → Payload → Message Chain 这条核心链路
3. 尝试连接一个集成（比如 GitHub + Slack），做一个简单的自动化
4. 学习 Memory 和 Expressions，开始处理更复杂的跨 run 场景

官方文档：https://docs.superplane.com

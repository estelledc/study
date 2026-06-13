---
title: Nango — 产品集成的托管 OAuth 与函数运行时
来源: https://github.com/NangoHQ/nango
日期: 2026-06-13
分类: 后端 API
子分类: Web 后端
难度: 中级
provenance: pipeline-v3
---

## 是什么

Nango 是**面向 SaaS 产品的第三方 API 集成平台**——帮你把「用户授权 Google / Salesforce / HubSpot」这件事，从「每个 API 各写一套 OAuth + token 刷新 + 分页同步」变成「统一接入层 + TypeScript 函数」。

日常类比：

- 你的产品要接 20 家 CRM，自己写集成像**在 20 个国家各开一家分公司**：每家都要办执照（OAuth App）、雇本地会计（token 刷新）、自己跑物流（分页拉数）。
- Nango 像**国际快递公司总部**：你在总部下单（`triggerAction` / `startSync`），它替你处理各国清关（OAuth）、仓储（Connection 凭证加密存储）、定时补货（Sync 调度），你只收统一格式的包裹（Records / 统一模型）。

和 [[unified]]（Merge.dev 等预置统一 API）不同，Nango 强调 **code-first**：统一模型由你自己定义，每家厂商的差异写在 Nango Function 里映射，而不是被迫接受别人的「最低公分母 schema」。

## 为什么重要

做 B2B SaaS 的人迟早会撞上「集成地狱」：

1. **OAuth 不是「调个接口」**——每家 redirect URL、scope、refresh token 生命周期、PKCE 要求都不一样；token 过期后用户数据就 silently 断了。
2. **读数据比写更难**——分页、增量游标、rate limit、删除检测、webhook 漏收，每个 provider 一套玩法。
3. **凭证不能进你的业务库**——把 access token 明文塞进 Postgres，一次 SQL 注入就是全客户 CRM 裸奔。

Nango 把这三件事收进一个平台：**Auth（Connect UI）→ Connection（凭证托管）→ Proxy / Functions（代发请求与同步逻辑）**。开源可自托管，也提供 Nango Cloud；文档宣称支持 **800+ API**，并提供 Node / Python / Go 等 SDK。

典型使用场景：

- 帮客户把工单从 Zendesk 同步进你的产品（RAG / 报表 / 触发器）
- 在应用内嵌入「连接 Salesforce」按钮，授权后调用统一 `create-contact` Action
- 给 AI Agent 暴露 MCP / tool calling，背后走已授权的 Connection

## 核心概念

先把名词对齐——后面读 SDK 和 Dashboard 都靠这张表。

| 概念 | 含义 | 类比 |
|------|------|------|
| **Provider** | Nango 内置的 API 模板（如 `github`、`salesforce`） | 快递公司覆盖的国家 |
| **Integration** | 你在环境里为某 Provider 创建的配置实例，有 `unique_key` | 某国分公司的运营牌照 |
| **Connection** | 某个终端用户成功授权后的一条凭证记录 | 某客户在该国的报关账号 |
| **Connect Session** | 短期 token，用于弹出 Connect UI 完成授权 | 一次性授权二维码 |
| **Proxy** | 代发 HTTP 请求，自动注入凭证，你的后端不碰 token | 代报关发货 |
| **Sync Function** | 定时/触发的拉数函数，结果写入 Records 缓存 | 定时从海外仓盘点入库 |
| **Action Function** | 按需执行的写操作或单次读 | 下单、改地址 |
| **Records** | Nango 侧的同步结果存储，带 cursor 增量读取 | 总部仓库台账 |
| **Unified API** | 你自定义的稳定模型，多家 Provider 各自映射 | 统一 SKU 编码体系 |

数据流可以概括成：

```
用户点击「连接 HubSpot」
  → 后端 createConnectSession()
  → 前端打开 Connect UI
  → OAuth 完成，生成 Connection
  → Sync 定时拉联系人 → Records
  → Webhook 通知你的 App
  → App 用 cursor 拉变更写入自有 DB
```

写回外部系统时走 **Action**；简单的一次性请求可以只用 **Proxy**，不必写 Function。

## 快速上手：授权 + 触发 Action

官方 Quickstart 用 GitHub 演示：Dashboard 里启用模板函数 `get-repository`，后端用 SDK 触发。

### 1. 安装 SDK 并触发 Action

```typescript
import { Nango } from '@nangohq/node';

const nango = new Nango({ secretKey: process.env.NANGO_SECRET_KEY! });

// integrationId = Dashboard 里的 unique_key，如 github-getting-started
// connectionId = 用户在 Connections 页授权后得到的 ID
const repo = await nango.triggerAction(
  'github-getting-started',
  process.env.NANGO_CONNECTION_ID!,
  'get-repository',
  { owner: 'NangoHQ', repo: 'nango' }
);

console.log(repo.id, repo.full_name, repo.default_branch);
```

要点：

- `secretKey` **只能放服务端**，相当于 root 权限。
- `triggerAction` 在 Nango 托管运行时执行函数，**凭证不经过你的应用进程**。
- Dashboard → Logs 可看 provider 原始请求/响应，排错比「黑盒 401」舒服得多。

### 2. 嵌入 Connect UI：让用户自己授权

产品里不能让用户去 Nango Dashboard 点按钮——要在你的设置页弹出授权。

```typescript
// Express / Next.js API Route 示例
import { Nango } from '@nangohq/node';

const nango = new Nango({ secretKey: process.env.NANGO_SECRET_KEY! });

export async function createHubSpotConnectLink(endUserId: string) {
  const { data } = await nango.createConnectSession({
    tags: {
      end_user_id: endUserId,
      organization_id: `org_${endUserId}`,
    },
    allowed_integrations: ['hubspot'],
  });

  // 前端 redirect 到 data.connect_link，或嵌 Connect UI 组件
  return {
    connectLink: data.connect_link,
    expiresAt: data.expires_at, // 约 30 分钟有效
  };
}
```

`tags` 会复制到 Connection 上，并出现在 auth webhook 里——**用它在回调里知道「是哪个租户连的」**。生产环境建议注册自己的 OAuth App（白标 callback 域名），测试可用 Nango 内置 developer app，但 scopes 固定且不适合上架 marketplace。

授权成功后监听 webhook（`connection.created`），把 `connection_id` 存到你自己的 `integrations` 表，后续 Sync / Action 都靠它索引。

## Proxy：不写函数也能代发请求

如果只需要「拿已授权 token 调一个 REST endpoint」，Proxy 最省事：

```typescript
const issues = await nango.get({
  providerConfigKey: 'github-prod',
  connectionId: customerConnectionId,
  endpoint: '/repos/NangoHQ/nango/issues',
  params: { state: 'open', per_page: '10' },
});

// issues.data 即 GitHub 原始 JSON
```

Proxy 自动处理 base URL、Authorization header、429/5xx 重试。适合探索期或调用路径不在 Sync/Action 覆盖范围内的边缘接口。复杂分页、增量、落库仍应升级为 Sync Function。

## Sync Function：把外部数据变成可消费的 Records

Sync 是 Nango 的「读路径」主力——在托管运行时跑你写的 TypeScript，分页拉取、映射模型、`batchSave` 进缓存。

下面是把 HubSpot 联系人映射到自建 `UnifiedContact` 的简化示例（基于官方 unified API 文档模式）：

```typescript
import { createSync } from 'nango';
import * as z from 'zod';

const UnifiedContact = z.object({
  id: z.string(),
  email: z.string().nullable(),
  name: z.string(),
  raw: z.unknown().optional(),
});

export default createSync({
  description: 'HubSpot contacts → UnifiedContact',
  frequency: 'every hour',
  models: { UnifiedContact },
  exec: async (nango) => {
    for await (const page of nango.paginate<{ id: string; properties: Record<string, string> }>({
      endpoint: '/crm/v3/objects/contacts',
      params: { properties: 'email,firstname,lastname' },
      paginate: {
        type: 'cursor',
        cursor_path_in_response: 'paging.next.after',
        cursor_name_in_request: 'after',
        response_path: 'results',
        limit_name_in_request: 'limit',
        limit: 100,
      },
    })) {
      const contacts = page.map((c) => ({
        id: c.id,
        email: c.properties.email ?? null,
        name: [c.properties.firstname, c.properties.lastname].filter(Boolean).join(' '),
        raw: c,
      }));
      await nango.batchSave(contacts, 'UnifiedContact');
    }
  },
});
```

部署后用 SDK 启动调度：

```typescript
await nango.startSync('hubspot', ['contacts'], customerConnectionId);
```

Sync 跑完后 Nango 向你的 webhook URL 推送变更摘要；应用侧用 **cursor** 增量拉 Records，写入自有数据库或向量索引——避免每次全量扫 10 万行联系人。

设计建议（文档反复强调）：

- 能增量就增量，配合 **checkpoint** 长跑可恢复。
- 统一模型的读（Sync）和写（Action）尽量共用 schema，减少应用层 `if (provider === 'x')`。
- 映射不了的字段放 `raw` 或 connection metadata，别硬塞进统一列。

## Unified API：多家 CRM，一个 `create-contact`

当你要同时支持 Salesforce、HubSpot、Pipedrive，应用层只想调：

```typescript
await nango.triggerAction(integrationId, connectionId, 'create-contact', payload);
```

做法是为每个 Provider 各实现同名 Action，输入输出都是你的 `UnifiedContact`，内部各自调厂商 API。Sync 侧同样映射到 `UnifiedContact` 写入 Records。这是 **可选模式**——小集成用 Proxy 就够；客户开始比「你支持哪家 CRM」时再上统一层。

## 与相近方案怎么选

| 方案 | 强项 | 弱项 |
|------|------|------|
| **自己写 OAuth** | 零供应商、完全控制 | N 个 API × 维护成本爆炸 |
| **Nango** | 凭证托管 + 函数运行时 + 800+ 模板 | 要学 Dashboard / Functions 模型 |
| **预置 Unified API（Merge 等）** | 开箱统一 schema | 模型僵化，边缘字段要加价或做不了 |
| **Zapier / Make** | 无代码连线 | 难嵌进多租户 SaaS 产品内核 |
| **[[mcp-ts-sdk]] 工具** | Agent 调工具 | 不负责 OAuth 与持久同步 |

Nango 2024–2026 年的叙事重心是 **「集成逻辑 = TypeScript Functions + AI 生成」**：用 CLI / MCP 让 Cursor、Claude Code 根据自然语言生成 Sync/Action，再部署到同一运行时——和「只卖统一 CRM schema」的竞品路线不同。

## 自托管与合规

- 仓库 MIT 开源：<https://github.com/NangoHQ/nango>
- Cloud 宣称 SOC 2 Type II、HIPAA、GDPR；自托管可把凭证留在自有 VPC
- OAuth **生产务必用自己的 developer app**——共享 app 适合 demo，有 scope 固定、被厂商吊销、无法 marketplace 上架等限制

本地开发时 SDK 指向 `http://localhost:3003`，与自托管实例一致。

## 实践清单（零基础第一周）

1. 注册 Nango Cloud，在 Integrations 启用 `github-getting-started`
2. Connections → Add Test Connection，记下 `connection_id`
3. 用 `triggerAction` 跑通 `get-repository`（第一个代码示例）
4. 写一个 API Route 调 `createConnectSession`，在浏览器走完 Connect UI
5. 给环境配置 Webhook URL，打印 `connection.created` 事件
6. 打开模板 Sync，观察 Records 与 cursor 拉取
7. 读 Logs 里 provider 请求，理解 Proxy 与 Function 的分工

## 常见坑

- **把 secret key 打进前端**——Connect Session 也必须服务端创建。
- **在业务 DB 存 access token**——违背平台设计；用 `connection_id` 索引即可。
- **Sync 里一次拉全量不落 checkpoint**——大租户超时后从头再来，API quota 爆掉。
- **测试用共享 OAuth app 上生产**——用户看到的是授权给 Nango 而非你的产品。
- **每家 Provider 各写一套应用内模型**——失去 Unified API 意义；先定你自己的 schema 再写映射。

## 延伸阅读

- 官方文档索引：<https://nango.dev/docs/llms.txt>（给 AI / 脚本发现全站页面）
- Auth 指南：OAuth app 注册、Connect UI、reconnect flow
- Sync 指南：webhook、cursor、删除检测、分区 Sync
- Unified APIs：多 Provider 共模实现模式
- 相关笔记：[[supabase]]（自有数据落库）、[[mcp-ts-sdk]]（Agent 工具暴露）、[[authentik]]（若你同时做企业 SSO，职责与 Nango 不同——Authentik 管「谁登录你的产品」，Nango 管「你的产品代用户访问外部 SaaS」）

---

**一句话**：Nango 把「SaaS 集成」拆成 **托管授权 + 可选 Proxy + 可部署的 Sync/Action 函数**；你专注产品自己的统一模型与业务逻辑，OAuth 刷新和拉数调度交给平台。

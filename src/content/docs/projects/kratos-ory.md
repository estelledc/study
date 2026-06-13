---
title: Ory Kratos 零基础学习笔记
来源: https://github.com/ory/kratos
日期: 2026-06-13
分类: 其他
子分类: 工程文化
provenance: pipeline-v3
---

# Ory Kratos 零基础学习笔记

## 一、它到底解决了什么问题

想象一下：你要开一家餐厅。

你希望把精力放在「做菜」上——菜谱、口味、食材。而不希望亲自去造一辆送餐自行车、研究防盗门锁、或者设计顾客登记表。

**Ory Kratos 就是这个"identity 领域的餐厅后厨"**。

它专门负责「谁是你的用户」这件事：注册、登录、忘记密码、邮箱验证、修改资料。你不需要在每个项目里重复写 `if password == correct` 的逻辑，而是把认证工作交给 Kratos，你的代码只关注"做菜"。

关键特征：
- **纯 API**：没有后台管理界面，只有 HTTP API。你用自己的前端页面来对接。
- **云原生**：专为 Docker / Kubernetes 设计，不绑任何语言或框架。
- **开源**：MIT 许可证，可以自托管。

## 二、核心概念（从类比到术语）

### 2.1 身份（Identity）

一个 Identity 就是你系统里的"一个人"或"一个设备"。它包含：
- 登录信息（邮箱 + 密码、或者第三方登录）
- 个人属性（名字叫什麼、头像、手机号）

类比：身份 = 你的员工胸牌。上面有照片（身份标识）+ 部门（属性）。

### 2.2 属性（Traits）

Traits 是身份里的"个人信息字段"。比如 email、first_name、last_name。

类比：胸牌上写的"姓名：张三，部门：研发"。你可以随时更新这些信息。

### 2.3 流（Flow）

这是 Kratos 最核心的概念。Kratos 里的每一步操作都是一个 **Flow**——登录是一个 Flow，注册是一个 Flow，修改密码又是一个 Flow。

每个 Flow 有自己的 **flow ID**（一串 UUID）。

类比：
- 注册 = 填写一张入职申请表
- 每个 Flow = 一次申请过程
- Flow ID = 申请单号

**为什么用 Flow 而不是简单调一个 API？** 因为每个 Flow 包含 CSRF 保护、过期时间、中间步骤验证，是一套完整的工作流。

### 2.4 会话（Session）

用户登录成功后，Kratos 会创建一个 Session。Session 里记录：
- 用户是谁
- 什么时候登录的
- 认证强度等级（AAL1 = 密码；AAL2 = 密码 + 短信验证码）

类比：Session = 你刷工卡进门后拿到的"入场手环"。保安（你的后端服务）看到手环，就知道你是谁。

### 2.5 API 端口

Kratos 有两个端口：

| 端口 | 名称 | 用途 |
|------|------|------|
| 4433 | Public API | 给浏览器和前端调用的接口 |
| 4434 | Admin API | 给后端服务和管理工具调用的接口 |

类比：4433 = 顾客自助点餐机；4434 = 厨房内部系统。

## 三、登录流程的工作原理

以"用户登录"为例，Kratos 的工作流程是这样的：

1. 你的前端页面让用户访问 `/login`
2. 前端请求 Kratos Public API 创建一个登录 Flow，拿到 flow_id
3. Kratos 返回一个 JSON 结构，告诉你这个登录表单有哪些字段（邮箱输入框、密码输入框）
4. 你的前端根据这个 JSON **动态渲染**出登录页面
5. 用户填写并提交表单
6. 前端把结果 POST 给 Kratos 验证
7. Kratos 验证通过后，创建 Session，重定向到仪表盘

**核心思想**：前端不需要知道表单长什么样。Kratos 告诉你需要哪些字段，你照做就行。这就是"API First"。

## 四、代码示例

### 示例 1：查询登录表单结构

调用这个 API，Kratos 会告诉你登录页面需要渲染哪些字段。

```bash
# 第一步：获取一个登录 Flow 的 ID
flowId=$(curl -s -X GET \
    -H "Accept: application/json" \
    http://127.0.0.1:4433/self-service/login/api | jq -r '.id')

# 第二步：用 Flow ID 获取完整的表单结构
curl -s -X GET \
    -H "Accept: application/json" \
    "http://127.0.0.1:4433/self-service/login/flows?id=$flowId" | jq .
```

返回结果示例（关键部分）：

```json
{
  "id": "5caccb0b-c3b5-4e9d-9944-213dccb3c8d0",
  "type": "api",
  "request_url": "http://127.0.0.1:4433/self-service/login/api",
  "ui": {
    "action": "http://127.0.0.1:4433/self-service/login?flow=5caccb0b-...",
    "method": "POST",
    "nodes": [
      {
        "type": "input",
        "attributes": {
          "name": "csrf_token",
          "type": "hidden",
          "value": ""
        }
      },
      {
        "type": "input",
        "attributes": {
          "name": "identifier",
          "type": "text",
          "required": true
        },
        "meta": {
          "label": { "text": "E-Mail" }
        }
      },
      {
        "type": "input",
        "attributes": {
          "name": "password",
          "type": "password",
          "required": true
        },
        "meta": {
          "label": { "text": "Password" }
        }
      }
    ]
  },
  "state": "choose_method"
}
```

你看到的 `nodes` 数组就是表单的所有字段。Kratos 告诉你："你需要一个隐藏的 CSRF 字段、一个邮箱输入框、一个密码输入框"。你的前端照此渲染即可。

### 示例 2：提交注册 + 查询会话

用户注册后，Kratos 自动创建身份并给你返回会话信息。

```bash
# 第一步：获取注册 Flow ID
flowId=$(curl -s -X GET \
    -H "Accept: application/json" \
    http://127.0.0.1:4433/self-service/registration/api | jq -r '.id')

# 第二步：用 curl 提交注册数据
curl -s -X POST \
    -H "Content-Type: application/json" \
    -H "Accept: application/json" \
    -d '{
      "traits": {
        "email": "zhangsan@example.com",
        "name": {
          "first": "San",
          "last": "Zhang"
        }
      },
      "password": "SecurePass123!"
    }' \
    "http://127.0.0.1:4433/self-service/registration?flow=$flowId" | jq .
```

返回结果示例：

```json
{
  "id": "de07f061-8624-4888-a4ea-f36d608f8aa7",
  "ui": {
    "messages": [
      {
        "text": "Please verify your email address by clicking the link we sent you.",
        "type": "info"
      }
    ]
  },
  "identity": {
    "id": "8250c7cf-9815-4a30-a5f6-9166760d4b20",
    "traits": {
      "email": "zhangsan@example.com",
      "name": {
        "first": "San",
        "last": "Zhang"
      }
    }
  }
}
```

注册成功后，你可以随时查询当前会话：

```bash
# 查询当前登录会话
curl -s \
    -H "Cookie: ory_kratos_session=..." \
    "http://127.0.0.1:4433/self-service/sessions?token=..." | jq .
```

返回的会话信息包含认证强度等级（AAL）、设备信息、登录时间等完整数据。

### 示例 3：Node.js 后端中间件（保护仪表盘）

你的后端需要判断用户是否已登录。用 Kratos 的 Session API 做验证：

```typescript
import express from 'express';

const app = express();
const KRATOS_PUBLIC_URL = 'http://127.0.0.1:4433';

// 保护中间件
async function requireLogin(req: express.Request, res: express.Response, next: express.NextFunction) {
  const cookieHeader = req.headers.cookie || '';

  const session = await fetch(
    `${KRATOS_PUBLIC_URL}/self-service/sessions`,
    {
      headers: { Cookie: cookieHeader }
    }
  );

  if (session.status === 401) {
    // 未登录，重定向到 Kratos 的登录页面
    const loginFlow = await fetch(
      `${KRATOS_PUBLIC_URL}/self-service/login/browser`
    );
    const flowData = await loginFlow.json();
    return res.redirect(
      `${KRATOS_PUBLIC_URL}/self-service/login?flow=${flowData.id}`
    );
  }

  // 已登录，把用户信息注入请求对象
  const data = await session.json();
  (req as any).user = data.identity;
  next();
}

// 使用保护中间件
app.get('/dashboard', requireLogin, (req: express.Request, res: express.Response) => {
  const name = (req as any).user?.traits?.name?.first || '用户';
  res.send(`<h1>你好，${name}！这是你的仪表盘。</h1>`);
});
```

## 五、Kratos 的架构定位

Kratos 在 Ory 全家桶中的位置：

| 组件 | 职责 | 类比 |
|------|------|------|
| **Kratos** | 用户管理（注册/登录/资料） | 人事部 |
| **Hydra** | OAuth2 / OpenID Connect 授权 | 发卡员 |
| **Ory Keto** | 权限控制（谁能访问什么） | 门禁系统 |

如果你的应用只需要基本的登录注册，Kratos 就够了。如果需要 OAuth2 第三方登录（比如"用 Google 登录"），需要搭配 Hydra。

## 六、自托管 vs 托管服务

**自托管**（Open Source）：
- 完全免费，MIT 许可证
- 自己部署在 Docker / Kubernetes 上
- 支持 PostgreSQL、MySQL、CockroachDB、SQLite
- 适合学习、原型、或不想被绑定的场景

**Ory Network**（托管服务）：
- 开箱即用，不用管基础设施
- 与开源版本 API 兼容
- 按使用量付费
- 适合不想运维的团队

## 七、学习路线建议

1. 跟着官方 Quickstart 跑一遍（`docker compose -f quickstart.yml up`）
2. 理解 Flow 的概念——这是 Kratos 的灵魂设计
3. 尝试修改 `kratos.yml` 配置文件
4. 用你熟悉的前端框架（React/Vue）替换示例中的 Node.js UI
5. 接入 PostgreSQL 替代 SQLite
6. 阅读 [Self-Service Flows](https://www.ory.com/docs/kratos/self-service) 文档深入每个 Flow

## 八、关键要点总结

- Kratos 是"身份管理的基础设施"，不是 UI 框架
- 一切围绕 **Flow** 和 **Session** 两个核心概念
- 前端根据 Kratos 返回的 JSON **动态渲染**表单，不是写死 HTML
- API First 设计让它可以与任何前端技术栈对接
- 支持多因素认证、社交登录、账号恢复等完整身份流程

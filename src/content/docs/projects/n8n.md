---
title: n8n 零基础学习笔记
来源: https://github.com/n8n-io/n8n
日期: 2026-06-13
分类: 基础设施
子分类: DevOps 与运维
provenance: pipeline-v3
---

# n8n 零基础学习笔记

## 什么是 n8n？

想象一下，你每天要做的重复性工作：每天早上从邮箱里抓取新的客户留言，把它们整理成表格，然后发到 Slack 通知团队。这种"从 A 拿到数据，处理后送到 B"的事，n8n 就是帮你自动完成的工具。

n8n（发音为 "n-eight-n"，意思是 "nodemation" = node + automation）是一个开源的**工作流自动化工具**。你可以把它理解成一个"数字流水线搭建器"——你不需要写复杂的程序，只要把不同的"功能模块"像搭积木一样连起来，就能让数据自动流转。

它的口号是"给技术人员代码的自由度，给非技术人员无代码的速度"。

## 核心概念

### 1. Workflow（工作流）

一个工作流就是一张画布，上面摆着各种节点，节点之间用线连着。线代表数据的流向。

```
[触发器] --> [获取数据] --> [处理数据] --> [发送通知]
```

这就是最简单的流水线：触发器启动流程，获取数据，处理数据，最后发送通知。

### 2. Node（节点）

节点是构成工作流的基本单元。每个节点只做一件事：

- **触发器节点（Trigger）**：告诉 n8n"什么时候开始干活"。比如定时触发器（每天凌晨 9 点）、Webhook 触发器（有人访问某个网址时触发）、邮件触发器（收到新邮件时触发）。
- **操作节点（Action）**：执行具体操作。比如"从 Google Sheets 读取数据"、"调用 OpenAI 生成摘要"、"发一封邮件"。
- **逻辑节点（Logic）**：控制流程走向。比如"If"节点（条件判断，数据符合条件走一条路，不符合走另一条路）、"Split In Batches"节点（分批处理大量数据）。
- **Code 节点**：允许你写 JavaScript 代码来做自定义处理。

### 3. Connection（连线）

连线代表数据从一个节点流向另一个节点。前一个节点的输出，就是后一个节点的输入。

### 4. Execution（执行记录）

每次工作流运行，n8n 都会记录下来：什么时候跑的、经过了哪些节点、每个节点处理了什么数据、有没有出错。你可以在界面上看到每一次执行的详细情况。

### 5. Credential（凭证）

如果你的工作流要连接 Gmail、Slack、GitHub 等服务，就需要配置凭证（API Key、OAuth Token 等）。n8n 会安全地存储这些凭证，不会泄露到工作流定义中。

## 数据在 n8n 中的组织方式

n8n 内部的数据结构是这样的：

```json
{
  "json": {
    "name": "张三",
    "email": "zhangsan@example.com",
    "amount": 150
  },
  "binary": {}
}
```

每个节点接收到的数据是一个数组，数组里的每个元素叫一个 **item（数据项）**。每个 item 包含 `json` 字段（结构化数据）和 `binary` 字段（二进制文件数据）。

理解这个结构很重要，因为后续所有操作都是围绕这个格式进行的。

## 安装 n8n

最简单的方式（需要 Node.js）：

```bash
npx n8n
```

或者用 Docker：

```bash
docker volume create n8n_data
docker run -it --rm --name n8n \
  -p 5678:5678 \
  -v n8n_data:/home/node/.n8n \
  docker.n8n.io/n8nio/n8n
```

启动后打开 `http://localhost:5678` 就能看到编辑器界面了。

n8n 有四种使用方式：
- **n8n Cloud**：官方托管，开箱即用
- **自托管（Self-hosted）**：部署在自己的服务器上，数据完全掌控
- **桌面版（Desktop）**：Mac/Windows/Linux 桌面应用，适合学习
- **嵌入式（Embedded）**：把 n8n 嵌入到自己的产品中

## 核心概念详解

### 触发器（Triggers）

触发器是工作流的"开关"。没有触发器，工作流就不会自动运行。

常见的触发器类型：
- **Manual Trigger（手动触发）**：点击按钮才运行，适合调试和测试
- **Schedule Trigger（定时触发器）**：类似 cron，可以设置每天/每周/每月定时运行
- **Webhook 触发器**：当外部系统向特定 URL 发送 HTTP 请求时触发
- **RSS Feed Trigger**：当 RSS 源有新内容时触发
- **Email Trigger**：当收到新邮件时触发

### 条件分支（If 节点）

If 节点让你可以根据条件把数据分流到不同的路径。比如：

```
订单金额 >= 1000  --> 走"VIP 审批"流程
订单金额 <  1000  --> 走"自动通过"流程
```

### 合并（Merge 节点）

当你有两个并行分支，想把它们的结果合在一起时，就用 Merge 节点。

### 循环（Split in Batches 节点）

当你要处理大量数据（比如 1000 条记录），而目标服务有速率限制（比如每分钟只能处理 100 条），Split in Batches 可以把数据分批处理。

## 代码示例

### 示例一：每日新闻摘要工作流

场景：每天早上 8 点，从 Hacker News 抓取最新帖子，用 AI 生成摘要，发送到 Slack。

```javascript
// Code 节点中的 JavaScript 代码
// 输入：来自 HTTP Request 节点的 Hacker News 热门帖子数据
// 输出：每条帖子的标题 + 摘要

const items = $input.all();

// 遍历每一条帖子
const output = items.map(item => {
  const title = item.json.title;
  const score = item.json.score;
  const numComments = item.json.num_comments;

  // 只处理分数超过 100 的帖子
  if (score > 100) {
    return {
      json: {
        title: title,
        summary: `[热度 ${score}] ${title} (${numComments} 条评论)`,
        score: score,
        timestamp: new Date().toISOString()
      }
    };
  }
  return null;
}).filter(Boolean);

return output;
```

这个 Code 节点做的事情很简单：
1. `$input.all()` 获取上一个节点传来的所有数据项
2. 遍历每条帖子，检查分数是否超过 100
3. 符合条件的生成摘要，不符合的过滤掉
4. 返回处理后的结果

### 示例二：客户留言自动处理工作流

场景：当有人通过表单提交留言时，自动保存到数据库、发送确认邮件、并在团队频道通知。

```javascript
// Code 节点：处理并格式化客户留言
// 输入：来自 n8n Form Trigger 的表单数据
// 输出：格式化后的留言数据

const form = $input.item.json;

// 判断留言类型（基于关键词）
let category = "一般咨询";
const lowerText = form.message.toLowerCase();

if (lowerText.includes("退款") || lowerText.includes("refund")) {
  category = "退款申请";
} else if (lowerText.includes("bug") || lowerText.includes("错误")) {
  category = "Bug 报告";
} else if (lowerText.includes("感谢") || lowerText.includes("thanks")) {
  category = "反馈表扬";
}

// 生成唯一的工单编号
const ticketId = `TK-${Date.now().toString(36).toUpperCase()}`;

// 构建输出
return [{
  json: {
    ticketId: ticketId,
    name: form.name,
    email: form.email,
    category: category,
    message: form.message,
    priority: category === "Bug 报告" ? "高" : "普通",
    createdAt: new Date().toISOString(),
    status: "待处理"
  }
}];
```

这个工作流的节点连接顺序是：

```
[n8n Form Trigger]
       |
       v
[Code 节点：分类 + 生成工单号]
       |
       +---> [Google Sheets：保存记录]
       |
       +---> [Send Email：发确认邮件]
       |
       +---> [Slack：发送通知到频道]
```

### 示例三：表达式引用（在节点间传递数据）

n8n 的表达式语法让你可以直接在 UI 中引用其他节点的数据，不需要写代码。

假设你在"HTTP Request"节点里调用了一个 API，返回了用户信息。你想在"Send Email"节点里使用返回的用户名字：

```
收件人: {{ $json.email }}
称呼: {{ $json.name }}
```

如果还需要引用前面某个节点的数据（即使中间隔了几个节点）：

```
{{ $node["HTTP Request"].json["data"]["user"]["email"] }}
```

表达式还可以做简单的数据处理：

```
// 拼接字符串
{{ $json.firstName + " " + $json.lastName }}

// 条件判断
{{ $json.amount > 1000 ? "VIP" : "普通" }}

// 数组操作
{{ $json.tags.join(", ") }}
```

## 关键能力总结

1. **400+ 内置集成**：Gmail、Slack、GitHub、Google Sheets、OpenAI、Stripe、Salesforce 等主流服务都有现成节点，拖拽即可使用。
2. **可视化编辑器**：画布式界面，节点之间连线，数据流向一目了然。
3. **代码自由**：需要复杂逻辑时，随时插入 Code 节点写 JavaScript。
4. **自托管**：数据完全在自己手里，可以用 Docker 一键部署。
5. **AI 原生**：内置 LangChain 支持，可以直接构建 AI Agent 工作流，接入 OpenAI、Anthropic 等大模型。
6. **Fair-code 协议**：源码可见、可自行部署，但不允许将 n8n 作为竞品服务出售。

## 下一步建议

1. 用 `npx n8n` 本地启动，花 10 分钟熟悉编辑器界面
2. 从模板市场找一个简单的工作流（比如"发送欢迎邮件"），导入后看看它的结构
3. 尝试自己搭建一个"定时抓取 RSS 推送"的工作流
4. 学习 Code 节点的 JavaScript 用法，这是突破无代码限制的钥匙

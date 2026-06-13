---
title: 9Router — AI 编程工具的万能路由器
来源: https://github.com/decolua/9router
日期: 2026-06-13
分类: CLI
子分类: 开发者工具
provenance: pipeline-v3
---

## 0 一句话理解

9Router 是一台"AI 翻译+调度交换机"。你在编程工具里（Claude Code、Cursor、Copilot 等）只配置一个本地地址 `localhost:20128`，9Router 帮你把请求智能路由到 40+ 供应商、100+ 模型，并且能自动降级、省 token、省额度。

---

## 1 日常类比：快递中转站

想象你要给不同国家的客户寄快递（你的 AI 编程请求）：

- **不��� Router 时**：每个客户（编程工具）都要单独找对应的快递公司（API 供应商），如果一家快递涨价或爆仓，你的包裹就卡住了。
- **有了 9Router**：所有包裹先送到你家门口的中转站。中转站自动决定：哪家便宜走哪家、哪家爆了就切另一家、哪家免费就用免费的。你只需要对接中转站。

9Router 就是这个中转站，运行在你本地电脑上。

---

## 2 核心概念拆解

### 2.1 OpenAI 兼容接口（OpenAI-Compatible API）

很多 AI 工具（Cursor、Copilot 等）默认支持通过"OpenAI API 格式"来对接模型，也就是说它们只需要知道一个 URL 和 API Key，就能发请求，不管背后实际用的是 Claude、Gemini 还是别的模型。

9Router 监听在 `http://localhost:20128/v1`，对外伪装成一个标准的 OpenAI API 服务。编程工具不知道也不关心背后是谁在干活。

### 2.2 三级智能回退（3-Tier Auto-Fallback）

9Router 允许你把供应商排成梯队：

| 等级 | 类型 | 示例 | 费用 |
|------|------|------|------|
| Tier 1 | 订阅制 | Claude Code、GitHub Copilot | 已付费 |
| Tier 2 | 便宜型 | GLM ($0.6/1M tokens)、MiniMax ($0.2/1M) | 极低 |
| Tier 3 | 免费型 | Kiro AI、OpenCode Free、Vertex $300 credits | 零成本 |

当 Tier 1 的额度用完后，9Router 自动切到 Tier 2，Tier 2 也耗尽就切到 Tier 3，全程不中断。

### 2.3 RTK 省 Token 技术

编程工具运行时会产生大量"工具输出"（`git diff`、`grep`、`ls -la`、文件树等），这些内容有时会占你 prompt 总长度的 30-50%。

RTK（Request Token Killer）在发送请求前自动检测并压缩这些工具输出，无损地省掉 20-40% 的输入 token。比如一个 47K token 的请求经 RTK 后变成 28K token，AI 的回答完全一样，但你省了将近一半的"垃圾"流量。

### 2.4 格式翻译（Format Translation）

不同供应商用不同的请求格式：

- OpenAI 格式（大多数工具用这个）
- Claude 原生格式
- Gemini 格式
- Cursor/Kiro/Vertex 格式

9Router 负责在它们之间自动翻译，你不用管。

### 2.5 多账号轮询（Multi-Account Round-Robin）

如果你有同一个供应商的多个 API Key，9Router 可以轮流使用它们，避免单个账号触发速率限制。

### 2.6 Caveman 模式

一个可选的"穴居人模式"：在发给 AI 的提示词里自动注入一种极简风格，让 AI 的回答变得更简短、更技术化，但不损失实质内容。据称可节省最多 65% 的输出 token。

---

## 3 代码示例

### 示例 1：本地安装并启动 9Router

这是最简单的方式，一条命令安装，一条命令启动。

```bash
# 全局安装（需要 Node.js）
npm install -g 9router

# 启动，默认端口 20128
9router
```

启动后会自动打开浏览器，显示 Dashboard 管理界面：

- 添加供应商（Providers）
- 创建回退组合（Combos）
- 查看实时用量（Quota Tracking）
- 开启/关闭 RTK 压缩

### 示例 2：在编程工具中对接 9Router

假设你在用 Cursor 或 OpenClaw，只需要改两处配置：

```
# 你的编程工具设置里：

Endpoint:   http://localhost:20128/v1
API Key:    从 9Router Dashboard 复制一个 Key
Model:      kr/claude-sonnet-4.5
```

这里 `kr/` 前缀表示 9Router 内部的路由命名空间。你不需要知道这个模型实际跑在哪个供应商上，9Router 会自动处理。

### 示例 3：创建一个三级回退 Combo

在 9Router 的 Dashboard 里创建名为 "my-coding-stack" 的组合：

```
Combo 名称: my-coding-stack

梯队 1 (最高优先): cc/claude-opus-4-6
  └─ 来源: 你已有的 Claude Code 订阅

梯队 2 (便宜备用): glm/glm-4.7
  └─ 来源: 智谱 GLM，约 $0.6/1M tokens

梯队 3 (免费兜底): if/kimi-k2-thinking
  └─ 来源: Kimi 免费层
```

工作流程演示：

```
你的编程工具 → localhost:20128/v1
                   │
              9Router 路由决策：
                   │
              ┌────┴────┐
              │ 配额充足？──是──→ 调用 Claude Opus 4.6（你的订阅）
              └────┬────┘
                 否
              ┌────┴────┐
              │ 预算够？──是──→ 调用 GLM-4.7（便宜）
              └────┬────┘
                 否
              ┌────┴────┐
              │          → 调用 Kimi K2（免费）
              └─────────┘
```

### 示例 4：从源码运行

如果你想更深入了解 9Router 的内部，可以从源码运行：

```bash
# 克隆项目
git clone https://github.com/decolua/9router.git
cd 9router

# 配置环境变量
cp .env.example .env

# 安装依赖
npm install

# 开发模式运行
PORT=20128 \
NEXT_PUBLIC_BASE_URL=http://localhost:20128 \
npm run dev

# 生产构建
npm run build
npm run start
```

注意：该项目的部分源码是私有的（`9router-app`），所以完整的源码编译可能受限。

### 示例 5：RTK 压缩的实际效果对比

假设一个编程工具发来的请求中包含了 `git diff` 的输出：

```
# 没有 RTK 时：
工具输出: "diff --git a/src/main.js b/src/main.js
...（省略 200 行差异）...
@@ -10,20 +10,20 @@
- console.log('old line 1')
+ console.log('new line 1')
...（更多重复的上下文行）..."
→ 总 token 数: 47,000

# 开启 RTK 后：
工具输出: "diff src/main.js: 200 lines changed
@@ -10-30
context: 2 lines before/after each change"
→ 总 token 数: 28,000  (节省 40%)
```

RTK 的过滤器包括：`git-diff`、`git-status`、`grep`、`find`、`ls`、`tree`、`dedup-log`、`smart-truncate` 等，全部自动检测，无需手动配置。

---

## 4 支持的编程工具

9Router 像万能转接头一样兼容几乎所有主流 AI 编程工具：

- Claude Code
- OpenClaw / Codex
- Cursor
- GitHub Copilot
- Cline
- Antigravity
- Roo
- Kilo Code
- Continue
- Droid

---

## 5 支持的供应商（部分列表）

### OAuth 供应商
Claude-Code、Antigravity、Codex、GitHub、Cursor

### 免费供应商
- **Kiro AI** — 免费无限制的 Claude 4.5 + GLM-5 + MiniMax
- **OpenCode Free** — 无需认证，自动获取模型列表
- **Vertex AI** — Google 提供 $300 免费额度

### API Key 供应商（40+）
OpenRouter、GLM、Kimi、MiniMax、OpenAI、Anthropic、Gemini、DeepSeek、Groq、xAI、Mistral、Perplexity、Together AI、Fireworks、Cerebras、Cohere、NVIDIA、SiliconFlow、Nebius、Chutes、Hyperbolic 等

---

## 6 你可能想问的

### Q: 它合法吗？

9Router 本身只是一个本地 API 网关/路由器，不破解任何服务。你用它连接的是你合法拥有的 API Key 或免费额度。

### Q: 安全吗？

所有流量经过你的本地电脑（`localhost`），不会经过第三方服务器。你配置供应商的 API Key 也保存在本地。

### Q: 部署在哪里？

默认本地运行。也支持 VPS、Docker、Cloudflare Workers 等云部署方式。

### Q: 为什么叫 9Router？

"9" 是中文"久"的谐音，寓意长久运行、永不中断。"Router" 就是路由器。

---

## 7 总结

9Router 解决的核心问题就两个：

1. **省钱**：通过 RTK 省 20-40% 输入 token、自动切换到便宜/免费供应商、多账号分摊额度
2. **不断档**：一个供应商的额度用完，自动无缝切换到下一个，你不需要手动干预

它的实现方式很简洁——就是一个运行在你本地电脑上的 HTTP 网关，把 OpenAI 兼容的请求翻译成各供应商的格式，然后按策略路由出去。编程工具只需要配一个 localhost 地址，就能享受"无限"的 AI 模型。

对于零基础学习者，理解 9Router 最好的方式是先理解 **API 网关** 的概念：它就是一个"中间人"，帮你做翻译、转发、决策。后面的 RTK、回退、多账号等都是在这个基础之上叠加的策略层。

---

*本文基于 2026-06-13 公开信息整理，项目持续更新，具体配置和供应商列表以官方仓库为准。*

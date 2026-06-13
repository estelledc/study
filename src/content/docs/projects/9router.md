---
title: 9Router — 把几十个 AI 模型串成一条"瀑布带"的免费网关
来源: 'https://github.com/decolua/9router'
日期: 2026-06-13
分类: 机器学习
子分类: ML 系统
难度: 初级
provenance: pipeline-v3
---

## 是什么

9Router 是一个**本地运行的 AI 代理网关**。日常类比：酒店礼宾员。

你在酒店前台（CLI 工具）说要叫出租车。礼宾员（9Router）不会亲自开车，他会看手里那张"司机名录"——最好的司机在忙，就换第二个；第二个也在忙，换第三个……你只跟礼宾员打交道，不知道背后换了几个人。

换成技术语言：9Router 跑在你自己电脑上的 `localhost:20128`，把所有 AI 编程工具（Claude Code、Cursor、Codex、OpenClaw……）发来的请求，自动路由到 40+ 提供商、100+ 模型，并在订阅耗尽时自动切换到便宜或免费的替代方案。

---

## 核心概念

### 1. 三层回退（3-Tier Fallback）

9Router 让你按优先级排一条"候选名单"：

```
第 1 层 — 订阅层：你已付费的（Claude Pro、Codex Plus）
第 2 层 — 低价层：按量计费的便宜模型（GLM $0.6/1M tokens）
第 3 层 — 免费层：完全免费的模型（Kiro、OpenCode Free）
```

当第 1 层额度用完后，9Router **自动切换**到第 2 层，再耗尽就切到第 3 层。整个过程对你透明，编码不会中断。

### 2. RTK Token 压缩器

LLM 的提示词里，工具输出（`git diff`、`grep` 结果、`ls` 列表）经常占 30-50% 的 token。RTK 在请求发出前自动压缩这些内容，**无损**但能节省 20-40% 的输入 token。

### 3. 格式翻译器

不同提供商用不同的 API 格式（OpenAI 格式、Claude 格式、Gemini 格式……）。9Router 在中间自动做格式转换，你的编程工具只需要会发 OpenAI 格式就够了。

---

## 代码示例

### 示例 1：安装并启动

```bash
# 全局安装（需要 Node.js 18+）
npm install -g 9router

# 启动服务，Dashboard 会自动打开
9router
```

启动后：

- Dashboard 地址：`http://localhost:20128/dashboard`
- API 端点：`http://localhost:20128/v1`

不需要注册账号，不需要 API Key，直接打开 Dashboard 就能添加提供商。

### 示例 2：在 Claude Code 中接入 9Router

编辑 `~/.claude/config.json`，把 AI 请求指向 9Router：

```json
{
  "anthropic_api_base": "http://localhost:20128/v1",
  "anthropic_api_key": "your-9router-api-key"
}
```

这里的 `your-9router-api-key` 从 Dashboard 里复制。设置完之后，Claude Code 以为自己在直接调用 Anthropic，实际上请求全部经过了 9Router 的路由和压缩。

### 示例 3：创建"三层回退"组合

在 Dashboard 的 **Combos** 页面创建一个新组合：

```
名称: my-coding-stack
  1. cc/claude-opus-4-6       ← 你的 Claude Pro 订阅（优先使用）
  2. glm/glm-4.7              ← 便宜备份，$0.6/1M tokens
  3. kr/claude-sonnet-4.5     ← 免费兜底（Kiro AI）

模型: 输入 my-coding-stack 即可
```

当第 1 层额度耗尽，9Router 自动切到第 2 层；第 2 层预算用完，切到第 3 层。你不需要做任何手动操作。

---

## 架构一览

```
你的 CLI 工具
  │  (Claude Code / Cursor / Codex / OpenClaw ...)
  ▼
localhost:20128/v1   ← 9Router 网关
  │
  ├─→ RTK Token 压缩   （省 20-40% 输入 token）
  ├─→ 格式翻译         （OpenAI ↔ Claude ↔ Gemini）
  ├─→ 额度跟踪         （实时看剩多少）
  │
  ▼
Tier 1: cc/claude-opus-4-6      （订阅层）
  ↓ 额度用完
Tier 2: glm/glm-4.7             （低价层）
  ↓ 预算用完
Tier 3: kr/claude-sonnet-4.5    （免费层）
```

---

## 支持的工具

9Router 支持所有主流 AI 编程工具：

- Claude Code、OpenClaw、Codex、OpenCode、Cursor
- Antigravity、Cline、Continue、RooCode、Copilot
- 任何支持"自定义 OpenAI 端点"的工具

本质上，只要你的工具能设置一个自定义的 API Base URL，9Router 就能接入。

---

## 支持的成本策略

| 层级 | 提供商举例 | 费用 | 适用场景 |
|------|-----------|------|---------|
| Token 压缩 | RTK（内置） | 免费 | 每个请求都省钱 |
| 订阅 | Claude Pro、Codex Plus | $20-200/月 | 已付费用户最大化利用 |
| 低价 | GLM、MiniMax | $0.2/1M tokens | 订阅耗尽后的备份 |
| 免费 | Kiro AI、OpenCode Free | $0 | 零成本编码 |

---

## 部署方式

| 方式 | 适用场景 |
|------|---------|
| 本地运行 | 单台电脑，离线可用 |
| Docker | 一键部署，数据持久化 |
| VPS / 云服务器 | 多台设备共享 |
| Cloudflare Workers | 边缘网络，全球低延迟 |

Docker 快速启动：

```bash
docker run -d \
  --name 9router \
  -p 20128:20128 \
  -v "$HOME/.9router:/app/data" \
  decolua/9router:latest
```

---

## 关键特点总结

- **零门槛**：安装后打开 Dashboard，连一个免费提供商就能开始用
- **零成本方案**：Kiro + OpenCode Free + RTK = $0/月编码
- **不锁平台**：一个 9Router 可以同时服务 Claude Code、Cursor、Codex 等所有工具
- **透明切换**：回退自动发生，不需要手动切换 API Key 或端点
- **开源免费**：MIT 许可证，软件本身不收取任何费用

---

## 一句总结

9Router 把你手头的 AI 模型从"单兵作战"变成"团队协作"——主力累了换替补，替补累了换免费，编码永不中断。

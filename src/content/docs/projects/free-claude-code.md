---
title: "Free Claude Code —— 用代理让 Claude Code 接入免费模型"
来源: https://github.com/Alishahryar1/free-claude-code
日期: 2026-06-13
分类: CLI
子分类: 开发者工具
provenance: pipeline-v3
---

## 一、这是什么？

Free Claude Code 是一个**本地代理（proxy）程序**。它架在"Claude Code 客户端"和"模型供应商"之间，把 Claude Code 发出的 API 请求接住，转交给其他免费或廉价的模型服务。

### 日常类比：快递中转站

想象你每天都给一个固定地址（Anthropic 官方 API）寄快递（API 请求），需要付很贵的运费（API 费用）。Free Claude Code 在你家门口建了个中转站：

```
你 → 中转站（免费） → 其他快递点（免费或便宜）
```

中转站会做三件事：

1. **接住**你寄出的包裹，保持包装不变（Claude Code 的协议不变）
2. **转发**到另一个更便宜的快递点（OpenRouter、Ollama、Google Gemini 等）
3. **翻译**对方回传的包裹格式，让你看不出来有任何变化（协议转换）

这就是所谓的 "drop-in proxy" —— 插上去就能用，不用改你原来的任何设置。

### 项目基本信息

| 项目 | 说明 |
|------|------|
| GitHub | Alishahryar1/free-claude-code |
| 语言 | Python |
| 协议 | MIT |
| Stars | 34,000+ |
| 核心功能 | 17 种模型供应商后端，支持 Claude Code / VS Code / JetBrains |

---

## 二、核心概念

### 1. 代理（Proxy）

Proxy 就像"中间人"。Claude Code 以为自己在直接和 Anthropic 对话，但实际上请求全部经过了一个本地服务（localhost:8082）。这个服务负责把请求原样转发给真正的模型供应商。

```
Claude Code ──→ 本地代理 (localhost:8082) ──→ OpenRouter / Ollama / Gemini ...
```

Claude Code 不会察觉到区别，因为它用的 Anthropic API 格式被代理统一转换了。

### 2. 模型路由（Model Routing）

Claude Code 会根据功能需要请求不同的模型（Opus、Sonnet、Haiku）。代理可以做**分级路由**：

- 请求 Opus → 转发到供应商 A（质量最好的）
- 请求 Sonnet → 转发到供应商 B（性价比最高）
- 请求 Haiku → 转发到供应商 C（最便宜的）
- 其他请求 → 转发到默认供应商

### 3. Claude Code 的三个启动方式

| 方式 | 入口 | 说明 |
|------|------|------|
| 终端 CLI | `fcc-claude` | 在终端里运行 Claude Code |
| VS Code 扩展 | 设置环境变量 | 在 VS Code 里使用 Claude Code |
| JetBrains ACP | 编辑配置文件 | 在 JetBrains IDE 里使用 |

三者原理一样：**把 `ANTHROPIC_BASE_URL` 指向 `http://localhost:8082`**，Claude Code 就会去本地代理找模型。

---

## 三、动手示例

### 示例 1：一键安装 + 启动代理

最省事的安装方式是用官方安装脚本。安装完后，只需一个命令启动代理：

```bash
# 安装代理
curl -fsSL "https://github.com/Alishahryar1/free-claude-code/blob/main/scripts/install.sh?raw=1" | sh

# 启动代理，默认监听 8082 端口
fcc-server
```

启动后终端会显示：

```
INFO:     Admin UI: http://127.0.0.1:8082/admin (local-only)
```

打开这个 admin 页面，填入你选定的模型供应商的 API Key（比如 OpenRouter 或 Ollama 的地址），设置好 `MODEL`，点 Validate + Apply 就完成了配置。

**关键概念**：`MODEL` 是"默认 fallback 模型"。如果你有 `MODEL_OPUS`、`MODEL_SONNET`、`MODEL_HAIKU` 三个变量，代理就会根据 Claude Code 请求的模型类型自动路由到不同的供应商。

### 示例 2：运行 Claude Code

代理启动并配置好后，用一个专用命令来启动 Claude Code：

```bash
fcc-claude
```

这个命令做了什么？它读取出你刚才在 Admin UI 里配置好的端口和 token，设置好三个环境变量：

```bash
export ANTHROPIC_BASE_URL=http://localhost:8082
export ANTHROPIC_AUTH_TOKEN=freecc
export CLAUDE_CODE_AUTO_COMPACT_WINDOW=190000
```

然后启动真正的 `claude` 命令。从 Claude Code 的角度看，它只是在连 `localhost:8082`——完全不知道背后是 Ollama 还是 Gemini。

### 示例 3：在 VS Code 里使用（不用终端）

如果你想在 VS Code 的 Claude Code 扩展里用，需要改设置：

1. 打开 VS Code 设置
2. 搜索 `claude-code.environmentVariables`
3. 选择 "Edit in settings.json"
4. 加入这些内容：

```json
{
  "claudeCode.environmentVariables": [
    { "name": "ANTHROPIC_BASE_URL", "value": "http://localhost:8082" },
    { "name": "ANTHROPIC_AUTH_TOKEN", "value": "freecc" },
    { "name": "CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY", "value": "1" },
    { "name": "CLAUDE_CODE_AUTO_COMPACT_WINDOW", "value": "190000" }
  ]
}
```

改完 reload 扩展就行。`ANTHROPIC_BASE_URL` 指向本地代理，`ANTHROPIC_AUTH_TOKEN` 是代理认的 token（默认 `freecc`）。

---

## 四、架构理解

请求的完整路径：

```
你输入问题
  → Claude Code 客户端（终端或 VS Code）
    → 发送 Anthropic API 请求到 localhost:8082
      → 代理根据模型名决定路由策略
        → 转发到供应商 A（如 OpenRouter）
          → 供应商返回结果
            → 代理转换格式，返回给 Claude Code
              → 你看到回答
```

代理内部做了很多"翻译"工作：

- **Thinking blocks**（思考过程）：不同供应商返回的思考块格式不同，代理统一转成 Claude Code 能识别的样子
- **Tool calls**（工具调用）：Claude Code 的 tool-use 协议需要被正确映射
- **Token 计数**：供应商返回的 token 用量会被聚合展示
- **错误处理**：供应商的 HTTP 错误会被转换成 Claude Code 能理解的格式

还有"优化层"：Claude Code 启动时会发一些探测请求（比如 "你叫什么名字"），代理会直接本地回答，不浪费供应商的 quota。

---

## 五、支持的 17 种模型供应商

| 供应商 | 类型 | 免费额度 |
|--------|------|----------|
| NVIDIA NIM | 云 API | 有 |
| OpenRouter | 聚合器 | 有免费模型 |
| Google AI Studio (Gemini) | 云 API | 有 |
| DeepSeek | 云 API | 有 |
| Mistral | 云 API | 有 |
| Mistral Codestral | 云 API | 有 |
| OpenCode Zen | 云 API | 有免费模型 |
| OpenCode Go | 云 API | 有 |
| Wafer | 云 API | 有 |
| Kimi (月之暗面) | 云 API | 有 |
| Cerebras | 云 API | 有 |
| Groq | 云 API | 有 |
| Fireworks AI | 云 API | 有 |
| Z.ai | 云 API | 有 |
| LM Studio | 本地运行 | 完全免费 |
| llama.cpp | 本地运行 | 完全免费 |
| Ollama | 本地运行 | 完全免费 |

LM Studio、llama.cpp、Ollama 这三种是**本地运行**的，不需要联网，完全免费——只需要你的电脑够强。

---

## 六、扩展功能

### 1. Discord / Telegram 机器人

可以搭建远程机器人，让你在 Discord 或 Telegram 里通过聊天和 Claude Code 交互。机器人能执行代码、回答问题，支持 `/stop`、`/clear`、`/stats` 等命令。

### 2. 语音笔记

集成 Whisper 或 NVIDIA NIM，可以把语音消息转成文字发给 Claude Code。

### 3. 本地 Admin UI

运行 `fcc-server` 后，打开 `http://localhost:8082/admin` 就是一个图形化界面：

- 配置 API Key
- 设置默认模型
- 查看供应商状态
- 管理消息机器人

---

## 七、总结

Free Claude Code 的核心价值可以用一句话概括：**让 Claude Code 不再绑定 Anthropic 官方 API**。

它做的事情其实不复杂——就是 HTTP 请求的"中转 + 翻译"。但好处很大：

1. **省钱**：可以用免费模型或本地模型
2. **灵活**：17 种供应商随你选，Opus/Sonnet/Haiku 分别路由
3. **离线可用**：Ollama + LM Studio 完全本地运行
4. **不锁死**：Claude Code 本身不变，只是换了个"后端"

对学习者的建议：先跑通 `fcc-server` + `fcc-claude` 这个最简单的组合，再逐步探索模型路由和扩展功能。

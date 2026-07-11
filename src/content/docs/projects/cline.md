---
title: Cline — VS Code 自主编码代理
来源: 'https://github.com/cline/cline'
日期: 2026-07-07
分类: editors
难度: 初级
---

## 是什么

Cline 是一个**住在编辑器和终端里的自主编码代理**。日常类比：像请一个实习搭档坐在你旁边，他能看项目文件、改代码、跑命令、看报错，但每次真正动手前都会把动作摊开给你确认。

它最早让人记住的是 VS Code 扩展：你在聊天框里说"把这个 bug 修掉"，它会先读相关文件，再给出修改 diff，必要时运行测试。现在 Cline 还扩展到 CLI、Kanban、JetBrains 插件和 SDK，核心都是同一个"模型 + 工具 + 权限"循环。

最小例子可以是一个终端任务：

```bash
cline "run tests and fix failures"
```

这句话不是魔法命令。Cline 真正做的是：理解你的目标，搜索代码，提出文件修改，运行测试，再把结果反馈给你。

## 为什么重要

不理解 Cline，下面这些事都很难解释：

- 为什么现在的编码助手不只是补全一行，而是能连续读文件、改文件、跑测试、再修第二轮
- 为什么 Plan mode 和 Act mode 要分开：前者像先开会画方案，后者才像开始动工
- 为什么自主 agent 仍然需要权限边界：它越能干，越要清楚哪些动作能自动批准
- 为什么 MCP、规则文件、SDK 这些周边能力，会决定一个编码代理能不能长期用于真实项目

## 核心要点

Cline 的核心可以拆成 **三层**：

1. **工具化的眼和手**：它不只会聊天，还能读文件、搜索代码、运行命令、打开浏览器、调用 MCP 工具。类比：普通聊天模型像顾问，Cline 像有钥匙进工地的施工员，但钥匙分级发放。

2. **人类在回路里**：文件编辑和终端命令默认需要你批准，IDE 里还会显示 diff。类比：装修师傅可以提方案和报价，但砸墙前要你点头。

3. **同一内核，多种入口**：VS Code 扩展适合边看代码边协作，CLI 适合脚本和 CI，SDK 适合把 agent 能力嵌进自己的产品。类比：同一台发动机，可以装在轿车、货车，也可以装进实验车架。

这三个点让 Cline 和"只给建议的助手"拉开距离：它强调端到端完成任务，同时把权限、回滚和上下文作为产品设计的一部分。

## 实践案例

### 案例 1：在 IDE 里从零生成一个小网页

官方 IDE 教程用一个单文件 todo app 作为入门任务：

```text
Build a todo app in a single HTML file. Include:
- Input field to add new tasks
- List that displays all tasks
- Checkbox to mark tasks complete
- Button to delete individual tasks
- All JavaScript inline in the same file
```

如果 Cline 处在 Act mode，它会提出创建 `index.html`，展示要写入的代码，然后等待你批准。批准后你可以在终端打开结果：

```bash
open index.html        # macOS
xdg-open index.html    # Linux
```

逐部分解释：

- `single HTML file` 把任务边界压小，方便新手看清每一步修改
- `Include:` 后面的清单是验收标准，Cline 会围绕它补齐 HTML、CSS、JS
- `open` / `xdg-open` 不是 Cline 专属，只是验证产物最直接的命令

### 案例 2：用 CLI 做 GitHub issue 根因分析

官方 CLI 示例把 issue URL 和提示词交给 Cline，输出机器可解析的 JSON：

```bash
PROMPT="What is the root cause of this issue?"
ISSUE_URL="https://github.com/owner/repo/issues/123"
cline --auto-approve true --json "$PROMPT: $ISSUE_URL" \
  | jq -r 'select(.type == "agent_event" and .event.type == "done") | .event.text'
```

逐部分解释：

- `--auto-approve true` 让脚本场景不用每步点确认，但必须放在干净分支或受控环境里
- `--json` 让输出变成一行行结构化事件，后面才能用 `jq` 过滤
- `ISSUE_URL` 给了外部上下文，Cline 会围绕这个链接和仓库内容做调查

### 案例 3：给 Cline 接一个 MCP 工具

官方 MCP 文档给出的本地服务器配置长这样：

```json
{
  "mcpServers": {
    "local-server": {
      "command": "node",
      "args": ["/path/to/server.js"],
      "env": { "API_KEY": "your_api_key" },
      "disabled": false,
      "autoApprove": []
    }
  }
}
```

逐部分解释：

- `command` 和 `args` 告诉 Cline 怎么启动本地 MCP 服务端
- `env` 放凭证，避免把密钥硬编码进脚本
- `autoApprove` 留空，表示新工具先人工审核，等确认安全后再放宽

这个案例说明 Cline 的重点不是"内置所有能力"，而是提供一个能接工具、能控权限的壳。

## 踩过的坑

1. **没打开项目文件夹就开始问**：Cline 需要 workspace 才知道文件该创建在哪里，否则上下文像空桌子，什么都摆不上去。

2. **Plan mode 里催它改代码**：Plan mode 故意不改文件，用来读代码和商量方案；要落盘必须切到 Act mode。

3. **一上来开全自动权限**：auto-approve 和 YOLO mode 会减少确认弹窗，但也可能自动执行危险命令；原因是 agent 的工具能力已经接近真实开发者。

4. **MCP 服务没做最小权限**：外部工具一旦能读库、写库、调云资源，配置错就会扩大事故半径；原因是 MCP 把外部系统接进了同一个操作循环。

## 适用 vs 不适用场景

**适用**：

- 已经有代码仓库，需要读懂结构后做小到中型改动
- 需要"改代码 + 跑测试 + 看失败 + 再修"的闭环任务
- 想把重复检查放进 CLI 或 CI，比如 issue 分析、PR review、变更摘要
- 团队愿意维护 `.clinerules`、MCP、权限策略，让 agent 按项目规矩办事

**不适用**：

- 需求还只是灵感，没有任何验收标准，最好先人工澄清
- 高风险生产操作，比如删库、改云权限、批量迁移真实数据
- 你完全不看 diff，只把结果当成一定正确
- 项目极大且依赖私有知识，但没有规则、文档、测试作为护栏

## 历史小故事（可跳过）

- **早期**：Cline 以 VS Code 自主编码扩展出圈，核心卖点是能读项目、改文件、跑命令，并让用户批准每一步。
- **2024-2025**：编码 agent 从"对话建议"走向"端到端改仓库"，Plan/Act、checkpoint、tool permission 变成必备设计。
- **2025-2026**：Cline 扩展到 CLI、Kanban、JetBrains 和 SDK，把同一套 agent core 放进更多入口。
- **2026 年 7 月**：GitHub 页面显示 Cline 已是 6 万多 star 的开源项目，社区重点也从单一扩展转向多入口 agent 平台。

## 学到什么

1. **编码代理的价值在闭环**：只给答案不够，关键是能拿真实代码和真实测试反馈继续迭代。
2. **权限设计不是附属功能**：工具越强，审批、checkpoint、命令限制越是主功能。
3. **上下文质量决定产出质量**：清楚的任务、相关文件、项目规则，比一句笼统的"帮我优化"有用得多。
4. **Cline 是平台化方向**：IDE、CLI、MCP、SDK 组合起来，说明未来 agent 更像可编排运行时，而不只是聊天窗口。

## 延伸阅读

- 官方仓库：[cline/cline](https://github.com/cline/cline)（README 能看到 VS Code、CLI、Kanban、SDK 的全景）
- 官方文档：[Cline Overview](https://docs.cline.bot/cline-overview)（理解它的产品边界）
- 官方教程：[CLI Overview](https://docs.cline.bot/usage/cli-overview)（看 headless、JSON、自动化用法）
- 官方教程：[MCP in Cline](https://docs.cline.bot/mcp/mcp-overview)（理解外部工具怎么接入）
- [[claude-code]] —— 同样是能读写仓库、运行命令的编码 agent，对比两者的交互边界
- [[mcp-spec]] —— Cline 接外部工具时背后的协议基础

## 关联

- [[vscode]] —— Cline 最典型的入口之一，很多交互都发生在编辑器侧栏里
- [[claude-code]] —— 终端编码 agent 的近邻，适合比较权限、上下文和提交习惯
- [[continue]] —— 更偏 IDE 内补全和聊天，和 Cline 的自主执行路线形成对照
- [[aider]] —— 早期命令行结对编程工具，强调 git diff 和小步提交
- [[mcp-spec]] —— Cline 通过 MCP 扩展工具边界，协议理解越清楚越不容易乱配
- [[openhands]] —— 更偏完整软件工程 agent 环境，和 Cline 的本地 IDE/CLI 路线互补

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[opencode]] —— OpenCode — 终端里的开源 AI 编程助手
- [[roo-code]] —— Roo Code — 多模式 VS Code AI 助手
- [[void]] —— Void — 开源 Cursor 替代

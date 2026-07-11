---
title: Roo Code — 多模式 VS Code AI 助手
来源: 'https://github.com/RooCodeInc/Roo-Code'
日期: 2026-07-07
分类: editors
难度: 初级
---

## 是什么

Roo Code 是一个**装在 VS Code 里的多模式 AI 编程助手**。日常类比：像把一个小开发团队塞进编辑器侧栏里，同一个人可以戴上"写代码""画架构""问答""排 bug"几顶帽子。

最小使用感不是写一堆配置，而是在聊天框里给它一个明确任务：

```text
/code Create a file named hello.txt containing "Hello, world!".
```

这里的 `/code` 表示切到 Code Mode，后面的句子是普通自然语言任务。Roo 会根据权限读取项目、提出写文件或跑命令的动作，再让你确认。

需要先知道一个现实背景：Roo Code 来自 Cline 生态，后来项目在 2026-05-15 归档，README 也写明原扩展已经停止运营。所以这篇更适合学习"多模式 coding agent 产品设计"，如果今天要长期使用，需要再看社区 fork 或同类工具。

## 为什么重要

不理解 Roo Code，下面这些事会很难解释：

- 为什么 AI 编程工具开始从"补全一行代码"变成"一组有权限边界的角色"
- 为什么 Architect / Code / Debug 要分开：同一个模型，换系统提示和工具权限，行为就会不同
- 为什么自动批准、checkpoint、`.rooignore` 这类安全设计，会和写代码能力一样重要
- 为什么 MCP、custom mode、slash command 会把一个编辑器插件变成可扩展工作台

对初学者来说，Roo Code 的价值不只是"让 AI 改代码"。它更像一张工作流地图：先问清需求，再选模式，再给上下文，再看 diff 和命令，再决定是否批准。

## 核心要点

1. **模式是角色分工**：类比一个小组里有人负责设计、有人负责施工、有人负责排障。Code Mode 能读写和跑命令，Architect Mode 更偏规划，Ask Mode 更偏解释，Debug Mode 更偏系统排查。

2. **权限是刹车系统**：类比教练车的副刹，车能跑很快，但你仍能在关键动作前踩停。Roo 的工具调用、自动批准、命令 allowlist / denylist、checkpoint，都是为了让 agent 有手也有边界。

3. **配置把经验固化下来**：类比把团队规范贴在工位旁边，而不是每次口头重复。自定义 mode、`.roo/commands/`、`.roo/rules-*`、MCP 配置，把"怎么做事"写成项目文件，让团队复用。

这三个点合起来，就是 Roo Code 和普通聊天窗口的区别：它不是只回答问题，而是在编辑器里组织上下文、角色、权限和外部工具。

## 实践案例

### 案例 1：用 slash command 固化代码评审清单

官方 Slash Commands 文档给的基础命令文件类似这样：

```markdown
# review.md

Please review this code for:

- Performance issues
- Security vulnerabilities
- Code style violations
- Potential bugs
```

逐部分解释：

- `review.md` 放在 `.roo/commands/` 后，文件名会变成 `/review`
- 清单不是代码语法，而是给 Roo 的固定任务说明
- 以后每次输入 `/review`，就能复用同一套检查标准

这适合团队把"每次都要提醒 AI 的话"沉淀下来。它不像安装插件那样一次性生效，而是把 prompt 当成项目资产来维护。

### 案例 2：给文档工作建一个只改 Markdown 的 mode

官方 Custom Modes 文档给了 `.roomodes` / `custom_modes.yaml` 的 YAML 例子：

```yaml
customModes:
  - slug: docs-writer
    name: Documentation Writer
    description: A specialized mode for writing and editing technical documentation.
    roleDefinition: You are a technical writer specializing in clear documentation.
    whenToUse: Use this mode for writing and editing documentation.
    customInstructions: Focus on clarity and completeness in documentation.
    groups:
      - read
      - - edit
        - fileRegex: \.(md|mdx)$
          description: Markdown files only
```

逐部分解释：

- `slug` 是内部名字，后续可以用来匹配 `.roo/rules-docs-writer/`
- `roleDefinition` 告诉 Roo 这个角色是谁，像给演员发角色卡
- `groups` 决定工具权限，这里只允许读文件和编辑 Markdown / MDX
- `fileRegex` 是安全边界，避免文档 mode 误改源码

这个案例体现 Roo 的差异点：同样是 AI 助手，它可以被拆成多个小角色，并且每个角色有自己的文件权限。

### 案例 3：用 MCP 接一个远程工具服务

官方 MCP 文档给了 Streamable HTTP 传输的配置形态：

```json
{
  "mcpServers": {
    "modern-remote-server": {
      "type": "streamable-http",
      "url": "https://your-modern-server.com/api/mcp-endpoint",
      "headers": {
        "X-API-Key": "your-secure-api-key"
      },
      "alwaysAllow": ["newToolA", "newToolB"],
      "disabled": false
    }
  }
}
```

逐部分解释：

- `mcpServers` 是外接工具列表，像给编辑器插扩展坞
- `type` 和 `url` 告诉 Roo 怎么连远程 MCP 服务
- `headers` 可以放鉴权信息，但真实密钥要用环境变量或安全配置管理
- `alwaysAllow` 会跳过特定工具的确认，必须只给低风险工具

这个案例说明 Roo 不追求把所有能力都内置进插件。它用 MCP 作为标准接口，把数据库、搜索、内部脚本等外部能力接进同一个任务循环。

## 踩过的坑

1. **把已归档项目当活跃产品用**：README 显示原扩展在 2026-05-15 停止运营，原因是项目状态已经变成历史材料或 fork 起点。

2. **自定义 mode 权限放太宽**：`edit` 和 `command` 一旦全开，文档角色也可能改源码或跑危险命令，原因是工具权限比角色名更决定实际能力。

3. **auto-approve 只图省事**：自动批准写文件、MCP、命令会减少弹窗，但原因同样明显：AI 可以在你没看见时真的改工作区。

4. **MCP 不用时仍保持开启**：官方 tips 建议不用 MCP 就关掉，原因是 MCP 相关定义会占系统提示空间，影响上下文预算。

## 适用 vs 不适用场景

**适用**：

- 学习 VS Code 内 coding agent 如何设计模式、工具权限和审批流程
- 对比 Cline、Claude Code、OpenCode 这类 agent 的交互边界
- 需要把团队 prompt 做成 slash command、custom mode 或规则文件的产品参考
- 想理解 MCP 如何从"外接工具"变成编辑器助手的一等能力

**不适用**：

- 想找一个今天仍由原团队持续维护的生产工具
- 完全不看 diff、不设权限边界，只想让 AI 自动改完整个仓库
- 只需要普通问答或代码解释，Ask Mode 之外的 agent 能力会显得过重
- 对安全和合规要求很高，但没有命令 denylist、`.rooignore`、checkpoint 和人工复核

## 历史小故事（可跳过）

- **早期**：Roo Code 从 Cline 路线分化出来，核心仍是 VS Code 里的 agent：读文件、改文件、跑命令、等用户批准。
- **2025 年初**：项目快速加入 Debug Mode、project-level custom modes、MCP 支持、checkpoint 等能力，明显押注"可定制 agent 工作台"。
- **2025 年中**：custom modes 支持 YAML，codebase indexing、todo list、slash commands 等功能把它从聊天插件推向工作流平台。
- **2026-05-15**：GitHub 仓库页面显示项目被归档，README 写明原扩展停止运营，同时指向社区 fork 和 Cline。
- **归档时**：GitHub 页面显示两万多 star，说明它虽然生命周期短，但抓住了 AI 编程助手从单角色到多角色的关键转折。

## 学到什么

- **模式不是皮肤，而是权限和提示词的组合**：换 mode 会改变 Roo 能做什么、该怎么说、该不该动手。
- **自动化必须配套回滚和审批**：checkpoint、diff、allowlist、denylist 是 agent 真的写文件后才变得重要。
- **prompt 可以产品化**：slash command、custom mode、rules 文件，把一次对话里的经验变成可复用配置。
- **项目状态也是知识的一部分**：学习 Roo Code 时要同时记住它的设计价值和归档事实。

## 延伸阅读

- 官方仓库：[RooCodeInc/Roo-Code](https://github.com/RooCodeInc/Roo-Code) —— 看 README、归档状态和项目定位
- 官方文档：[Roo Code Documentation](https://roocodeinc.github.io/Roo-Code/) —— 看 modes、MCP、checkpoints、auto-approve 的完整说明
- 同源对照：[[cline]] —— Roo Code 的来源方向，适合比较同一类 VS Code agent 如何演化
- 终端对照：[[claude-code]] —— 同样能读写仓库，但入口从 VS Code 换成 CLI
- 协议基础：[[mcp-spec]] —— 理解 Roo 接外部工具时背后的标准接口

## 关联

- [[vscode]] —— Roo Code 的主入口就是 VS Code 扩展侧栏
- [[cline]] —— Roo Code 来自 Cline 生态，二者共享很多 agent 设计问题
- [[claude-code]] —— 都强调读写项目、运行命令和人工审批，入口形态不同
- [[opencode]] —— 终端 / 服务化方向的开源 coding agent，可对照模式与权限设计
- [[mcp-spec]] —— Roo 用 MCP 扩展外部工具，协议理解决定配置是否安全
- [[continue]] —— 都把 prompt 和规则项目化，但 Continue 更偏 PR 检查和 CI

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

（暂无反向链接）

# 第三方源码研究副本

本目录只放用于源码阅读、架构对比或临时贡献的外部仓库 clone。源码由上游 Git 管理，父仓只跟踪本页和 `_meta` 项目卡。

| 仓库 | 项目卡 |
|---|---|
| ResearchStudio | [researchstudio](../../_meta/researchstudio.md) |
| Codex | [codex](../../_meta/codex.md) |
| Gemini CLI | [gemini-cli](../../_meta/gemini-cli.md) |
| Grok Build | [grok-build](../../_meta/grok-build.md) |
| OpenCode | [opencode](../../_meta/opencode.md) |
| Pi | [pi](../../_meta/pi.md) |
| CSSwitch fork | [csswitch](../../_meta/csswitch.md) |

## Coding Agent 源码研究矩阵

| 项目 | 主语言 | 最值得研究 | 推荐入口 |
|---|---|---|---|
| Pi | TypeScript | 最小 Agent loop、事件流和 provider 抽象 | `packages/agent/src/agent-loop.ts` |
| Grok Build | Rust | TUI、runtime、tools 与 workspace 的纵向集成 | `crates/codegen/xai-grok-pager-bin/src/main.rs` |
| Codex | Rust | thread / turn 状态机、工具路由、app-server 协议与沙箱 | `codex-rs/core/src/session/turn.rs` |
| OpenCode | TypeScript | 持久化 Session、多客户端和服务端分层 | `packages/core/src/session/runner/llm.ts` |
| Gemini CLI | TypeScript | 工具策略、Subagent、ACP、eval 与集成测试 | `packages/cli/src/nonInteractiveCli.ts` |

默认先读 Pi 建立最小循环，再用另外四个项目逐层增加产品复杂度；不要同时精读五个仓库。

默认规则：

- 需要时按项目卡恢复，不做全量 clone。
- 研究结论要标明版本或 pinned commit。
- 只读研究不直接改上游；准备贡献时先核对 fork、upstream 和分支边界。

[返回 research](../README.md)

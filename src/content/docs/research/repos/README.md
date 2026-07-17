---
title: "第三方源码研究副本"
sidebar:
  hidden: true
---
# 第三方源码研究副本

本目录只放用于源码阅读、架构对比或临时贡献的外部仓库 clone。源码由上游 Git 管理，父仓只跟踪本页和 `_meta` 项目卡。

| 仓库 | 项目卡 |
|---|---|
| ResearchStudio | researchstudio (`researchstudio`) |
| Codex | codex (`codex`) |
| Gemini CLI | gemini-cli (`gemini-cli`) |
| Grok Build | grok-build (`grok-build`) |
| OpenCode | opencode (`opencode`) |
| Pi | pi (`pi`) |
| CSSwitch fork | csswitch (`csswitch`) |
| CC Switch | ccswitch (`ccswitch`) |
| Chinese Independent Developer fork | chinese-independent-developer (`chinese-independent-developer`) |

## Trellis 与 Coding Agent Harness 生态研究

以下 17 个项目覆盖 SDD、上下文工程、文件计划、Skill、Memory 和确定性治理。每个目录是独立浅层稀疏 clone，`origin` 指向个人 fork，`upstream` 指向原项目。

| 能力层 | 项目与项目卡 |
|---|---|
| 核心与 SDD | Trellis (`trellis`)、Spec Kit (`spec-kit`)、OpenSpec (`openspec`)、BMAD-METHOD (`bmad-method`)、Spec Workflow MCP (`spec-workflow-mcp`) |
| 上下文、计划与复利 | Superpowers (`superpowers`)、Planning with Files (`planning-with-files`)、GSD Core (`gsd-core`)、Agent OS (`agent-os`)、Compound Engineering (`compound-engineering`)、PRPs Agentic Eng (`prps-agentic-eng`)、Context Engineering Intro (`context-engineering-intro`) |
| Memory 与治理 | Acontext (`acontext`)、memU (`memu`)、claude-mem (`claude-mem`)、SpexCode (`spexcode`)、OpenLore (`openlore`) |

完整研究导航见 [Trellis 与 Coding Agent Harness 生态研究](../trellis-agent-harness-ecosystem-study/README.md)。

## LambChat 与生产级 Agent 平台生态研究

以下 14 个项目覆盖 Deep Agent 基础运行时、端到端产品平台、MCP 治理控制面和
多租户执行底座。每个目录是独立浅 clone，`origin` 指向个人 fork，`upstream` 指向
canonical 上游。

| 能力层 | 项目与项目卡 |
|---|---|
| 主项目与直接基础 | LambChat (`lambchat`)、DeepAgents (`deepagents`)、LangGraph (`langgraph`)、deepagents-backends (`deepagents-backends`) |
| 端到端与近邻平台 | OpsinTech Platform (`opsintech-platform`)、DeepAgentForce (`deepagentforce`)、Dify (`dify`)、LibreChat (`librechat`)、OpenClaw (`openclaw`) |
| 治理控制面与执行底座 | project-agi (`project-agi`)、MCP Gateway Registry (`mcp-gateway-registry`)、Preloop (`preloop`)、Lobu (`lobu`)、Loomcycle (`loomcycle`) |

完整研究导航见 [LambChat 与生产级 Agent 平台生态研究](../lambchat-ecosystem-study/README.md)。

## MinerU 与文档解析生态研究

以下 19 个项目均为独立浅层稀疏 clone：`origin` 指向个人 fork，`upstream` 指向原项目，模型权重和数据集不在本地 clone 范围内。

| 能力层 | 项目与项目卡 |
|---|---|
| 核心、组件与评测 | MinerU (`mineru`)、PDF-Extract-Kit (`pdf-extract-kit`)、OmniDocBench (`omnidocbench`)、DocLayout-YOLO (`doclayout-yolo`)、UniMERNet (`unimernet`)、MinerU-Diffusion (`mineru-diffusion`) |
| 工程型解析器 | Docling (`docling`)、Marker (`marker`)、PaddleOCR (`paddleocr`) |
| 专用文档 VLM | olmOCR (`olmocr`)、dots.ocr (`dots-ocr`)、MonkeyOCR (`monkeyocr`)、DeepSeek-OCR (`deepseek-ocr`)、GLM-OCR (`glm-ocr`)、Dolphin (`dolphin`)、OCRFlux (`ocrflux`) |
| 轻量转换与 ETL | MarkItDown (`markitdown`)、Unstructured (`unstructured`)、OpenParse (`open-parse`) |

完整研究导航见 [MinerU 与文档解析生态系统研究](../mineru-ecosystem-study/README.md)。

## ResearchStudio 生态研究语料

以下仓库均为独立浅层稀疏 clone：`origin` 指向个人 fork，`upstream` 指向原项目，父仓只跟踪项目卡和研究结论。

| 能力层 | 项目与项目卡 |
|---|---|
| 核心与索引 | ResearchStudio (`researchstudio`)、Awesome AI Auto-Research (`awesome-ai-auto-research`) |
| 自动研究主链 | AI-Scientist (`ai-scientist`)、AI-Scientist-v2 (`ai-scientist-v2`)、AI-Researcher (`ai-researcher`)、Agent Laboratory (`agent-laboratory`)、AutoResearchClaw (`auto-research-claw`)、FAROS (`faros`)、AutoR (`autor`)、InternAgent (`intern-agent`)、nano-scientist (`nano-scientist`) |
| Idea、证据与讨论 | Idea2Paper (`idea2paper`)、Co-Scientist (`co-scientist`)、PaperQA2 (`paper-qa`)、STORM (`storm`)、Paper Search MCP (`paper-search-mcp`) |
| Skill 与 artifact | AI Research SKILLs (`ai-research-skills`)、Scientific Agent Skills (`scientific-agent-skills`)、Agent-Native Research Artifact (`agent-native-research-artifact`) |
| 论文传播 | Paper2Poster (`paper2poster`)、PosterGen (`postergen`)、Paper2Video (`paper2video`)、Paper2Slides (`paper2slides`)、PPT Master (`ppt-master`)、PaperBanana (`paper-banana`)、posterly (`posterly`)、paper2anything (`paper2anything`) |

完整研究导航见 [ResearchStudio 生态系统研究](../researchstudio-ecosystem-study/README.md)。

## Garden Skills 与 Agent Skills 工程生态研究

以下 20 个项目覆盖开放规范、官方样例、内容集合、安装市场、Harness、自动激活、安全、评测和文本优化。每个目录是独立只读 Git 仓库，`origin` 指向个人 fork，`upstream` 指向原项目。

| 能力层 | 项目与项目卡 |
|---|---|
| 主项目与伴生实现 | Garden Skills (`garden-skills`)、Reacticle (`reacticle`)、GPT Image 2 101 (`gpt-image-2-101`) |
| 规范、官方样例与市场 | Agent Skills Spec (`agent-skills-spec`)、Anthropic Agent Skills (`anthropic-agent-skills`)、Claude Plugins Official (`claude-plugins-official`) |
| 发现、安装与生命周期 | Vercel Agent Skills CLI (`vercel-agent-skills-cli`)、Awesome Claude Skills (`awesome-claude-skills`)、Awesome Agent Skills (`awesome-agent-skills`)、Skill Factory (`skill-factory`) |
| 生产集合与 Harness | Superpowers (`superpowers`)、Addy Agent Skills (`addy-agent-skills`)、Matt Pocock Agent Skills (`mattpocock-agent-skills`)、Scientific Agent Skills (`scientific-agent-skills`)、Compound Engineering Plugin (`compound-engineering-plugin`) |
| 生成、触发、安全、评测与优化 | Skill Seekers (`skill-seekers`)、Claude Code Infrastructure Showcase (`claude-code-infrastructure-showcase`)、Skill Scanner (`skill-scanner`)、Agent Skills Eval (`agent-skills-eval`)、SkillOpt (`skillopt`) |

完整研究导航见 [Garden Skills 与 Agent Skills 工程生态研究](../agent-skills-ecosystem-study/README.md)。

## LangGraph 生态研究语料

以下 21 个项目均为独立浅层稀疏 clone：`origin` 指向个人 fork，`upstream` 指向原项目，`research-snapshot` 固定研究提交。

| 能力层 | 项目与项目卡 |
|---|---|
| 核心与标准 agent | LangGraph (`langgraph`)、LangGraph.js (`langgraphjs`)、LangChain (`langchain`)、Deep Agents (`deepagents`) |
| 官方模式与教学 | Supervisor (`langgraph-supervisor-py`)、Swarm (`langgraph-swarm-py`)、Bigtool (`langgraph-bigtool`)、ReAct Agent (`react-agent`)、LangGraph 101 (`langgraph-101`) |
| 应用、部署与索引 | Agent Chat UI (`agent-chat-ui`)、Gemini Fullstack (`gemini-fullstack-langgraph-quickstart`)、Agent Service Toolkit (`agent-service-toolkit`)、Aegra (`aegra`)、DeerFlow (`deer-flow`)、LangGraph4j (`langgraph4j`)、Awesome LangGraph (`awesome-langgraph`) |
| 同类框架 | Microsoft Agent Framework (`agent-framework`)、CrewAI (`crewai`)、Pydantic AI (`pydantic-ai`)、OpenAI Agents SDK (`openai-agents-python`)、Mastra (`mastra`) |

完整研究导航见 [LangGraph 生态系统研究](../langgraph-ecosystem-study/README.md)。

## FastVLM 与端侧高效 VLM 生态研究

以下 21 个项目均为独立浅层稀疏 clone：`origin` 指向个人 fork，`upstream` 指向原项目，模型权重、数据集和构建产物不进入父仓。

| 能力层 | 项目与项目卡 |
|---|---|
| 核心血缘与运行时 | FastVLM (`fastvlm`)、FastViT (`fastvit`)、MobileCLIP (`mobileclip`)、RayGen (`mobileclip-dr`)、LLaVA (`llava`)、MLX-VLM (`mlx-vlm`)、MLX Swift Examples (`mlx-swift-examples`)、MLX Swift LM (`mlx-swift-lm`) |
| 同类端侧模型 | LLaVA-NeXT (`llava-next`)、MobileVLM (`mobilevlm`)、MiniCPM-V (`minicpm-v`)、MiniCPM-V Apps (`minicpm-v-apps`)、SmolVLM (`smollm`)、Moondream (`moondream`) |
| 衍生与应用 | Mobile-O (`mobile-o`)、VLMKit (`vlmkit`)、USLS (`usls`) |
| token 效率替代路线 | SparseVLM (`sparsevlms`)、LLaVA-PruMerge (`llava-prumerge`)、FastV (`fastv`)、AdaptVision (`adaptvision`) |

完整研究导航见 [FastVLM 与端侧高效 VLM 生态系统研究](../fastvlm-ecosystem-study/README.md)。

## 系统提示词泄露生态研究

以下 17 个项目均为独立浅克隆：`origin` 指向个人 fork，`upstream` 指向原项目，父仓只跟踪项目卡和研究结论。

| 能力层 | 项目与项目卡 |
|---|---|
| 综合档案 | System Prompts Leaks (`system-prompts-leaks`)、AI Tools Prompts (`system-prompts-and-models-of-ai-tools`)、CL4R1T4S (`cl4r1t4s`)、jujumilk3 (`leaked-system-prompts-jujumilk3`) |
| 自定义 GPT 与知识库 | ChatGPT System Prompt (`chatgpt-system-prompt`)、The Big Prompt Library (`the-big-prompt-library`) |
| 阅读、官方数据与社区验证 | YeeKal (`leaked-system-prompts-yeekal`)、Grok Prompts (`grok-prompts`)、LeakHub (`leakhub`)、System Prompt Open (`system-prompt-open`) |
| 直接抽取与 benchmark | Effective Prompt Extraction (`prompt-extraction`)、PLeak (`pleak`)、RaccoonBench (`raccoonbench`)、Prompt Extraction Eval (`prompt-extraction-eval`)、SPE-LLM (`spe-llm`) |
| 功能重建与自适应 Agent | PRSA (`prsa`)、JustAsk (`justask`) |

完整研究导航见 [系统提示词泄露生态研究材料包](../system-prompt-leak-ecosystem-study/README.md)；一手来源与固定快照刷新规则见 [维护章](../system-prompt-leak-ecosystem-study/09-sources-and-maintenance.md)。

## Provider 切换与本地控制面研究

| 项目 | 研究边界 | 当前版本 | 最值得研究 |
|---|---|---|---|
| CSSwitch | Claude Science 的 provider gateway 与隔离运行时 | `0897e78` / `v0.6.0` | Rust gateway、Science 生命周期、真实账号隔离、外部 Skill bridge |
| CC Switch | 七类 AI 编程客户端的统一配置与本地代理控制面 | `f6e37ed` / `v3.17.0+6` | SQLite SSOT、live 配置投影、协议转换、热切换与故障转移 |

两者名字相近但产品边界不同：CSSwitch 深入管理一个宿主的隔离运行时，CC Switch 横向管理多个客户端的配置与流量。联合研究材料从 [research 总览](../README.md) 进入。

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

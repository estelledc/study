---
title: OpenHands — 开源 AI 软件工程师
来源: 'Wang et al., "OpenHands: An Open Platform for AI Software Developers as Generalist Agents", 2024'
日期: 2026-05-29
分类: AI / Agent
难度: 中级
---

## 是什么

OpenHands（前身叫 OpenDevin）是 2024 年开源的"AI 软件开发助手"——你给它一个 GitHub issue，它自己读代码、改代码、跑测试、提 PR。

日常类比：Devin（Cognition Labs 那个全网爆火的闭源 demo）是付费 AI 程序员；OpenHands 就是开源版的同款，本地跑你自己的 LLM 都行。

技术上它是一套 platform：装好之后起一个本地 web 界面，你在网页上跟它说"修一下这个 bug"，它就在隔离的 Docker 沙箱里 clone 仓库、跑命令、写 patch、最后把 PR 推到 GitHub。

## 为什么重要

不理解 OpenHands，下面这些事都没法解释：

- 为什么 2024 年"开源 AI 程序员"突然可落地——OpenHands 是早期把沙箱、事件流、评测接到一起的完整开源平台之一（同期还有 [[swe-agent]] 等）
- 为什么后来 CodeAct 2.1 能在 SWE-Bench Verified 报到约 53%——说明开源脚手架 + 强模型可以打进主流榜单（口径是 agent 版本，不是 2407.16741 论文主表）
- 为什么 Claude Code / Cursor agent / Cline 等产品常被拿来和它比抽象——EventStream + typed Action 成了常见参考系，但并非唯一源头
- 为什么企业敢私有部署 AI 编程助手——核心代码 MIT 开源，可自托管，代码不必出公司网

一句话：它是 2024 年 coding agent 赛道的重要开源底座，后面不少产品站在同类抽象上迭代。

## 核心要点

OpenHands 的设计可以拆成 **三块**：

1. **CodeActAgent（用 Python 代码当 action）**：让 LLM 直接写 Python 代码当动作，而不是传统的 JSON 工具调用。类比：以前给 LLM 一个工具菜单（"call_function: read_file, args: ..."）；现在直接让它写 `open('foo.py').read()`。代码比 JSON 更灵活、格式错误更少。

2. **Sandbox（Docker 隔离的执行环境）**：每个会话起一个独立的 Docker container，LLM 在 container 里跑命令。host 不暴露给它。类比：给 AI 一个虚拟机当工作台，它怎么折腾都不会把你的真电脑搞坏。

3. **Trajectory replay + multi-turn（保留所有历史 + 错误回喂）**：所有历史推理 + 错误信息都保留下来，下一步喂回 LLM。类比：医生看病不会忘记上次开了什么药——OpenHands 也不会忘记上一步它跑了什么命令、报了什么错。

## 实践案例

### 案例 1：装起来 + 跑起来

```bash
# 把 0.39.0 换成你要用的 release tag（见 GitHub Releases）
docker run -it --rm \
  -e SANDBOX_RUNTIME_CONTAINER_IMAGE=docker.all-hands.dev/all-hands-ai/runtime:0.39.0 \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -p 3000:3000 \
  docker.all-hands.dev/all-hands-ai/openhands:0.39.0
```

**逐部分解释**：

1. 外层容器跑 OpenHands UI；`runtime` 镜像是沙箱里真正执行命令的环境
2. 挂载 `docker.sock` 让它能再起子容器——方便，但等于把 Docker 控制权交给它，本机别当生产机
3. 浏览器打开 `localhost:3000`，配上 LLM API key（Claude / GPT-4 / 本地模型），即可发任务

### 案例 2：给一个 GitHub issue 让它修

典型工作流：

1. 你在网页上贴 issue 链接："`org/repo#123` 这个 bug 帮我修"
2. OpenHands clone 仓库到 sandbox 里
3. 它读代码、定位问题文件
4. 写 patch、跑测试
5. 测试通过 → 提 PR；测试失败 → 看错误信息再改一轮

整个过程大约 5–15 分钟，看任务复杂度。**全程你看着它跑**，每一步动作和返回都在网页上实时显示。

### 案例 3：CodeAct 比传统 ReAct 强在哪

传统 ReAct 风格的 LLM 工具调用——LLM 输出一段 JSON：

```json
{"tool": "read_file", "args": {"path": "foo.py"}}
```

LLM 经常把 JSON 写错——多个逗号、引号乱套、字段名拼错。

CodeAct 风格——LLM 直接输出 Python：

```python
content = open('foo.py').read()
print(content)
```

LLM 写 Python 通常比写 JSON tool call 稳——训练语料里代码远多于工具 JSON。CodeAct 相关工作报告过相对 JSON 工具调用约两成量级的成功率提升；OpenHands 默认 agent 走这条路。

## 踩过的坑

1. **Docker per-session 冷启动慢**：每会话起一个 container 要 5-10 秒（pull image + 启动 action server）。高 QPS 场景跑不动，需要 K8s pod warming pool。
2. **LiteLLM 接 100+ 模型但兼容性差异大**：换模型有时要重调 prompt；不同 provider 的 tool calling 行为不一致——别以为换个 API key 就完事。
3. **multi-agent 不是万能解**：论文把 multi-agent delegation 当能力点，但窄任务（单文件改 bug）上单 agent + 良好 tool 往往更稳；协作开销可能大于收益。
4. **Action 类型边界扩展不便**：每加一个新 Action 类（比如想接 MCP）都要改 Runtime dispatch、frontend 渲染、condenser 处理三处。号称"几行扩展"实际上常是百行级 PR。

## 适用 vs 不适用场景

**适用**：
- 想让 AI 代理你做"读代码 + 改代码 + 跑测试"的端到端任务
- 想在公司内私有部署，代码不出网
- 想魔改 agent 内部逻辑做研究——开源代码模块化清晰
- 想接自家的 LLM（包括开源模型）—— LiteLLM 支持 100+ 模型

**不适用**：
- 实时编辑器助手（边敲边补全） → 用 Cursor / Claude Code 体验更好
- 极端窄任务（只修单文件 bug） → 用 Aider 之类的 pipeline 工具更轻
- 资源受限场景（每会话 Docker 起 5-10 秒） → 高 QPS 跑不动
- 完全无 GitHub / 无 Docker 环境 → 装不起来

## 历史小故事（可跳过）

- **2024-03**：CMU + UIUC 等团队启动 OpenDevin——开源对标 Cognition Labs 刚发布的 Devin demo
- **2024-07**：第一版论文挂 arXiv（2407.16741），系统初步成型
- **2024-08**：因商标问题改名 OpenHands；repo 迁到 All-Hands-AI 组织
- **2024-10/11**：CodeAct 2.1 在 SWE-Bench Verified 报到约 53%（博客成绩，强依赖底层模型）
- **2024-12**：加强 multi-agent 与浏览器操作，评测覆盖扩到 GAIA / WebArena 等
- **2025**：推出 OpenHands Cloud；社区贡献者数百、star 数破 4 万量级

之后不少 coding agent 产品在 EventStream + typed Action 这类抽象上继续演进。

## 学到什么

1. **"开源版 Devin"首先是工程系统**——沙箱、轨迹、评测接在一起，才谈得上和闭源 demo 同台
2. **typed event 比自由文本好**——把每个动作做成结构化对象（CmdRunAction / FileEditAction），下游更稳
3. **Docker 沙箱是 LLM 操作 shell 的安全底线**——别让 LLM 直接跑在 host 上
4. **平台 > 单点 agent**——OpenHands 的价值更像 substrate，而不只是榜单再高 0.5%

## 延伸阅读

- 官方 repo：[All-Hands-AI/OpenHands](https://github.com/All-Hands-AI/OpenHands)（MIT，4 万+ star）
- 论文 PDF：[arXiv 2407.16741](https://arxiv.org/abs/2407.16741)（重点看 §3 框架抽象）
- CodeAct 2.1 成绩说明：[OpenHands 博客](https://www.openhands.dev/blog/openhands-codeact-21-an-open-state-of-the-art-software-development-agent)
- [[swe-agent]] —— OpenHands 的直系前作语境，提供 ACI 概念
- [[react]] —— think + act + observe 三元组的源头（ReAct 论文）
- [[agentless]] —— 反命题派："agent 复杂度边际收益是负的"

## 关联

- [[swe-agent]] —— OpenHands 把 ACI 升级成 typed Action Stream
- [[react]] —— ReAct 三元组里的 thought 字段被保留在 Action 元数据里
- [[autogen]] —— 多 agent 协作的 dialogue 派，OpenHands 选了 typed delegation
- [[metagpt]] —— SOP-driven 多 agent，与自由 delegation 互补
- [[agentless]] —— 反对者："agent 不是必需的"
- [[voyager]] —— skill library 思路，microagent 可看作工业版回声

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[swe-agent]] —— SWE-Agent — Princeton SWE-bench 解法
- [[voyager]] —— Voyager — LLM 终身学习智能体
- [[cline]] —— Cline — VS Code 自主编码代理
- [[continue]] —— Continue — 让 AI code review 跑成 git 跟踪的 PR status check

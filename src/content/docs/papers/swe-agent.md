---
title: 'SWE-Agent — Princeton SWE-bench 解法'
来源: 'Yang et al., "SWE-agent: Agent-Computer Interfaces Enable Automated Software Engineering", NeurIPS 2024'
日期: 2026-05-29
分类: AI / Agent
难度: 中级
---

## 是什么

SWE-Agent 是 Princeton 2024 年做的**专门给 LLM 设计的命令行界面**，让 LLM 在 SWE-bench（真实 GitHub issue 修复评测集）上自动改 bug。

日常类比：你给小学生一把瑞士军刀（什么都能干，但每个工具都要先学），结果他切水果反而切到手；不如直接给他一把削皮刀——只能削皮，但**怎么用都不会出错**。

[[react]] 给 LLM 任意 shell（`ls / cd / vim / sed` 全开），SWE-Agent 给 LLM 量身定制的精简菜单：每个工具都易学且不易出错，而且**反馈能让 LLM 看懂**（不像 shell 报错满屏 stack trace）。

## 为什么重要

不理解 SWE-Agent，下面这些事都没法解释：

- 为什么 OpenHands / Cline / Cursor / Claude Code 的工具列表都很短，且名字都很像（`view / edit / run`）——它们都学了 ACI 的设计
- 为什么"给 LLM 一个 shell 让它干活"听起来直觉但效果差——LLM 容易迷路、改错、卡死
- 为什么同一个 GPT-4 Turbo，换上 SWE-Agent 的 ACI，SWE-bench Lite 解决率从 Shell-only 的 11% 提到 18%（全文 12.47%）——**没换模型，主要换接口**
- 为什么 [[agentless]] 后来反过来说"agent 有时候不如 pipeline"——SWE-Agent 是 agent 路线代表，两条路在 2024 年正好对立

## 核心要点

SWE-Agent 的核心概念叫 **ACI（Agent-Computer Interface，agent 专用接口）**。它的三个支柱：

1. **专用工具，不是裸 shell**：核心是 `find_file` / `search_dir` / `search_file`（搜）+ `open` / `goto` / `scroll_up|down`（看）+ `edit`（改）+ 必要时 bash 跑测。输出为 LLM 优化——行号清晰、结果截断、错误简短。类比：给小学生的是削皮刀菜单，不是整间厨房。

2. **窗口式上下文管理**：不让 LLM 一次吞整文件，默认开约 **100 行**滑动窗口，用 `scroll_up / scroll_down / goto` 移动。类比：IDE 里用滚动条，而不是把整本说明书摊开。

3. **历史压缩**：跑了几十步后旧观察会爆上下文。SWE-Agent 把更早的观察折叠/截断，只保留最近几步详细输出。类比：长会议把前面讨论压成一句"已确定 X、Y"。

三个加起来：**LLM 看到的不是真实电脑，而是为它简化过的电脑**。论文里把这套设计叫 ACI，并证明接口本身就能拉开分数。

## 实践案例

### 案例 1：bug 修复全流程

GitHub issue：`json.dumps fails on datetime objects`。典型动作序列：

```
1. search_dir "json.dumps"     → 命中 src/json/encoder.py
2. open src/json/encoder.py    → 窗口显示约 100 行 + 行号
3. goto 247 / scroll_down      → 对准 default() 方法
4. edit 247 255 <新代码>       → 加 datetime 分支；失败则 lint 打回
5. python tests/test_json.py   → 跑相关测试
6. submit                      → 提交补丁
```

**逐部分解释**：

- `search_dir` 先定位，避免瞎 `open` 整库
- `open` + 窗口让模型只看当前片段，不撑爆上下文
- `edit` 必须带起止行号，改完自动回显窗口
- 测试用 bash/`python` 跑；输出会截断，只留关键失败信息

### 案例 2：与 [[agentless]] 对照同一 bug

| 维度 | SWE-Agent | [[agentless]] |
|------|-----------|---------------|
| 形式 | 多轮 agent 循环 | 定位 → 修复 → 验证 pipeline |
| Lite 分数 | 18%（GPT-4 Turbo + ACI） | 27.3%（GPT-4o + pipeline） |
| 失败模式 | 搜错路径 / 卡循环 / 连续 edit 失败 | 定位错文件就全错 |

**逐步对照**：

1. Agent：`search_dir` → `open` → `edit` → 跑测，下一步由模型自己定
2. Pipeline：先出可疑文件/行，再生成补丁，再统一验证——人定流程
3. 分数接近量级、思路相反：自由试错 vs 固定三步

### 案例 3：三种失败伪轨迹

1. **搜错路径**：`search_dir "utils"` → 打开 `tests/utils/` → 后续 edit 全改错文件
2. **edit 雪崩**：`edit` 弄坏缩进 → lint/测试红一片 → 模型反复改邻行仍找不到根因
3. **死循环**：`search_file` 无结果 → 换词再搜 → 直到耗尽步数/预算

这些失败直接启发 [[agentless]]："少让 agent 自由发挥，每步规定死。"

## 踩过的坑

1. **ACI 不等于"功能越少越好"**：早期只有 view/edit 时模型更易卡——没有 search 就只能挨个 `open`。**够用 + 易学**才是精髓
2. **edit 必须回显改后窗口**：只回"成功/失败"时模型会瞎改；SWE-Agent 改完立刻展示当前窗口
3. **测试输出要截断**：pytest 可能吐出数 MB；只保留首个失败 trace + 摘要，否则上下文爆
4. **不能给无约束破坏性命令**：早期有模型 `rm -rf` 测目录"修"过 bug——后来工具与权限做了收紧/白名单

## 适用 vs 不适用场景

**适用**：

- 真实 GitHub issue 修复（SWE-bench 主场）
- 中等代码库（大约 < 100 万行）——太小可直接 pipeline，太大单靠 ACI 也难
- 需要"探索 + 试错"、路径事先不清楚的任务
- 单实例还能接受大约几十步、数美元 API 预算的场景

**不适用**：

- bug 定位极明确 → [[agentless]] 式 pipeline 更稳、更便宜
- 高 stake 生产改动 → 多轮里任一步出错都会写进仓库
- 多文件大范围重构 → 默认窗口式编辑，跨文件协调弱；步数/美元预算也容易先耗尽

## 历史小故事（可跳过）

- **2024-05**：Princeton NLP（Yang / Jimenez 等，与 SWE-bench 同组）发 SWE-agent 论文（arXiv:2405.15793），提出 ACI，GPT-4 Turbo 达到全文 12.47% / Lite 18%
- **2024 中**：OpenHands（前身 OpenDevin）等开源项目复用"搜 / 看 / 改 / 跑"短工具集思路
- **2024-07**：[[agentless]] 论文主张不用复杂 agent，三步 pipeline 在 Lite 上到 27.3%（GPT-4o）
- **2025**：Claude Code / Cursor / Cline 等产品继续强调"工具不要太通用"——ACI 思路的产品化延伸

## 学到什么

1. **接口决定上限**：同一模型换 ACI，能力可明显变化；换 UI 往往比换模型便宜
2. **为 LLM 设计 UI ≠ 为人设计 UI**：人喜欢功能多；LLM 喜欢功能少、可预测、反馈结构化
3. **工具反馈格式是一等公民**：稳定行号、截断、lint 打回，比再塞一个万能 shell 更重要
4. **agent vs pipeline 是路线分歧**：SWE-Agent 代表自由循环，[[agentless]] 代表固定流水线——按场景选，不必站队

## 延伸阅读

- 论文 PDF：[arXiv:2405.15793](https://arxiv.org/abs/2405.15793)（Princeton NLP，NeurIPS 2024）
- 项目代码：[github.com/princeton-nlp/SWE-agent](https://github.com/princeton-nlp/SWE-agent)
- SWE-bench leaderboard：[swebench.com](https://www.swebench.com/)
- [[agentless]] —— 反 agent 论代表，与 SWE-Agent 对照
- [[react]] —— think → act → observe 循环，SWE-Agent 的控制骨架
- [[swe-bench]] —— 评测集，SWE-Agent 的主战场

## 关联

- [[react]] —— 提供 think → act → observe 循环，SWE-Agent 在其上加 ACI
- [[agentless]] —— 反对复杂 agent，与 SWE-Agent 形成路线分歧
- [[swe-bench]] —— 评测集，SWE-Agent 的主战场
- [[toolformer]] —— 早期"LLM + 工具"；SWE-Agent 把工具细化成"为 LLM 优化的接口"
- [[openhands]] —— 开源软件工程 agent，工具集设计受 ACI 影响

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[agentless]] —— Agentless — 反 Agent 派的 SWE-bench 解法
- [[apex-policy-exploration]] —— APEX — 给自进化 agent 配一张"策略图"防止它走老路
- [[ccopd-distillation]] —— CCOPD — 让多轮对话别被自己的旧话带偏
- [[code-as-agent-harness]] —— Code as Agent Harness — 把代码当 agent 的"骨架"来重新看 agentic AI
- [[copilot-rct]] —— Copilot RCT — AI 编程助手的第一个严格随机对照实验
- [[lacuna-program-holes]] —— LACUNA — 把 AI agent 的行动变成编译器先检查的程序洞
- [[misevolution-2509]] —— Misevolution — 自进化 agent 也会"越改越坏"，连顶配模型也躲不过
- [[openhands]] —— OpenHands — 开源 AI 软件工程师
- [[papers/react]] —— ReAct — Reasoning and Acting
- [[react-agent]] —— ReAct Agent — 推理和行动交替的工具使用范式
- [[self-evolving-agents-survey]] —— 自进化 AI agent 综述 — 给"会自己升级"的 agent 画一张统一地图
- [[soundness-bench]] —— SoundnessBench — 判断 AI 科学家会不会把坏点子当好点子
- [[swe-bench]] —— SWE-bench — 真实 GitHub Issue 评测
- [[continue]] —— Continue — 让 AI code review 跑成 git 跟踪的 PR status check
- [[crewai]] —— CrewAI — 把多 Agent 编排做成"组团队"

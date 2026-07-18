---
title: "一手来源与快照维护"
sidebar:
  hidden: true
---
# 一手来源与快照维护

## 1. 本章用途

前八章回答“看到了什么、如何理解”。本章只回答两个收尾问题：

1. 结论来自哪里？
2. 固定快照以后怎样更新，而不把“追最新”变成无限任务？

## 2. 项目一手入口

### 档案与知识库

| 项目 | 上游仓库 | 本轮主要证据 |
|---|---|---|
| System Prompts Leaks | <https://github.com/asgeirtj/system_prompts_leaks> | README、贡献规则、目录和样本组织 |
| System Prompts and Models of AI Tools | <https://github.com/x1xhlol/system-prompts-and-models-of-ai-tools> | 产品目录、prompt 与 tools JSON |
| CL4R1T4S | <https://github.com/elder-plinius/CL4R1T4S> | README、厂商目录和样本命名 |
| Leaked System Prompts | <https://github.com/jujumilk3/leaked-system-prompts> | README、文件头 `source:` 和时间线 |
| ChatGPT System Prompt | <https://github.com/LouisShark/chatgpt_system_prompt> | 字段协议、parser、index 和 Actions |
| The Big Prompt Library | <https://github.com/0xeb/TheBigPromptLibrary> | SystemPrompts、Security、Articles 和 Tools |

### 平台与官方数据

| 项目 | 上游仓库 | 本轮主要证据 |
|---|---|---|
| YeeKal | <https://github.com/YeeKal/leaked-system-prompts> | `lib/prompts.ts`、静态路由、front matter |
| Grok Prompts | <https://github.com/xai-org/grok-prompts> | xAI 官方 Jinja 模板和 safety prefix |
| LeakHub | <https://github.com/elder-plinius/LEAKHUB> | Convex schema、共识 action/mutation、React UI |
| System Prompt Open | <https://github.com/x-zheng16/System-Prompt-Open> | `data.js`、静态 gallery 和 oracle 字段 |

### 抽取、重建与评测

| 项目 | 上游仓库 | 对应论文或说明 |
|---|---|---|
| Effective Prompt Extraction | <https://github.com/y0mingzhang/prompt-extraction> | <https://arxiv.org/abs/2307.06865> |
| PLeak | <https://github.com/BHui97/PLeak> | <https://arxiv.org/abs/2405.06823> |
| RaccoonBench | <https://github.com/M0gician/RaccoonBench> | <https://aclanthology.org/2024.findings-acl.791/> |
| PromptExtractionEval | <https://github.com/liangzid/PromptExtractionEval> | <https://arxiv.org/abs/2408.02416> |
| PRSA | <https://github.com/yangyZJU/PRSA> | <https://www.usenix.org/conference/usenixsecurity25/presentation/yang-yong> |
| SPE-LLM | <https://github.com/solidlabnetwork/SPE-LLM> | <https://arxiv.org/abs/2505.23817> |
| JustAsk | <https://github.com/x-zheng16/JustAsk> | <https://arxiv.org/abs/2601.21233> |

## 3. 安全与厂商依据

| 主题 | 一手来源 | 用途 |
|---|---|---|
| System Prompt Leakage | <https://github.com/OWASP/www-project-top-10-for-large-language-model-applications/blob/main/2_0_vulns/LLM07_SystemPromptLeakage.md> | 确认 prompt 不是秘密或授权边界 |
| Prompt Injection 防御 | <https://cheatsheetseries.owasp.org/cheatsheets/LLM_Prompt_Injection_Prevention_Cheat_Sheet.html> | 输入、输出、隔离和最小权限 |
| 工程化泄露假设 | <https://aws.amazon.com/blogs/security/designing-for-the-inevitable-system-prompt-leakage-and-mitigations-in-generative-ai-applications/> | 按“最终可能泄露”设计 |
| Anthropic 官方 prompt | <https://platform.claude.com/docs/en/release-notes/system-prompts> | 官方版本与社区提取对照 |
| xAI 官方 prompt | <https://github.com/xai-org/grok-prompts> | 模板级真值对照 |
| ProxyPrompt | <https://aclanthology.org/2026.findings-acl.429/> | 功能保持、语义混淆型防御 |

## 4. 固定快照与实时远端

本材料的事实源是项目卡中的 `pinned_commit`，不是每次阅读时的远端 `main`。

两个字段必须分开：

- `pinned_commit`：正文分析对应的固定提交；只有重新审计并更新材料后才改变。
- `last_remote_main`：最近一次检查时上游默认分支的 HEAD；用于提示是否出现新增量。

示例：锚点仓本轮分析固定在 `9a0a06a3`。2026-07-17 检查时上游已前进到
`e280af55`，只修改 OpenCode、Claude Code skill、README 和配置样本，没有改变
本材料的领域分类、架构或安全结论，因此：

- 个人 fork 保持在 `155d2845`，作为当前恢复锚点。
- 本地研究副本与 `pinned_commit` 仍保持 `9a0a06a3`。
- 当前 upstream HEAD 单独记录在
  [2026-07-17 全量刷新](10-2026-07-17-refresh.md)，不覆盖 fork 恢复锚点。

这避免“材料写到一半，上游每次提交都迫使全文重算”。

## 5. 何时刷新正文

只有出现以下 external delta 才刷新研究材料：

- 新增一种此前未覆盖的采集、验证、攻击或防御方法。
- 官方 ground truth 推翻现有真实性判断。
- 上游重构改变项目架构、数据模型或核心控制流。
- 修复当前记录的关键复现缺口，例如 JustAsk 补齐公开 `data/`。
- 用户提出的问题无法由当前 00–09 章回答。

以下变化只更新 `last_remote_main`，不重写正文：

- 新增单个厂商或模型 prompt。
- README 文案、徽章、样式或非核心依赖更新。
- 不影响结论的样本修订。

## 6. 有界刷新流程

```bash
# 1. 只读取远端，不移动研究快照
git -C research-worktrees/<repo> fetch --depth=1 upstream main

# 2. 审计固定快照到远端 HEAD 的增量
git -C research-worktrees/<repo> diff \
  --stat <pinned_commit> upstream/main

# 3. 只有命中刷新门槛时，才更新本地研究快照
git -C research-worktrees/<repo> merge --ff-only upstream/main

# 4. 同步个人 fork
gh repo sync estelledc/<fork> --source <owner/repo> --branch main
```

执行第 3 步后必须同步修改：

- 对应 `_meta/<id>.md` 的 `pinned_commit` 和 `last_remote_main`。
- [项目清单](README.md)中的短 SHA。
- 受影响章节的文件数、代码路径和结论。

## 7. 收尾验收

每次刷新后至少验证：

```bash
python3 scripts/explorations/restore-projects.py --check
make lint
git diff --check
make check
```

并逐仓确认：

- `origin` 仍指个人 fork，`upstream` 仍指原仓。
- 工作树 clean。
- clone 仍由父仓 `.gitignore` 忽略。
- 两个大型档案继续保留本机 sparse-checkout 例外：
  - PromptCraft：`prompts/gpts/knowledge/P0tS3c/`
  - The Big Prompt Library：`CustomInstructions/ChatGPT/knowledge/P0tS3c/`

## 8. 当前停止状态

- 17 个 fork 已存在并核对 parent。
- 17 个本地 clone 已登记，研究副本保持 clean。
- 00–09 章已覆盖基础概念、来源、逐仓架构、评测、防御、FAQ 和维护。
- 没有运行真实 extraction、模型推理或产品 E2E。
- 后续默认进入按问题查阅，不再主动扩仓或追逐每次 prompt 更新。

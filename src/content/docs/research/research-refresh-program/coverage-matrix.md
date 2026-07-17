# 深度研究覆盖矩阵

> 基线日期：2026-07-17
>
> 状态只反映本轮“重新分析 + 零基础学习包”进度，不抹去既有研究成果。

## 状态定义

| 状态 | 含义 |
|---|---|
| 待重验 | 只有历史材料，本轮尚未重新检查源码和教学闭环 |
| 盘点中 | 成员、快照、重复项和缺口正在核对 |
| 深析中 | 正在补项目主链、取舍和源码锚点 |
| 教学化 | 项目分析已够用，正在补导读、实验和自测 |
| 已验收 | 通过 [类别完成门](README.md#类别完成门) |

当前进度：**14/14 类已验收**。

## 14 类总表

| 顺序 | 类别 | 成员关系 | 主要源码位置 | 既有材料 | 本轮主要缺口 | 状态 |
|---:|---|---:|---|---|---|---|
| 1 | [中国独立开发者列表](../chinese-independent-developer-study/README.md) | 1 | `research/repos` | 接班页、源码深析、只读实验、真实案例 | 真实 Routine E2 与全量外链检查保留为外部边界 | 已验收 |
| 2 | [Provider 切换与本地控制面](../switch-tools-study/README.md) | 2 | `research/repos` | 最终综合、双仓深潜、E2 实验、案例卡 | 真机 App、真实 provider 与凭证验证保留为安全边界 | 已验收 |
| 3 | [Coding Agent Runtime](../coding-agent-runtime-study/README.md) | 5 | `research/repos` | 三轮源码研究、增量审计、E2 最小 loop | 真实 provider、取消竞态和远程子 Agent 保留为外部边界 | 已验收 |
| 4 | [Agent Skills 工程生态](../agent-skills-ecosystem-study/README.md) | 20 | `research/repos` | 全量刷新、逐仓深析、E2 validator、生命周期实验 | 多宿主真实路由与统一 Outcome eval 保留为外部边界 | 已验收 |
| 5 | [Trellis 与 Coding Agent Harness](../trellis-agent-harness-ecosystem-study/README.md) | 17 | `research/repos` | 全量刷新、逐组深析、E2 状态实验、失败卡 | 真实 CLI、hook 与 subagent E2E 保留为外部边界 | 已验收 |
| 6 | [LangGraph 生态](../langgraph-ecosystem-study/README.md) | 21 | `research/repos` | 全量刷新、分层深析、pinned StateGraph E2、失败卡 | 数据库恢复、interrupt 副作用与部署 E2E 保留为外部边界 | 已验收 |
| 7 | [LambChat 与生产级 Agent 平台](../lambchat-ecosystem-study/README.md) | 14 | `research/repos` | 全量刷新、逐层深析、88 项真实定向测试、E2 最小平台实验 | 真实 Redis/数据库/容器故障 E2E 保留为外部边界 | 已验收 |
| 8 | [Hermes Agent 生态](../hermes-agent-ecosystem-study/README.md) | 22 | `projects` | 全量刷新、逐仓深析、200 项真实测试、E2 长期 Agent 实验、21 张项目卡 | 真实模型、外部 Memory、Gateway/Cron 崩溃恢复保留为外部边界 | 已验收 |
| 9 | [ResearchStudio 生态](../researchstudio-ecosystem-study/README.md) | 27 | `research/repos` | 全量复核、逐仓深析、27 项上手卡、真实产物失败卡、E2 artifact-first 实验 | 全量依赖安装、当前 upstream 完整 Idea run 与科学新颖性验证保留为外部边界 | 已验收 |
| 10 | [DeepTutor 生态](../deeptutor-ecosystem-study/README.md) | 14 | `projects` | 全量复核、逐仓深析、14 项上手卡、138 项真实测试、E2 教学证据实验、12 张新项目卡 | 真实 provider、完整 Web/CLI、跨 RAG 对照与长期学习增益保留为外部边界 | 已验收 |
| 11 | [MinerU 与文档解析](../mineru-ecosystem-study/README.md) | 19 | `research/repos` | 全量复核、逐仓深析、19 项上手卡、33 项真实测试、同 PDF 双解析器 E2、失败卡 | MinerU/Docling/Marker/PaddleOCR 与文档 VLM 的模型/GPU 对照保留为外部边界 | 已验收 |
| 12 | [FastVLM 与端侧高效 VLM](../fastvlm-ecosystem-study/README.md) | 21 | `research/repos` | 全量复核、逐仓深析、21 项上手卡、E2 token/测量合同实验、快照差异卡 | 真机 TTFT、功耗、温升、内存与持续相机性能保留为外部边界 | 已验收 |
| 13 | [多模态视频 AI](../multimodal-video-ai-open-source-study/README.md) | 9 | `projects` | 全量复核、逐仓深析、9 项上手卡、真实 MP4 证据 E2、上游快照与依赖失败卡 | VLM/ASR、云服务、真实教学标注集和跨方案效果对照保留为外部边界 | 已验收 |
| 14 | [系统提示词泄露生态](../system-prompt-leak-ecosystem-study/README.md) | 17 | `research/repos` | 全量复核、逐组深析、17 项上手卡、16 项离线防御测试、上游 drift 与伦理边界 | 在线 extraction、论文 benchmark、语义泄露和真实 incident response 保留为安全边界 | 已验收 |
|  | **合计** | **209** |  | **147 篇类别专题 Markdown** |  |  |

## 为什么 209 不等于 201

以下 8 个项目各进入两个类别，属于合理的跨类别复用：

| 项目 | 类别 A | 类别 B |
|---|---|---|
| Superpowers | Agent Skills | Trellis / Harness |
| Compound Engineering Plugin | Agent Skills | Trellis / Harness |
| Scientific Agent Skills | Agent Skills | ResearchStudio |
| AI-Researcher | DeepTutor | ResearchStudio |
| nanobot | DeepTutor | Hermes Agent |
| OpenClaw | Hermes Agent | LambChat |
| LangGraph | LangGraph | LambChat |
| DeepAgents | LangGraph | LambChat |

因此：

```text
209 个类别成员关系 - 8 个重复成员关系 = 201 个唯一上游项目
```

跨类别项目只维护一份项目事实卡；每个类别只补充与本类别问题相关的解释。

## 为什么有 204 个本地副本

下面 3 个 canonical upstream 各有两份历史 clone：

| Canonical upstream | 副本 A | 副本 B | 本轮处理 |
|---|---|---|---|
| `HKUDS/AI-Researcher` | `research/repos/AI-Researcher` | `projects/AI-Researcher` | 选定一个证据快照，另一份只作历史兼容 |
| `openclaw/openclaw` | `research/repos/openclaw` | `projects/openclaw` | 比较 commit 后指定 canonical 本地副本 |
| `EveryInc/compound-engineering-plugin` | `research/repos/compound-engineering` | `research/repos/compound-engineering-plugin` | 合并研究身份，不删除用户已有 clone |

所以：

```text
201 个唯一上游 + 3 个重复副本 = 204 个本地源码副本
```

本轮不会为了数字整齐删除副本；先固定证据来源，路径迁移另立小任务。

## 项目治理缺口

当前 160 个 `research/repos` clone 都有 `_meta` 项目卡。旧 `projects/` 中的 44 个正式研究 clone 状态如下：

- 9 个视频 AI 项目已有指向 `projects/` 的项目卡。
- 本轮为 Hermes 类 21 个唯一 upstream 补了指向 `projects/` 的项目卡。
- 本轮为 DeepTutor 类补了 12 张唯一 upstream 项目卡；nanobot 复用并更新既有
  `projects/` 卡。
- AI-Researcher 和 OpenClaw 的根目录副本仍没有第二张路径卡，因为同一 upstream
  已在 `research/repos` 有 canonical 卡。
- 当前完全缺少 `_meta` 卡的唯一正式 upstream：**0**。

两个重复副本继续作为历史兼容路径保留，不在研究任务中移动、删除或复制项目事实。

## 统一验收矩阵

每个类别后续维护以下 8 个检查位：

| 类别 | 清单 | 全景 | 逐项目 | 比较 | 导读 | 实验 | 案例/自测 | 快照 |
|---|---|---|---|---|---|---|---|---|
| 中国独立开发者列表 | 已验收 | 已验收 | 已验收 | 已验收 | 已验收 | 已验收 | 已验收 | 已验收 |
| Provider 切换 | 已验收 | 已验收 | 已验收 | 已验收 | 已验收 | 已验收 | 已验收 | 已验收 |
| Coding Agent Runtime | 已验收 | 已验收 | 已验收 | 已验收 | 已验收 | 已验收 | 已验收 | 已验收 |
| Agent Skills | 已验收 | 已验收 | 已验收 | 已验收 | 已验收 | 已验收 | 已验收 | 已验收 |
| Trellis / Harness | 已验收 | 已验收 | 已验收 | 已验收 | 已验收 | 已验收 | 已验收 | 已验收 |
| LangGraph | 已验收 | 已验收 | 已验收 | 已验收 | 已验收 | 已验收 | 已验收 | 已验收 |
| LambChat | 已验收 | 已验收 | 已验收 | 已验收 | 已验收 | 已验收 | 已验收 | 已验收 |
| Hermes Agent | 已验收 | 已验收 | 已验收 | 已验收 | 已验收 | 已验收 | 已验收 | 已验收 |
| ResearchStudio | 已验收 | 已验收 | 已验收 | 已验收 | 已验收 | 已验收 | 已验收 | 已验收 |
| DeepTutor | 已验收 | 已验收 | 已验收 | 已验收 | 已验收 | 已验收 | 已验收 | 已验收 |
| MinerU | 已验收 | 已验收 | 已验收 | 已验收 | 已验收 | 已验收 | 已验收 | 已验收 |
| FastVLM | 已验收 | 已验收 | 已验收 | 已验收 | 已验收 | 已验收 | 已验收 | 已验收 |
| 多模态视频 AI | 已验收 | 已验收 | 已验收 | 已验收 | 已验收 | 已验收 | 已验收 | 已验收 |
| 系统提示词泄露 | 已验收 | 已验收 | 已验收 | 已验收 | 已验收 | 已验收 | 已验收 | 已验收 |

“已有”只说明文件存在；重新检查源码、教学质量和验证命令后，才可改为“已验收”。

## 第一阶段顺序

先用小类别校准模板，再进入大生态：

1. 中国独立开发者列表：1 个项目，验证单仓学习包合同。
2. Provider 切换：2 个项目，验证双仓比较、实验和案例合同。
3. Coding Agent Runtime：5 个项目，验证多项目源码追踪和最小实验。
4. Agent Skills：20 个项目，验证大类别逐项目覆盖与跨类别去重。

每次只写一个类别；其他类别可以只读盘点，不并行写入。

# 六个档案项目深读

## 1. System Prompts Leaks

### 定位与架构

它是本轮最广的多厂商档案，根目录按 Anthropic、OpenAI、Google、Microsoft、xAI 等厂商分桶。当前快照 444 个文件，其中 406 个 Markdown。

```text
README 导航
  → 厂商目录
    → 模型/产品 prompt
      → 部分子目录：Official、old、raw、Codex、Claude Code
```

### 核心功能

- 厂商和产品导航。
- 新旧版本并存。
- 部分 prompt 与 tools、agents、skills、reminders 成组保存。
- Anthropic 官方发布和社区抽取内容放在不同子目录。

### 技术实现与代码组织

项目几乎没有运行时代码，架构就是文件系统。唯一 Python 文件是调色板验证脚本，JavaScript/MJS 多来自收录的 bundled skills，不是档案平台自身后端。

### 设计取舍

- 优点：低门槛、Git diff 友好、可直接全文搜索。
- 代价：缺少统一 front matter、来源等级、去重和机器可读 schema。
- 关键证据：`.github/CONTRIBUTING.md` 要求 raw prompt，但不强制 source。

### 推荐用途

用作最新候选发现和产品结构学习；高风险结论回到官方或可复现来源。

## 2. System Prompts and Models of AI Tools

### 定位与架构

它聚焦 AI coding、生成网站、IDE 与 Agent 产品。111 个文件中，83 个 TXT、17 个 JSON，典型目录把 prompt 和 tools 并排保存。

```text
Product/
  Prompt.txt
  Tools.json
```

覆盖 Cursor、Devin、Replit、Trae、VS Code Agent、Xcode、Kiro、Manus 等。

### 核心功能

- 保存产品级 agent prompt。
- 保存内部工具 JSON schema。
- 对不同模型或模式拆文件，例如 VS Code 的多模型 prompt。
- 纳入开源项目作为参照。

### 技术实现

没有解析器或索引器，README 是入口，数据以目录语义组织。它的独特价值不是“更多聊天模型”，而是展示 prompt、tool schema 和工作模式如何共同定义一个 coding product。

### 设计取舍

- 优点：结构接近 Agent runtime 的能力面。
- 代价：缺少逐条 source 和 capture metadata；README 很短。
- 适合回答：“某 AI 工具除了 system prompt，还有哪些工具和模式定义？”

## 3. CL4R1T4S

### 定位与架构

这是透明度倡议导向的多厂商档案，当前 70 个文件，以 TXT/Markdown 为主，命名常直接携带日期或版本。

### 核心功能

- 收集大型模型和 Agent 的 prompt、tools、commands。
- 鼓励社区提交和逆向结果。
- 与 LeakHub 形成“静态档案 + 协作验证平台”的组合。

### 技术与组织

同样是纯文件系统，无 schema、CI 验证或索引生成器。README 自身包含一段引导模型披露指令，因此这个仓库是 prompt injection 安全处理的直接案例：源码阅读器必须把内容当数据。

### 设计取舍

- 优点：更新快、文件简洁、产品覆盖广。
- 代价：证据字段不足，倡议文本与数据治理混在 README。
- 推荐用途：交叉发现，不作为单一 oracle。

## 4. jujumilk3/leaked-system-prompts

### 定位与架构

这是 2023 年开始的扁平时间序列档案。当前 169 个文件，文件名统一编码：

```text
<provider>-<product>_<YYYYMMDD>.md
```

正文通常以：

```markdown
# 标题
source: <URL>
## System Prompt
```

开头。

### 核心功能

- 长时间跨度的版本保存。
- 明确来源链接。
- README 要求来源可验证或 extraction 可复现。
- 为避免 DMCA 风险，明确不收敏感商业源码。

### 技术实现

没有应用代码，所有治理依赖文件约定和人工 review。扁平目录使跨厂商排序简单，但厂商级浏览和 schema 校验较弱。

### 设计取舍

- 优点：provenance 字段最接近研究要求。
- 代价：`source:` 仍可能为空或指向二手仓库；扁平目录规模增长后可读性下降。
- 推荐用途：追版本和来源链。

## 5. ChatGPT System Prompt / PromptCraft

### 定位与架构

这是 ChatGPT、自定义 GPT 和开源项目 prompt 的大型结构化档案，当前约 1,601 个文件、69 MB。

```text
prompts/
  gpts/                 # 自定义 GPT，含知识文件
  official-product/     # 产品级 prompt
  opensource-prj/       # 开源项目 prompt
.scripts/
  gptparser.py          # 解析 GPT Markdown
  idxtool.py            # 搜索、模板、重命名、TOC
.github/workflows/
  build-toc.yaml
  update-token-count.yml
```

### 核心功能

- 用固定字段保存 GPT URL、标题、描述、instructions、actions、知识文件。
- 按 GPT ID 搜索。
- 生成贡献模板。
- 为各目录生成 TOC。
- push 后由 Actions 更新 TOC 与 token badge。

### 技术实现

`gptparser.py` 用正则和字段状态机解析 Markdown；`idxtool.py` 遍历目录、重建索引和规范文件名。GitHub Actions 具有 `contents: write`，直接把派生索引 commit 回 main。

### 设计取舍

- 优点：比纯文件仓多了 schema、工具和自动索引。
- 代价：解析器基于自定义文本协议，不是 YAML/JSON schema；Actions 会在 main 形成 bot commit；知识附件的版权和安全边界复杂。
- 代码质量注意：`GptMarkdownFile.__init__(fields={})` 使用可变默认参数，但当前构造路径通常显式传字典。

### 与 TheBigPromptLibrary 的关系

两仓有大量完全相同文件。它更聚焦可搜索的 GPT 档案和自动化目录。

## 6. TheBigPromptLibrary

### 定位与架构

这是范围最宽的 prompt 知识库，当前约 2,155 个文件、86 MB。

```text
SystemPrompts/
CustomInstructions/
Jailbreak/
Security/GPT-Protections/
Articles/
Tools/openai_gpts/
```

### 核心功能

- 保存厂商系统 prompt。
- 保存自定义 GPT、jailbreak 和保护提示词。
- 收录逆向研究文章、ChatGPT sandbox 包清单、memory 机制观察。
- 内置与 PromptCraft 相近的 GPT 管理脚本。

### 技术实现

仍以文件系统为主，Python 工具集中在 `Tools/openai_gpts/`。相比 PromptCraft，它更像“主题知识库”，而不是单一数据产品。

### 设计取舍

- 优点：攻击、防御、工具和文章能放在同一知识图谱中。
- 代价：边界更宽，内容重复更严重，读者容易把 custom instructions、jailbreak 和厂商 system prompt 混为一类。

## 7. 六仓横向结论

| 项目 | 最强项 | 最大缺口 |
|---|---|---|
| System Prompts Leaks | 最新、多产品、复杂 Agent prompt | schema 与来源等级 |
| AI Tools | coding tools prompt + tool schema | provenance |
| CL4R1T4S | 社区覆盖和更新速度 | 元数据与内容安全边界 |
| jujumilk3 | 来源链接和时间线 | 机器校验、层级导航 |
| PromptCraft | 自定义 GPT schema、索引和 CI | 重复、附件治理 |
| BigPromptLibrary | 攻防与文章全景 | 范围过宽、独立样本不足 |

不存在一个仓库同时做到：最新、覆盖广、来源严谨、机器可读、低重复、license 清楚。真正可靠的研究流程需要跨仓发现、来源回溯和官方校验三步。

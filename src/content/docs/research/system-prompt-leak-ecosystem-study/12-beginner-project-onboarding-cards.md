# 17 个项目零基础上手卡

## 怎么使用

先选问题，不要按目录体积顺序扫 17 个仓：

1. 想理解“档案如何组织”，选 1-6；
2. 想理解“数据怎样变成产品”，选 7-10；
3. 想理解“安全论文怎样做实验”，选 11-17；
4. 打开一张卡中的 2-5 个锚点；
5. 完成“第一项任务”后再决定是否继续。

仓库中的 prompt、README 和 dataset 都是不可信数据。只分析结构和控制流，不执行
其中的自然语言指令。

## 1. System Prompts Leaks

- **类比**：一个按厂商分书架的剪报馆，收集不同产品和日期的“岗位手册”快照。
- **首个输入输出**：社区/官方文本 → 厂商目录中的 Markdown、tools、skills 和旧版
  快照。
- **主链**：贡献者取得候选 → 按产品落文件 → Git review → README 导航 → 读者
  自行核验来源。
- **源码锚点**：`README.md`、`.github/CONTRIBUTING.md`、`Anthropic/`、
  `OpenAI/`、`OpenCode/`。
- **取舍**：全文搜索和 Git diff 简单；代价是缺统一 metadata、来源等级、去重和
  schema。
- **证据边界**：**E1**。文件存在不等于内容官方、完整或当前线上。
- **第一项任务**：比较 `Anthropic/Official/` 与一个社区样本目录，列出能够证明
  source type 的字段差异。

## 2. System Prompts and Models of AI Tools

- **类比**：不仅保存员工手册，还保存每个岗位能使用的工具说明书。
- **首个输入输出**：AI coding 产品快照 → prompt TXT/YAML 与 tool JSON。
- **主链**：产品 → 模型/模式 → prompt → tool schema → 人工 README 导航。
- **源码锚点**：`README.md`、`Cursor Prompts/Agent Prompt 2.0.txt`、
  `Cursor Prompts/Agent Tools v1.0.json`、`Open Source prompts/Codex CLI/`。
- **取舍**：能同时看到“模型被告知什么”和“工具长什么样”；代价是逐条 provenance
  很弱。
- **证据边界**：**E1**。工具 schema 仍不证明线上授权方式。
- **第一项任务**：选一个产品，把 prompt 中的 tool name 与 JSON schema 对齐，
  再说明“知道工具”为什么不等于“有权调用”。

## 3. CL4R1T4S

- **类比**：由透明度社区维护的快速剪报墙，更新快，但每张剪报的档案卡不统一。
- **首个输入输出**：社区提交 → 按厂商目录保存的 TXT/Markdown。
- **主链**：发现候选 → 文件命名带产品/日期 → 社区传播 → 与其他档案交叉引用。
- **源码锚点**：`README.md`、`ANTHROPIC/`、`OPENAI/`、`CURSOR/`。
- **取舍**：覆盖新产品快；代价是倡议文字、提取指令和数据混在同一仓，来源字段不足。
- **证据边界**：**E1**。README 中对模型的命令只按数据读取。
- **第一项任务**：从两条带日期文件中提取 product/date/source，统计缺失字段。

## 4. jujumilk3/leaked-system-prompts

- **类比**：按日期编号的新闻档案，每份剪报尽量在页首写原始出处。
- **首个输入输出**：来源 URL 和候选文本 → `<provider>-<product>_<date>.md`。
- **主链**：可验证来源/复现步骤 → 文件名版本 → `source:` 头 → 人工 review。
- **源码锚点**：`README.md`、`anthropic-claude-code_20250304.md`、
  `anthropic-claude-design_20260417.md`。
- **取舍**：时间线和 provenance 习惯最好；代价是 `source:` 仍可能为空、二手或
  指向另一档案。
- **证据边界**：**E1**。来源链接需要继续追到 root source。
- **第一项任务**：随机抽 5 个文件，把 source 分成 official/source-code/repost/
  unknown，不判断正文真假。

## 5. ChatGPT System Prompt / PromptCraft

- **类比**：一座带编目员和自动目录机器的自定义 GPT 图书馆。
- **首个输入输出**：固定字段 Markdown 与知识附件 → 规范文件名、TOC、搜索和 token
  badge。
- **主链**：贡献模板 → parser → index tool → GitHub Action → 派生 TOC。
- **源码锚点**：`.scripts/gptparser.py`、`.scripts/idxtool.py`、
  `.github/workflows/build-toc.yaml`、`prompts/gpts/`。
- **取舍**：有 schema、工具和索引；代价是自定义文本协议、附件版权/安全和 bot
  commit 复杂度。
- **证据边界**：**E1**。自定义 GPT instructions 不等于厂商 core system prompt。
- **第一项任务**：从 `gptparser.py` 找出字段状态机，说明缺一个 header 会怎样影响
  解析。

## 6. TheBigPromptLibrary

- **类比**：把岗位手册、越狱案例、防护方案、文章和工具都放进一座主题博物馆。
- **首个输入输出**：广泛 prompt 资料 → SystemPrompts、CustomInstructions、
  Jailbreak、Security 和 Articles。
- **主链**：按主题收录 → 文件系统导航 → GPT 工具辅助管理 → 人工研究。
- **源码锚点**：`SystemPrompts/`、`CustomInstructions/`、
  `Security/GPT-Protections/`、`Articles/`、`Tools/openai_gpts/`。
- **取舍**：攻防全景广；代价是类别边界松、与 PromptCraft 大量重复、独立证据量
  容易被高估。
- **证据边界**：**E1**。目录数和文件数不能当独立来源数。
- **第一项任务**：各从 SystemPrompts、CustomInstructions、Security 选一条，
  说明为什么不能用同一种 authenticity 规则。

## 7. YeeKal/leaked-system-prompts

- **类比**：Markdown 是仓库，Next.js 是展厅；新增藏品后展厅自动生成页面和搜索。
- **首个输入输出**：带 front matter 的 prompt Markdown → 分组首页、搜索和详情页。
- **主链**：`prompts/` → `gray-matter` → `lib/prompts.ts` → static params →
  React page。
- **源码锚点**：`lib/prompts.ts`、`app/page.tsx`、
  `app/prompts/[company_id]/[slug]/page.tsx`、`add_frontmatter.py`。
- **取舍**：Markdown 单一事实源、路由自动；代价是 `sanitize: false` 与
  `dangerouslySetInnerHTML` 需要严格内容信任边界。
- **证据边界**：**E1**。未启动站点；内容展示质量不等于来源质量。
- **第一项任务**：追踪一个 Markdown 到详情 HTML，并指出 XSS 控制应放在哪一层。

## 8. xAI Grok Prompts

- **类比**：厂商公开的“手册模板”，其中还留有运行时需要填写的空格和条件分支。
- **首个输入输出**：Jinja 模板 + runtime variables → 某次具体 system turn。
- **主链**：模板 → 条件/变量渲染 → product-specific prompt → runtime context。
- **源码锚点**：`README.md`、`grok4_system_turn_prompt_v8.j2`、
  `ask_grok_system_prompt.j2`、`grok_4_safety_prompt.txt`。
- **取舍**：A 级官方 ground truth；代价是仍不含全部动态变量、工具、账户和部署
  状态。
- **证据边界**：**E1 + A 官方**，只限公开提交对应版本。
- **第一项任务**：从一个 Jinja 模板找变量和条件，解释为什么官方模板仍不等于一次
  完整 runtime capture。

## 9. LeakHub

- **类比**：多个目击者分别交口供，平台把相似口供分组，达到阈值后选一份代表。
- **首个输入输出**：登录用户的 leak submissions → request、consensus group、
  verified representative 与积分。
- **主链**：mutation insert → scheduler → internal action 计算相似度 →
  internal mutation 写状态。
- **源码锚点**：`convex/schema.ts`、`convex/leaks.ts`、
  `convex/requests.ts`、`src/components/submitLeakForm.tsx`。
- **取舍**：限制同一用户重复提交并做相似分组；代价是文本共识不是真实性，
  复制同一错误来源也能一致。
- **证据边界**：**E1**。没有运行 Convex/React；仓库未见自动化测试。
- **第一项任务**：追踪 `calculateSimilarity()` 到 request close，列出
  “相似”“独立”“官方”三种不同结论。

## 10. System Prompt Open

- **类比**：把研究结果装进一个无需后端的可携带展板，浏览器打开就能筛选比较。
- **首个输入输出**：`window.SP_DATA` → 过滤、排序、分页、oracle 对照和 UCB 展示。
- **主链**：手写 JS object → `index.html` 原生 JS → 静态 gallery。
- **源码锚点**：`data.js`、`index.html`、`README.md`。
- **取舍**：零构建、易镜像；代价是无 schema validation、数据测试和自动生成，
  consistency 容易被误读成准确率。
- **证据边界**：**E1**。45 条发布数据不能证明 JustAsk repo 可直接重跑。
- **第一项任务**：找一条有 oracle 和一条无 oracle 的记录，列出各自最多能证明什么。

## 11. JustAsk

- **类比**：像多臂老虎机教练，在已有策略和没试过的新策略之间分配实验预算，并把
  成败写进记忆。
- **首个输入输出**：策略统计、模型反馈和预算 → UCB 排名、会话、规则演化与抽取
  候选。
- **主链**：skill set → UCB → single/multi-turn trial → validation →
  knowledge update → next ranking。
- **源码锚点**：`src/skill_evolving.py`、`src/ucb_ranking.py`、
  `src/knowledge.py`、`src/validation.py`、`config/exp_config.yaml`。
- **取舍**：自适应探索与记忆有价值；代价是公开快照缺 `data/`，核心 CLI 不能
  开箱运行。
- **证据边界**：**E1 + 已验证失败卡**。本轮不运行任何真实抽取。
- **第一项任务**：只读 `calculate_ucb()`，手算“高成功老策略”和“低访问新策略”
  的排名变化。

## 12. PLeak

- **类比**：不是手写一句诱导词，而是在影子模型上反复替换 token，寻找更容易触发
  目标输出的钥匙形状。
- **首个输入输出**：shadow prompts/model → HotFlip trigger → target model
  outputs 与多指标。
- **主链**：target slices → gradients → top-k replacement → optimized query →
  sampler → defense/metrics。
- **源码锚点**：`Attack.py`、`Sampler.py`、`Defense.py`、`main.py`。
- **取舍**：攻击搜索可计算且考虑迁移；代价是 GPU/受限模型重，代码有缺 import、
  未定义变量和无 license。
- **证据边界**：**E1**。不安装、不执行攻击。
- **第一项任务**：比较 `Attack.py` 的优化目标与 `Sampler.py` 的评测目标，说明
  “训练成功”和“目标模型泄露”不是同一事件。

## 13. RaccoonBench

- **类比**：安全实验室不展示一个成功案例，而是把攻击、组合、防御和模型排成矩阵。
- **首个输入输出**：GPT prompt、attack taxonomy、defense condition 和 provider →
  response、ROUGE-L 与 susceptibility matrix。
- **主链**：Loader → SysPrompt → attack/defense transform → provider adapter →
  concurrent runs → parse/score。
- **源码锚点**：`Raccoon/loader.py`、`Raccoon/prompt.py`、
  `Raccoon/raccoon_gang.py`、`run_raccoon_gang.py`、`Data/defenses/`。
- **取舍**：显式覆盖 singular/compound 与 defended/defenseless；代价是历史模型
  ID、配置占位和本机路径影响复现。
- **证据边界**：**E1**。不向 provider 发送 benchmark。
- **第一项任务**：画出四象限，解释为什么只报平均 ASR 会隐藏 worst case。

## 14. Effective Prompt Extraction

- **类比**：先让多个侦探提出候选，再让鉴别器判断哪个候选最像真值，而不是相信第一
  个回答。
- **首个输入输出**：数据 × attack queries → completions → leakage estimator →
  top guess 与 PR/ROUGE。
- **主链**：API/HF adapter → reversible transform → optional 5-gram filter →
  candidate file → DeBERTa estimator → evaluation。
- **源码锚点**：`src/gpt-x-prompt-extraction.py`、
  `src/hf-prompt-extraction.py`、`src/common.py`、
  `src/evaluate-extraction.py`。
- **取舍**：清楚分开 candidate generation 与 candidate judging；代价是旧 API、
  GPU 与过时 checkpoint。
- **证据边界**：**E1**。历史论文数字不外推到 2026 产品。
- **第一项任务**：找 `common.py` 的 5-gram defense，再列出 exact filter 看不到的
  两类泄露。

## 15. PromptExtractionEval

- **类比**：不是一个应用，而是一整个实验工作台，分别改变模型大小、prompt 长度、
  攻击方式、指标和防御。
- **首个输入输出**：实验变量与 datasets → JSON/PDF 结果、文本/语义/功能指标。
- **主链**：run scripts → model generation → metrics → soft extraction /
  defense transformation → utility regression。
- **源码锚点**：`extractingPrompt/1.run_prompt_extraction.py`、
  `extractingPrompt/metrics.py`、
  `extractingPrompt/api_related_experiments/2.soft_extraction_experiments.py`、
  `extractingPrompt/defending/defend_pplfilter.py`。
- **取舍**：把逐字、语义、功能和 utility drop 分开；代价是脚本/结果多、硬编码
  CUDA/CWD、无统一 requirements/test/license。
- **证据边界**：**E1**。适合论文复盘，不是 SDK。
- **第一项任务**：从 `metrics.py` 选两个指标，分别说明“高分”究竟代表字符、语义
  还是任务能力。

## 16. PRSA

- **类比**：看不到原配方时，通过少量成品反推一个味道相近的新配方；文本可能不同，
  功能却接近。
- **首个输入输出**：目标 input/output 与同类样本 → category gradient →
  reconstructed/pruned prompt → unseen-input utility。
- **主链**：prompt attention generation → dimension differences → category gradient →
  attack generation → de-overfit/prune → multi-metric evaluation。
- **源码锚点**：`1_prompt_attention_generation.py`、`2_run_attack.py`、
  `scorers.py`、`demo_data/`。
- **取舍**：揭示“保住原文”不等于“保住功能”；代价是旧 OpenAI API、硬编码 Java
  路径、提交 pyc、无 license。
- **证据边界**：**E1**。不调用目标服务。
- **第一项任务**：比较 prompt-level similarity 与 output utility，构造一个“前者低、
  后者高”的例子。

## 17. SPE-LLM

- **类比**：一台小型演示机，把三种输入模板、几种模型格式、三种防御和多个指标接成
  一条直线。
- **首个输入输出**：dataset 与 attack template → formatted generation →
  guardrail/filter → exact/cosine/ROUGE。
- **主链**：`main_attack.py` / `main_defense.py` → model formatting →
  generation → `defense_methods.py` → `similarity.py`。
- **源码锚点**：`main_attack.py`、`main_defense.py`、`defense_methods.py`、
  `similarity.py`。
- **取舍**：链短、适合初学者；代价是模板写死、数据/依赖不完整、防御靠手工切换，
  每条样本可能重复加载模型。
- **证据边界**：**E1**。不运行模型。
- **第一项任务**：追踪一次 defense 输出到 similarity，指出 output filter 与
  authorization policy 的职责差异。

## 选择地图

| 当前问题 | 先读 |
|---|---|
| 找候选 prompt | System Prompts Leaks |
| 理解 prompt + tools | AI Tools |
| 追 source 和版本 | jujumilk3 |
| 做结构化档案 | PromptCraft |
| 做 Markdown 站点 | YeeKal |
| 找官方 ground truth | Grok Prompts |
| 理解社区共识 | LeakHub |
| 做静态研究 gallery | System Prompt Open |
| 理解自适应策略 | JustAsk |
| 理解 benchmark 矩阵 | Raccoon |
| 理解 soft extraction | PRSA / PromptExtractionEval |
| 读最短的攻防链 | SPE-LLM |

## 共通自测

1. 为什么 17 个项目不能按文件数排“可信度”？
2. 为什么 official template 仍不一定是 full runtime prompt？
3. 为什么两个仓库文本完全相同也可能只有一个来源？
4. 为什么 exact-match 防御不能覆盖 PRSA 的 threat model？
5. 如果 prompt 全公开，系统仍必须保留哪些硬边界？

# 17 个项目横向比较

## 1. 一张总表

| 项目 | 类型 | 事实源 | 主要实现 | 最值得学 | 主要风险 |
|---|---|---|---|---|---|
| System Prompts Leaks | 档案 | Markdown | 厂商目录 | 产品覆盖和版本切片 | 来源 schema 弱 |
| AI Tools | 档案 | TXT/JSON | 产品目录 | prompt + tools 联合阅读 | provenance 弱 |
| CL4R1T4S | 档案 | TXT/MD | 厂商目录 | 社区更新和透明度 | prompt injection、元数据弱 |
| jujumilk3 | 档案 | Markdown | 扁平时间线 | source 字段 | 二手来源混杂 |
| PromptCraft | 档案+工具 | Markdown | parser/index/Actions | custom GPT schema | 大量重复和附件版权 |
| BigPromptLibrary | 知识库 | 多格式 | 主题目录+工具 | 攻防全景 | 边界过宽 |
| YeeKal | 内容站 | Markdown | Next.js 静态生成 | MD→站点 | 未 sanitize HTML |
| Grok Prompts | 官方数据 | Jinja/TXT | 模板仓 | ground truth | 非完整 runtime |
| LeakHub | 协作平台 | Convex DB | React+Convex | 共识状态机 | 共识不等于真实 |
| System Prompt Open | 研究 gallery | JS object | 静态 HTML/JS | extraction/oracle 对照 | schema 与 license 缺口 |
| Effective Extraction | 研究 | 数据集/输出 | Python/DeBERTa | 候选与置信度分离 | 旧 API/模型 |
| PLeak | 研究 | shadow data | PyTorch HotFlip | 梯度优化 query | 重硬件、代码缺口 |
| Raccoon | benchmark | GPT/attack/defense | Python adapters | 四象限评测 | 历史模型、配置缺口 |
| PromptExtractionEval | 研究包 | 大量结果 | 实验脚本 | soft extraction/机制 | 难复现、组织松散 |
| PRSA | prompt stealing | I/O 样例 | LLM 反演+剪枝 | 功能复制威胁 | 环境硬编码 |
| SPE-LLM | 研究原型 | 数据集 | HF pipeline | 最短完整攻防链 | 依赖/数据不全 |
| JustAsk | Agent 研究 | 交互日志/知识 | UCB+memory | 自适应探索 | 公开 data 缺失 |

## 2. 按目标选项目

### 想快速看最新产品 prompt

首选：

1. System Prompts Leaks
2. AI Tools
3. CL4R1T4S

然后用 jujumilk3 的 `source:` 回溯，最后找官方或源码。

### 想研究历史版本

首选：

1. jujumilk3 的日期文件名。
2. YeeKal 的 front matter 和详情站。
3. System Prompts Leaks 的 `old/Official/raw` 分层。

### 想研究自定义 GPT

首选：

1. PromptCraft 的 GPT 字段协议、parser 和 index。
2. TheBigPromptLibrary 的 custom instructions、知识文件与文章。
3. Raccoon 的 GPTs benchmark 数据。

### 想研究 coding agent 架构

首选：

1. AI Tools 看 prompt + tools。
2. System Prompts Leaks 看 agents、skills、reminders。
3. Grok Prompts 看官方 Jinja source。
4. 再回到 [Coding Agent Runtime 研究](../coding-agent-runtime-study/README.md) 对照真实源码。

### 想搭建浏览站

- 最低成本：System Prompt Open 的静态 `data.js + index.html`。
- 内容工程：YeeKal 的 Markdown + front matter + Next.js。
- 多人协作：LeakHub 的 DB、request、auth 和 consensus。

### 想做安全评测

- 最容易理解：SPE-LLM。
- 最完整 taxonomy：Raccoon。
- 置信度判定：Effective Prompt Extraction。
- 自动 query 优化：PLeak。
- 自适应黑盒探索：JustAsk。
- 功能复制：PRSA。

## 3. 架构复杂度阶梯

```text
纯文件目录
  System Prompts Leaks / CL4R1T4S
        ↓
带元数据和脚本
  jujumilk3 / PromptCraft
        ↓
内容驱动站点
  YeeKal / System Prompt Open
        ↓
有状态协作平台
  LeakHub
        ↓
离线实验管道
  SPE-LLM / Raccoon / Effective Extraction
        ↓
优化与自适应系统
  PLeak / PRSA / JustAsk
```

复杂不等于更好。纯文件仓更适合长期审计；有状态平台更适合协作；研究管道更适合可控实验。

## 4. 数据组织模式

| 模式 | 项目 | 优点 | 代价 |
|---|---|---|---|
| 厂商目录 | System Prompts Leaks、CL4R1T4S | 易浏览 | 版本字段藏在文件名 |
| 扁平时间线 | jujumilk3 | 易排序和 grep | 规模大后难导航 |
| Front matter | YeeKal | 机器可读、可生成站点 | 需 schema/lint |
| 自定义文本协议 | PromptCraft | 人可读、能兼容复杂字段 | parser 脆弱 |
| JS object | System Prompt Open | 零构建部署 | 手工维护和校验弱 |
| 数据库 schema | LeakHub | 查询和状态迁移强 | 部署与迁移复杂 |
| 实验目录 | 学术项目 | 保留中间结果 | 代码与数据耦合、体积大 |

## 5. 验证模型对比

| 项目 | “验证”是什么意思 | 不能证明什么 |
|---|---|---|
| Grok Prompts | 厂商公开 | 线上完整动态上下文 |
| jujumilk3 | 来源可回溯/过程可复现 | 来源本身一定正确 |
| LeakHub | 两名独立用户文本相似 | 官方真实性 |
| System Prompt Open | 多次抽取一致；少量 oracle | 所有条目逐字准确 |
| Effective Extraction | 预测候选与 ground truth 的泄露程度 | 当前产品仍同样脆弱 |
| Raccoon | 在固定矩阵下达到 ROUGE 阈值 | 防御在别的模型有效 |
| PRSA | 新输入上的输出行为接近 | stolen prompt 与原文相同 |

## 6. 工程质量观察

### 相对产品化

- YeeKal：明确依赖和页面架构，但内容渲染安全需要加强。
- LeakHub：有 schema、索引、action/mutation 分层，但测试和数据真实性模型不足。
- PromptCraft：有 parser、CLI 和 Actions，但技术债与数据版权复杂。

### 相对研究化

- Effective Prompt Extraction：模块边界清楚，接口较旧。
- Raccoon：benchmark 抽象较完整，但配置和历史 provider 依赖明显。
- JustAsk：概念与代码模块丰富，但公开快照缺关键 data。

### 相对原型化

- PLeak、PromptExtractionEval、PRSA、SPE-LLM 都有论文级方法证据，但包含硬编码、缺依赖或未定义入口。

这不是论文质量排名，只是当前固定 Git 快照的工程可运行性判断。

## 7. License 概览

| License | 项目 |
|---|---|
| CC0 | System Prompts Leaks |
| GPL-3.0 | AI Tools、Raccoon、SPE-LLM |
| AGPL-3.0 | CL4R1T4S、Grok Prompts、LeakHub |
| MIT | PromptCraft、BigPromptLibrary、Effective Prompt Extraction |
| 当前快照无 license 文件 | jujumilk3、YeeKal、System Prompt Open、JustAsk、PLeak、PromptExtractionEval、PRSA |

README 的 “MIT” badge 或文字不等同于仓库根目录存在可执行 license grant。再利用前应以实际 license 文件和第三方内容来源为准。

## 8. 推荐的统一参考架构

如果把 17 个项目优点合并：

```text
prompts/<provider>/<product>/<version>.md
  + 强制 front matter
  + source graph / hash / license
  + schema lint / duplicate check
        ↓
静态阅读站
  + 搜索 / diff / 时间线 / evidence badge
        ↓
受控贡献
  + request / reviewer / oracle check
  + 不用“两个相似文本”直接代表官方
        ↓
安全评测
  + exact / semantic / functional 三层指标
  + fixed model/version/budget
        ↓
防御回流
  + 外置 authorization
  + prompt secret scan
  + input/output monitor
```

## 9. 最关键的选择原则

不要问“哪个项目最好”，先问：

1. 我要的是内容、真值、协作、评测还是防御？
2. 我需要逐字原文还是功能解释？
3. 我接受什么证据等级？
4. 我要固定历史还是追最新？
5. 我是否准备运行需要模型、GPU 和 API 的实验？

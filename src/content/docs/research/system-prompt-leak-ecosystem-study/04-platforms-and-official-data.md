# 平台与官方数据深读

## 1. YeeKal：Markdown 驱动的检索站

### 架构

```text
prompts/<company>/*.md
  → gray-matter 解析 front matter
  → remark 转 HTML
  → Next.js generateStaticParams
  → 首页分组/排序 + Fuse 搜索 + 详情页
```

技术栈：

- Next.js 15、React 19、TypeScript。
- `gray-matter` 解析元数据。
- `remark` + `remark-html` 渲染正文。
- Fuse.js 做客户端搜索。
- Tailwind 和 Radix UI 做展示。

### 核心数据模型

`lib/prompts.ts` 定义：

- `PromptData`：slug、company、model、date、SEO 和 source。
- `FullPromptData`：增加 `contentHtml`。
- `ModelGroupData`：按 company 分组，记录最新更新时间。

`getAllPromptData()` 同步扫描目录、解析 front matter、按日期排序，再把 featured company 提前。`getAllPromptPaths()` 为每条 prompt 生成静态路由。

### 数据流

```text
文件系统扫描
  → 每公司解析 Markdown
  → 组内按日期倒序
  → 公司按最新日期排序
  → 首页和搜索组件
  → /prompts/[company_id]/[slug]
```

### 值得学习

- Markdown 是单一事实源，站点是派生视图。
- 路由由内容自动生成，新厂商无需改代码。
- front matter 把“显示元数据”和“正文”分离。

### 风险

`remark-html` 使用 `sanitize: false`，详情页再用 `dangerouslySetInnerHTML`。仓库内容来自外部贡献时，这相当于信任 Markdown 产生的 HTML；生产部署需要严格 HTML sanitization、CSP 和贡献审查。

`add_frontmatter.py` 的 `make_frontmatter()` 在日期无效分支仍使用 `date_short`，存在未赋值路径。这说明迁移脚本不是稳健的数据管道。

## 2. Grok Prompts：官方 ground truth

### 架构与功能

仓库只有 12 个文件：

- 7 个 Jinja 模板。
- 3 个 safety prompt 文本。
- README 和 AGPL license。

Jinja 模板表明线上 prompt 不是固定纯文本，而是带变量和条件的渲染源。它覆盖：

- Grok 3/4/4.1 chat。
- X 上的 Ask Grok / Explain。
- API 模型的 safety prefix。

### 关键意义

这是少见的厂商官方真值，可用于：

- 校验 extraction 的语义相似度。
- 区分“官方模板”和“某次线上渲染结果”。
- 理解 product feature prompt 与 model safety prefix 的分层。

### 边界

官方仓也不是完整 runtime：

- 动态变量值未必公开。
- 工具 schema、用户上下文和运行时策略可能来自别处。
- 提交日期不等于每个线上环境的部署日期。

## 3. LeakHub：社区共识平台

### 架构

```text
React/Vite 前端
  ↕ Convex queries/mutations
Convex schema + actions
  ↕ GitHub OAuth
用户 / requests / leaks / points
```

技术栈：

- React 19、React Router 7、Vite 6。
- Convex 数据库、函数、scheduler 和 auth。
- Cloudflare Pages / Wrangler 部署。

### 数据模型

`leaks`：

- target、provider、type、正文、source URL。
- 登录/付费/工具 prompt 等采集上下文。
- submitter、verifiers、verification state。

`requests`：

- 想获取的目标、URL、提交者。
- 对应 leak IDs、关闭状态和关闭原因。

`users`：

- GitHub 身份、提交记录、积分。

### 共识状态机

```text
用户创建 request
  → 不同用户各提交一次 leak
  → scheduler 启动 processRequestConsensus
  → 文本规范化
  → 4-token shingle cosine 粗筛
  → 高相似时再算 Levenshtein
  → 阈值 >= 0.85 的最大组
  → 第一条成为 verified representative
  → request closed
  → submitter +100 / verifier +50 / requester +20
```

把相似度计算放到 `internalAction`，数据库写入放回 `internalMutation`，是为了绕开 mutation 的计算/内存限制，同时保持最终写事务化。

### 核心取舍

- 优点：不同用户、一次提交限制、相似分组比单人审核更抗偶然错误。
- 代价：这是文本共识，不是外部真实性验证。
- 代表文本取组内第一条，可能不是最完整或质量最高。
- 两个账号复制同一二手来源可通过验证。
- `insertVerifiedLeak` 允许内部 trusted import 直接绕过共识，信任边界转移到导入流程。

### 代码状态

当前代码有明显实验性质：

- `insertVerifiedLeak` 对象中 `url` 重复两次。
- request 去重会全表扫描再做大小写比较。
- points 注释和实现状态不完全一致。
- 没看到自动化测试目录。

## 4. System Prompt Open：单文件静态数据产品

### 架构

```text
data.js: window.SP_DATA = { prompts: [...] }
index.html:
  样式 + 表格 + 过滤 + 分页 + 展开对照 + UCB 可视化
assets/: 图片和 favicon
```

不需要构建工具和后端，GitHub Pages 可以直接托管。

### 数据模型与规模

当前 45 条：

- 36 个 provider。
- 类别：22 Open、12 Closed、6 FT、4 Verified、1 Code Agent。
- 方法：32 L14、8 H8+H4、5 JustAsk。
- 6 条有 oracle。
- consistency 范围 0.715 到 0.95，平均约 0.842。

### 前端实现

`index.html` 用原生 JS：

- 按 model/provider/category/method 搜索。
- 按字段排序。
- 每页 20 条。
- 展开 extracted 与 oracle 双栏。
- 用 stop-word 规则对正文做额外 redaction 展示。
- 键盘 `/` 聚焦搜索、方向键导航。

### 设计取舍

- 优点：零后端、数据与 UI 很容易镜像和审计。
- 代价：`data.js` 是手写全量对象，没有 schema validation、自动生成或数据测试。
- 45 条数据和 README 宣称曾出现 41/45 两种口径，使用时需绑定快照。
- 大量 `*******` redaction 有利于负责发布，但会降低逐字评测能力。

## 5. 四项目横向结论

| 维度 | YeeKal | Grok Prompts | LeakHub | System Prompt Open |
|---|---|---|---|---|
| 事实源 | Markdown | Jinja/TXT | Convex DB | JS object |
| 写入者 | repo contributor | 厂商 | 登录用户/内部导入 | 研究团队 |
| 验证 | 人工来源 | 官方 | 两用户相似共识 | consistency + 少量 oracle |
| 部署 | Next.js | 无应用 | Vite + Convex + Cloudflare | 静态页 |
| 最强项 | 阅读体验 | 真值 | 协作流程 | 研究结果比较 |
| 最大风险 | HTML 信任 | 不完整 runtime | 共识冒充真实 | consistency 误读 |

如果自己搭建研究平台，推荐组合：

- YeeKal 的 Markdown/front matter 作为可审查事实源。
- System Prompt Open 的 evidence/method/consistency 字段。
- LeakHub 的 request 与审核流程，但验证必须增加官方/source oracle。
- Grok Prompts 的 template/version 思维，避免把一次渲染当永久文本。

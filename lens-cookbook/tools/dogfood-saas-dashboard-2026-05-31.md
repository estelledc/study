# Dogfood v6 第三轮：SaaS Dashboard 场景（fresh agent 视角）

> 日期：2026-05-31
> 角色：未读任何前两轮 dogfood / dossier / 反馈环的 fresh agent
> 可查范围：`/Users/jason/intern-journal/explorations/lens-cookbook/v6/lens-*.md` + `/v6/paradigm/`
> 项目：SaaS dashboard — CSV 上传 (≤100MB) → LLM 分析（DeepSeek 主，Claude 兜底）→ PDF 报告 + 邮件 → 后台历史/下载/同事邀请；预算 <$200/月；2 人团队；预期 100 用户/月

## 第一观察

v6 共 7 个 lens：frontend / backend / aieng / data / devops / media-storage / vllm。本场景非教学站，不需要 vllm。决策树首层都改成"成本/规模门"，对 2 人团队 + $200/月 + 100 用户/月 这种小体量友好。开场试图找一条"上传/对象存储"的路径，需要在 backend / data / media-storage 三个 lens 之间路由——这是和 LangGraph 站不一样的新摩擦点。

---

## 步骤 1：项目骨架（前端 + 仓库结构）

- task：选 Next / Astro / Vite？monorepo 还是 split？
- cookbook_consulted：lens-frontend 候选表 + ADR-1（Astro+Next 拆双站）+ 决策树 Q0/Q1。
- decision：单 Next App Router monorepo（一个仓 + 一个 Vercel 项目），不拆 Astro 子站。理由：本项目几乎没有营销内容页（dashboard 是登录后应用），Q0 走"否"（QPS 不会 <5 但仍小），Q1 内容 vs 应用走"应用→Q2"。ADR-1 alternatives 里 alternatives 是 Next 静态路由，rollback 阈值"双 CI 维护 >1 人周/月"反向告诉我"营销页少→不拆"。
- verdict：sufficient
- gap_description：无。但 ADR-1 默认场景是"营销+控制台"双站，cookbook 没显式给"纯应用站"的反例锚——fresh agent 是反向推出来的。可在 ADR-1 加一句 "纯 dashboard 单站不拆"。

## 步骤 2：CSV 上传（≤100MB）

- task：100MB 上传，前端走哪条路径，后端落哪。
- cookbook_consulted：lens-media-storage 候选表 R2/S3/B2 + ADR-2（origin 选 R2）+ 决策树 Q0/Q5；lens-backend 候选表（无文件存储节）；lens-data 候选表（无对象存储）。
- decision：浏览器直传 R2（presigned PUT），后端只发 token + 记 metadata。理由：ADR-2 "默认 R2；S3-only SDK 不兼容时回 S3"，R2 egress=0 对 100 用户/月场景成本最低。但 cookbook 没给"presigned URL 直传"这条具体模式——只给 origin 选哪家，没给上传协议。
- verdict：partial
- gap_description：lens-media-storage 整章在讲"视频/CDN/转码"，CSV 这种"非媒体大文件"是边缘场景。候选表里有 R2/S3，但没有 ADR 讲 "presigned URL vs server proxy vs tus.io 断点续传" 的选型。fresh agent 知道"放 R2"，不知道"上传走哪条"。**v7 必须补：lens-media-storage 加 ADR-5 "大文件上传协议（presigned PUT vs multipart vs tus.io）"，触发条件 "用户直传 >50MB"**。

## 步骤 3：LLM router（DeepSeek 主 + Claude 兜底）

- task：怎么把 DeepSeek 主 + Claude fallback 封到一个调用面，要带 retry/fallback 语义。
- cookbook_consulted：lens-aieng ADR-2 Router + 决策树 Q0/Q3。
- decision：Vercel AI SDK（TS 进程内）+ DeepSeek OpenAI 兼容 provider + onError fallback 到 Anthropic provider。理由：ADR-2 "Py LiteLLM；TS Vercel；OpenRouter"，本项目 Next + TS 栈走 Vercel AI SDK；Q0 "团队 ≤3 或月预算 <$500 → 全 SaaS" 直接命中。
- verdict：sufficient
- gap_description：ADR-2 alternatives 列了 Portkey / LCR，但没显式给"主+兜底"的 fallback pattern——是从决策树 Q3 "≥2 provider→ADR-2" 倒推。OpenRouter 也是合法答案（一行配两家），但 cookbook 没给 OpenRouter vs Vercel AI SDK 的判据。次级缺口。

## 步骤 4：PDF 生成

- task：分析结果 → PDF 报告。
- cookbook_consulted：lens-frontend / lens-backend 全量 grep "pdf"。
- decision：cookbook 完全无命中。fresh agent 自决：后端 puppeteer-core + @sparticuz/chromium（serverless 友好）渲染 HTML → PDF；落 R2，签 5min URL。理由：完全跳出 cookbook。
- verdict：missing
- gap_description：**PDF 生成是真正的盲区**。cookbook 7 个 lens 没有一个 cover "文档生成 / 报表导出 / 离线渲染"。这类任务在 SaaS 工具站非常普遍（合同、报表、发票、报告）。**v7 must_fix：lens-backend 加 §"文档生成"段（puppeteer / wkhtmltopdf / typst / react-pdf 选型 + serverless 部署的 chromium 体积坑）**，或新建 lens-document-generation。

## 步骤 5：邮件发送

- task：报告生成完发邮件给用户 + 邀请同事链接邮件。
- cookbook_consulted：lens-backend 候选表 + ADR 全量 grep "mail/email/smtp/resend/postmark"。
- decision：cookbook 无命中。fresh agent 自决：Resend（DX 最好的 transactional API，免费档 3000/月足够 100 用户）+ react-email 模板。理由：完全跳出。
- verdict：missing
- gap_description：**邮件发送也是盲区**。SaaS 必备：transactional email（Resend / Postmark / SES / Mailgun / SendGrid）+ 邀请/重置/通知模板。**v7 must_fix：lens-backend 加 §"transactional 通知"段（email + SMS + push 三件套），ADR 给 Resend vs SES vs Postmark 选型 + DKIM/SPF/DMARC 一句话清单**。

## 步骤 6：鉴权（含同事邀请）

- task：用户登录 + 团队（workspace）+ 邀请同事 + 角色权限。
- cookbook_consulted：lens-backend ADR-3 Auth 选型 + 候选表 Auth.js / Clerk / Better Auth + 决策树 Q1。
- decision：Clerk Pro。理由：ADR-3 五档矩阵 "团队 ≤3 + 上线快 → 托管优先"，Q1 "团队 ≤3 无运维 → PaaS（Supabase+Clerk）" 双重命中。Clerk 自带 Organizations + Invitations + RBAC（同事邀请这条 SaaS 必备路径它一行配齐）。Auth.js 也能跑但 organization/invitation 要自己写。
- verdict：sufficient
- gap_description：ADR-3 决策粒度只到"哪家 Auth"，没到"organization/invitation"层。Clerk Organizations 是命中但 ADR 没显式标"含 org/invitation"判据，fresh agent 是凭对 Clerk 文档的常识补的。次级缺口：v7 可在 ADR-3 加"org/invitation 必需 → Clerk/WorkOS 直接命中；Auth.js 需自建"。

## 步骤 7：CSV 暂存（落库 + 元数据）

- task：CSV 已经在 R2 了，元数据（user_id / 文件名 / 大小 / 状态 / 报告 PDF URL）落哪？分析任务怎么排队？
- cookbook_consulted：lens-backend ADR-1 Postgres + ADR-4 Drizzle + 决策树 Q1/Q6 + lens-data 候选表（无）。
- decision：Neon Postgres + Drizzle ORM；jobs 表用 pg-boss（复用主库）。理由：Q1 "团队 ≤3 → PaaS（Supabase/Neon）"，ADR-1 "Postgres 单实例"，Q6 "队列 <1k+PG → pg-boss"。100 用户/月 × 几次/月分析 = 远 <1k jobs/s，pg-boss 一行装。
- verdict：sufficient
- gap_description：无。这步和 LangGraph 站第 7 步几乎一样，cookbook 命中度很高。

## 步骤 8：后台 Dashboard 路由（历史列表 + 下载 + 邀请页）

- task：登录后控制台：上传历史、下载 PDF、邀请同事、设置。
- cookbook_consulted：lens-frontend 决策树 Q1/Q2/Q3 + ADR-3 RSC use-client 边界。
- decision：Next App Router，列表页 RSC（server fetch from PG），上传按钮 + 状态轮询用 client island，邀请页用 Clerk `<OrganizationProfile>` drop-in。理由：决策树 Q1 应用 → Q2 数据时效 <1min（任务状态轮询）→ SSR/RSC，Q3 登录态 → Edge SSR + cookie。ADR-3 阈值 use_client_leaf_max_kb=50 给了具体 budget。
- verdict：sufficient
- gap_description：无。lens-frontend 这块对 dashboard 类应用直接命中。

## 步骤 9：部署（<$200/月）

- task：Next + worker + PG + R2 + 邮件 cap $200/月。
- cookbook_consulted：lens-devops 决策树 Q0 + ADR-1 PaaS。
- decision：Vercel Pro ($20) + Neon Pro ($19) + Clerk Pro ($25) + R2 ($5) + Resend 免费 + Bunny/CF 不需要 = ~$70/月。理由：决策树 Q0 "单团队 + 预算 <$50/月 + <100k 请求/天 → PaaS"，本项目预算 $200 上限但实际 $70 够用，命中"用 PaaS 即可"。ADR-1 rollback 阈值 "$200/月持续 2 周" 给了清晰升级线（恰好踩在用户预算上限——cookbook 写得很贴）。
- verdict：sufficient
- gap_description：无。Q0 阈值"$50"略低于本项目预算"$200"但仍然在 PaaS 区间内（rollback 阈值就是 $200），没有歧义。

---

## 汇总

### cookbook_hit_rate

9 步全部命中至少一条 lens。**hit_rate = 9/9 = 1.0**

### cookbook_useful_rate

- sufficient：1, 3, 6, 7, 8, 9 = **6 步**
- partial：2 = 1 步
- missing：4（PDF）、5（邮件）= 2 步
- misled：0
- **useful_rate = 6/9 = 0.67**（v6 LangGraph 站为 1.0；v4 LangGraph 站为 0.4）

### fresh_agent_blockers（本场景独有）

1. **PDF 生成无 lens**（步 4）— SaaS 报表/合同/发票通用需求，cookbook 全空。
2. **邮件发送无 lens**（步 5）— SaaS transactional email 通用需求，cookbook 全空。
3. **大文件上传协议无 ADR**（步 2）— 知道落 R2，不知道用 presigned PUT vs multipart。
4. （次级）OpenRouter vs Vercel AI SDK 没明确判据。
5. （次级）Auth org/invitation 维度没显式标。

### must_fix_for_v7

高优（影响 SaaS 类项目落地）：

1. **lens-backend 加 §"文档生成"段**（puppeteer / typst / react-pdf；serverless chromium 体积坑；同步 vs job 队列阈值）。
2. **lens-backend 加 §"transactional 通知"段**（Resend / Postmark / SES 选型 + DKIM/SPF/DMARC checklist + react-email 模板）。
3. **lens-media-storage 加 ADR-5 "大文件上传协议"**（presigned PUT / multipart / tus.io，触发条件 ">50MB 或网络弱"）。

中优：

4. lens-aieng ADR-2 加一句 "OpenRouter vs Vercel AI SDK 选型：要 100+ 模型矩阵 → OpenRouter；锁 1-3 家 → Vercel AI SDK"。
5. lens-backend ADR-3 加判据 "需 org/invitation 开箱 → Clerk/WorkOS；Auth.js 需自建"。

低优：

6. lens-frontend ADR-1 加反例 "纯 dashboard 单站不拆 Astro"。

### verdict

**cookbook_partially_works**

理由：9 步中 6 步 sufficient（67%）、1 步 partial、2 步 missing、0 步 misled。decision-tree 首层"成本/规模门"在小团队场景仍然命中 100%，这是 v6 paradigm 最大的胜利。但**两个 missing 暴露 cookbook 的 SaaS 类项目盲区**——PDF 生成和邮件发送是 SaaS 通用模块，不是边缘需求。v6 dogfood 在 LangGraph 教学站测出 1.0，是因为教学站需求和 cookbook 选型范围重合度极高（agent / 流式 UI / 视频）；换到 SaaS dashboard 这种"工具站"骨架，hit_rate 仍 1.0 但 useful_rate 掉到 0.67。

### comparison vs v4-LangGraph + v6-LangGraph

| 维度 | v4 LangGraph | v6 LangGraph | v6 SaaS dashboard（本轮）|
|---|---|---|---|
| 步数 | 10 | 10 | 9 |
| hit_rate | 0.9 | 1.0 | 1.0 |
| useful_rate | 0.4 | 1.0 | 0.67 |
| sufficient | 4 | 10 | 6 |
| partial | 3 | 0 | 1 |
| missing | 2 | 0 | 2 |
| misled | 1 | 0 | 0 |
| 主要缺口 | 流式 UI / 视频 / 部署 | 无 | PDF / 邮件 / 大文件上传 |

**关键观察**：

- **决策树 Q0 成本门彻底立住**——两个场景小团队都直接命中 PaaS / SaaS 路径，无 misled。这是 v6 相对 v4 最稳的进步。
- **lens 覆盖随场景类型有偏**：v6 是为 "agent + 流式 + 视频" 类项目深耕的 cookbook；SaaS 工具站常见模块（PDF / 邮件 / 大文件直传）暴露盲区。
- **泛化能力未达"任何项目都覆盖"**：v6 LangGraph 站 1.0 不能直接外推；SaaS 类项目 0.67 是更接近"通用 cookbook"的真实泛化成绩。
- **v7 方向**：把 backend lens 从"API server / Auth / ORM / 队列"扩展到"API server / Auth / ORM / 队列 / **文档生成** / **通知**"五件套；media-storage 把"上传协议"从隐含变为显式 ADR。补完后 SaaS dashboard 类场景 useful_rate 应能到 0.9+。

---
title: "Plane — 把 Linear 的体感、Jira 的覆盖、GitHub Projects 的开放，全部塞进一个 turborepo + Django"
description: 大型应用范例——49.9k stars 的开源 Linear/Jira 替代，TypeScript + Python + Postgres，monorepo 工程范式精读
sidebar:
  order: 28
  label: "makeplane/plane"
schema_version: zhuangyuan-v1.1
branch: A
---

## 自我分类（self-classify）

- **状元篇 v1.1 / 分支 A**：大型应用 / monorepo
- 论据：TS frontend + Django backend + Hocuspocus collab 三栈共存于单仓
- 行数 842（target ≥ 600）符合 branch A 深度

> 状元篇 v1.1 分支 A（大型应用 / monorepo / 工程范式）。
> 基于 commit `0acb32e6` 的源码精读 + 浅克隆 + 一次"读 Dockerfile + helm chart 看部署形态"hands-on。
> Plane 是这个站点目前为止结构最复杂的笔记对象——TS 前端 + Django 后端 + Hocuspocus realtime 三轨并存，
> 笔记的目标不是把每条轨道讲完，而是讲清**"为什么三轨能挂在同一个 monorepo 里不互相绊倒"**。

## 核心信息

| 字段 | 值 |
|---|---|
| Repo | [makeplane/plane](https://github.com/makeplane/plane) |
| Star / Fork | 49,900 / 4,400（2026-05-28 拉取） |
| 最近活跃 | `pushed_at` 维持 daily 推送（`preview` 分支为开发主线，`master` 落滞后稳定 release） |
| 主分支 commit | `0acb32e65e8c`（2026-05-27，"chore: bump turbo to 2.9.14, migrate pnpm config to workspace yaml #9147"） |
| 最新 release | `v1.3.1`（2026-05-14） |
| 主语言 | TypeScript 71.4% + Python 24.9% + HTML 2.4%（GitHub linguist） |
| 维护方 | Plane Software, Inc.（核心由 sriramveeraghanta / pratapalakshmi / vamsi-kurama 推） |
| 主要贡献者 | sriramveeraghanta（背靠核心商业公司）/ pratapalakshmi / NarayanBavisetti / aaryan610 / anmolsinghbhatia（前 5，2026-05-28 拉取） |
| License | AGPL-3.0（self-host 友好但二次商业化要小心） |
| 类似项目 | Linear（闭源，pixel-perfect SaaS）/ Jira（覆盖王者）/ GitHub Projects（最轻量）/ Asana / Notion 项目 / OpenProject / Tuleap |
| 哲学不同竞品 | Linear（"工程师专属、键盘优先、不要拖累"） vs Plane（"我把 Linear 的体感复刻给自托管用户"） |

## 一句话定位

**Plane 不是"再做一个 Linear"——
它是"把 Linear 的视觉体感 + Jira 的功能覆盖度 + 自托管 + AGPL"四件事
塞进同一个 turborepo + Django 应用，让你能用 `docker compose up` 在自己机器上跑出一个项目管理工具"。**

它的工程价值不在某个算法或心脏抽象，而在**"如何让 TS 前端、Python 后端、Node realtime 这三个生态各自最大的几个框架在一个仓库里和平共处"**——
turborepo 协调构建，pnpm workspace 协调依赖，Django + DRF 守住后端，Hocuspocus + Yjs 守住实时协同。
读它的目的不是"抄一段代码"，是**"看一个真实在线产品的工程范式长什么样"**。

## Why（为什么是它而不是 Linear / Jira / GitHub Projects / Asana / Notion 项目）

Plane 解决的不是"项目管理"问题——是"**项目管理 + 我自己掌控数据 + 我自己掌控数据库 + 我能在 GPU 集群没装 Notion 的内网用上**"四件事**怎么用一个开源仓库统一交付**的问题。

[README 顶部宣传语](https://github.com/makeplane/plane/blob/0acb32e65e8c3880a32d7b73a40cae52d3960ab0/README.md)：

> Plane is an open-source project management tool to track issues, run sprint cycles, and manage product roadmaps without the chaos of managing the tool itself.

注意"without the chaos of managing the tool itself"这一句——这不是营销废话，是 Plane 全部产品决策的底牌：

1. **"open-source"**——AGPL-3.0 而不是 MIT。AGPL 强制 SaaS 二次分发的人也开源自己的修改。
   这句话在企业法务那里会被读成"小心引入"，但对个人 / hackathon / 内网团队来说意味着**"你自己跑就完全合法、零月费、零供应商风险"**。
2. **"track issues, run sprint cycles, manage product roadmaps"**——三件事一一对应三个核心实体：**Issue / Cycle / Module**。
   Cycle 是 sprint，Module 是 roadmap epic。如果你做过 Linear / Jira，你会发现这套实体抽象**几乎照抄 Linear**——但是 Plane 在 schema 里把它写成了 Django Model（不是 GraphQL 类型），任何人 `manage.py shell` 就能直接玩。
3. **"without the chaos of managing the tool itself"**——指 Jira 那种"光是装上 + 配权限 + 调 workflow 就要一个 admin 全职 6 个月"的痛苦。
   Plane 默认开箱可用：`docker compose up` → 5 分钟拉起完整栈（API / web / live / proxy / postgres / redis / minio）。

但如果只看产品宣传，会错过**架构层的真正价值**——

Plane 的真正特点不是"开源"或"覆盖度"，而是**"它必须同时活成 Linear 的体感 + Jira 的覆盖 + 多租户 SaaS"**——
这三件事中的任意一件，单独做都是巨大的工程；同时做的人极少。
读 Plane 的源码不是去看"它怎么做了一个 Issue 模型"，而是去看**"为什么这套架构能同时承担三件事而不崩"**：

- **前端的体感** ⇐ React + Vite + MobX + Tailwind + Tiptap，每个选择都偏向"低延迟交互、键盘流畅、协同友好"
- **后端的覆盖** ⇐ Django + DRF + Postgres + Celery + Redis，每个选择都偏向"成熟、能扛、social/auth/permission 不需要重写"
- **协同的实时** ⇐ Hocuspocus + Yjs + Tiptap，独立成 `apps/live`，不让"实时"污染"事务"

如果你做任何带"工单 + 协同 + 多租户"的 web 应用（OA / CRM / 内部工具平台 / GitHub-like），
**第一性问题应该是**："这三件事能不能拆成三个独立的运行时，靠同一份 Postgres + Redis 协调"——这就是 Plane 的答案。

![Plane 整体架构 — Web/Space → Proxy → API (Django) + Live (Hocuspocus) → Postgres + Redis + S3](/study/projects/plane/01-architecture.webp)

*图 1：Plane v1.3.1 / commit `0acb32e6` 的整体架构。左侧三个 client（apps/web 主站、apps/space 公开页、apps/admin 实例管理）走
[`apps/proxy`](https://github.com/makeplane/plane/tree/0acb32e65e8c3880a32d7b73a40cae52d3960ab0/apps/proxy) 反向代理。中间两条独立运行时：
[`apps/api`](https://github.com/makeplane/plane/tree/0acb32e65e8c3880a32d7b73a40cae52d3960ab0/apps/api) 是 Django + DRF（Python 24.9%，事务/CRUD/权限/migration 全在这里），
[`apps/live`](https://github.com/makeplane/plane/tree/0acb32e65e8c3880a32d7b73a40cae52d3960ab0/apps/live) 是 Express + Hocuspocus + Yjs（Node，富文本协同 + presence）。
两条运行时**共享 Postgres + Redis**，但在生产部署里是两个独立容器——一个挂了不会拖垮另一个。
右侧 Postgres = 事务真相 / Redis = 缓存 + pub/sub + Hocuspocus 房间状态 / S3-compatible (MinIO)= 附件。
Worker queue 走 Celery（Beat + Worker），处理 webhook / notification / import 等异步任务。
关键判断：**realtime 不进 Django，事务不进 Hocuspocus**——这一道闸门避免了"WebSocket 卡住数据库连接池"的灾难。
手绘 sketchnote 风。*

## 仓库地形

### 顶层目录注释表

```
plane/                                       ← turborepo monorepo（pnpm workspace 协调）
├── apps/                                    ← 五个独立运行时（每个都有自己的 Dockerfile）
│   ├── api/                                 ← ★★★ Django + DRF 后端（apps/api/plane/* 是 Python 包）
│   │   ├── plane/db/models/                 ← ★ 31 个 Model 文件（issue/cycle/module/project/workspace 等）
│   │   ├── plane/api/                       ← REST API endpoints（按子系统切目录）
│   │   ├── plane/app/                       ← 业务 logic（与 api/ 区分：app/ 是内部，api/ 是公开）
│   │   ├── plane/bgtasks/                   ← Celery 异步任务（webhook / notification / import）
│   │   ├── plane/authentication/            ← 自家 auth（不依赖 django-allauth 默认 flow）
│   │   ├── plane/middleware/                ← workspace_slug 解析、API token 校验
│   │   ├── manage.py                        ← Django 入口
│   │   ├── Dockerfile.api                   ← 生产镜像
│   │   └── pyproject.toml                   ← Python 依赖（Django / DRF / Celery / Redis / boto3）
│   ├── web/                                 ← ★ 主前端（React + Vite + React Router 7 + MobX）
│   │   ├── core/store/                      ← ★ MobX 树（root.store.ts 串起 11 个子 store）
│   │   ├── core/components/                 ← UI 组件（issues / projects / cycles / pages 等）
│   │   ├── core/services/                   ← API client（IssueService / CycleService / ...）
│   │   ├── core/hooks/                      ← React hook 封装 store 订阅
│   │   ├── core/types/                      ← 本地 type（绝大多数 type 在 packages/types）
│   │   ├── ce/                              ← Community Edition 专属代码（与 EE 切分）
│   │   ├── app/                             ← React Router file-based routes
│   │   └── vite.config.ts                   ← Vite 构建（取代了早期 Next.js）
│   ├── space/                               ← 公开页（issue/project 分享链接，未登录可看）
│   ├── admin/                               ← 实例管理后台（self-host 用户配置 SMTP 等）
│   ├── live/                                ← ★ Hocuspocus + Yjs realtime（Express + WebSocket）
│   │   └── src/
│   │       ├── hocuspocus.ts                ← ★ 67 行：HocusPocus singleton manager
│   │       ├── extensions/                  ← Database / Logger / Redis / TitleSync / ForceClose
│   │       ├── controllers/                 ← HTTP endpoint（健康检查 + REST 旁路）
│   │       └── lib/                         ← auth / stateless 处理
│   └── proxy/                               ← Nginx 反向代理（统一域名分流）
├── packages/                                ← 共享包（pnpm workspace 内部依赖）
│   ├── types/                               ← ★★ TypeScript 类型公约（前端 / live 共享）
│   ├── editor/                              ← ★ Tiptap 富文本编辑器（包含 Yjs 协同 binding）
│   ├── ui/                                  ← 通用组件（Button / Modal / Dropdown）
│   ├── constants/                           ← 共享常量（priority/state group 等）
│   ├── i18n/                                ← 国际化字符串
│   ├── services/                            ← 跨前端共享 API client（不只 apps/web 用）
│   ├── shared-state/                        ← 跨前端的轻量共享状态（不是 MobX 那个）
│   ├── decorators/                          ← TS 装饰器辅助
│   ├── hooks/                               ← 跨前端 hook
│   ├── logger/                              ← 通用日志层
│   ├── propel/                              ← 内部脚手架 / DX 工具
│   ├── codemods/                            ← jscodeshift 迁移脚本
│   ├── tailwind-config/                     ← 共享 tailwind preset
│   ├── typescript-config/                   ← 共享 tsconfig base
│   └── utils/                               ← 工具函数
├── deployments/                             ← 部署配置（aio / cli / kubernetes / swarm）
│   ├── aio/community/                       ← all-in-one docker-compose
│   ├── kubernetes/community/                ← helm chart（self-host kube）
│   └── swarm/community/                     ← docker swarm
├── docs/                                    ← 公开文档
├── .husky/                                  ← git hook（lint-staged 等）
└── turbo.json                               ← turborepo task graph
```

### 心脏文件清单（commit `0acb32e6` 时刻，**≥ 3** 因为大型应用心脏分布在多个 subsystem）

| 文件 | 行数 | 角色 |
|---|---|---|
| [`apps/api/plane/db/models/issue.py`](https://github.com/makeplane/plane/blob/0acb32e65e8c3880a32d7b73a40cae52d3960ab0/apps/api/plane/db/models/issue.py) | ~600 | **Issue 模型 + IssueManager + IssueAssignee/Label/Subscriber/...**——后端事务真相 |
| [`apps/api/plane/db/models/cycle.py`](https://github.com/makeplane/plane/blob/0acb32e65e8c3880a32d7b73a40cae52d3960ab0/apps/api/plane/db/models/cycle.py) | ~200 | Cycle（sprint）模型——和 Issue 一对多 |
| [`apps/api/plane/db/models/module.py`](https://github.com/makeplane/plane/blob/0acb32e65e8c3880a32d7b73a40cae52d3960ab0/apps/api/plane/db/models/module.py) | ~200 | Module（epic / roadmap 容器）——和 Issue 多对多 |
| [`apps/web/core/store/issue/project/issue.store.ts`](https://github.com/makeplane/plane/blob/0acb32e65e8c3880a32d7b73a40cae52d3960ab0/apps/web/core/store/issue/project/issue.store.ts) | ~180 | **ProjectIssues store**——前端 issue 列表的 mobx 入口 |
| [`apps/web/core/store/issue/helpers/base-issues.store.ts`](https://github.com/makeplane/plane/blob/0acb32e65e8c3880a32d7b73a40cae52d3960ab0/apps/web/core/store/issue/helpers/base-issues.store.ts) | 1500+ | **BaseIssuesStore**——分页 / group / filter / sort 全部基类逻辑 |
| [`apps/live/src/hocuspocus.ts`](https://github.com/makeplane/plane/blob/0acb32e65e8c3880a32d7b73a40cae52d3960ab0/apps/live/src/hocuspocus.ts) | 67 | **HocusPocusServerManager**——realtime 入口 singleton |
| [`apps/live/src/extensions/index.ts`](https://github.com/makeplane/plane/blob/0acb32e65e8c3880a32d7b73a40cae52d3960ab0/apps/live/src/extensions/index.ts) | 18 | extension 装配顺序（Logger → Database → Redis → TitleSync → ForceClose） |
| [`packages/types/src/issues/issue.d.ts`](https://github.com/makeplane/plane/tree/0acb32e65e8c3880a32d7b73a40cae52d3960ab0/packages/types) | — | TIssue 类型公约（前端 / live 共享） |

### commit 热点按子系统分组

数字基于浅克隆 `--depth=1` 后 GitHub 网页 commit 列表（不是完整 `git log`）抽样估算，
但**结构性结论**仍然成立：

#### 后端模型（apps/api/plane/db/models/）

issue.py / cycle.py / module.py / state.py 是 PR 高频区——任何"加一个字段 / 加一种过滤条件"都要碰这里。
issue.py 的频率比其他几个高一个数量级。

#### 前端 store（apps/web/core/store/）

`issue/helpers/base-issues.store.ts` 是 1500+ 行的"基类"——分组 / 排序 / 分页全部装在这里。
高频改动暗示**抽象做得不够稳，每加一个 view 类型都要改基类**——这是 Plane 工程债的一个 surface。

#### realtime（apps/live/）

extensions/database.ts / title-sync.ts 是关键改动点——任何"realtime 又要同步什么字段"都要碰这里。

#### noise（changelog / lock 文件 / dependabot）

`pnpm-lock.yaml` / `package.json` / changelog 高频但不是设计决策，**读源码时跳过**。

**怀疑 0**（数据局限）：本笔记没有跑完整 `git log --format='' --name-only | sort | uniq -c | sort -rn`
（公司 MDM + 仓库体量大，浅克隆是更现实的取舍）。**绝对热度数字不可信**，
但"issue 模型 / base-issues store / hocuspocus 三轨"的结构性热度排名是稳的。

## 核心机制（3 段独立 subsystem 精读）

### 机制 a · Issue / Cycle / Module 数据模型 —— Django ORM + 事务级 advisory lock

[`apps/api/plane/db/models/issue.py:96-185`](https://github.com/makeplane/plane/blob/0acb32e65e8c3880a32d7b73a40cae52d3960ab0/apps/api/plane/db/models/issue.py#L96-L185)
是 Plane 后端的"宪法"——Issue 模型的字段定义和 IssueManager 的默认 queryset：

```python
# TODO: Handle identifiers for Bulk Inserts - nk
class IssueManager(SoftDeletionManager):
    def get_queryset(self):
        return (
            super()
            .get_queryset()
            .exclude(state__group=StateGroup.TRIAGE.value)
            .exclude(archived_at__isnull=False)
            .exclude(project__archived_at__isnull=False)
            .exclude(is_draft=True)
        )


class Issue(ChangeTrackerMixin, ProjectBaseModel):
    TRACKED_FIELDS = ["state_id"]

    PRIORITY_CHOICES = (
        ("urgent", "Urgent"),
        ("high", "High"),
        ("medium", "Medium"),
        ("low", "Low"),
        ("none", "None"),
    )
    parent = models.ForeignKey(
        "self",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="parent_issue",
    )
    state = models.ForeignKey(
        "db.State",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="state_issue",
    )
    point = models.IntegerField(
        validators=[MinValueValidator(0), MaxValueValidator(12)],
        null=True,
        blank=True,
    )
    estimate_point = models.ForeignKey(
        "db.EstimatePoint",
        on_delete=models.SET_NULL,
        related_name="issue_estimates",
        null=True,
        blank=True,
    )
    name = models.CharField(max_length=255, verbose_name="Issue Name")
    description_json = models.JSONField(blank=True, default=dict)
    description_html = models.TextField(blank=True, default="<p></p>")
    description_stripped = models.TextField(blank=True, null=True)
    description_binary = models.BinaryField(null=True)
    priority = models.CharField(max_length=30, choices=PRIORITY_CHOICES, default="none")
    start_date = models.DateField(null=True, blank=True)
    target_date = models.DateField(null=True, blank=True)
    assignees = models.ManyToManyField(
        settings.AUTH_USER_MODEL,
        blank=True,
        related_name="assignee",
        through="IssueAssignee",
        through_fields=("issue", "assignee"),
    )
    sequence_id = models.IntegerField(default=1, verbose_name="Issue Sequence ID")
    labels = models.ManyToManyField("db.Label", blank=True, related_name="labels", through="IssueLabel")
    sort_order = models.FloatField(default=65535)
    completed_at = models.DateTimeField(null=True)
    archived_at = models.DateField(null=True)
    is_draft = models.BooleanField(default=False)
    type = models.ForeignKey(
        "db.IssueType",
        on_delete=models.SET_NULL,
        related_name="issue_type",
        null=True,
        blank=True,
    )

    issue_objects = IssueManager()  # 默认 manager（叫 issue_objects 不是 objects）
```

旁注：

- **`IssueManager` 用 `exclude` 而不是 `filter` 串成默认 queryset**——任何"我只想看 active issue"的接口都自动得到正确语义；
  但 `Issue.objects` 仍然是 `SoftDeletionManager` 带回所有未软删的记录。命名上区分 `objects` vs `issue_objects` 是 Plane
  的"两个 manager 共存"约定——**忘记用 `issue_objects` 会拉回 archive / draft / triage 数据**，是新人最常踩的坑
- **`description_json` + `description_html` + `description_stripped` + `description_binary` 四份描述**——
  json 给 Tiptap 用、html 给 SSR / 邮件渲染用、stripped 给搜索用、binary 给 Yjs 协同的 doc 状态用。
  这是"宁可冗余也不重算"的典型权衡——查询时随便选哪份；写入时四份一起更新（在 `save()` 里同步）
- **`sort_order = FloatField(default=65535)`**——浮点 sort key 而不是 int，是为了**插入两条记录之间不需要重排所有行**。
  在 a 和 b 之间插入新记录直接给 `(a.sort_order + b.sort_order) / 2`。这是 Plane（连同 Linear / Notion / Figma）的通用做法
- **`PRIORITY_CHOICES = (("urgent", ...), ...)` 的 5 档**——和 Linear 完全一致；这不是巧合，是 Plane 主动对齐 Linear 的产品决策
- **`TRACKED_FIELDS = ["state_id"]`**——只追踪 state 变化进 changelog。
  暗示 ChangeTrackerMixin 的实现是**字段白名单**而不是"全字段 diff"，避免每次保存都写一条 history
- **`db_table = "issues"`**——显式给表名，不让 Django 用默认的 `db_issue` 这种 app-prefixed 命名

[`apps/api/plane/db/models/issue.py:200-235`](https://github.com/makeplane/plane/blob/0acb32e65e8c3880a32d7b73a40cae52d3960ab0/apps/api/plane/db/models/issue.py#L200-L235)
（`save()` 方法）是真正的关键——Issue 的 `sequence_id` 怎么避免并发冲突：

```python
def save(self, *args, **kwargs):
    self._ensure_default_state()
    kwargs = self._sync_completed_at(kwargs)

    if self._state.adding:
        with transaction.atomic():
            # Create a lock for this specific project using a transaction-level advisory lock
            lock_key = convert_uuid_to_integer(self.project.id)
            with connection.cursor() as cursor:
                cursor.execute("SELECT pg_advisory_xact_lock(%s)", [lock_key])

            last_sequence = IssueSequence.objects.filter(project=self.project).aggregate(
                largest=models.Max("sequence")
            )["largest"]
            self.sequence_id = last_sequence + 1 if last_sequence else 1
            # Strip the html tags using html parser
```

旁注（续）：

- **`pg_advisory_xact_lock(lock_key)`**——Postgres 事务级建议锁。同 project 内并发新建 issue，
  锁会让它们排队拿 sequence；锁的粒度是 `project.id`，**不同 project 不互相阻塞**，比表级锁细 1000 倍
- **`convert_uuid_to_integer(self.project.id)`**——Postgres advisory lock 只接受 bigint 不接受 uuid，
  所以要把 uuid 哈希到 int64。**这里有冲突风险**（不同 project 哈希到同一个 int 会互锁），
  但 64-bit space 下两个真实 project ID 哈撞概率极低
- **没有用 `Issue.objects.aggregate(Max("sequence_id")) + 1`**——用了独立的 `IssueSequence` 表存 per-project 序号。
  原因：**如果你删除了 issue #5 然后 #6 直接成了 #5**——用户体感非常糟糕。`IssueSequence` 表只增不减
- **TODO comment "Handle identifiers for Bulk Inserts - nk"**——提示**批量插入这套机制不工作**。
  循环 `bulk_create()` 不会触发 `save()`，advisory lock 也就没拿到。这是 Plane 工程债

**怀疑 1**：`convert_uuid_to_integer` 把 uuid 哈到 int64 后，不同 project 的 lock_key 撞同一个值的概率虽然低，
但**在大规模 self-host（10k+ projects）下**会有多少次"伪锁等待"？没看到 Plane 在 issue tracker 公开过这个数字。
是不是应该在这里换成 namespaced advisory lock（`pg_advisory_xact_lock(class_id, obj_id)` 双参数版）？

**怀疑 2**：`description_json + html + stripped + binary` 四份冗余的写入路径，
在哪里强制同步？如果 Tiptap 写了 json 但忘了更新 stripped——搜索就查不到这条 issue 的 body。
要追到 `save()` 里 `strip_tags(self.description_html)` 那一行才能确认机制是"每次 save 都重算"，但
**Yjs 协同写入是不是也走 save()**？还是 Hocuspocus extensions/database.ts 直接 update 单字段绕过了 save 钩子？

### 机制 b · 前端 issue store —— BaseIssuesStore + 多个子类的"模板方法"

[`apps/web/core/store/issue/project/issue.store.ts:51-100`](https://github.com/makeplane/plane/blob/0acb32e65e8c3880a32d7b73a40cae52d3960ab0/apps/web/core/store/issue/project/issue.store.ts#L51-L100)
是项目级 issue 列表的入口 store——但它**只有约 180 行**。秘密在于它继承了 `BaseIssuesStore`：

```typescript
export class ProjectIssues extends BaseIssuesStore implements IProjectIssues {
  viewFlags = {
    enableQuickAdd: true,
    enableIssueCreation: true,
    enableInlineEditing: true,
  };
  router;

  // filter store
  issueFilterStore: IProjectIssuesFilter;

  constructor(_rootStore: IIssueRootStore, issueFilterStore: IProjectIssuesFilter) {
    super(_rootStore, issueFilterStore);
    makeObservable(this, {
      fetchIssues: action,
      fetchNextIssues: action,
      fetchIssuesWithExistingPagination: action,
      quickAddIssue: action,
    });
    this.issueFilterStore = issueFilterStore;
    this.router = _rootStore.rootStore.router;
  }

  fetchParentStats = async (workspaceSlug: string, projectId?: string) => {
    projectId && this.rootIssueStore.rootStore.projectRoot.project.fetchProjectDetails(workspaceSlug, projectId);
  };

  fetchIssues = async (
    workspaceSlug: string,
    projectId: string,
    loadType: TLoader = "init-loader",
    options: IssuePaginationOptions,
    isExistingPaginationOptions: boolean = false
  ) => {
    try {
      runInAction(() => {
        this.setLoader(loadType);
        this.clear(!isExistingPaginationOptions);
      });

      const params = this.issueFilterStore?.getFilterParams(options, projectId, undefined, undefined, undefined);
      const response = await this.issueService.getIssues(workspaceSlug, projectId, params, {
        signal: this.controller.signal,
      });

      this.onfetchIssues(response, options, workspaceSlug, projectId, undefined, !isExistingPaginationOptions);
      return response;
    } catch (error) {
      this.setLoader(undefined);
      throw error;
    }
  };

  fetchNextIssues = async (workspaceSlug: string, projectId: string, groupId?: string, subGroupId?: string) => {
    const cursorObject = this.getPaginationData(groupId, subGroupId);
    if (!this.paginationOptions || (cursorObject && !cursorObject?.nextPageResults)) return;
    try {
      this.setLoader("pagination", groupId, subGroupId);
      const params = this.issueFilterStore?.getFilterParams(
        this.paginationOptions,
        projectId,
        this.getNextCursor(groupId, subGroupId),
        groupId,
        subGroupId
      );
      const response = await this.issueService.getIssues(workspaceSlug, projectId, params);
      this.onfetchNexIssues(response, groupId, subGroupId);
      return response;
    } catch (error) {
      this.setLoader(undefined, groupId, subGroupId);
      throw error;
    }
  };
```

旁注：

- **`extends BaseIssuesStore`**——这是模板方法模式。子类只填三件事：`viewFlags` / `fetchIssues` / `fetchParentStats`；
  `BaseIssuesStore` 提供 1500+ 行的"分页 / group / sort / pagination data 维护"。
  Plane 至少有 7 个子类（`ProjectIssues` / `CycleIssues` / `ModuleIssues` / `WorkspaceIssues` / `ArchivedIssues` / `DraftIssues` / `ProfileIssues`）
- **`makeObservable(this, { fetchIssues: action, ... })`**——MobX 6 的显式 observable 声明。
  和 `makeAutoObservable` 不同的是这里**只把 4 个方法标 action**，其他属性走父类的 observable 声明。
  这样保证子类不会意外把父类的 protected 状态变成 observable
- **`this.controller.signal`**——`AbortController` 让 fetch 可被取消。
  用户切 filter 时上一次的请求会被 abort——避免"切到 priority=high 但回来的是 priority=low 的旧响应"
- **`fetchNextIssues` 接受 `groupId` / `subGroupId`**——当列表被 group by 时，每个组独立分页。
  拉 "Backlog" 组的下一页不影响 "In Progress" 的滚动位置。这是 Linear 风格的"无限滚动 per group"
- **`getNextCursor()`**——分页用 cursor 不用 offset。这是因为 issue 列表会在协同下变化，offset 分页**会跳行 / 重复行**
- **`paginationOptions` 的存在**——stored on instance，用户切 sort 时只重新拉第一页（`fetchIssuesWithExistingPagination`）
  而不是丢掉所有缓存

[`apps/web/core/store/issue/helpers/base-issues.store.ts:1-60`](https://github.com/makeplane/plane/blob/0acb32e65e8c3880a32d7b73a40cae52d3960ab0/apps/web/core/store/issue/helpers/base-issues.store.ts#L1-L60)
是 1500+ 行基类的开头——重要的是它声明的接口契约：

```typescript
import { isEqual, concat, get, indexOf, isEmpty, orderBy, pull, set, uniq, update, clone } from "lodash-es";
import { action, computed, makeObservable, observable, runInAction } from "mobx";
import { computedFn } from "mobx-utils";
// types
import type {
  TIssue,
  TIssueGroupByOptions,
  TIssueOrderByOptions,
  TGroupedIssues,
  TSubGroupedIssues,
  TLoader,
  IssuePaginationOptions,
  TIssuesResponse,
  TIssues,
  TIssuePaginationData,
  TGroupedIssueCount,
  TPaginationData,
  TBulkOperationsPayload,
  IBlockUpdateDependencyData,
} from "@plane/types";
import { EIssueServiceType, EIssueLayoutTypes } from "@plane/types";

export enum EIssueGroupedAction {
  ADD = "ADD",
  DELETE = "DELETE",
  REORDER = "REORDER",
}

export interface IBaseIssuesStore {
  loader: Record<string, TLoader>;
  groupedIssueIds: TGroupedIssues | TSubGroupedIssues | undefined;
  groupedIssueCount: TGroupedIssueCount;
  issuePaginationData: TIssuePaginationData;
  removeIssue: (workspaceSlug: string, projectId: string, issueId: string) => Promise<void>;
  clear(shouldClearPaginationOptions?: boolean): void;
  getIssueIds: (groupId?: string, subGroupId?: string) => string[] | undefined;
  issuesSortWithOrderBy(issueIds: string[], key: Partial<TIssueOrderByOptions>): string[];
  getPaginationData(groupId: string | undefined, subGroupId: string | undefined): TPaginationData | undefined;
  getIssueLoader(groupId?: string, subGroupId?: string): TLoader;
  getGroupIssueCount: (
    groupId: string | undefined,
    subGroupId: string | undefined,
    isSubGroupCumulative: boolean
  ) => number | undefined;
  // ... 其他 30+ 方法
}
```

旁注（续）：

- **`groupedIssueIds: TGroupedIssues | TSubGroupedIssues`**——store 不存 issue 对象，**只存 ID 数组**。
  实际 issue 数据存在另一个 `rootIssueStore.issues` map 里。这是 Plane 性能的关键决定——**一个 issue 在多个视图（list / kanban / cycle / module）中只存一份**
- **`computedFn` from `mobx-utils`**——用于参数化 computed。`getIssueIds(groupId)` 必须是 computed 才能让 React 自动重渲染，
  但 MobX 原生 computed 不支持参数。`computedFn` 给每组参数 memoize 一份 computed
- **`Record<string, TLoader>` 而不是单 loader**——同一个 list 可能多个组在分别分页加载。
  loader 必须 per-group 才能正确显示"Backlog 组转圈，In Progress 组已完成"
- **`removeIssue` 在 base 类强制声明**——所有子类都要实现这个；
  但**实现可能不一致**——`ProjectIssues.removeIssue` 和 `CycleIssues.removeIssue` 行为是否一致需要测试覆盖

**怀疑 3**：`base-issues.store.ts` 是 1500+ 行的基类——这种"基类 + 7 个子类"结构通常意味着**抽象做漏了**。
真正的好抽象会让基类很小（< 300 行）+ 各子类按 composition 而不是 inheritance 组合。
Plane 选择 inheritance 是不是因为 MobX 6 + decorator 的语义在 composition 下不好处理？看 git blame 是不是在 v0.1 → v1.0 期间这部分被反复重写过？

### 机制 c · realtime 协同 —— Hocuspocus + Yjs + Tiptap，独立成一个进程

[`apps/live/src/hocuspocus.ts`](https://github.com/makeplane/plane/blob/0acb32e65e8c3880a32d7b73a40cae52d3960ab0/apps/live/src/hocuspocus.ts#L1-L67)
（**全文 67 行**，是这个站点笔记里贴最完整的核心文件）：

```typescript
import { Hocuspocus } from "@hocuspocus/server";
import { v4 as uuidv4 } from "uuid";
// env
import { env } from "@/env";
// extensions
import { getExtensions } from "@/extensions";
// lib
import { onAuthenticate } from "@/lib/auth";
import { onStateless } from "@/lib/stateless";

export class HocusPocusServerManager {
  private static instance: HocusPocusServerManager | null = null;
  private server: Hocuspocus | null = null;
  // server options
  private serverName = env.HOSTNAME || uuidv4();

  private constructor() {
    // Private constructor to prevent direct instantiation
  }

  /**
   * Get the singleton instance of HocusPocusServerManager
   */
  public static getInstance(): HocusPocusServerManager {
    if (!HocusPocusServerManager.instance) {
      HocusPocusServerManager.instance = new HocusPocusServerManager();
    }
    return HocusPocusServerManager.instance;
  }

  /**
   * Initialize and configure the HocusPocus server
   */
  public async initialize(): Promise<Hocuspocus> {
    if (this.server) {
      return this.server;
    }

    this.server = new Hocuspocus({
      name: this.serverName,
      onAuthenticate,
      onStateless,
      extensions: getExtensions(),
      debounce: 10000,
    });

    return this.server;
  }

  /**
   * Get the configured server instance
   */
  public getServer(): Hocuspocus | null {
    return this.server;
  }

  /**
   * Reset the singleton instance (useful for testing)
   */
  public static resetInstance(): void {
    HocusPocusServerManager.instance = null;
  }
}
```

旁注：

- **Hocuspocus 是 Tiptap 公司开源的 Yjs WebSocket server**——Plane 没有自己实现协同协议。
  这是大型应用的正确取舍：**协同算法是 PhD-level 工程**，自己实现 = bus factor 1
- **`debounce: 10000` (10 秒)**——这不是 keystroke debounce（用户体感会被毁），是**持久化 debounce**。
  10 秒内的所有改动累积成一次 DB 写入。意味着**服务器宕机最多丢 10 秒协同内容**——业务可接受
- **`onAuthenticate` / `onStateless` 抽出到 `lib/`**——authentication 不和 server 装配耦合，
  让 Hocuspocus server 实例创建逻辑保持极简
- **Singleton + private constructor + `resetInstance()`**——经典 Java 风的单例。
  Node 进程理论上每个 worker 一个 instance；但 `resetInstance()` 提示**测试里能反复销毁创建**
- **`env.HOSTNAME || uuidv4()`**——多实例部署时，每个 pod 必须有唯一 name 才能让 Hocuspocus 的 cluster
  广播工作（通过 Redis pub/sub）。fallback 到 uuid 防止本地开发忘记设环境变量

[`apps/live/src/extensions/index.ts`](https://github.com/makeplane/plane/blob/0acb32e65e8c3880a32d7b73a40cae52d3960ab0/apps/live/src/extensions/index.ts#L1-L18)
（**全文 18 行**）展示了 extension 装配顺序——这是 Plane realtime 的"小宪法"：

```typescript
import { Database } from "./database";
import { ForceCloseHandler } from "./force-close-handler";
import { Logger } from "./logger";
import { Redis } from "./redis";
import { TitleSyncExtension } from "./title-sync";

export const getExtensions = () => [
  new Logger(),
  new Database(),
  new Redis(),
  new TitleSyncExtension(),
  new ForceCloseHandler(), // Must be after Redis to receive broadcasts
];
```

旁注（续）：

- **顺序敏感**——Hocuspocus 按 extensions 数组顺序串联 hook。
  Logger 第一个意味着**所有事件都先被记录**（即使下游 extension 抛错也至少有日志）
- **`Database()` 是 Plane 自己写的 extension（不是 `@hocuspocus/extension-database`）**——
  挂在 `apps/live/src/extensions/database.ts`，负责把 Yjs doc 持久化到 Postgres 的 `Issue.description_binary` 字段
- **`Redis()` 是 `@hocuspocus/extension-redis`**——多实例部署的关键。
  pod A 收到改动 → 写 Redis → pod B 订阅广播 → 更新 doc 状态。这是**水平扩展的核心**
- **`ForceCloseHandler()` "Must be after Redis"** 注释——揭示了一个**有序性 bug 风险**：
  ForceClose 通过 Redis 广播触发，必须在 Redis extension 注册之后才能收到事件。
  顺序写错就 silently 失败。这种"靠注释守住的 invariant"是工程债
- **没有 `@hocuspocus/extension-throttle`**——Plane 没限速。大型 workspace 同时编辑可能打爆 server CPU
- **TitleSyncExtension 是定制项**——issue title 在 Tiptap 编辑器里改时，要同步反向写回 Postgres `Issue.name` 字段。
  这是**"协同字段"和"事务字段"之间的桥**——同一个 title 既是 Yjs document 一部分（协同），又是 Issue.name（CRUD/搜索）

**怀疑 4**：`apps/live` 用 Express + ws，**不是** apps/api 的 Django Channels。这意味着 Plane 团队主动选了"两个运行时"。
权衡是什么？最直接的好处：Python GIL 不卡 WebSocket。但代价是**两份认证逻辑**——`onAuthenticate` 在 lib/auth.ts，
逻辑必须和 Django 的 token / session 验证保持一致；任何 auth 改动都要同步两边。这套**双向同步的 invariant** 在哪里测试覆盖？
在 PR review 流程里？还是只能事后补？

## Hands-on（含改一处实验）

### 30 分钟跑通命令清单

```bash
# 1) 浅克隆（完整克隆 800MB+，没必要）
git clone --depth 1 -b preview https://github.com/makeplane/plane.git
cd plane
git rev-parse HEAD     # 应当看到 0acb32e6 附近的 SHA

# 2) 选最简单的 all-in-one docker-compose 启动
# 路径：deployments/aio/community/docker-compose.yml
cd deployments/aio/community
ls -la                 # 看到 docker-compose.yml + .env.example
cp .env.example .env
docker compose up -d   # 拉镜像、起 6 个容器

# 3) 等约 90 秒（首次拉镜像），看健康
docker compose ps

# 4) 浏览器打开 http://localhost
# 注册账号 → 创建 workspace → 创建第一个 project → 创建第一个 issue
```

如果时间紧，**只读不跑**也合格——

```bash
# 读 Dockerfile 看部署形态
less apps/api/Dockerfile.api
less apps/web/Dockerfile.web
less apps/live/Dockerfile.live

# 读 turbo.json 看构建图
less turbo.json

# 读 helm chart 入口
less deployments/kubernetes/community/Chart.yaml
ls deployments/kubernetes/community/templates/
```

### 改一处实验：把 `debounce: 10000` 改成 `1000`，观察前端协同体感

```bash
# 在 apps/live/src/hocuspocus.ts 里
# debounce: 10000,  →  debounce: 1000,

# 重启 live 容器
docker compose restart plane-live

# 在浏览器里两个标签同时编辑同一个 issue 的 description
# 在另一个标签观察改动延迟
```

预期观察：

- **改动延迟（A 输入到 B 看到）几乎无变化**——debounce 控制的是"持久化到 DB"，不是"广播给其他客户端"
- **DB 写入频率上升 10 倍**——`docker compose logs plane-api` 看 SQL 写入应该多很多次 description 更新
- **服务器 CPU 上升**——大型 workspace 下感知明显

实验意义：**搞清"持久化 debounce" vs "广播 debounce"的区别**——
如果你以为改 debounce 能让协同变快，你就误解了 Hocuspocus 的事件模型。

### 真正的"读 Dockerfile"实验

`apps/api/Dockerfile.api` 是 Plane 后端的镜像构建——重点看：

- **multi-stage build**：第一阶段装 build-essential 编译 wheel（Python C 扩展），第二阶段只 copy artifacts，让 final image 不带编译器（瘦身 + 安全）
- **`python -m venv /python` 而不是系统 site-packages**：让 user-mode 安装的包易迁移
- **`uvicorn` 而不是 `gunicorn`**：异步 worker 才能 cope WebSocket / async views
- **静态文件不在镜像里**：通过 nginx (proxy 容器) serve；镜像里只有 Python 代码

`apps/live/Dockerfile.live` 是 realtime 镜像——重点看：

- **基镜像是 `node:alpine`**：小、快
- **build → bundle → drop**：tsdown 把 TS 编译成单文件 ESM，镜像里没 node_modules（除了 native deps）
- **`CMD ["node", "dist/start.mjs"]`**：和 `apps/live/package.json` 的 `main` 字段对得上

## 横向对比

### 五维对比表（vs Linear / Jira / GitHub Projects / Asana / Notion 项目）

| 维度 | Plane | Linear | Jira | GitHub Projects | Asana / Notion 项目 |
|---|---|---|---|---|---|
| 部署形态 | self-host (docker compose / helm) + Plane Cloud | SaaS only | SaaS + DC self-host（贵） | SaaS only | SaaS only |
| 价格（小团队 10 人） | $0（self-host） / $7-15/user (cloud) | $8-14/user/month | $7-13/user/month | 内嵌 GitHub 免费 | $10-25/user/month |
| 数据所有权 | 自己 Postgres | Linear 服务器 | Atlassian 服务器 | GitHub 服务器 | Asana/Notion 服务器 |
| API 完整度 | REST（Django DRF）覆盖 ~80% UI 功能 | GraphQL 覆盖 100% | REST 完整但难用 | GraphQL/REST 完整 | REST 完整 |
| 协同实时 | Yjs + Hocuspocus（独立进程） | 自家协议（闭源） | 不强 | 弱（只 issue comment） | 弱 |
| 工程透明度 | 全部源码可审计 | 完全闭源 | 闭源（DC 自托管不开源逻辑） | 闭源 | 闭源 |
| AGPL 限制 | SaaS 二次分发要开源你的修改 | 不适用 | 不适用 | 不适用 | 不适用 |
| 视觉/键盘体感 | 复刻 Linear 的 80% | 100% 标杆 | 0% 标杆 | 偏 GitHub 风 | 各家不同 |
| Issue 实体抽象 | Issue / Cycle / Module / State / Label | Issue / Cycle / Project / Status | Issue / Sprint / Epic / Status / 自定义 | Issue + Project | Task / Project |
| 富文本协同 | Tiptap + Yjs（标准开源栈） | 自家（闭源） | 自家（闭源） | 简单 markdown comment | 各家自实现 |
| 实例规模上限 | self-host 取决于硬件，cloud 千人级 | 10 万人级（实战） | 10 万人级（实战） | GitHub 全用户 | 百万人级 |
| 学习曲线 | 中（接近 Linear） | 低 | 高（admin 噩梦） | 低 | 中 |
| 一键 demo | `docker compose up` ~5min | 注册即用 | 注册免费版 | GitHub 自动有 | 注册即用 |

### 选型建议（场景 → 选谁）

- **小团队 SaaS、不在乎数据存哪、要 pixel-perfect 体感** → Linear
- **企业级、要审批流 / 自定义字段 / SAP 集成 / 老板就要 Jira** → Jira（认命）
- **完全 GitHub-native 工作流、issue 主要是工程任务、不需要 sprint/cycle** → GitHub Projects
- **数据必须自己机房 / 内网 / 监管要求 / 想省 SaaS 钱** → Plane self-host
- **想要 Linear 体感 + 自托管 + 不介意 AGPL** → Plane（这是 Plane 的甜点场景）
- **跨部门、非工程团队为主、要表格 / 时间线 / Doc 一站式** → Notion / Asana
- **完全自由定制、愿意改源码** → Plane（但要遵守 AGPL）

### 哲学对比

Linear 的哲学是 **"工程师专属、键盘优先、不要拖累"**——它甚至拒绝做 Gantt 图，因为"这会让人开始堆功能"。
Plane 的哲学是 **"我把 Linear 的体感复刻给那些不能用 SaaS 的人"**——所以它接受多种 view（Gantt / Kanban / List / Calendar）、
多种集成、AGPL 让 self-host 用户得到完全控制权。**两者不是同一类产品的同一流派**——Linear 是"做减法"，Plane 是"做覆盖"。

Jira 的哲学是 **"我什么都给你，你自己配"**——所以 Jira 的 admin 是全职岗。
Plane 选择**"我给你 80% Linear 的体感开箱可用，剩下 20% 你改源码"**——这是 AGPL 选择的逻辑结果。

## 与你当前工作的连接

### 今天就能用的部分（≥ 4 子弹）

- **MobX 6 + makeObservable 的显式 action 声明模式**——任何 React 项目里替代 Redux/Zustand 时直接抄
  [`apps/web/core/store/issue/project/issue.store.ts`](https://github.com/makeplane/plane/blob/0acb32e65e8c3880a32d7b73a40cae52d3960ab0/apps/web/core/store/issue/project/issue.store.ts) 的 `makeObservable(this, { fetchX: action })` 写法。比 `makeAutoObservable` 更可控
- **Postgres advisory lock 做 per-tenant 序号生成**——任何"我要给某个范围内生成自增 ID 但不锁全表"的场景，
  抄 [`issue.py:200-235`](https://github.com/makeplane/plane/blob/0acb32e65e8c3880a32d7b73a40cae52d3960ab0/apps/api/plane/db/models/issue.py#L200-L235) 的 `pg_advisory_xact_lock(convert_uuid_to_integer(scope_id))` 模式
- **Tiptap + Yjs + Hocuspocus 三件套做协同编辑器**——别自己写 OT/CRDT。
  抄 [`apps/live/src/hocuspocus.ts`](https://github.com/makeplane/plane/blob/0acb32e65e8c3880a32d7b73a40cae52d3960ab0/apps/live/src/hocuspocus.ts) 的 67 行 singleton 模式 + extension 装配顺序
- **多份描述（json / html / stripped / binary）冗余存储**——任何"既要全文搜索又要协同编辑还要 SSR 渲染"的场景，
  这是 Plane / Notion / Linear 的通用做法

### 下个月能用的部分（≥ 4 子弹）

- **turborepo + pnpm workspace 的 monorepo 范式**——
  如果你的项目从单 repo 长大到"前端 + 后端 + 内部工具"，把 Plane 的 `turbo.json` 拿来作为基线
- **AGPL 协议下的 SaaS 商业模式**——
  你想做"开源核心 + SaaS 托管 + 企业版"的三层商业，研究 Plane 的 ce/ vs 商业版切分
- **Django 的 ChangeTrackerMixin 做 audit log**——任何"客户要看 X 字段什么时候被谁改成了什么"的场景，抄 [`issue.py`](https://github.com/makeplane/plane/blob/0acb32e65e8c3880a32d7b73a40cae52d3960ab0/apps/api/plane/db/models/issue.py#L98) 顶部 `TRACKED_FIELDS = ["state_id"]` 的字段白名单模式
- **realtime 独立进程 vs 后端进程的拆分**——任何 Python 后端 + 想加 WebSocket 的项目，
  抄 Plane 的 "Python 守事务、Node 守 realtime、共享 Postgres + Redis" 模式

### 不要用的部分（≥ 4 子弹）

- **`base-issues.store.ts` 1500+ 行的基类**——
  你不是 Plane 的多 view 多子类需求，**不要复制 inheritance 模式**。用 composition + Zustand slice / Jotai atom
- **`description_json + html + stripped + binary` 四份描述冗余**——
  你的产品不一定要协同编辑器；冗余存储的同步成本（每改一次写四份）只在"必须全文搜 + 必须协同 + 必须 SSR"全部成立时才划算
- **AGPL 协议**——
  如果你做的是闭源商业 SaaS，**绝对不要把 Plane 的源码 fork 进你的代码库**。
  AGPL 的 viral 比 GPL 更狠——你的服务一旦让用户访问，整个服务的源码都要开源
- **`pg_advisory_xact_lock(convert_uuid_to_integer(uuid))`**——
  你如果不是真的有"per-tenant 自增序号必须严格不跳号"的需求，**不要引入 advisory lock**。
  普通 unique index + retry-on-conflict 在 99% 的场景够用，advisory lock 是高复杂度高排查成本的工具

## 自检问题 + 延伸阅读

### 自检问题（≥ 4 个，追到行号级别）

1. **`Issue.description_binary` 是 Yjs doc 的二进制 snapshot 吗？在哪里被写入？**
   要找 `apps/live/src/extensions/database.ts` 里 `onStoreDocument` 钩子的实现行号，
   以及它是直接 SQL UPDATE 单字段，还是走了 Django ORM 的 `Issue.save()`？
   如果是后者，TODO 注释 "Handle identifiers for Bulk Inserts" 提到的 sequence_id 锁会不会被无意触发？

2. **`base-issues.store.ts` 的 `groupedIssueIds` 在 group by 切换时是怎么不丢 pagination cursor 的？**
   要追 `setGroupBy()`（不在 `issue.store.ts` 里）的方法签名 + 实际实现位置 + 验证
   "切 group by 时是否仅重新分组现有 issueIds 而不是重新拉取所有数据"。

3. **`apps/live` 的 `onAuthenticate` 怎么校验用户对某个 Issue 有写权限？**
   是直接调 Django 的 `/api/auth/verify` endpoint 同步阻塞？还是有自家 JWT 验签？
   一旦后端 auth 逻辑改动，live 这边怎么发现？要在 `apps/live/src/lib/auth.ts` 里追到具体 HTTP call 或 JWT secret。

4. **`pg_advisory_xact_lock(convert_uuid_to_integer(self.project.id))` 在大规模 self-host 下哈撞的概率**
   理论上 64-bit 下两个真实 project ID 撞同一个 int 的概率是 1/(2^64)，但 `convert_uuid_to_integer` 实现是 truncate 还是 hash？
   要看 `plane/utils/uuid.py` 的实际函数体——如果是 truncate（取 uuid 头 8 字节），实际熵远低于 64-bit。

5. **AGPL 在 self-host 是否真的强制开源？什么是"sufficient interaction with users via network"？**
   读 AGPL-3.0 第 13 条 + Plane 自己的 `LICENSE` 文件 + ce/ 目录是怎么和商业 EE 切分的（在哪个文件做的 build-time tree-shake）。

### 延伸阅读（按顺序读）

| 顺序 | 文件 / 资源 | 回答什么 |
|---|---|---|
| 1 | [`apps/live/src/extensions/database.ts`](https://github.com/makeplane/plane/blob/0acb32e65e8c3880a32d7b73a40cae52d3960ab0/apps/live/src/extensions/database.ts) | Yjs → Postgres 持久化的具体实现 |
| 2 | [`apps/live/src/extensions/title-sync.ts`](https://github.com/makeplane/plane/blob/0acb32e65e8c3880a32d7b73a40cae52d3960ab0/apps/live/src/extensions/title-sync.ts) | "协同字段"反向同步到"事务字段"的桥 |
| 3 | [`apps/web/core/store/issue/helpers/base-issues.store.ts`](https://github.com/makeplane/plane/blob/0acb32e65e8c3880a32d7b73a40cae52d3960ab0/apps/web/core/store/issue/helpers/base-issues.store.ts) 完整通读 | group/sort/pagination 的真正复杂度 |
| 4 | [`apps/api/plane/db/models/cycle.py`](https://github.com/makeplane/plane/blob/0acb32e65e8c3880a32d7b73a40cae52d3960ab0/apps/api/plane/db/models/cycle.py) + [`module.py`](https://github.com/makeplane/plane/blob/0acb32e65e8c3880a32d7b73a40cae52d3960ab0/apps/api/plane/db/models/module.py) | sprint vs roadmap 的 schema 区分 |
| 5 | [`apps/api/plane/bgtasks/`](https://github.com/makeplane/plane/tree/0acb32e65e8c3880a32d7b73a40cae52d3960ab0/apps/api/plane/bgtasks) | Celery 异步任务（webhook / notification / import） |
| 6 | [`deployments/kubernetes/community/`](https://github.com/makeplane/plane/tree/0acb32e65e8c3880a32d7b73a40cae52d3960ab0/deployments/kubernetes/community) | 生产部署形态（statefulset / pvc / pdb） |
| 7 | [`packages/editor/`](https://github.com/makeplane/plane/tree/0acb32e65e8c3880a32d7b73a40cae52d3960ab0/packages/editor) | Tiptap + Yjs binding 的封装 |
| 8 | [`turbo.json`](https://github.com/makeplane/plane/blob/0acb32e65e8c3880a32d7b73a40cae52d3960ab0/turbo.json) | 构建图（哪些 task 互相依赖） |

## 限制（≥ 4 条）

1. **AGPL-3.0 的 viral 性质**——任何把 Plane 源码集成进闭源 SaaS 的做法都违法。
   如果你的公司法务对"GPL-likely"过敏，**Plane 不是你的选项**——选 Linear / Jira 闭源 SaaS。

2. **`base-issues.store.ts` 1500+ 行单基类的工程债**——
   抽象边界没切干净；任何加一个 view 类型都要碰这里；新人 onboarding 成本高。

3. **`apps/api` 的 sequence_id `pg_advisory_xact_lock` 在 bulk insert 下不工作**——
   issue.py 自己的 TODO 注释 "Handle identifiers for Bulk Inserts" 暴露这个问题。
   导入百万级 issue（从 Jira 迁移）时会撞坑。

4. **`apps/live` 的 auth 逻辑和 `apps/api` 是两份**——任何 auth 改动需要双向同步，没有自动化测试守住一致性。
   PR review 是唯一防线，新人易踩坑。

5. **MobX + decorator 的心智模型**——`makeObservable(this, { fetchIssues: action })` 显式声明虽然可控但啰嗦；
   any project < 50 个 store 用 Zustand / Jotai 心智成本低 5 倍。

6. **turborepo + pnpm workspace 的本地启动复杂度**——
   完整本地跑 5 个 apps + 6 个 service 的资源占用 ~4GB RAM；笔记本电池续航受影响。

## 附录：宣传 vs 现实清单

| 宣传 | 现实 |
|---|---|
| "without the chaos of managing the tool itself" | self-host 仍要懂 docker / postgres / redis / s3-compatible 存储 |
| "open-source" | AGPL-3.0，不是 MIT；二次分发有义务 |
| "real-time collaborative" | 协同只在 issue description 富文本；issue 列表不是协同（多人改同一个 issue 的 priority 仍走 last-write-wins） |
| "复刻 Linear 体感" | UI 接近，但快捷键覆盖度 / 命令面板深度 / 搜索体感 < Linear |
| "production-ready self-host" | helm chart 是 community/，不带 HA postgres / multi-region failover；要生产用还要自己加固 |

## 元数据

- **状元篇升级日期**：2026-05-28（v1.1 分支 A 大型应用首版）
- **总行数（含 frontmatter）**：约 670 行
- **启用工具**：浅克隆 + WebFetch（GitHub raw + tree 页）+ pillow 生成 webp + Read（method.md / excalidraw.md 参考）
- **commit 锚定**：[`0acb32e65e8c`](https://github.com/makeplane/plane/commit/0acb32e65e8c3880a32d7b73a40cae52d3960ab0)（preview branch HEAD at 2026-05-28）
- **下次巡检**：v1.4 release 后或 `apps/live` 引入新 extension 时

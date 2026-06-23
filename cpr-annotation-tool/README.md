# cpr-annotation-tool（v3：CPR 数据平台）

状态: shipped（设计已被全智评 deploy 吸收；本地代码副本已删除，仅保留设计文档）

> **平台定位**：为 vea 项目建一个**可复现的 CPR 数据集**。
> 老师在这里把临床知识沉淀成结构化数据，平台把它整理成版本化 snapshot，vea 拉走训练 / 评估。
>
> 不是标注工具，不是文件夹，不是仪表盘——是 **dataset platform**：数据进、数据治、数据出三段闭环。

## 文件总览

```
cpr-annotation-tool/
├── README.md                                       ← 你正在看这个
├── docs/                                           ← 现行文档
│   ├── platform-architecture-v3.md                ← 顶层架构（10 节）
│   ├── page-inventory-v3.md                       ← 19 个页面清单 + MVP 砍到 8 页
│   ├── vea-data-contract-v3.md                    ← 平台 → vea 数据契约 + 7 张 parquet + 7 个 API
│   ├── first-principles-derivation-v2.md          ← 5 类贡献的推导（v3 继承）
│   └── labeling-guide-v2.md                       ← 老师可读指南（5 类贡献）
├── schema/                                         ← 现行 schema
│   └── labeling-schema-v3.json                    ← envelope + dataset + snapshot + relationship
└── archive/                                        ← 历史版本（不再使用）
    ├── docs/labeling-guide-v1.md
    └── schema/{labeling-schema-v1.json, labeling-schema-v2.json}
```

## 三段闭环

```
收集 INGEST           整理 CURATE              展示 SERVE
──────────           ──────────              ──────────
老师上传 5 类贡献       审核 + 状态机              人看：19 个页面（学习 / 诊断）
媒体抽取元数据         版本化 dataset/snapshot    机器看：7 个 API + 7 张 parquet
知情同意              去重 + 关系图              vea 引用 snapshot_id 即可复现
```

## 5 类贡献（继承 v2）

| Code | 类型 | 作用 |
|---|---|---|
| A | graded_video | 学生视频整段 28 步评分（vea 评估 ground truth） |
| B+ | reference_positive | 正面示范（视频 / 图片）→ vea 检索增强正样本 |
| B− | reference_negative | 反面教材 + E_code（视频 / 图片）→ vea 检索增强负样本 |
| C | comparison_pair | 正反对照 + 区别说明 → vea 边界教学 |
| D | rubric_note | 对 rubric 的注解 / 修订 / 新增提议 → rubric 演进 |

## v3 三层新概念

| 概念 | 解决什么 |
|---|---|
| **dataset** | 一组贡献的逻辑容器（cohort / 主题）。可变。 |
| **snapshot** | dataset 的不可变版本。**vea 唯一引用对象**。 |
| **relationship** | 贡献间的引用关系图（derives_from / supersedes / compares_against / cites / duplicates） |

## 三种使用模式

| 模式 | 用户 | 入口 |
|---|---|---|
| **学习模式** | 老师 | `/learn` → step / E_code 详情 / 对比库 |
| **诊断模式** | Jason / 教研员 | `/curate` → 覆盖率热力图 / 待审队列 / 质量监控 |
| **消费模式** | vea | `/api/v1/snapshots/{id}/...` → manifest / parquet / 切片 |

## MVP 范围（8 个页面 + 5 个 API）

按依赖顺序：

1. P1 首页（覆盖率热力图最简版）
2. P2 贡献向导（先支持 graded_video + reference_negative）
3. P3 我的贡献
4. C1 审核队列
5. C2 审核详情
6. V2 step 详情
7. V4 视频详情
8. API：snapshots list / manifest / export / by_step / by_error

后面 11 个页面随用随加。

## 已确认的设计决策

| 主题 | 选择 | 来源 |
|---|---|---|
| 标注范围 | P0+P1+P2 全标 | 你拍 |
| 标注者数 | 1 位主标 + 同人复测 3 个 | 你拍 |
| 易错点形态 | 封闭勾选 + 时间戳 + rubric_note 升级闭环 | 你拍 |
| 媒介 | video / image / 文字皆收，统一 media[] | 你拍（v2 起） |
| 5 类贡献 | graded / pos / neg / compare / note | 你拍（v2 起） |
| 平台定位 | 数据集平台（不是工具） | 你拍（v3） |

## 待你 review 的关键决策（v3）

1. **MVP 是否先做单 dataset / 单 snapshot 跑通再扩** → 我倾向是（避免一开始就建多 cohort 复杂度）
2. **审批数 1 还是 2** → MVP 1 个；正式 2 个？
3. **撤同意流程要不要硬上**（合规要求）→ 至少占位字段必须有，UI 流程可后做
4. **覆盖率热力图阈值** → `min_ref_negative_per_error=3, min_ref_positive_per_step=2, min_comparison_per_error=1` 合理吗？
5. **vea 实验记录强约束 snapshot_id** → 这是治理决策，需要你和 vea 项目对齐
6. **存储栈**：MVP 用 SQLite + JSON 文件 + 本地对象存储模拟；规模化时上 Postgres + S3 兼容

## 待办（按优先级）

| 优先级 | 任务 |
|---|---|
| P0 | review v3 三个 doc + schema → 你拍板 |
| P0 | 出 v1→v2→v3 数据迁移脚本骨架 |
| P1 | 网站需求文档（界面线框 + 后端接口） |
| P1 | AI draft 生成脚本（复用 quanzhiping-poc perception） |
| P2 | 老师培训材料（5 分钟视频脚本 + cheatsheet） |
| P2 | 实施技术选型（前端框架 / 后端栈 / 部署） |

## 关联

- 评分体系源：`../cpr-eval/schema/rubric-v2.{md,json}`
- 视频文件：`~/Downloads/心肺复苏15个案例/` + `~/Downloads/心肺复苏简易呼吸器电除颤/`
- 历史标注实战：`../quanzhiping-poc/labels/student-02/intervals_ai_draft.yaml`
- vea 数据目录（导出目标）：`../video-eval-agent/data/cpr-cohort-2026-05/`

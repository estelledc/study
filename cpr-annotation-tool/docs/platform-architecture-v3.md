# CPR 数据平台架构 v3

> 由 v2 的"老师贡献体系"扩展为"vea 的端到端数据平台"。
> 本文是顶层架构，下挂：schema-v3 / page-inventory-v3 / vea-data-contract-v3。

## 一、平台定位（一句话）

**为 vea 项目建一个可复现的 CPR 数据集**：老师把知识沉淀进来，平台把它整理成版本化数据，vea 拉走训练 / 评估。

不是：标注工具 / 文件夹 / 仪表盘。
是：**dataset platform**——数据进、数据治、数据出三段闭环。

## 二、三段闭环

```
┌─────────────┐         ┌─────────────┐         ┌─────────────┐
│  收集 INGEST  │  ────►  │  整理 CURATE  │  ────►  │  展示 SERVE   │
│             │         │             │         │             │
│ 上传 5 类贡献 │         │ 审核 / 版本   │         │ 人看 + 机器消费 │
│ 元数据抽取   │         │ 去重 / 关系图 │         │ 三种使用模式    │
│ 知情同意     │         │ 打 snapshot │         │             │
└─────────────┘         └─────────────┘         └─────────────┘
       ▲                       │                        │
       │                       │                        ▼
   老师 / 教研员             质量监控                vea / 老师 / Jason
       │                       │                        │
       └───────────────────────┴────────────────────────┘
                          反馈环：覆盖率引导贡献
```

## 三、四个角色

| 角色 | 在平台上做什么 | 关键诉求 |
|---|---|---|
| **老师（生产者）** | 上传 5 类贡献 / 审别人的 / 看其他人怎么标 | 上传顺手 / 知道自己贡献是否被采纳 / 能学习他人 |
| **Jason / 教研员（运营）** | 设 cohort / 审核 / 打 snapshot / 看覆盖率 | 知道缺口在哪 / 能追溯每个 vea 跑的数据来自何处 |
| **vea 项目（消费者）** | 拉 snapshot / 按维度切片 | 数据稳定可复现 / 切片维度灵活 / 引用可追溯 |
| **受试者 / 公众（隐私方）** | 行使知情同意 / 撤回 | 数据用途透明 / 撤回请求可执行 |

## 四、收集 INGEST 层

### 4.1 上传形态

5 类贡献 × 3 种媒介 = 收什么都行：

| 贡献类型 | 视频 | 图片 | 纯文字 |
|---|---|---|---|
| graded_video | ✓（学生整段） | — | — |
| reference_positive | ✓（片段） | ✓（关键帧 / 标注图） | — |
| reference_negative | ✓（片段） | ✓ | — |
| comparison_pair | ✓ + ✓ | ✓ + ✓ | — |
| rubric_note | — | — | ✓ |

### 4.2 上传时自动做的事

```
原始文件
   ↓
1. 病毒扫描 + MIME 校验
2. 元数据抽取（ffprobe：duration / fps / 分辨率；exif：拍摄时间）
3. checksum_sha256 计算 + 去重检查（已存在则提示老师"已有人传过"）
4. 缩略图生成（视频抽 5 帧；图片缩 256/512）
5. 转码标准化（h264 / mp4 / 1080p 上限；图片 jpeg）
6. 对象存储入库 + 生成 media_id
   ↓
媒体资产已就位
   ↓
7. 老师在表单填 envelope（kind / step_links / explanation / consent）
8. 系统校验（schema 规则 1-10）
9. 落 contribution 记录，status=draft
```

### 4.3 知情同意必填

每条含可识别人物的媒体必填三项（schema-v3 已强约束）：
- 知情同意书是否签
- 是否已脱敏
- 授权范围（仅团队 / 脱敏研究 / 公开 CC-BY）

授权范围决定 export 默认过滤（默认排除"仅团队"）。

### 4.4 批量上传

支持 zip 包：videos/ + labels/ + manifest.yaml。
manifest 里写每个文件的 envelope 关键字段，避免老师 100 个视频点 100 次表单。

## 五、整理 CURATE 层

### 5.1 审核流（继承 v2 状态机）

```
draft  ──submit──►  pending  ──approve──►  approved  ──supersede──►  deprecated
                       │                       ▲
                       └──reject──►  rejected  │
                                              │
                                      revision──┘
```

MVP：1 reviewer。后续：2 reviewer、专家加权。

### 5.2 三个核心新概念

#### dataset（数据集容器）
```
dataset_id: "cpr-cohort-2026-06"
contains: [contribution_id, ...]
created_by, created_at, description
intended_use: ["vea-training", "vea-eval", "rubric-validation"]
```
逻辑容器。一份 contribution 可属于多个 dataset（cohort + theme）。

#### snapshot（不可变版本）
```
snapshot_id: "cpr-cohort-2026-06@v3"
dataset_id: "cpr-cohort-2026-06"
created_at, created_by
contribution_ids: [...]  # 冻结
rubric_version: "rubric-v2"
schema_version: "labeling-v3"
splits:
  train: [...] / val: [...] / test: [...]
  inter_rater_subset: [...]   # 同人复测的 3 个
content_hash: sha256(...)      # 验证不可变
```
**vea 引用的对象**。每次 vea 训练 / 评估 → 必须引用一个 snapshot_id。
后续要改 dataset 内容 → 不能改 snapshot，只能打新 snapshot。

#### relationship（贡献关系图）
```
{
  from: contribution_id_B,
  to:   contribution_id_A,
  type: "derives_from" | "supersedes" | "compares_against" | "cites"
  details: { extracted_interval: [12.3, 18.5] }
}
```
解决两个真问题：
- 老师从 graded_video A 截一段做 reference B → B `derives_from` A
- A 被 B 替换 → B `supersedes` A，A 自动 deprecated

### 5.3 去重

三层去重：
1. **文件层**：checksum_sha256 撞了直接拒绝
2. **片段层**：同一视频不同时段被多次引用 → 不阻止，但提示"已有 K 条贡献引用此视频段"
3. **语义层（人工）**：同一 step + E_code 已有 N 条相似 reference → 提示老师"是否要补充新角度"

### 5.4 版本演进

```
rubric-v2  ────►  rubric-v3 (新增 E34, 拆分 E10)
   │                │
   │                ├─ 兼容映射表 (rubric_v2_to_v3.yaml)：旧 E_code → 新 E_code
   │                │
   ▼                ▼
labeling-schema-v3  ←─ 兼容
   │
   ▼
存量 contribution
   ├─ 自动 reanchor 到 rubric-v3（按映射表）
   ├─ 不能映射的 → flag 待人工处理
   └─ 旧 snapshot 保持 rubric-v2 不变（不可变性）
```

### 5.5 质量监控（自动跑）

每天定时扫：
- 孤立 contribution（status=draft 超 14 天）
- approved 但引用的视频已删 / 已撤同意
- inter-rater 子集统计：复测一致率
- AI draft diff 大的 step 排行（最弱环节）
- 覆盖率缺口（哪些 step / E_code 样本数 < 阈值）

报告进 quality_dashboard，每周给运营看。

## 六、展示 SERVE 层

### 6.1 三种使用模式 → 三套界面入口

| 模式 | 入口 | 主要页面 |
|---|---|---|
| **学习模式** | "/learn" | step 详情页 / E_code 详情页 / 对比库 |
| **诊断模式** | "/curate" | 覆盖率热力图 / 待审队列 / 质量仪表盘 |
| **消费模式** | "/api" + "/datasets" | snapshot 列表 / 切片 API / parquet 下载 |

### 6.2 给人看：核心 19 个页面

详见 `page-inventory-v3.md`。摘要：

**生产者**（4 个）：首页 / 贡献向导 / 我的贡献 / 通知
**整理者**（5 个）：审核队列 / 审核详情 / 数据集管理 / rubric 演进 / 质量仪表盘
**消费者公开视图**（7 个）：dataset 主页 / step 详情 / E_code 详情 / 视频详情 / 贡献者主页 / 对比页 / 时间线
**通用**（3 个）：搜索 / 设置 / 帮助

### 6.3 给机器看：vea 数据契约

详见 `vea-data-contract-v3.md`。核心 API：

```
GET /api/v1/snapshots/{snapshot_id}/manifest
   → 返回 snapshot 的 metadata + contribution 列表

GET /api/v1/snapshots/{snapshot_id}/export?format=parquet&filter=...
   → 返回过滤后的 parquet（gold_steps / ref_negative / comparison 等 7 张表）

GET /api/v1/snapshots/{snapshot_id}/media/{media_id}
   → 返回带短期 token 的下载 URL

GET /api/v1/snapshots/{snapshot_id}/by_step/{step_id}
GET /api/v1/snapshots/{snapshot_id}/by_error/{error_code}
   → 切片视图：返回某 step / E_code 关联的所有 contribution（含正例 / 反例 / 对比）
```

vea 跑实验时强制要求：必须在实验记录里写明 `snapshot_id`，否则不算可复现。

## 七、覆盖率引导：把贡献流量导向缺口

首页核心是覆盖率热力图（不是仪表盘）：
```
            正例数  反例数  对比数  graded
D1S1         3       0       0       15
D1S2         1       2       0       15
D2S5         8       12      4       15   ← 充分
D6S3         0       0       0       15   ← 缺口
...
E10          —       0       0       —    ← 致命缺口
E13          —       8       2       —
```
颜色按缺口大小渐变，老师点进去直接进对应 step 的贡献向导。

## 八、关键技术约束

| 约束 | 选择 |
|---|---|
| 数据存储 | contribution 主体走 JSON 文件 (per-record)；媒体走对象存储（S3 兼容） |
| 数据库 | SQLite（MVP）→ Postgres（规模上来后），存元数据 + 索引 |
| 不可变性 | snapshot 一旦打出，contribution_ids + content_hash 永不可改 |
| 删除 / 撤回 | 软删除 + 撤同意流程；snapshot 内部仍保留但 export 时按授权过滤 |
| 部署 | 内网优先（处理隐私） |
| 用户系统 | 带 role-based 权限（producer / reviewer / curator / consumer） |

## 九、演进路径

| 阶段 | 范围 |
|---|---|
| **Phase 0（现在）** | 文档 + schema v3 定稿 |
| **Phase 1** | MVP：上传 + 5 类贡献表单 + 审核 + 1 个 dataset 1 个 snapshot |
| **Phase 2** | 覆盖率热力图 + step / E_code 详情页 + vea 消费 API |
| **Phase 3** | 关系图 / 对比页 / rubric 演进流 / 质量监控 |
| **Phase 4** | 多 dataset / 多 cohort / 跨数据集对比 / 公开发布 |

## 十、不在本架构范围（v4 候选）

- 多模态扩展（穿戴传感器、AED 时间日志）
- 主动学习：AI 模型反过来"请求"老师标某些样本
- 跨机构联邦：多个医院共建 dataset 但数据不出本地
- 在线评分服务：把 vea 包成 API 给学生用

这些都是合理方向，但优先级低于把"基本数据平台"立起来。

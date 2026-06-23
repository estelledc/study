# vea 数据契约 v3

> 平台向 vea 提供数据的形式、稳定性保证与切片维度。
> 配套 `platform-architecture-v3.md` 第 6.3 节。
> vea 任何一次实验运行必须引用一个 `snapshot_id`，否则不算可复现。

## 一、契约最小条款

| 条款 | 内容 |
|---|---|
| **数据单位** | snapshot（不是 dataset）。snapshot 不可变。 |
| **引用** | vea 实验记录里必须出现 `snapshot_id` + `content_hash` |
| **稳定性** | snapshot 一旦发布，contribution_ids / 媒体 hash / rubric_version 永不变 |
| **可撤回** | 撤同意后媒体不可下载，但 snapshot manifest 保留指针（标记为撤回） |
| **导出格式** | parquet（结构化）+ 媒体对象存储链接（带短期 token） |
| **过滤默认** | status=approved AND license != "仅团队内部"（除非显式包含） |

## 二、Snapshot Manifest（核心元数据）

```yaml
snapshot_id: cpr-cohort-2026-06@v3
dataset_id:  cpr-cohort-2026-06
created_at:  2026-06-30T18:00:00+08:00
created_by:  jason

rubric_version:    rubric-v2
schema_version:    labeling-v3
content_hash:      sha256:abcd...

description: |
  第二轮 cohort，含 15 个 graded_video + 47 reference_negative
  + 12 comparison_pair + 8 rubric_notes。
  专家 1 位主标 + 1 位 reviewer。

intended_use:
  - vea-training
  - vea-eval
  - rubric-validation

splits:
  train:  [contrib_..., contrib_..., ...]
  val:    [contrib_..., ...]
  test:   [contrib_..., ...]
  inter_rater_subset: [contrib_..., contrib_..., contrib_...]   # 同人复测的 3 个 graded_video

stats:
  total_contributions: 82
  by_kind:
    graded_video:        15
    reference_positive:  18
    reference_negative:  29
    comparison_pair:     12
    rubric_note:          8
  total_media:
    video:  47
    image:  35
  total_duration_sec: 8430

coverage:
  per_step:
    D1S1:  { graded: 15, ref_pos: 2, ref_neg: 3, comparison: 1 }
    D2S5:  { graded: 15, ref_pos: 4, ref_neg: 8, comparison: 3 }
    ...
  per_error:
    E10:   { ref_neg: 6, comparison: 2 }
    E13:   { ref_neg: 8, comparison: 3 }
    ...
  gaps:                        # 样本数 < 阈值的清单
    - { target: D6S3, kind: ref_neg, current: 0, threshold: 3 }

contributions:
  - contribution_id: contrib_2026-06-05_doctor-zhang_0001
    kind: graded_video
    status: approved
    media_ids: [media_xxx]
    file_paths_in_snapshot: [contributions/contrib_..._0001.json]

audit:
  signed_by: jason
  signature: ed25519:...
```

## 三、导出表（parquet 7 张）

### gold_steps.parquet
派生自 graded_video。

| 列 | 类型 | 说明 |
|---|---|---|
| snapshot_id | string | |
| video_id | string | |
| contribution_id | string | |
| annotator_id | string | |
| step_id | string | D1S1..D8S2 |
| executed | bool | |
| score_value | float | |
| score_band | string | full / partial / zero |
| error_codes | array<string> | |
| error_timestamps_json | string | JSON 字符串 |
| interval_start | float | |
| interval_end | float | |
| confidence | string | sure / unsure |
| notes | string | |

### gold_events.parquet
派生自 graded_video.timeline_events。

| 列 | 类型 |
|---|---|
| video_id, step_id, event_type | |
| t_sec, duration_sec | float |
| extra_json | string |

event_type ∈ {compression_first, compression_last, interruption, round, ventilation, key_speech}

### gold_overall.parquet

| 列 | 类型 |
|---|---|
| video_id, total_score, qualified, annotator_id, session_type | |
| repeat_of_record_id | nullable |

### ref_positive.parquet

| 列 | 类型 |
|---|---|
| contribution_id, step_links_json, key_features_json | |
| media_ids_json, explanation_summary, explanation_detailed | |
| author_id, author_role | |

### ref_negative.parquet

| 列 | 类型 |
|---|---|
| contribution_id, step_links_json, primary_error_code | |
| secondary_error_codes_json, severity, demo_subject | |
| media_ids_json, explanation_summary, explanation_detailed | |

### comparison.parquet

| 列 | 类型 |
|---|---|
| contribution_id, step_links_json, error_links_json | |
| left_label, left_media_ids_json, left_caption | |
| right_label, right_media_ids_json, right_caption | |
| key_distinguishing_features_json, common_mistake_explanation | |

### rubric_notes.parquet

| 列 | 类型 |
|---|---|
| contribution_id, proposal_kind, scope, scope_target | |
| current_definition_quoted, proposed_change, rationale | |
| evidence_contribution_ids_json, status | |

## 四、API endpoints

### 4.1 列出 snapshot
```
GET /api/v1/snapshots
  ?dataset_id=cpr-cohort-2026-06
  ?status=published

→ [{ snapshot_id, created_at, content_hash, stats_summary }, ...]
```

### 4.2 获取 manifest
```
GET /api/v1/snapshots/{snapshot_id}/manifest
→ 上面的 manifest YAML
```

### 4.3 导出 parquet
```
GET /api/v1/snapshots/{snapshot_id}/export
  ?tables=gold_steps,ref_negative,comparison
  ?include_internal_only=false
  ?format=parquet

→ 返回 zip 包或 streaming 多文件
```

### 4.4 切片 by_step
```
GET /api/v1/snapshots/{snapshot_id}/by_step/{step_id}
  ?kinds=graded_video,reference_negative

→ 该 step 关联的所有 contribution（聚合视图）
```

### 4.5 切片 by_error
```
GET /api/v1/snapshots/{snapshot_id}/by_error/{error_code}

→ 该 E_code 关联的所有反例 + 对比 + graded_video 命中段
```

### 4.6 媒体下载
```
GET /api/v1/snapshots/{snapshot_id}/media/{media_id}
→ 302 重定向到带短期 token（1h）的对象存储 URL
```

### 4.7 撤回检查（vea 实验前必跑）
```
POST /api/v1/snapshots/{snapshot_id}/revocation_check
  body: { contribution_ids: [...] }

→ { revoked: [...], still_valid: [...] }
```

## 五、稳定性 SLA

| 指标 | 承诺 |
|---|---|
| snapshot 不可变性 | 100%（破坏性操作禁用） |
| manifest 可用 | 99% / 30 天 |
| parquet 导出延迟 | < 10s（< 100MB） |
| media 下载短链有效期 | 1 小时，可续 |
| schema 向后兼容 | minor 升级（v3.x）保证；major 升级（v4）出迁移工具 |

## 六、vea 端使用示例（伪代码）

```python
from vea.data import load_snapshot

snap = load_snapshot("cpr-cohort-2026-06@v3")

# 训练数据
gold_train = snap.export("gold_steps", split="train")
ref_neg    = snap.export("ref_negative", filter={"primary_error_code": "E10"})
compare    = snap.export("comparison",   filter={"step_links": "D2S5"})

# 检索增强：取 D2S5 的正反对照
context = snap.by_step("D2S5", kinds=["reference_positive", "reference_negative", "comparison_pair"])

# 评估：拿 test split 的 gold + 对应视频
for video in snap.iter_videos(split="test"):
    pred = vea.score(video.media_path)
    gold = video.gold_steps
    metrics.update(gold, pred)

# 实验记录
mlflow.log_param("snapshot_id",  snap.id)
mlflow.log_param("content_hash", snap.content_hash)
```

## 七、关键设计决定

1. **snapshot 而非 dataset 直接消费**：dataset 可变，snapshot 不可变。vea 引用可变对象 = 实验不可复现。
2. **parquet 而非 JSON**：vea 是数据科学栈，parquet 列存 + 压缩 + Polars/DuckDB 直读。
3. **媒体外挂**：parquet 只存 media_id 指针，媒体单独走对象存储。避免单文件超大。
4. **撤回是单独流程**：snapshot 不删数据，但 vea 跑前必须查撤回清单。隐私合规与可复现性的折中。
5. **content_hash 强校验**：vea 加载时算一遍 hash 对比 manifest，hash 不一致拒绝加载。

## 八、不在契约范围

- 在线推理 API（vea 提供，不是平台提供）
- 增量训练 / 流式数据（snapshot 是 batch 模型）
- 跨 snapshot 联合查询（vea 自己 union）
- 数据回写（vea 不能往平台写预测结果，那是另一个产品）

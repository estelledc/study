# Examples — 张老师在 cpr-cohort-2026-06 的真实贡献流

> 用本地真实视频（`~/Downloads/心肺复苏15个案例/` + `~/Downloads/心肺复苏简易呼吸器电除颤/`）举例。
> 主角：张老师（doctor-zhang，副主任医师，主标）+ 李老师（doctor-li，主任医师，reviewer）。
> 数据集：cpr-cohort-2026-06。

## 一、文件清单

```
examples/
├── README.md                              ← 你正在看这里
├── users/
│   ├── doctor-zhang.json                  ← 张老师（producer + reviewer）
│   └── doctor-li.json                     ← 李老师（reviewer + curator）
├── datasets/
│   └── cpr-cohort-2026-06.json            ← dataset 容器
├── contributions/
│   ├── contrib_0001_graded_video_student2.json                    ← A 类：学生 2 整段评分（71/100）
│   ├── contrib_0002_reference_positive_student5_clip.json         ← B+ ：从学生 5 截标准按压姿势
│   ├── contrib_0003_reference_positive_self_demo.json             ← B+ ：张老师自演 EC 手法 8s
│   ├── contrib_0004_reference_negative_student12_slow.json        ← B− ：学生 12 E13 频率慢
│   ├── contrib_0005_reference_negative_student18_elbow_image.json ← B− ：学生 18 E10 弯曲（图片+标注）
│   ├── contrib_0006_comparison_pair_pose.json                     ← C  ：肘伸直 vs 弯曲对比
│   ├── contrib_0007_rubric_note_E10_threshold.json                ← D  ：建议给 E10 加 165° 阈值
│   └── contrib_0099_graded_video_student5_repeat.json             ← A 类 repeat：2 周后复测学生 5
├── relationships/
│   ├── rel_0001_comparison_uses_positive.json    ← 对比 cite 正例
│   ├── rel_0002_comparison_uses_negative.json    ← 对比 cite 反例
│   ├── rel_0003_negative_derives_from_student18.json ← 反例 derives_from 原视频
│   └── rel_0004_repeat_of_primary.json           ← repeat supersedes primary
└── snapshots/
    └── cpr-cohort-2026-06_v1.json         ← 首个 snapshot（vea 引用对象）
```

## 二、对应学生视频

| 学生 | 时长 | 在示例中扮演的角色 |
|---|---|---|
| 学生 2 | 752s | A 类主案例：完整 28 步评分 |
| 学生 5 | 324s | B+ 来源（标准按压片段） + repeat 复测对象 |
| 学生 12 | 588s | B− 来源（E13 频率慢） |
| 学生 18 | 430s | B− 来源（E10 肘弯曲关键帧） |

## 三、覆盖了哪些场景

- ✅ A 类（graded_video）primary + repeat 两种 session_type
- ✅ B+ 类两种 demonstration_subject（real_student_anonymized + self_demo）
- ✅ B− 类两种媒介（视频 30s + 图片 + 标注图层）
- ✅ C 类（comparison_pair）混合媒介引用（左视频 + 右图片）
- ✅ D 类（rubric_note）pending 状态 + evidence_contribution_ids
- ✅ Relationship 三种 type（cites / derives_from / supersedes）
- ✅ Snapshot 不可变 + content_hash + splits + coverage stats + gaps

## 四、对照 schema 字段速查

```
contribution.envelope     →  所有 contribution_*.json 顶层字段
contribution.payload      →  各文件 payload 段（按 kind 不同）
dataset                   →  datasets/cpr-cohort-2026-06.json
snapshot                  →  snapshots/cpr-cohort-2026-06_v1.json
relationship              →  relationships/rel_*.json
user                      →  users/*.json
```

## 五、注意

- 所有 `media.path` 和 `checksum_sha256` 是占位符，真实平台运行时由后端生成
- contrib_0099 的 steps 数组省略，仅展示 repeat envelope 结构（实际入库时 28 步必填）
- snapshot 里只放了部分 contribution；真实 snapshot 会包含 cohort 全部 43+ 条
- rubric-v3 升级（基于 contrib_0007 的提议）是后续动作，本批 example 用 rubric-v2 锚定

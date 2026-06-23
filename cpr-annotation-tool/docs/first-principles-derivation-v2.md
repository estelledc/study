# vea 数据贡献体系第一性原理推导（v2）

> 由 v1 的"老师标学生视频"扩展为"老师对 vea 知识图谱的多类贡献"。
> 本文是为什么这么改的逻辑链，schema 文件是落地。

## 一、vea 学的是什么映射

```
学生 CPR 视频  ───►  28 步打分 + 易错点 + 总分 + 评语
```

要学好这个映射，AI 至少需要四类训练 / 检索信号——类比培养一个新医生评分员：

| 信号类型 | 比喻 | vea 用途 |
|---|---|---|
| 批改过的考卷 | "这位扣 3 分因为 E10" | 评估 AI 对错 + 监督学习 |
| 正面示范 | "标准 EC 手法看这里" | 给 AI 对的范式 |
| 反面教材 | "这就是 E10 的典型" | 给 AI 错的样本 |
| 对比说明 | "左对右错，差在手肘角度" | 教 AI 分类边界 |

v1 只覆盖第一类，是单腿走路。

## 二、五类贡献

| Code | 类型 | 数据形态 | 关键字段 |
|---|---|---|---|
| A | `graded_video` | 学生视频 + 28 步评分 | per-step score / error / interval |
| B+ | `reference_positive` | 视频片段或图片 + 文字 | media[] / step_links / explanation |
| B− | `reference_negative` | 视频片段或图片 + 文字 + E_code | media[] / step_links / **error_links** / explanation |
| C | `comparison_pair` | 两个 asset 引用 + 对比解释 | left_asset / right_asset / contrast_text |
| D | `rubric_note` | 纯文字 + E_code 或 step | scope / proposal_kind |

## 三、媒介统一抽象

不再分 "video_field / image_field"，统一为 `media[]`：

```jsonc
media: [
  { type: "video", path: "...mp4", duration_sec: 8.3, interval: { start: 0, end: 8.3 } },
  { type: "image", path: "...jpg", frame_extracted_from: "video_id_xxx@2.4s" }
]
```

好处：
- 一份贡献可以同时含视频 + 关键帧截图
- 后续要加 audio / 序列图只是加 type 枚举
- 网站上传层"视频还是图片都收"自然落到 type 字段

## 四、强制锚点：所有贡献必须挂到 rubric

| 锚点 | 字段 | 必填规则 |
|---|---|---|
| step_id | `step_links: [string]` | 所有贡献必填，至少 1 个 |
| error_code | `error_links: [E_code]` | 负例 + comparison 必填，正例可选，graded_video 见 step.error_codes |

没有锚点的贡献 = vea 不知道训练时用到哪步 = 无 ML 价值，拒绝入库。

## 五、贡献状态机

```
draft  ──submit──►  pending  ──approve──►  approved  ──supersede──►  deprecated
                       │
                       └──reject──►  rejected
```

单标注者风险通过两条机制缓解：
1. **graded_video 的同人复测**（v1 已设计，保留）
2. **reference / comparison 的多人审批**（新加。任何老师都可以贡献，要进 vea 训练集需要至少 1 位 reviewer 标 approved）

## 六、rubric 升级闭环

v1 痛点：易错点封闭勾选 33 个，老师遇到边界 case 只能写 notes，notes 不可机器学习。
v2 解法：`rubric_note` 类型贡献，proposal_kind ∈:
- `clarify_existing`：补充某 E_code 的边界（如"E10 角度阈值约 15°"）
- `propose_new_error_code`：申请 E34、E35
- `propose_new_step`：申请新 step（罕见，但留口子）
- `propose_rubric_split_or_merge`：合并 / 拆分现有项

走审批后写入 rubric v3，参考库自动按新版本重新挂载。

## 七、密度作为 vea 性能上限

vea 评分时检索增强 = 每个 step / E_code 拉 K 个正例 + K 个负例 + 解释，喂给 LLM 做对比判断。
所以**每条 step / E_code 的参考样本密度 = vea 准确率上限**。

引出 schema 必须支持"覆盖率统计"：

```
coverage[step_id] = {
  positive_count, negative_count, comparison_count, last_updated
}
coverage[error_code] = {
  example_count, last_updated
}
```

老师进入网站时，首屏就显示"哪些 step / E_code 还缺样本"，引导贡献流向最稀缺处。这是产品层而非 schema 层的事，但 schema 要支持算出来。

## 八、本次改动的边界

不在 v2 范围（留给 v3 / 实施阶段）：

- 多人协作的实时锁
- 资产去重 / 引用计数
- consent / 隐私 face-blur 自动化
- 跨视频引用片段（B 工作流：从 graded_video 截一段做 reference）
- 移动端拍摄上传

这些都是真问题，但优先级低于"先把 5 类贡献的 schema 立起来"。

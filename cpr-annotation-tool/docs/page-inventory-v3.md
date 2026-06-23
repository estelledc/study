# 页面清单 v3（19 个）

> 配套 `platform-architecture-v3.md` 第 6.2 节。
> 三类用户 × 不同模式 = 19 个页面 + 公共 API。

## 一、生产者（老师）— 4 个

### P1. 首页 / 覆盖率热力图（着陆）
- 显示当前 cohort 的 step × E_code 缺口热力图
- 头部显示"我已贡献 X 条 / 待审 Y 条 / 已采纳 Z 条"
- 引导按钮："去标缺口最大的 D6S3" / "继续上次的 graded_video"

### P2. 贡献向导（5 类同入口，向导分流）
**第一步**：选 kind（5 张大卡片，每张含说明 + 示例）
**第二步**：根据 kind 走不同表单
- graded_video → 视频上传 → 28 步评分页（带 AI draft）
- reference_+/− → 媒体上传 → 锚点选择 → 解释填写
- comparison_pair → 选两个媒体（已上传 / 现传）→ 对比说明
- rubric_note → 选 scope → 引用现有定义 → 写 proposal

**所有路径终点**：预览 → 保存草稿 / 提交审核

### P3. 我的贡献
- 列表：所有自己的 contribution，带 status 过滤
- 每条显示：缩略图 / kind / step_links / status / 审核反馈
- 操作：继续编辑（draft）/ 撤回（pending）/ 修订重提（rejected）

### P4. 通知中心
- 我的贡献状态变化（被批 / 被拒 / 被引用 / 被 supersede）
- 我被指派为 reviewer 的待审项
- rubric 升级公告（影响我的旧贡献时高亮）

---

## 二、整理者（教研员 / Jason）— 5 个

### C1. 审核队列
- 全部 pending contribution 列表
- 按 kind / step / 提交时间过滤
- 批量操作：approve / reject / 指派 reviewer

### C2. 审核详情
- 单个 contribution 全貌：媒体 + envelope + 解释
- AI draft diff（如果是 graded_video）：用红绿高亮老师改了哪里
- 类似贡献参考（语义检索同 step + E_code 的已 approved 项）
- 决策按钮：approve / reject（带原因模板）/ 退回修订

### C3. 数据集管理
- dataset 列表：cohort-2026-06 / cohort-2026-07 ...
- 进入 dataset：包含的 contribution / 当前 snapshot 列表 / 打新 snapshot 按钮
- 打 snapshot 时强制填：splits 划分 / 用途 / 描述
- snapshot diff：v3 vs v4 哪些 contribution 进 / 出

### C4. rubric 演进
- 当前 rubric 版本 + 全部 rubric_note 列表
- 按 proposal_kind 分组：clarify / new_error / new_step / split_or_merge
- 每条提议显示：支持的 contribution 数 / 反对意见 / 当前状态
- 决策：批准 → 触发新 rubric 版本 + 兼容映射表生成

### C5. 质量仪表盘
- 覆盖率热力图（与 P1 共享但更详）
- inter-rater 一致率（同人复测）
- AI draft diff 排行（哪些 step AI 最弱）
- 撤同意 / 待删除请求队列
- 数据完整性告警（孤立媒体、引用断裂）

---

## 三、消费者 — 7 个公开视图

### V1. dataset 主页
- 描述 / 用途 / 当前最新 snapshot / 历史 snapshot
- 总贡献数 / 5 类分布 / 覆盖率概览
- 下载入口（按授权过滤）

### V2. step 详情（每个 step 一页 × 28）
URL：/step/D2S5
- 标题 / 标准操作（rubric 原文）/ 满分 / 关联 E_code
- 该 step 下所有 contribution（按 kind 分 4 个 tab）：
  - graded_video（学生表现）
  - reference_positive（标准示范）
  - reference_negative（典型错误）
  - comparison_pair（正反对照）
- 评论 / 讨论区（教研员可回应）

### V3. E_code 详情（每个 E_code 一页 × 33+）
URL：/error/E10
- E_code 文字 / 关联 step / 严重度分布
- 所有反例库（按 severity 排序）
- 所有引用此 code 的 graded_video 段（点进可跳到具体时间）
- "此 E_code 还缺什么" 的提示

### V4. 视频详情
URL：/video/学生1
- 视频播放器
- 时间轴叠加：所有 step interval / 所有 error_timestamps / 所有 timeline_events
- 旁注：评分 / 评语 / 引用本视频片段的其他 contribution

### V5. 贡献者主页
URL：/author/doctor-zhang
- 该老师的贡献统计 + 时间线
- 该老师在 inter-rater 上的一致率
- 该老师的标注风格分析（与同行 diff 大的 step）

### V6. 对比库
- 所有 comparison_pair 列表 + 按 step 分组的画廊
- 强教学场景：教学时直接拿这页投屏

### V7. 时间线 / 活动流
- 全平台最近活动：新贡献 / 审核结果 / rubric 升级 / snapshot 发布
- 老师可订阅自己关注的 step / E_code

---

## 四、通用 — 3 个

### G1. 全局搜索
- 跨 contribution / step / E_code / 老师 / 视频统一搜
- 支持过滤：kind / status / date / cohort / license

### G2. 设置
- 个人资料 / 显示名 / 专科 / 通知偏好
- 授权管理：撤回某些贡献的授权范围
- API token 管理（消费者）

### G3. 帮助 / 培训
- 5 类贡献新手向导
- rubric 详细说明
- 标注示例库
- FAQ / 联系运营

---

## 五、API（机器消费） — 见 vea-data-contract-v3.md

不计入 UI 页面数。核心 5 个 endpoint：

```
GET /api/v1/snapshots
GET /api/v1/snapshots/{id}/manifest
GET /api/v1/snapshots/{id}/export?format=parquet
GET /api/v1/snapshots/{id}/by_step/{step_id}
GET /api/v1/snapshots/{id}/by_error/{error_code}
```

---

## 六、信息架构图

```
顶部导航：[首页] [贡献] [浏览] [审核*] [数据集*] [API]
              │      │      │       │         │
              ▼      ▼      ▼       ▼         ▼
             P1     P2    V1-V7   C1-C5   API + V1
              │
              └──► 我的贡献 P3 / 通知 P4

侧栏（条件出现）：
  - 老师身份 → 我的贡献 / 通知 / 帮助
  - 教研员身份 → 审核队列 / 数据集 / rubric / 质量
  - 消费者 / 公开 → 数据集列表 / step 浏览 / E_code 浏览

* 仅特定角色可见
```

---

## 七、MVP 砍到几页

如果要快出 MVP，最小可用集合是 8 个（按依赖顺序）：

1. P1 首页（最简版：只列 cohort 和上传按钮）
2. P2 贡献向导（先支持 graded_video + reference_negative）
3. P3 我的贡献
4. C1 审核队列
5. C2 审核详情
6. V2 step 详情（最关键的浏览入口）
7. V4 视频详情
8. API endpoints（vea 消费）

后面 11 个页面随用随加。

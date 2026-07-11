---
title: CVAT — 视频帧标注与半自动追踪的开源王者
来源: https://github.com/cvat-ai/cvat
日期: 2026-05-31
分类: 数据基础设施 / 计算机视觉标注
难度: 中级
---

## 是什么

CVAT（Computer Vision Annotation Tool）是一套**专门为视觉任务做的开源数据标注平台**，2018 年由 Intel OpenCV 团队开源，2022 年迁移到 `cvat-ai` 独立公司继续维护，GitHub 仓库 `cvat-ai/cvat` 已超 13k star。它的招牌不是"什么都能标"，而是**视频里的目标在 100 帧之间怎么不丢、不抖、还不用一帧一帧手画**。

日常类比：

- 一般标注工具像照相馆——一张张拍，一张张标；
- CVAT 像监控运维台——你只在第 0 帧、第 30 帧、第 60 帧画三个框，中间 27 帧由系统自己补出来；遇到目标变形或转弯，再开 SAM 或追踪算法接管。

它的代码栈是 Django + React + PostgreSQL + Redis + Nuclio（serverless），跟 [[label-studio]] 同属"开源标注平台"流派，但目标用户和取舍完全不同。

## 为什么重要

不了解 CVAT，下面几件事就讲不通：

- 为什么自动驾驶 / 安防 / 工业质检团队跑量产标注首选 CVAT 而不是 [[label-studio]]——视频帧导航和追踪是它的命根
- 为什么 SAM（Segment Anything）出来后开源标注圈最先跟进的是它——Nuclio serverless 协议早就在那里等着接模型
- 为什么 KITTI / MOT Challenge / 学术界视觉 benchmark 的标注流程默认假设 CVAT 工作流——它的导出格式是这些数据集的母语
- 为什么"半自动追踪"能成为产品功能——把 SiamMask / TransT 这种在线追踪器挂到标注界面里，省下 90% 的手画时间

## 核心要点

CVAT 的设计可以拆成 **四块**：

1. **视频帧 + 关键帧插值（Track Mode）**
   一段视频被切成连续帧，标注员在关键帧上画框 / 点 / 多边形，中间帧的位置由系统线性插值。矩形 4 个角同时插值，多边形按顶点编号一一对应。这一套 UI 是 CVAT 的核心差异化，别的工具只能"一帧一标"。

2. **半自动追踪（Interactor / Tracker）**
   挂 SiamMask、TransT、SAM 等模型到 Nuclio 上，标注员点一下目标，模型负责在后续帧里跟随。这把"插值不准"的场景接下来——目标被挡、转身、形变，插值会失败，追踪器接管。

3. **数据模型：Organization > Project > Task > Job**
   Project 是一类标注集合，Task 是一份待标数据集，Task 又被切成多个 Job 分给不同标注员。Job 是真正的工作单元——一个标注员认领一个 Job，互不冲突。

4. **Nuclio serverless 函数协议**
   想接自己的检测 / 分割 / 追踪模型，只需写一个 Nuclio function（Python + Docker），CVAT 把它注册进"AI Tools"菜单。SAM、YOLOv8、Mask R-CNN、Detectron2 都靠这套机制接进来。

视频追踪的秘密就在第 1+2 点：**插值省时间，追踪器救场，剩下的人工只补关键帧**。

## 实践案例

### 案例 1：标一段 100 帧视频里的车

```
帧 0:   画一个矩形框住车
帧 100: 把矩形拖到车的新位置
帧 1-99: 系统线性插值，每帧的框自动算出来
```

如果车在第 40 帧被树挡住，插值会出错；这时把第 40 帧标成 outside（消失），第 50 帧重新出现时再标 visible。CVAT 的插值会自动跳过 outside 区间。

具体省力多少？以一段 30 fps、30 秒的视频为例：

- 全人工：900 帧 × 5 秒/帧 = 75 分钟
- 关键帧 + 插值：30 个关键帧 × 8 秒 = 4 分钟
- 关键帧 + 追踪器：5 个 anchor + 模型推理 = 1 分钟（但要 GPU）

差距是 1-2 个数量级，不是百分比。

### 案例 2：用 SAM 一键画分割掩码

部署一个 SAM 的 Nuclio function 后：

```
1. 在 CVAT 界面切到 AI Tools > Interactors > SAM
2. 在目标上点一下（正样本）/ 在背景点一下（负样本）
3. SAM 返回 mask，自动转成多边形顶点
4. 不满意再点几次正/负样本，迭代收敛
```

人工时间从"画 50 个顶点"压到"点 3 下"。

### 案例 3：导出 MOT 格式给追踪模型训练

```bash
# 通过 CVAT API 触发导出
curl -X POST 'http://localhost:8080/api/projects/1/dataset/export?format=MOT+1.1' \
  -H 'Authorization: Token <YOUR_TOKEN>'
```

拿到 `gt.txt` 格式的 MOT Challenge 标准文件，列是 `frame, id, x, y, w, h, conf, ...`，直接喂 ByteTrack / SORT 这类追踪模型。COCO / YOLO / Pascal VOC / KITTI / TFRecord 同样一键导出。

## 踩过的坑

1. **默认 SQLite 不抗压**：开发起来方便，生产环境单 Task 上千帧 + 多 Job 并发时数据库容易锁死。生产部署直接挂 [[postgresql]]。

2. **SAM / 追踪不是开箱即用**：要装 Nuclio + 部署对应的 serverless function，自带 Docker compose 模板能跑通但 GPU 显存要够。本地 8GB 显卡跑 SAM ViT-H 会爆。

3. **关键帧插值在多边形上要小心顶点编号**：第 0 帧的顶点 1 必须对应第 100 帧的顶点 1，不然插值出来形状会扭曲。系统不会自动配对。

4. **Track 和 Shape 是两种东西**：Shape 只在当前帧存在，Track 跨帧带 ID。新人常把整段视频每帧都画成 Shape，结果导出 MOT 格式时没有目标 ID。

5. **Job 切分后不可改大小**：Task 创建时 Job size（默认每 Job 几百帧）就定了，后期想合并 / 拆分要重新建 Task。

## 适用 vs 不适用

**适用**：

- 视频目标检测 / 追踪 / 分割：插值 + 追踪器是它的杀手锏
- 自动驾驶 / 安防 / 工业质检：3D cuboid + 多视角 + 大数据量都支持
- 学术视觉 benchmark 复现：MOT / KITTI / COCO 格式原生支持
- 大团队多角色协作：Organization + Project + Task + Job 四层权限

**不适用**：

- 文本 / 音频 / 表格标注：用 [[label-studio]] 或 doccano 更顺
- 几百张图快速标：CVAT 部署成本不低，自己写表单页可能更快
- 极简单的图像分类：杀鸡用牛刀
- 完全离线断网环境：Nuclio + Redis + PostgreSQL 整套依赖较重

## 历史小故事（可跳过）

- **2018 年**：Intel OpenCV 团队把内部用的视觉标注工具开源，最初只支持图像和视频的 bbox / polygon。
- **2019-2020 年**：加入插值、Nuclio serverless 协议、第一批自动标注模型（YOLO / Mask R-CNN）。
- **2022 年**：项目从 OpenCV 仓库分出，由 cvat-ai 公司独立运营，同时推出 SaaS 版 cvat.ai。
- **2023-2025 年**：跟进 SAM / SAM2 / YOLOv8，强化视频追踪体验；3D 标注（点云 cuboid）成为差异化卖点。

## 学到什么

1. **专一比全面更有壁垒**：CVAT 不追"跨模态通吃"，把"视觉 + 视频"做到极致就有了不可替代性。
2. **插值是省力工程的核心**：标注成本不在 UI 好不好看，在"能不能让一次标注覆盖更多帧"。
3. **协议先于 SDK**：Nuclio 函数是 HTTP 约定，模型框架不限——这跟 [[label-studio]] 的 ML Backend 是同款思路。
4. **数据模型分层要够细**：Organization > Project > Task > Job 看似复杂，但量产标注离了它就管不动多人协作。

## 延伸阅读

- 官方文档：[docs.cvat.ai](https://docs.cvat.ai/) — 从快速开始到 Nuclio 部署全套
- 仓库 README：[github.com/cvat-ai/cvat](https://github.com/cvat-ai/cvat) — 路线图和版本历史
- SAM 集成教程：[docs.cvat.ai/docs/manual/advanced/ai-tools](https://docs.cvat.ai/docs/manual/advanced/ai-tools/) — Interactor / Detector / Tracker 三类
- 对照阅读：[Label Studio](https://github.com/HumanSignal/label-studio) 跨模态、[doccano](https://github.com/doccano/doccano) 文本专精——三者 README 对比能看出取舍

## 关联

- [[label-studio]] —— 跨模态标注王者，CVAT 的最强对照
- [[postgresql]] —— 生产部署默认元数据库，替代默认 SQLite
- [[django]] —— CVAT 后端框架
- [[react]] —— CVAT 前端框架
- [[redis]] —— 任务队列和缓存
- [[opencv]] —— CVAT 出身的母仓库，最早的视觉计算库
- [[minio]] —— 大体量视频帧的 S3 兼容自建存储选择

## 一段总结

CVAT 选了一条窄但深的路：不做"什么数据都能标"的通用平台，而是在视觉这一块——尤其是视频——把插值、追踪、3D cuboid、SAM 集成这几件事做到位。它告诉你一个产品决策的反直觉道理：**早期同时打多个赛道的工具，往往会在每个赛道都被专精玩家击败**。Label Studio 跨模态的优势在文本 + 图像混排场景立得住，但只要任务一变成"30 秒视频里追 5 个目标"，CVAT 的视频帧导航就没有对手。这件事值得留意——选工具时先问"我的瓶颈是什么"，再去找针对那个瓶颈深耕的工具，比看 star 数和功能列表都管用。

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

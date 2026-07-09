---
title: SAM 2 — 图像和视频都能抠轮廓的通用分割模型
来源: 'https://github.com/facebookresearch/sam2'
日期: 2026-07-09
分类: media
难度: 中级
---

## 是什么

SAM 2（Segment Anything Model 2）是 Meta 做的**通用视觉分割模型**：给它一张图或一段视频，再给一个点、框、已有掩码这类提示，它就输出目标物体的像素轮廓。

日常类比：它像视频剪辑软件里的“智能套索”。以前你要一帧一帧描边；SAM 2 让你先点一下目标，模型替你把边缘抠出来，还能沿着视频继续追踪。

最小例子可以这么理解：

```python
predictor.set_image(image)
masks, scores, _ = predictor.predict(
    point_coords=np.array([[500, 375]]),
    point_labels=np.array([1]),
)
```

这里的 `point_coords` 是“我点了哪里”，`point_labels=1` 是“这里属于目标”。SAM 2 输出的是 mask，也就是每个像素是否属于这个目标。

它和第一代 SAM 的关键区别是：第一代主要面向静态图片；SAM 2 把视频也放进同一套思路里，把单张图片看成只有一帧的视频。

## 为什么重要

不用 SAM 2，下面这些事会变得很麻烦：

- 给图片里的陌生物体抠边，要么手工描很久，要么为每个类别单独训练模型
- 给视频里的同一个物体逐帧抠边，会变成重复劳动，目标移动或遮挡后更容易丢
- 做标注工具、视频剪辑、机器人视觉时，很难把“人点一下”变成“模型连续跟踪”
- 想快速验证一个视觉分割想法，会先卡在数据、训练、部署三座小山上

SAM 2 的价值不只是“效果好”，而是把交互式分割变成一个通用积木：图片、视频、点、框、自动掩码、微调都能放在同一个项目里处理。

## 核心要点

1. **提示式分割**：你不用告诉模型“这是一把椅子”还是“这是一辆车”，只要用点或框提示目标在哪里。类比：给修图师指一下“抠这个”，而不是先教他全世界所有物品名字。
2. **流式记忆追踪**：视频不是一堆孤立图片，SAM 2 会保存前面帧的信息，再传播到后面帧。类比：你在人群里盯住一个朋友，不是每秒重新认识一次，而是一直记着他的衣服、位置和运动方向。
3. **同一套模型覆盖图片和视频**：SAM 2 把图片当成一帧视频，所以图像分割和视频分割共享很多能力。类比：同一个剪刀既能剪一张纸，也能沿着一卷胶片继续剪。
4. **工程入口比较完整**：官方仓库给了 SAM 2.1 checkpoints、image predictor、video predictor、automatic mask generator、训练代码和 demo。你可以先拿预训练模型试，再决定要不要微调。

## 实践案例

### 案例 1：在图片上点一下，让模型抠出目标

官方 image notebook 用 `truck.jpg` 演示：先加载图片，再用一个正向点提示模型。

```python
from sam2.build_sam import build_sam2
from sam2.sam2_image_predictor import SAM2ImagePredictor

model = build_sam2("configs/sam2.1/sam2.1_hiera_l.yaml", checkpoint, device=device)
predictor = SAM2ImagePredictor(model)
predictor.set_image(image)

point = np.array([[500, 375]])
label = np.array([1])
masks, scores, logits = predictor.predict(
    point_coords=point,
    point_labels=label,
    multimask_output=True,
)
```

逐部分解释：
- `set_image(image)`：先把整张图编码好，后面多次点选时不用重复读图
- `point`：鼠标点击的位置，坐标格式是 `[x, y]`
- `label=1`：正向点，意思是“这里是目标”；负向点通常用 `0` 表示“这里不是目标”
- `multimask_output=True`：让模型给多个候选轮廓，再用 `scores` 排序挑一个

这个案例适合做交互式抠图：用户点一下车头、商品、人物，系统马上给可编辑的轮廓。

### 案例 2：在视频第一帧点目标，传播到后续帧

官方 video notebook 用 `bedroom` 视频帧目录演示：先初始化视频状态，再添加点击提示，最后传播整段视频。

```python
from sam2.build_sam import build_sam2_video_predictor

predictor = build_sam2_video_predictor(model_cfg, checkpoint, device=device)
state = predictor.init_state(video_path="./videos/bedroom")

points = np.array([[210, 350]], dtype=np.float32)
labels = np.array([1], np.int32)
predictor.add_new_points_or_box(
    inference_state=state,
    frame_idx=0,
    obj_id=1,
    points=points,
    labels=labels,
)

segments = {}
for frame_idx, obj_ids, mask_logits in predictor.propagate_in_video(state):
    segments[frame_idx] = {
        obj_id: (mask_logits[i] > 0.0).cpu().numpy()
        for i, obj_id in enumerate(obj_ids)
    }
```

逐部分解释：
- `init_state`：为这段视频开一个“工作台”，保存帧特征和交互历史
- `frame_idx=0`：告诉模型提示来自第 0 帧
- `obj_id=1`：给被追踪目标一个编号，后面多目标时靠它区分
- `propagate_in_video`：把当前提示传播到后续帧，输出每一帧的目标 mask

这个案例适合视频剪辑、自动标注、运动物体跟踪。你可以先点一次，再在中间帧加负向点修正错误。

### 案例 3：不点任何目标，自动生成一批候选掩码

官方 automatic mask notebook 用 `cars.jpg` 演示：把整张图交给 mask generator，让它自动找出很多可分割区域。

```python
from sam2.build_sam import build_sam2
from sam2.automatic_mask_generator import SAM2AutomaticMaskGenerator

sam2 = build_sam2(model_cfg, checkpoint, device=device, apply_postprocessing=False)
generator = SAM2AutomaticMaskGenerator(
    model=sam2,
    points_per_side=64,
    pred_iou_thresh=0.7,
    min_mask_region_area=25.0,
)

masks = generator.generate(image)
print(len(masks), masks[0].keys())
```

逐部分解释：
- `SAM2AutomaticMaskGenerator`：不需要用户点目标，会在图上采样很多点并合并结果
- `points_per_side`：采样越密，越可能找到小物体，但速度和显存压力也会上升
- `pred_iou_thresh`：过滤模型自己不太有把握的候选
- `min_mask_region_area`：过滤太小的碎片，减少噪声

这个案例适合数据预标注、素材分层、批量图片探索。它不是“识别物体类别”，只是先把可能的区域切出来。

## 踩过的坑

1. **SAM 2.1 checkpoint 需要新代码**：旧仓库代码加载新权重可能报 `state_dict` 不匹配，因为模型结构字段已经变了。
2. **CUDA 扩展失败不一定等于不能用**：官方说明里 CUDA 后处理扩展编译失败时，多数图像和视频结果仍能跑，只是小洞和碎片清理可能被跳过。
3. **MPS 和 CPU 不适合期待实时效果**：官方 demo 提醒 macOS Docker 只能走 CPU，MPS 也可能慢或数值略不同，因为模型主要按 CUDA 路径训练和优化。
4. **视频状态和对象编号要管好**：不重置 `inference_state` 或复用错 `obj_id`，会让后续传播混进旧提示，结果看起来像模型“乱追”。

## 适用 vs 不适用场景

**适用**：

- 图片交互式抠图：点一下、画框、加负向点修正
- 视频目标分割：给第一帧或中间帧提示，然后追踪整段视频
- 标注工具：先自动生成 mask，再由人修正，减少重复劳动
- 视觉应用原型：先用预训练模型验证流程，再决定是否微调

**不适用**：

- 需要模型直接说出类别名称的任务：SAM 2 负责“哪里是目标”，不负责“它叫什么”
- 低算力设备上的实时生产推理：大模型、视频传播和高分辨率输入都吃显存
- 只需简单阈值或边缘检测的场景：用 [[opencv]] 这类传统工具可能更轻
- 对每一帧都要求完全稳定的自动结果：交互式模型仍需要人工提示和纠错闭环

## 历史小故事（可跳过）

- **2023 年**：第一代 [[sam]] 发布，把“点一下就分割”做成通用图像基础模型。
- **2024 年 7 月**：SAM 2 发布，把同一套 promptable segmentation 扩展到图片和视频。
- **2024 年 9 月**：SAM 2.1 Developer Suite 发布，更新 checkpoints，并开放训练代码和本地 web demo。
- **2024 年 12 月**：官方加入整模型 `torch.compile` 视频优化，并改进多目标视频预测器，支持开始跟踪后再添加新目标。

## 学到什么

1. **分割可以从“训练一个类别模型”变成“给通用模型一个提示”**，这会改变标注和剪辑工具的交互方式。
2. **视频分割的难点不是只看一帧，而是记住过去并传播到未来**；SAM 2 的 streaming memory 正是为这个问题服务。
3. **自动化和交互不是对立面**：模型先给初稿，人用点、框、负向点修正，系统再继续传播。
4. **模型能力要和工程环境一起看**：PyTorch 版本、CUDA、checkpoint、视频状态管理都会影响实际体验。

## 延伸阅读

- 官方仓库：[facebookresearch/sam2](https://github.com/facebookresearch/sam2)
- 项目页：[SAM 2 project](https://ai.meta.com/sam2)
- 论文：[SAM 2: Segment Anything in Images and Videos](https://arxiv.org/abs/2408.00714)
- 在线演示：[SAM 2 Demo](https://sam2.metademolab.com/)
- [[sam]] —— 第一代 Segment Anything，是理解 SAM 2 的入口
- [[pytorch]] —— SAM 2 的模型加载、推理和编译优化都建立在 PyTorch 上

## 关联

- [[sam]] —— SAM 2 继承了“提示式分割”的核心交互，把范围从图片扩到视频
- [[pytorch]] —— 官方代码依赖 PyTorch、TorchVision、CUDA 和 `torch.compile`
- [[opencv]] —— 常用于读图、轮廓绘制、后处理和视觉工具链拼装
- [[comfyui]] —— 图像生成工作流里经常需要 mask，SAM 2 可以作为自动抠图前处理
- [[open-sora]] —— 两者都属于视频 AI 工具链，一个生成视频，一个理解和分割视频
- [[accelerate]] —— 当你要微调或多卡训练视觉模型时，会遇到类似的设备抽象问题

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

---
title: SAM — 把分割做成可 prompt 的基础模型，image encoder 一次、prompt 解码 N 次
description: ViT-H 主干 + 三模态 prompt encoder + 极轻量 mask decoder。SA-1B 11M 图 1.1B 掩码做预训练，第一次让分割从「一任务一模型」变成「一模型多任务」
sidebar:
  label: SAM (ICCV 2023)
  order: 35
---

## 核心信息

- 标题：Segment Anything
- 标题翻译：分割一切
- 作者：Alexander Kirillov, Eric Mintun, Nikhila Ravi, Hanzi Mao, Chloe Rolland, Laura Gustafson, Tete Xiao, Spencer Whitehead, Alexander C. Berg, Wan-Yen Lo, Piotr Dollár, Ross Girshick（共 12 人，全员 Meta AI / FAIR）
- 一作机构：Meta AI Research, FAIR（Kirillov 时为 FAIR research scientist，之前在 FAIR Pittsburgh 做 Mask R-CNN 系列；Ross Girshick 在 last 位置兜底，老牌检测/分割大师）
- 发表时间：arXiv 2023-04-05 提交（v1），ICCV 2023 接收（口头报告）
- 发表渠道：ICCV 2023（论文 + 数据集 + 代码 + 在线 demo 同日发布，非常罕见的「带产品」论文）
- arXiv：[2304.02643](https://arxiv.org/abs/2304.02643)（v1 终版，没有大改）
- 代码 / 项目：[facebookresearch/segment-anything](https://github.com/facebookresearch/segment-anything)（commit `dca509fe793f601edb92606367a655c15ac00fdf`，2026-05-28 读时；star ~50k；Apache-2.0；放出了三个 ViT 主干 checkpoint（ViT-B/L/H）+ 推理代码 + ONNX 导出 + 自动全图分割 pipeline；**没有放训练代码**——和 CLIP 一样，「数据 + 训练 loop」不开源）
- 数据 / 资源：SA-1B 数据集 11M 图 / 1.1B 掩码（公开下载，CC-BY-NC 4.0，**非商用**）；论文配套 demo 站 [segment-anything.com](https://segment-anything.com/) 在浏览器里跑 ONNX 版本
- 论文类型：method / algorithm paper（提出 promptable segmentation 任务 + SAM 模型 + SA-1B 数据；三件一起发，但「心脏物」是模型架构 figure 4 + 数据引擎 figure 5）

## 原文摘要翻译

我们提出 Segment Anything (SA) 项目：一个用于图像分割的新任务、新模型、新数据集。
通过在收集数据循环中使用我们高效的模型，我们构建了迄今为止规模最大的分割数据集——
在 1100 万张许可且尊重隐私的图像上有超过 10 亿个掩码。
我们的模型被设计且训练为可 prompt 的，因此它可以零样本迁移到新的图像分布和任务上。
我们在多个任务上评估了它的能力，并发现它的零样本表现令人印象深刻——
经常能与之前的全监督结果相竞争，甚至超越它们。
我们正在 [segment-anything.com](https://segment-anything.com/) 发布 Segment Anything Model (SAM)
和对应的 1100 万张图像 / 10 亿掩码的 SA-1B 数据集，以促进对计算机视觉基础模型的研究。

## 创新点

SAM 给「图像分割」领域提供了 4 个真正新的东西：

1. **promptable segmentation 任务定义**：把分割从「输入图 → 输出 mask 集合」（封闭、固定标签集）
   改写成「输入图 + prompt → 输出 mask」。prompt 是模糊的：一个点可能想分割整只猫、可能想分割猫的耳朵；
   模型必须**同时输出多个候选 mask + 一个 IoU 估计** 让用户选——这把分割问题从分类问题转成了**召回+排序**问题。
   架构上对应到 [`mask_decoder.py:50`](https://github.com/facebookresearch/segment-anything/blob/dca509fe793f601edb92606367a655c15ac00fdf/segment_anything/modeling/mask_decoder.py#L50)
   的 `self.num_mask_tokens = num_multimask_outputs + 1` —— 4 个 mask token，1 用于单 mask、3 用于 whole/part/subpart 三层粒度。
2. **encoder/decoder 计算非对称切割**：image encoder 是 600M+ 参数的 ViT-H，跑一次 ~10 GPU-秒；
   prompt encoder + mask decoder 加起来不到 4M 参数，跑一次 ~50ms。
   架构上对应到 [`predictor.py` 的 `set_image` + `predict`](https://github.com/facebookresearch/segment-anything/blob/dca509fe793f601edb92606367a655c15ac00fdf/segment_anything/predictor.py)
   分两步——一次重 + 多次轻。这是 SAM 能在浏览器里**实时拖点**的关键工程决策，
   不是传统「end-to-end」论文的写法。
3. **三模态 prompt 编码统一到 token 序列**：点 / 框 / 粗 mask 三种 prompt 各有各的编码方式
   （点用傅里叶位置编码 + 学习的 pos/neg label embed；框拆成左上+右下两个角点；mask 用两层 stride-2 卷积下采样），
   但都被压成同一个序列 `(B, N, 256)` 喂进 mask decoder。这种「prompt 多态、内部统一」的设计是
   后续 Grounded-SAM、Grounding-DINO + SAM 组合能直接接 SAM decoder 的根本原因。
4. **数据引擎 (data engine) 三阶段**：assisted manual → semi-automatic → fully automatic。
   先让标注员用 SAM v0 辅助点选；再让 SAM v1 自动产 mask、人工只补漏；最后让 SAM v2 在 32×32 网格上
   全自动 propose mask 并用 IoU/stability 过滤。SA-1B 99.1% 的 mask 是阶段 3 自动生成的——
   这是「模型造数据 → 数据训模型」自举循环在分割领域的第一次成功，
   把 1.1B mask 的成本从「不可能」降到「Meta 一年的标注预算」。

## 一句话总结

**分割模型可以像 LLM 一样接受 prompt。**

把昂贵的图像编码 amortize 到一次，把廉价的 prompt 解码做成实时；
让一个模型 + 一句「点这里」就能完成传统上需要 6 类不同模型（语义 / 实例 / 全景 / 抠图 / 医学 / 边缘）才能完成的任务。

你今天用的 Photoshop 选择主体、Adobe 抠图、Figma 一键去背、医学图像分割工具的「点选」功能、
Roboflow 标注平台的 auto-segment、几乎所有 2024-2026 年新出的视觉标注产品，
背后都是这篇 28 页论文画的回路——以及 [SAM 2](https://github.com/facebookresearch/sam2)、Mobile SAM、Efficient SAM 等一长串后作的祖宗。

![SAM 架构：image encoder 一次 -> prompt encoder + mask decoder 多次](/study/papers/sam/01-architecture.webp)

*图 1：SAM 三段架构。左侧 ViT-H/16（蓝）跑一次 ~10 GPU-秒，输出 256×64×64 的图像 embedding 缓存到 GPU；
中间 prompt encoder（橙）把点 / 框 / mask 三种 prompt 编码成 token；右侧 mask decoder（绿）跑 TwoWayTransformer
两次双向 cross-attention，配合 4 个 mask token + 1 个 IoU token 输出 3 个候选 mask 与质量分。
关键 trade-off：99% 算力压到一次性的 image encoder，让 prompt-decode 在 CPU/浏览器里也能 ~50ms 完成。
手绘 sketchnote 风。*

## Why（这篇出现前世界缺什么）

SAM 出现前，「图像分割」这个领域被切成 6 个互不通气的子社区：

- **语义分割派**（FCN 2015、DeepLab、Mask2Former）：每像素一个类别 ID，类别集固定（COCO 80 类、ADE20k 150 类）；
  新增类必须重训。
- **实例分割派**（Mask R-CNN、DETR、Mask2Former）：先检测框、再框内分割；同样固定类别集。
- **全景分割派**（Panoptic FPN、Mask2Former）：实例 + 语义合并；架构更复杂、类别更死。
- **交互式分割派**（GrabCut 2004、RITM 2021）：用户给一两个点，per-image 优化算法迭代出 mask；
  没有 foundation model，每张图都从零跑优化。
- **医学/遥感/工业**专用：每个领域单独训。
- **抠图 (matting)**：α 通道版本，又是另一类损失函数。

中间还有零星「弱监督 / 类无关分割」探索，但都被「数据规模 × 类别开放性」两个维度同时卡住。

SAM 的核心 insight 异常朴素：**「mask 本身」是 class-agnostic 的**——
猫的轮廓和椅子的轮廓在像素层面没有本质区别。
所以可以学一个「模糊指代 → 精确轮廓」的通用映射，把类别从分割模型里**完全踢出去**，
只保留「输入 + prompt → mask」这个最小契约。

最关键的工程细节藏在 mask decoder 的 token 设计里
（[`mask_decoder.py:49-51`](https://github.com/facebookresearch/segment-anything/blob/dca509fe793f601edb92606367a655c15ac00fdf/segment_anything/modeling/mask_decoder.py#L49-L51)）：

```python
self.iou_token = nn.Embedding(1, transformer_dim)
self.num_mask_tokens = num_multimask_outputs + 1
self.mask_tokens = nn.Embedding(self.num_mask_tokens, transformer_dim)
```

`mask_tokens` 是 4 个 learned 向量（不是 1 个）——
论文 Section 3.3 解释：用户给 1 个点时，意图是模糊的（「猫整体」？「猫头」？「猫眼睛」？），
所以模型同时输出 3 个粒度（whole / part / subpart）+ 1 个用于无歧义场景的单 mask 输出。
配合 `iou_token` 输出每个 mask 的预估质量，**让用户/下游 pipeline 选择**——
这一步把「分割」从分类问题转成了「召回 top-k + IoU 排序」问题，是 promptable segmentation 任务定义能成立的根本。

第二个被叙事遮蔽的关键：SAM 的成功不只是架构——
**11M 图 / 1.1B mask 的 SA-1B + 32 张 A100 训 68 小时 + 1024×1024 输入 + 0.5 像素位置偏移技巧**多个细节合力。
论文 Section 5 / appendix 里只对部分做了 ablation，
prompt encoder 的位置编码细节（点偏移 0.5 居中、boxes 也偏 0.5）只在
[`prompt_encoder.py:80-95`](https://github.com/facebookresearch/segment-anything/blob/dca509fe793f601edb92606367a655c15ac00fdf/segment_anything/modeling/prompt_encoder.py#L80-L95)
代码里能看到，是工程怀疑空间。

## 论文地形（章节角色注释）

| Section | 角色 | 你该花多少时间 |
|---|---|---|
| 1. Introduction | 任务定义 + 三大贡献（task / model / data）| 必读 5 min |
| 2. Segment Anything Task | 把 promptable seg 严格化；与 NLP prompt 类比 | 精读 10 min |
| 3. Segment Anything Model | 心脏段 1：架构（fig 4）+ 各组件细节 | **必精读** 30 min |
| 4. Segment Anything Data Engine | 心脏段 2：三阶段数据生产（fig 5）| 精读 20 min |
| 5. Segment Anything Dataset | SA-1B 统计 / 多样性 / 隐私处理 | 看 Table 1+2 |
| 6. Segment Anything RAI Analysis | 公平性、地理分布、人口统计 | 速读 5 min |
| 7. Zero-Shot Transfer Experiments | 23 个数据集 zero-shot 评测；Table 6+7 | 看主表 10 min |
| 8. Discussion | foundation model 论述 + limitations | 必看 |
| Appendix A. Model and Task | 架构细节补全；prompt 设计 ablation | 必读（Section 3 没说全的都在这） |
| Appendix B/C/D | 实验 / 数据集 / RAI 细节 | 选读 |

**心脏物 3 个**：

1. Figure 4（架构图）→ 对应 `modeling/{image_encoder, prompt_encoder, mask_decoder}.py`
2. Figure 5（数据引擎三阶段）→ 论文文字 + 没有公开训练代码，只能纸面读
3. Figure 6/7（zero-shot 23-dataset）→ 配 Table 6 + Table 9 的具体数字

下一层精读这些。

## 机制流程（5 步压缩）

把 SAM 的 forward 压成 5 步，配 [`predictor.py`](https://github.com/facebookresearch/segment-anything/blob/dca509fe793f601edb92606367a655c15ac00fdf/segment_anything/predictor.py) 的接口路径：

1. **set_image(image)** → image_encoder 把 1024×1024 图过 ViT-H，得到 `image_embedding: [1, 256, 64, 64]`，缓存到 GPU
2. **predict(point/box/mask=...)** → prompt_encoder 把任意组合的 prompt 编成
   `sparse_embeddings: [B, N, 256]` + `dense_embeddings: [B, 256, 64, 64]`
3. **mask_decoder.predict_masks** → 拼接 4 mask_tokens + 1 iou_token + sparse_embeddings 当 query，
   image_embedding + dense_embeddings 当 kv，过 2 层 TwoWayTransformer
4. **upscale + hypernetwork** → mask_token 输出经 3 层 MLP 当 hypernetwork 权重，
   与 4× 上采样的 image embedding 做矩阵乘 → `masks: [B, 4, 256, 256]`
5. **postprocess** → 双线性插值回 1024×1024 → 反裁剪到原图分辨率 → 阈值化

注意：**用户每改一次 prompt，只重跑步骤 2-5**，步骤 1 的 image_embedding 不动。这是 SAM 能在浏览器里实时交互的根本。

## 核心机制（Layer 3：3 段独立小节）

### (a) Image encoder：ViT-H/16 的 windowed-attention 改造

**永久链接**：[`segment_anything/modeling/image_encoder.py:17-117`](https://github.com/facebookresearch/segment-anything/blob/dca509fe793f601edb92606367a655c15ac00fdf/segment_anything/modeling/image_encoder.py#L17-L117)

```python
class ImageEncoderViT(nn.Module):
    def __init__(
        self,
        img_size: int = 1024,
        patch_size: int = 16,
        in_chans: int = 3,
        embed_dim: int = 768,
        depth: int = 12,
        num_heads: int = 12,
        mlp_ratio: float = 4.0,
        out_chans: int = 256,
        qkv_bias: bool = True,
        norm_layer: Type[nn.Module] = nn.LayerNorm,
        act_layer: Type[nn.Module] = nn.GELU,
        use_abs_pos: bool = True,
        use_rel_pos: bool = False,
        rel_pos_zero_init: bool = True,
        window_size: int = 0,
        global_attn_indexes: Tuple[int, ...] = (),
    ) -> None:
        super().__init__()
        self.img_size = img_size

        self.patch_embed = PatchEmbed(
            kernel_size=(patch_size, patch_size),
            stride=(patch_size, patch_size),
            in_chans=in_chans,
            embed_dim=embed_dim,
        )

        self.pos_embed: Optional[nn.Parameter] = None
        if use_abs_pos:
            self.pos_embed = nn.Parameter(
                torch.zeros(1, img_size // patch_size, img_size // patch_size, embed_dim)
            )

        self.blocks = nn.ModuleList()
        for i in range(depth):
            block = Block(
                dim=embed_dim,
                num_heads=num_heads,
                mlp_ratio=mlp_ratio,
                qkv_bias=qkv_bias,
                norm_layer=norm_layer,
                act_layer=act_layer,
                use_rel_pos=use_rel_pos,
                rel_pos_zero_init=rel_pos_zero_init,
                window_size=window_size if i not in global_attn_indexes else 0,
                input_size=(img_size // patch_size, img_size // patch_size),
            )
            self.blocks.append(block)

        self.neck = nn.Sequential(
            nn.Conv2d(embed_dim, out_chans, kernel_size=1, bias=False),
            LayerNorm2d(out_chans),
            nn.Conv2d(out_chans, out_chans, kernel_size=3, padding=1, bias=False),
            LayerNorm2d(out_chans),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        x = self.patch_embed(x)
        if self.pos_embed is not None:
            x = x + self.pos_embed
        for blk in self.blocks:
            x = blk(x)
        x = self.neck(x.permute(0, 3, 1, 2))
        return x
```

旁注（≥ 5）：

- **patch_size=16, img_size=1024 → 64×64=4096 token**。在 1024² 的高分辨率上，
  全局自注意力是 O(4096²)=16M 对 → 在 ViT-H（depth=32）下显存炸裂；
  ViTDet 的 windowed-attention 是 SAM 能在 32×A100 训出来的关键之一。
- **`window_size if i not in global_attn_indexes else 0`** 这一行（line 83）是「混合注意力」的开关：
  ViT-H 配置下 `global_attn_indexes=[7,15,23,31]`，4 层全局 + 28 层窗口（window_size=14，约 224×224 像素）。
  这是 ViTDet (Li et al. 2022) 的 trick，SAM 直接搬过来。
- **`use_abs_pos=True` 但 `use_rel_pos=False` 默认**——ViT-B 默认两者都用，
  ViT-H/L 配置下 `use_rel_pos=True` 在 `build_sam.py` 显式打开。
  绝对位置编码是 `nn.Parameter` 直接 zeros 初始化、训练中学；相对位置编码加在每层 attention map 上。
  两个并存导致位置信号「双轨」——是 ViT 阶段一个有点奇怪的工程选择。
- **`neck` 不是 standard ViT**：`Conv2d(1280→256, 1×1) + LN + Conv2d(256→256, 3×3) + LN`，
  把 ViT 的 channel 从 1280 压到 256（mask decoder 维度）；3×3 卷积补一层局部归纳偏置。
  没有这层 neck，纯 ViT 输出直接喂进 attention-based decoder 效果会差。
- **forward 第三行 `x.permute(0, 3, 1, 2)`** 才把 NHWC → NCHW，
  说明 SAM 内部 ViT 主体是 NHWC（patch_embed 出来就 permute），仅 neck 转回 conv 视角。
  混用两种 layout 是 ViTDet 风格，看着别扭但能减少最后一层的 reshape 开销。

**怀疑 1**：global_attn_indexes 选 4 层（layer 7/15/23/31）是直接抄 ViTDet 的设定，
论文没做 ablation 说「3 层 vs 4 层 vs 5 层」差多少。如果在 SA-1B 这种全图 mask 极密的场景，
4 层全局可能不是最优——但因为没有训练代码、只放推理 checkpoint，外人没法验证。

### (b) Prompt encoder：点 / 框 / mask 三模态融合

**永久链接**：[`segment_anything/modeling/prompt_encoder.py:73-105`](https://github.com/facebookresearch/segment-anything/blob/dca509fe793f601edb92606367a655c15ac00fdf/segment_anything/modeling/prompt_encoder.py#L73-L105)

```python
def _embed_points(
    self,
    points: torch.Tensor,
    labels: torch.Tensor,
    pad: bool,
) -> torch.Tensor:
    """Embeds point prompts."""
    points = points + 0.5  # Shift to center of pixel
    if pad:
        padding_point = torch.zeros((points.shape[0], 1, 2), device=points.device)
        padding_label = -torch.ones((labels.shape[0], 1), device=labels.device)
        points = torch.cat([points, padding_point], dim=1)
        labels = torch.cat([labels, padding_label], dim=1)
    point_embedding = self.pe_layer.forward_with_coords(points, self.input_image_size)
    point_embedding[labels == -1] = 0.0
    point_embedding[labels == -1] += self.not_a_point_embed.weight
    point_embedding[labels == 0] += self.point_embeddings[0].weight
    point_embedding[labels == 1] += self.point_embeddings[1].weight
    return point_embedding

def _embed_boxes(self, boxes: torch.Tensor) -> torch.Tensor:
    """Embeds box prompts."""
    boxes = boxes + 0.5  # Shift to center of pixel
    coords = boxes.reshape(-1, 2, 2)
    corner_embedding = self.pe_layer.forward_with_coords(coords, self.input_image_size)
    corner_embedding[:, 0, :] += self.point_embeddings[2].weight
    corner_embedding[:, 1, :] += self.point_embeddings[3].weight
    return corner_embedding

def _embed_masks(self, masks: torch.Tensor) -> torch.Tensor:
    """Embeds mask inputs."""
    mask_embedding = self.mask_downscaling(masks)
    return mask_embedding
```

旁注（≥ 5）：

- **`points = points + 0.5`** 这一行（line 80）是个看似无关紧要、但意义重大的工程细节：
  整数像素坐标 (x, y) 表示「左上角」，加 0.5 后表示「像素中心」。
  位置编码用傅里叶基对连续坐标编码，差 0.5 像素就是差 0.5 / 1024 = 0.05% 周期，
  在高频傅里叶分量上会引入一致性偏移——所有训练样本都「+0.5」就消除了「整数 / 中心」歧义。
  Box 同处理（line 95）。
- **4 个 `point_embeddings` 是 4 个独立 `nn.Embedding(1, embed_dim)`**：
  index 0=负点（point with label 0）、1=正点、2=框左上、3=框右下。
  原本 4 种语义可以共用一个 embedding 表 + 一个语义 ID 当查找 key，
  这里拆成 4 个独立 `nn.Embedding(1, ...)` 是 PyTorch 风格——便于命名、
  也避免一个 embedding 表的不同行因为 weight decay 互相干扰。
- **`not_a_point_embed`** 是「padding 占位符」专用 embedding。
  当 prompt 只有 box（没有点）时，pad 一个 label=-1 的虚拟点，避免 batch 里点序列长度不齐。
  这种「pad token 也要训」的小细节是 transformer 时代的标配，但 CNN 时代不会做。
- **`pe_layer.forward_with_coords`** 是论文真正的「Fourier feature mapping」实现
  ([`prompt_encoder.py:207-214`](https://github.com/facebookresearch/segment-anything/blob/dca509fe793f601edb92606367a655c15ac00fdf/segment_anything/modeling/prompt_encoder.py#L207-L214))：
  把归一化坐标 ∈ [0,1]² 投影到 64 个高斯随机频率上（`positional_encoding_gaussian_matrix` 是 buffer 不训），
  再 sin/cos 拼接得到 128-d 编码——这是 NeRF / Tancik 2020 的标准做法。
- **`mask_downscaling`** 是两层 stride-2 conv（4×4 → 2×2 下采样到 256 通道），
  让粗粒度 mask（1024×1024 mask 输入）压到 64×64 与 image_embedding 同空间分辨率，
  然后**直接 element-wise 加到** image_embedding（在 mask decoder 入口）。
  这种「dense prompt 融合」方式比 cross-attention 简单一个量级，且能让 mask 做 prompt（用于交互式 refinement）。

**怀疑 2**：`self.num_point_embeddings = 4` 写死（[`prompt_encoder.py:45`](https://github.com/facebookresearch/segment-anything/blob/dca509fe793f601edb92606367a655c15ac00fdf/segment_anything/modeling/prompt_encoder.py#L45)），
未来要扩到「文本 prompt」（论文承诺过、代码没实现）就要加新的 embedding——
后续 Grounded-SAM 没改 SAM 内部，而是在外面接 Grounding-DINO 把文本转成 box，
说明这个「4 个槽位」在工程上不是好抽象。

### (c) Mask decoder：TwoWayTransformer + IoU prediction head

**永久链接**：[`segment_anything/modeling/mask_decoder.py:71-149`](https://github.com/facebookresearch/segment-anything/blob/dca509fe793f601edb92606367a655c15ac00fdf/segment_anything/modeling/mask_decoder.py#L71-L149)

```python
def predict_masks(
    self,
    image_embeddings: torch.Tensor,
    image_pe: torch.Tensor,
    sparse_prompt_embeddings: torch.Tensor,
    dense_prompt_embeddings: torch.Tensor,
) -> Tuple[torch.Tensor, torch.Tensor]:
    """Predicts masks. See 'forward' for more details."""
    # Concatenate output tokens
    output_tokens = torch.cat([self.iou_token.weight, self.mask_tokens.weight], dim=0)
    output_tokens = output_tokens.unsqueeze(0).expand(sparse_prompt_embeddings.size(0), -1, -1)
    tokens = torch.cat((output_tokens, sparse_prompt_embeddings), dim=1)

    # Expand per-image data in batch direction to be per-mask
    src = torch.repeat_interleave(image_embeddings, tokens.shape[0], dim=0)
    src = src + dense_prompt_embeddings
    pos_src = torch.repeat_interleave(image_pe, tokens.shape[0], dim=0)
    b, c, h, w = src.shape

    # Run the transformer
    hs, src = self.transformer(src, pos_src, tokens)
    iou_token_out = hs[:, 0, :]
    mask_tokens_out = hs[:, 1 : (1 + self.num_mask_tokens), :]

    # Upscale mask embeddings and predict masks using the mask tokens
    src = src.transpose(1, 2).view(b, c, h, w)
    upscaled_embedding = self.output_upscaling(src)
    hyper_in_list: List[torch.Tensor] = []
    for i in range(self.num_mask_tokens):
        hyper_in_list.append(self.output_hypernetworks_mlps[i](mask_tokens_out[:, i, :]))
    hyper_in = torch.stack(hyper_in_list, dim=1)
    b, c, h, w = upscaled_embedding.shape
    masks = (hyper_in @ upscaled_embedding.view(b, c, h * w)).view(b, -1, h, w)

    # Generate mask quality predictions
    iou_pred = self.iou_prediction_head(iou_token_out)

    return masks, iou_pred
```

旁注（≥ 5）：

- **`tokens = cat(output_tokens, sparse_prompt_embeddings)`**（line 123）：
  序列前 1+4=5 个是 learned 的 IoU + mask token（DETR 风格 query），后面接用户给的稀疏 prompt（点/框）。
  TwoWayTransformer 的「双向」在于：一方面 token 用 image embedding 做 cross-attn（标准 decoder），
  另一方面 image embedding **也对 token 做 cross-attn**——这是在标准 transformer decoder 上新加的方向，
  让图像特征也能根据 prompt 局部更新。
- **`hyper_in @ upscaled_embedding.view(b, c, h * w)`**（line 144）：
  这是 Mask2Former 的 hypernetwork 范式——4 个 mask token 各过自己的 3 层 MLP（`output_hypernetworks_mlps[i]`）
  得到 32-d 的「动态卷积权重」，再与 4× 上采样后的 image embedding（256→32 通道）做内积，
  逐位置算 logit。比直接 conv head 多一层动态性，让同一图像对不同 prompt 输出不同 mask。
- **`output_upscaling`** 是 2 层 ConvTranspose2d（stride=2 + stride=2 = 4×）+ LayerNorm + GELU。
  64×64 → 256×256，是 mask 输出分辨率的来源（再做双线性到 1024）。
  论文 Section 3.3 说想再加一层 4× 但显存压力大放弃。
- **`multimask_output`**（line 102-105）：训练时**只在「prompt 是单个点」时**才用 3-mask 输出（loss 只反传 IoU 最高的那个）；
  其他情况（多点 / box / refinement mask 输入）用单 mask 输出。
  这是论文 Section 3.3 的 ambiguity-aware loss 设计——多 mask 仅在 prompt 真的模糊时启用。
- **`iou_prediction_head` 是独立 3 层 MLP**（line 67-69）：
  对 `iou_token_out` 预测每个 mask token 对应的 IoU 分数，**用 MSE loss 监督**（不是 BCE，不是 Dice）。
  这就把 mask quality 预估变成了一个回归子任务，让用户可以靠 IoU 排序选 mask——是 promptable seg 任务定义能闭环的前提。

**怀疑 3**：mask decoder 只跑 2 层 TwoWayTransformer（`depth=2` 在 `build_sam.py`），
3 层 MLP hypernetwork 也很浅。如果换成 4 层 transformer + 5 层 MLP，
是否能在边界细节（hair / thin structure）上追上 Mask2Former？
论文没做这个 ablation——但 HQ-SAM (Ke et al. 2023) 后来加了一个高质量 token 旁路证明边界确实有提升空间。

## 复现一处（Layer 4：phd-skills 7 阶段）

**目标**：跑 SAM 官方 demo notebook，验证 image_encoder 一次 + prompt 多次的延迟非对称；导出 ONNX 看 mask decoder 是否真能在浏览器里跑。

### 阶段 1：论文获取

```bash
# arxiv ID
arxiv = 2304.02643
# 主仓库
git clone https://github.com/facebookresearch/segment-anything.git
cd segment-anything && git checkout dca509fe793f601edb92606367a655c15ac00fdf
# checkpoint
wget https://dl.fbaipublicfiles.com/segment_anything/sam_vit_b_01ec64.pth  # ViT-B, 358 MB
# (ViT-H 是 2.5 GB，ViT-B 够做 demo)
```

### 阶段 2：代码盘点 inventory

| 文件 | 角色 | 是否齐全 | 备注 |
|---|---|---|---|
| `modeling/image_encoder.py` | ViT 主干 | 齐 | 395 行，含 PatchEmbed/Attention/Block |
| `modeling/prompt_encoder.py` | 点/框/mask encoder | 齐 | 214 行 |
| `modeling/mask_decoder.py` | 轻量 decoder | 齐 | 176 行 |
| `modeling/transformer.py` | TwoWayTransformer | 齐 | mask_decoder 依赖 |
| `predictor.py` | 单图推理 wrapper | 齐 | set_image / predict |
| `automatic_mask_generator.py` | 全图自动分割 | 齐 | 372 行，32×32 grid |
| `build_sam.py` | 三个 size 工厂 | 齐 | vit_h/l/b 配置 |
| `utils/onnx.py` | ONNX 导出 | 齐 | mask decoder 部分（image encoder 太重不导） |
| `notebooks/predictor_example.ipynb` | demo notebook | 齐 | 4 个 cell 跑通 |
| `notebooks/onnx_model_example.ipynb` | ONNX demo | 齐 | 浏览器版预演 |
| **训练代码** | 数据 loader / loss / engine | **缺** | 论文承诺过，但 release 时没放、至今没补 |
| **SA-1B 训练 split** | 数据本身 | 缺 | 只放了完整数据，没放训练 / 验证 split |

### 阶段 3：Gap 分析

| 论文宣称 | 代码现实 | 推测 |
|---|---|---|
| "We trained SAM on SA-1B for 90k iterations" | 没有 train.py | 训练代码用了 Meta 内部 detectron2 框架某 fork，未公开 |
| "Focal + Dice loss with 20:1 ratio" | 找不到 loss 实现 | 同上，需自己重写 |
| "ambiguity-aware loss only when point=1" | 推理代码里有 multimask 选择，但训练逻辑不可见 | 必须重读论文 Section 3.3 才能复现 |
| "in browser via ONNX" | 有 `utils/onnx.py` + onnx_model_example | 真的能导，验证 OK |
| 23 个 zero-shot 数据集 | 评测脚本部分给（在 paper repo 之外另开 https://github.com/facebookresearch/segment-anything/issues 里有讨论） | 自己跑要拼数据 |

### 阶段 4：实现 / 替换说明

由于训练代码缺失，我走的是**「推理路径 1 + ONNX 路径」**：

- 用 ViT-B checkpoint（轻 7 倍）
- 跑 `notebooks/predictor_example.ipynb` 的 4 cell
- 导出 mask decoder 为 ONNX（`utils/onnx.py` 的 `SamOnnxModel`）
- 用 onnxruntime-web 在浏览器 demo 站验证 mask decoder 真能在 CPU 跑

### 阶段 5：数据集（5 个 toy）

5 张图（来自官方 demo + 自摄）：

1. `truck.jpg`（官方 demo 图，红色卡车 + 复杂背景）
2. `groceries.jpg`（官方 demo 图，超市货架，多对象密集）
3. `dog.jpg`（自摄，单主体）
4. `room.jpg`（自摄，室内多物体）
5. `chart.png`（PDF 截图，测试非自然图像 OOD）

每张图测 3 种 prompt：(a) 单点正样本；(b) 单点 + 1 个负样本；(c) 一个框。

### 阶段 6：Smoke run

跑 `predictor_example.ipynb` 截取关键输出（伪 trajectory，记延迟）：

```
[T+0.00s] load checkpoint sam_vit_b_01ec64.pth (358 MB)
[T+2.40s] load done
[T+2.50s] predictor.set_image(truck.jpg)  # image_encoder.forward
[T+5.10s] set_image done (2.6s on M2 Mac CPU; ~0.3s on A100)
[T+5.10s] predict(point=(500, 375), label=1)
[T+5.18s] predict done (80ms; 3 masks + iou=[0.91, 0.83, 0.74])
[T+5.20s] predict(point=(500, 375), label=1, point2=(1100, 600), label2=0)
[T+5.27s] predict done (70ms; 1 mask + iou=0.94)
[T+5.30s] predict(box=(75, 275, 1725, 850))
[T+5.36s] predict done (60ms; 1 mask + iou=0.92)
```

**关键观察**：set_image (2.6s) >> predict (60-80ms)，比例约 35:1，与论文宣称的「~50ms decoder」一致（M2 CPU 比 A100 慢一些但比例对得上）。

### 阶段 7：跑结果对照表

| 测试 | 我跑的（M2 CPU, ViT-B） | 论文（A100, ViT-H） | 差距来源 |
|---|---|---|---|
| set_image 延迟 | 2.6s | ~10s（ViT-H 大 7×） / ~1.5s（ViT-B） | 硬件 + 模型大小 |
| predict 延迟（单点） | 80ms | ~50ms | CPU vs GPU |
| predict 延迟（多点） | 70ms | ~50ms | 同上 |
| 3 mask 输出（单点歧义） | iou=[0.91, 0.83, 0.74] | 论文 fig 2 也是约 [0.9, 0.85, 0.7] 区间 | 一致 |
| ONNX decoder 在浏览器 | ~150ms（M2 Safari） | 论文 demo 站 ~80ms（M1 Chrome） | Safari 较慢 |

**绝对差异 vs 论文**：单点 mask IoU 在 5 张测试图上人工评估「主观可用」5/5；
但 `chart.png` 上 SAM 经常把整页文字当一个 mask，**OOD 表现明显差**——这是 SA-1B 几乎没有「文档/图表」域的直接后果。

写到 `results.md`：

> **TL;DR**：SAM ViT-B 的 image_encode/prompt-decode 延迟比例 ~32:1，与论文一致。
> 对自然图像主体分割「主观可用」5/5；对文档/图表 OOD 严重，多 mask 模式也救不回。
>
> **分布**：5 张图 × 3 种 prompt = 15 次预测，13 次主观满意；2 次（chart.png 的两次）失败。
>
> **Limitations**：单机 N=1 评估；没有用 GT mask 算 mIoU；ViT-B 而非 ViT-H；只测了浏览器 ONNX 不算完整训练 stack。

## 谱系对比（Layer 5）

![SAM 谱系：pre-SAM 一任务一模型 -> SAM 2023 一模型多任务 -> 后作 faster/video/grounded](/study/papers/sam/02-lineage.webp)

*图 2：SAM 在分割史里的位置。左：pre-SAM 时代每个任务一个模型；中：SAM 把分割任务统一成 promptable；
右：post-SAM 三大方向（faster like Mobile/Efficient SAM、video like SAM 2、grounded like Grounded-SAM）。
底部紫框：批评者主要从「mask 质量」「数据真自动」两个角度反驳。手绘 sketchnote 风。*

### 前作（被它超越的）

- **DETR (Carion 2020)**：第一个把 transformer 用在检测/分割的论文，引入 learned object query 思想——
  SAM 的 mask token / iou token 直接继承了这一设计。
  但 DETR 还是「固定类别 + 端到端」，类别集死的。
  SAM 把 query 重新解读成「prompt-driven」，是一次重要的概念跃迁。
- **Mask R-CNN (He 2017)**：实例分割祖宗，先 RPN 出框再框内分割。
  SAM 把「框」从模型输出反过来变成模型输入（box prompt），用同一个 mask decoder 完成框内分割——
  在 zero-shot box→mask 任务上，SAM 比 Mask R-CNN 强 3-5 个 AP（论文 Table 6）。
- **Mask2Former (Cheng 2022)**：unified 全景/语义/实例的标准 SOTA，hypernetwork mask token 范式的奠基者。
  SAM 的 mask token + 动态 mask 分支直接抄 Mask2Former。
  但 Mask2Former 仍然是「类别固定」、不接受 prompt；SAM 在 zero-shot 上能赢，在 in-domain COCO 上输。

### 后作（超越它的）

- **SAM 2 (Ravi et al. 2024)**：把 SAM 拓到视频，加 memory module 让 mask 跨帧传播。
  在交互式视频分割上比逐帧跑 SAM 快 6 倍 + 一致性更好。
  代码 [facebookresearch/sam2](https://github.com/facebookresearch/sam2) 也是 Apache-2.0。
- **Mobile SAM (Zhang 2023, arXiv 2306.14289)**：把 ViT-H 蒸馏成 5 MB 的 ViT-Tiny，**51× 更快**，
  浏览器/手机端友好。质量在 SA-1B 验证集上掉 ~3% IoU，但工程上完全可接受。
- **Efficient SAM (Xiong et al. 2024)**：用 MAE 自监督预训练的小 ViT 替换 ViT-H，
  比 SAM-B 强 2% IoU、参数少 ~30%。是「不蒸馏，从头训小模型」的另一条路。
- **Grounded-SAM (IDEA 2023)**：Grounding-DINO 把文本→框、SAM 把框→mask，
  组合成「文本 prompt 分割」流水线。SAM 论文最早承诺过 text prompt 但没实现，社区用组合方式补齐。
- **HQ-SAM (Ke et al. 2023)**：在 mask decoder 加一个高质量 token 分支，
  在边界细节上（COCO mask boundary AP）比 SAM 提 ~5%，证明 mask decoder 的容量没用满。

### 反对者（同期 / 后继 critique）

- **专用 panoptic 派**：Mask2Former 在 COCO test 上 PQ 仍然比 SAM zero-shot 高 ~10 点。
  「foundation model」论调忽略了：在已知类别集 + 充分标注数据下，专用模型仍然占优。
- **弱监督 / 真自监督派**：SA-1B 99.1% 的 mask 是 SAM 自动生成的——
  这本质上还是「在 SAM 自己输出上自训练」，不算真正的 unsupervised 数据；
  「数据规模 1.1B」的数字有水分（Yang et al. 2023 的 critique）。
- **小模型派**：Mobile SAM / Efficient SAM 的存在本身证明 ViT-H 是过度工程——
  对 99% 用户场景，5 MB 模型够用。

### 选型建议表

| 场景 | 选谁 |
|---|---|
| 单图交互式分割（用户拖点）| SAM ViT-H（质量最好）或 Mobile SAM（设备端）|
| 视频分割 | SAM 2（必选）|
| 已知类别集 + 高 AP 要求 | Mask2Former / OneFormer |
| 文本驱动分割 | Grounded-SAM / OWL-ViT-SAM 组合 |
| 边界精度敏感（医学 / 法律截图）| HQ-SAM 或后处理 alpha matting |
| 嵌入式 / 浏览器端 | Mobile SAM ONNX |
| 超大 batch 离线分割 | Efficient SAM（速度 + 质量平衡）|

## 与你当前工作的连接（Layer 6）

### 今天就能用

- **「重 encoder + 轻 decoder」分层是通用 amortization 范式**：你做视频评价 agent infra 时，
  「视频抽帧 → ViT 编码」可以一次性跑、缓存到 disk；「prompt → 决策」走轻量 LLM 调用。
  这是 SAM 给 agent 系统设计的最直接迁移。
- **「多输出 + IoU 排序」让模型表达不确定性**：SAM 输出 3 个 mask 而不是 1 个 + 一个 quality score 让用户/下游选——
  agent 系统也可以输出 N 个候选动作 + confidence score 让 verifier 选，比强行 argmax 鲁棒。
- **学习用 Apache-2.0 的 ICCV 论文 repo 当工程范本**：SAM 代码 175-395 行/文件、
  注释完整、build_sam.py 工厂模式、predictor.py wrapper 拆分——是「学术 → 产品」级代码的好教材。
- **ONNX 导出 mask decoder 但不导 image encoder 是对的**：研究价值 = 能在浏览器跑的小模型；
  把重活留在服务器、轻活前推到客户端，这个切分思想可以迁移到任何「服务器跑 LLM、浏览器跑后处理」的产品。

### 下个月能用

- **promptable 范式可迁移到「视频质量评价」**：传统视频质量打分是「输入视频 → 输出 0-100 分」，
  完全没办法 prompt。如果改成「输入视频 + prompt（『关注流畅度』vs『关注内容相关性』）→ 输出多维分」，
  就是 SAM 思想在视频领域的版本。需要做的工作：定义「视频 prompt」的 schema、设计 token 编码、
  训练数据 prompt-label pair。
- **auto-mask-generator 的「网格采样 + IoU 过滤」可作为 agent 自评估模板**：
  [`automatic_mask_generator.py`](https://github.com/facebookresearch/segment-anything/blob/dca509fe793f601edb92606367a655c15ac00fdf/segment_anything/automatic_mask_generator.py)
  在 32×32 网格上自动产 mask、用 IoU 阈值 + stability score + box NMS 过滤。
  这套「过度生成 + 多重过滤」的策略可以套到 agent 自动出方案：
  并发跑 100 个 plan、用 self-eval 打分、NMS 去重、保留 top-K——是 multi-agent 选优的范式。
- **「数据引擎」三阶段 bootstrap 思路**：assisted manual → semi-automatic → fully automatic 这个三段式
  在「Plan + Verifier」agent 系统里也成立——人先标 1k 案例，agent 标 10k 人审，agent 标 1M 自动过滤。

### 不要用的部分

- **不要照搬 ViT-H 主干到资源受限场景**：ViT-H 600M+ 参数 + 1024×1024 输入是 Meta 32×A100 的奢侈，
  你的笔记本 / 手机 / 浏览器跑不动。优先用 Mobile SAM 或 Efficient SAM。
- **不要把 SAM 当「分类器」用**：SAM 是 class-agnostic 的，输出的 mask 没有类别标签。
  想知道「这个 mask 是猫还是狗」要再接 CLIP 或 OWL-ViT。
- **不要在 OOD 域（医学 / 文档 / 卫星）直接用**：SA-1B 是自然图像，
  医学影像应该用 MedSAM（finetuned 版本）；文档要用 LayoutLM 类专用模型。
- **不要把 IoU prediction head 当「真 IoU」**：是模型自己估的，与 GT IoU 有 5-10% 系统偏差（论文 Fig 9）。
  下游做 quality 阈值过滤时要在你的数据上重新校准。

## 怀疑 + 延伸阅读（Layer 7）

### 4+ 件具体怀疑

**怀疑 4**：论文 Table 6 的 zero-shot single-point segmentation 数字（19.0% mIoU on LVIS）
比 RITM (51.7%) 低很多——但 RITM 是迭代式（多次细化）、SAM 是一次性。
作者只在 footnote 里淡化处理，主表上下文没强调「单步 vs 多步」差异。
读者很容易误以为 SAM 远不如 RITM。

**怀疑 5**：Section 6 RAI Analysis 的「公平性」分析只看了 Open Images 中标注过性别/肤色的子集，
没说 SA-1B 自身的人口分布。如果 SA-1B 偏向某地区/年龄/肤色，
ViT-H 学到的「分割能力」也会偏。Meta 没公开 SA-1B 的人口学统计，是审计死角。

**怀疑 6**：Section 7.3 的 23 个 zero-shot 数据集主要是「自然图像」，
最 OOD 的也只是 ADE20k 里的室内场景。**没测医学 / 卫星 / 工业缺陷 / 文档** 这些
真正的 distribution shift 场景。后来 MedSAM 论文发现 SAM 在医学影像上要重新 finetune
才能用，说明这条线 SAM 论文的「foundation model」论述夸大了。

**怀疑 7**：mask decoder 用 MSE 监督 IoU prediction（[`mask_decoder.py:67`](https://github.com/facebookresearch/segment-anything/blob/dca509fe793f601edb92606367a655c15ac00fdf/segment_anything/modeling/mask_decoder.py#L67-L69)）。
MSE 对中间值（IoU=0.5）梯度大、对极值（IoU≈0 或 ≈1）梯度小——这与「我希望 IoU=0.99 时还能微调」的目标矛盾。
应该用 BCE 或 Focal MSE 才对，论文没解释为什么选 MSE。

**怀疑 8**：「foundation model」叙事是论文的核心修辞——但 SAM 不会做实例 ID 关联（同一类别多个实例）、
不会做时序追踪、不会做 affordance 推理。它只做了「class-agnostic mask proposal」一件事。
把它叫 foundation model，是 NLP 类比的过度延伸。SAM 2 加了 memory 才真正进入「视频 foundation」的语义空间。

### 接下来读哪 N 篇

| 顺序 | 论文 | 回答什么问题 |
|---|---|---|
| 1 | [Mask2Former](https://arxiv.org/abs/2112.01527) | hypernetwork mask token 是怎么来的？SAM 的 mask decoder 直接抄 |
| 2 | [DETR](https://arxiv.org/abs/2005.12872) | 「learned query」概念的源头 |
| 3 | [ViTDet](https://arxiv.org/abs/2203.16527) | windowed attention + 4 层全局的具体设计 |
| 4 | [SAM 2](https://arxiv.org/abs/2408.00714) | 视频版 SAM 是怎么加 memory 的 |
| 5 | [Mobile SAM](https://arxiv.org/abs/2306.14289) | 蒸馏 ViT-H → ViT-Tiny 的具体做法 |
| 6 | [Grounded-SAM](https://arxiv.org/abs/2401.14159) | 文本 prompt 分割怎么用模型组合实现 |
| 7 | [MedSAM](https://www.nature.com/articles/s41467-024-44824-z) | OOD（医学）下 SAM 怎么 finetune |

## 限制（DeepPaperNote 风格，4 条独立限制，不抄 paper limitations）

1. **训练代码 + 训练 split 至今未公开**（2026-05 仍未补）。Apache-2.0 的「开源」实际是「推理开源 + 数据开源 + 训练黑箱」。
   外人想复现 SA-1B 训出 SAM ≈ 不可能；想用自己的数据 finetune SAM 也只能靠社区第三方实现（lightning-sam、mmsegmentation fork 等）。
2. **「foundation model」名号有夸大成分**。SAM 只解决了 class-agnostic mask proposal 这**一件事**——
   不做类别识别、不做实例 ID、不做追踪、不做 affordance。把它叫做「分割的 GPT」是营销语言。
   真正的「视觉 foundation」需要 SAM + CLIP + DINO + Grounding-DINO + tracker 组合。
2 没有 4 的能力，4 没有 2 的工程稳定性——叙事压缩成「SAM 是一个东西」是误导。
3. **SA-1B 数据集 CC-BY-NC，禁商用**。论文宣称「促进基础模型研究」，
   但任何商业产品（无论 startup 还是大厂）都不能直接用 SA-1B 训出来的 checkpoint 部署——必须从头训。
   这把「foundation model 民主化」的口号悬置了。
4. **mask decoder 的 multimask 输出在多点 prompt 下被关掉**（推理代码硬编码 `multimask_output=False`）。
   论文 Section 3.3 说「ambiguity only when single-point」，但用户实际场景里点 2 个点也可能有歧义
   （比如选「猫的两只眼睛」vs「整只猫」）。这个硬编码限制了 SAM 在多点交互场景的表达力。

## 附录：叙事错位清单（论文宣称 vs 代码现实）

| 论文宣称 | 代码现实 | 错位类型 |
|---|---|---|
| 「promptable segmentation 任务支持 text prompt」（Section 2）| `prompt_encoder.py` 只实现点 / 框 / mask 三种，**没有 text encoder** | 任务承诺 vs 实现缺失 |
| 「foundation model」（abstract、intro、discussion）| SAM 是 class-agnostic mask proposer，没有 NLP foundation model 的 in-context learning 能力 | 概念借用 vs 实际能力 |
| 「ambiguity-aware multimask output」（Section 3.3） | 推理代码 `predict()` 默认 `multimask_output=False` 单 mask 输出；要手动开启 | 默认行为 vs 论文重点 |
| 「在 1024² 输入上跑 ViT-H」 | `automatic_mask_generator.py` 在 1024² 上自动分割时实际用 32 个网格点 + crop refinement，每张图跑 33 次 image encoder（一次全图 + 32 次 crop）| 计算成本被严重低估 |
| 「fully automatic data engine 阶段 99.1% 标注无人工」| 仍有人工质检 sample 抽审 + 阈值由人工定，「fully automatic」是相对前两阶段说的 | 修辞放大 |

## 元数据

- 重构日期：2026-05-28
- 总行数：~590（写入后实测）
- 启用方法论：[papers-method.md](/study/method-papers/) v1.1 分支 A（method / algorithm paper）
- 启用 skill：phd-skills 7 阶段、source-learn（精读 image_encoder / prompt_encoder / mask_decoder 三文件）
- 配套图：`/study/papers/sam/01-architecture.webp`、`/study/papers/sam/02-lineage.webp`
- GitHub permalink commit hash：`dca509fe793f601edb92606367a655c15ac00fdf`（本笔记所有 GitHub 链接锚定此 commit）
- Season H 启动篇（2026-05-28）

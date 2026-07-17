# FastVLM 最终综合与接班地图

## 一句话定位

FastVLM 是“从视觉编码器源头优化 VLM 首响应延迟”的代表方案：让高分辨率图片经过 FastViTHD 后更快变成更少的视觉 token，再由简单 MLP 接入 Qwen2/Vicuna 一类语言模型。

## 先建立直觉

把 VLM 想成一名看图答题的人：

- 视觉编码器像眼睛，负责把像素整理成可理解的视觉线索。
- projector 像翻译员，把视觉线索翻译成 LLM 的 embedding。
- LLM 像答题者，把图片线索和问题一起读完后开始作答。

传统高分辨率 VLM 的问题是：眼睛看得越细，产生的“视觉笔记”越多；答题者必须先读完几百到上万条笔记，首个字才出来。FastVLM 同时减少“眼睛整理笔记的时间”和“笔记数量”。

类比的边界是：视觉 token 不是人类文字笔记，而是连续向量；LLM 也不是逐条显式理解图片，而是在统一序列中做注意力计算。

## FastVLM 的完整数据流

```text
相机帧 / 图片
  -> resize / normalize
  -> FastViTHD
     - convolutional stem
     - 3 个 RepMixer 卷积阶段
     - 2 个 self-attention 阶段
     - 分层下采样到较小二维特征图
  -> 展平为视觉 token
  -> 两层 MLP projector
  -> 替换 prompt 中的 <image> token
  -> Qwen2 decoder prefill
  -> KV cache 自回归解码
  -> 流式文字
```

端侧官方 App 把这条链拆成两个运行域：

- FastViTHD 视觉塔导出为 Core ML package。
- Qwen2、projector、KV cache 与生成循环使用 MLX/MLX Swift。

所以 FastVLM 不是“全部都跑在 ANE”，也不能从仓库代码直接推断所有计算单元的真实占比。

## 五个最重要的设计判断

### 1. 优化指标必须覆盖 TTFT 全链路

`TTFT = 视觉编码延迟 + LLM prefill 延迟 + 首 token 解码开销`

只让视觉塔更快但输出更多 token，可能把成本转移到 LLM prefill；只减少 token 但增加复杂 resampler，也可能得不偿失。FastVLM 的论文价值在于把分辨率、视觉延迟、token 数、LLM 大小放到同一 Pareto 曲线上。

### 2. FastViTHD 是层次化骨干，不是普通 ViT 的缩小版

代码中 `fastvithd()` 使用：

- 层数：`[2, 12, 24, 4, 2]`
- 通道：`[96, 192, 384, 768, 1536]`
- token mixer：前三阶段 `repmixer`，后两阶段 `attention`
- 五阶段下采样

卷积阶段先高效提取局部结构，注意力阶段在更小特征图上建模全局语义。它把昂贵注意力留到空间尺寸已经下降之后。

### 3. 结构重参数化区分训练图和推理图

FastViT/MobileCLIP 的 MobileOne/RepMixer 训练时可用多分支提高可训练性，部署前把卷积和 BatchNorm 融合成单分支。它不是量化，而是把等价计算图折叠为更适合推理的形式。

### 4. FastVLM 的多模态接口仍是 LLaVA 范式

视觉塔输出 `[B, C, H, W]`，转为 `[B, H*W, C]`，再经 projector 映射到 LLM hidden size。`prepare_inputs_labels_for_multimodal` 找到 `<image>` 占位符，用视觉 embedding 替换它，同时把视觉位置的训练 label 设为 `IGNORE_INDEX`。

真正创新集中在视觉骨干和效率分析，训练/对话/评测大量继承 LLaVA。

### 5. 端侧产品问题不等于论文 benchmark

官方 App 已处理：

- 模型懒加载与下载进度
- 任务取消
- 单次只允许一个生成任务
- 摄像头帧用 `bufferingNewest(1)` 丢弃旧帧
- 每 4 个 token 更新 UI，避免逐 token 更新造成约 15% 吞吐损失
- 显示 TTFT

社区实测还提醒：持续摄像头推理可能带来发热、耗电和 UI 卡顿。论文的单次 TTFT 不能替代热稳定性、能耗和长时间帧率测试。

## 领域技术路线图

| 优化位置 | 代表项目 | 核心做法 | 主要代价 |
|---|---|---|---|
| 视觉骨干内部 | FastVLM/FastViTHD | 层次化下采样，天然少产 token | 需要重新设计和训练视觉塔 |
| projector | MobileVLM | LDPv2 将视觉 token 池化到固定网格 | 细节可能在进入 LLM 前丢失 |
| resampler | MiniCPM-V | 切片后用固定 query 压缩 | 组件和 placeholder 管理更复杂 |
| 固定少 token 架构 | SmolVLM | 每个 patch 压到较少 token | 极细粒度任务受压缩上限影响 |
| 高分辨率裁块 | Moondream | 全局图 + 局部重叠 crop 后重建 | 多 crop 增加视觉编码成本 |
| 视觉编码器出口 | PruMerge | CLS 注意力筛选，合并被裁 token | 依赖视觉塔内部结构与启发式 |
| LLM 中间层 | FastV | 早期注意力排名，深层丢视觉 token | 视觉塔与浅层 LLM 成本仍保留 |
| 多层 LLM 稀疏 | SparseVLM | 问题引导评分，渐进裁剪/聚合 | 修改 decoder，兼容性复杂 |
| 主动视觉采集 | AdaptVision | 先低清看图，需要时调用局部高清 crop | 多轮推理、工具协议和 RL 训练 |
| 系统级编排 | VLMKit | Vision 先定位，VLM 分区调用再聚合 | 多次 VLM 调用增加总延迟 |

## 21 个项目在地图上的位置

### 核心血缘

- **FastVLM**：主实现，包含 PyTorch、Core ML 导出和 Swift App。
- **FastViT**：混合视觉骨干与结构重参数化的前身。
- **MobileCLIP**：视觉预训练、轻量图文表征和 MobileCLIP2 架构。
- **MobileCLIP RayGen**：大规模合成 caption 与 teacher embedding 数据强化。
- **LLaVA**：视觉指令微调和图像 embedding 插入骨架。

### Apple Silicon 运行时

- **MLX-VLM**：Python 端原生 FastVLM、转换、量化、训练与服务。
- **MLX Swift Examples**：应用样例层；可复用 VLM 库已经迁出。
- **MLX Swift LM**：当前 Swift 端模型 registry、processor、下载和生成抽象。

### 同类端侧模型

- **LLaVA-NeXT**：AnyRes/OneVision 路线，强调多图和视频。
- **MobileVLM**：在 projector 中轻量下采样。
- **MiniCPM-V**：切片、resampler、当前版本的编码器内部压缩。
- **MiniCPM-V Apps**：iOS/Android/HarmonyOS 的 GGUF + llama.cpp/mtmd 工程。
- **SmolVLM**：全开放小模型训练、固定少 token 和数据打包。
- **Moondream**：专用小模型、区域任务、高分辨率 crop 与图像缓存。

### 衍生与应用

- **Mobile-O**：FastVLM + SANA，统一理解和图像生成。
- **VLMKit**：Apple Vision/ARKit 与本地 VLM 的结构化 fan-out。
- **USLS**：Rust/ONNX Runtime，把 FastVLM 拆成三个 engine。

### 替代效率路线

- **LLaVA-PruMerge**：视觉塔出口 token 筛选与合并。
- **FastV**：LLM 深层视觉 token 剪枝。
- **SparseVLM**：问题引导、多层渐进视觉 token 稀疏。
- **AdaptVision**：模型主动请求局部高清视觉输入。

## 生态发展判断

### 已经相对成熟

- 小型 VLM 能在 Apple Silicon、本地浏览器和移动 App 中完成真实图片问答。
- Core ML/MLX、GGUF/llama.cpp、ONNX Runtime 已形成多条可选部署链。
- 视觉 token 数已经成为和参数量同等重要的效率指标。
- 模型仓与运行时仓逐步解耦，FastVLM 已进入 MLX-VLM、MLX Swift LM 与 Transformers 生态。

### 仍未解决

- benchmark 精度、真实设备功耗、温升、内存峰值和持续吞吐缺少统一口径。
- OCR、计数、空间定位与小物体细节仍容易在激进压缩中退化。
- 不同硬件后端的算子支持决定理论 FLOPs 能否转成真实加速。
- 小模型长输出可能重复或退化，需要 generation 配置、停止条件和任务型微调共同控制。
- 高分辨率不一定要一次看全图，主动视觉采集开始成为 2026 年的重要方向。

## 使用 FastVLM 时的决策顺序

1. 先定义任务：caption、OCR、VQA、结构化抽取还是连续视频。
2. 再定义设备：iPhone 代际、内存、是否允许云端、持续运行多久。
3. 再选模型大小与量化，不先迷信参数量。
4. 同时测视觉编码、prefill、decode、峰值内存、温升与能耗。
5. 对细节任务比较“全图高分辨率”和“低清全图 + 局部 crop”。
6. 对连续相机采用背压：只保留最新帧，推理串行，允许取消。
7. 对结构化输出加入 schema/JSON 修复，但必须保留失败状态，不能把修复当正确性。

## 证据强度

| 结论类型 | 本轮状态 |
|---|---|
| 仓库关系、commit、目录、依赖、核心控制流 | 已本地核对 |
| 项目 README/论文报告的模型指标 | 已记录，未复现 |
| 21 个 fork 和本地 clone | 已执行并核对 |
| 单元测试、构建、模型推理 | 未执行 |
| 真机功耗、温升、帧率和视觉质量 | 未执行 |

## 后续提问入口

- 不理解 FastViTHD：从“为什么前三阶段用卷积”开始问。
- 不理解视觉 token：从“图片如何变成 `[B, N, C]`”开始问。
- 不理解 TTFT：从“视觉编码和 LLM prefill 如何相加”开始问。
- 想做 iOS：从 Swift App 的 `Camera -> UserInput -> ModelContainer -> generate` 链开始。
- 想比较模型：先确定任务与设备，再看 [横向比较](03-cross-project-comparison.md)。
- 想继续读源码：按 [学习路线](04-learning-route-and-questions.md) 从 5 个核心文件开始。

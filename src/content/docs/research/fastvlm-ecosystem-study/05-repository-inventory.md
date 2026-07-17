---
title: "仓库清单、版本与本地恢复"
sidebar:
  hidden: true
---
# 仓库清单、版本与本地恢复

## 执行结果

- GitHub 账号：`estelledc`
- 深度语料：21 个仓库
- fork：21/21 已创建并确认 `isFork=true`
- 本地 clone：21/21 已完成
- clone 模式：`--depth=1 --filter=blob:none --sparse`
- LFS：clone 时使用 `GIT_LFS_SKIP_SMUDGE=1`，未下载模型/媒体大文件
- 本地位置：`research-worktrees/<id>/`
- remote：`origin` 指向个人 fork，`upstream` 指向源仓库
- 父仓状态：所有源码目录由 `.gitignore` 的 `research-worktrees/*/` 忽略

## 版本快照

| ID | Upstream | Fork | Pinned commit |
|---|---|---|---|
| fastvlm | apple/ml-fastvlm | estelledc/ml-fastvlm | `592b4add3c1c` |
| fastvit | apple/ml-fastvit | estelledc/ml-fastvit | `8af5928238ca` |
| mobileclip | apple/ml-mobileclip | estelledc/ml-mobileclip | `aecfb5453d02` |
| mobileclip-dr | apple/ml-mobileclip-dr | estelledc/ml-mobileclip-dr | `6042e3c54c24` |
| llava | haotian-liu/LLaVA | estelledc/LLaVA | `c121f0432da2` |
| mlx-vlm | Blaizzy/mlx-vlm | estelledc/mlx-vlm | `84f437533803` |
| mlx-swift-examples | ml-explore/mlx-swift-examples | estelledc/mlx-swift-examples | `378f2449c257` |
| mlx-swift-lm | ml-explore/mlx-swift-lm | estelledc/mlx-swift-lm | `4ca25fd901e2` |
| llava-next | LLaVA-VL/LLaVA-NeXT | estelledc/LLaVA-NeXT | `bce12e479bc4` |
| mobilevlm | Meituan-AutoML/MobileVLM | estelledc/MobileVLM | `688fdec91481` |
| minicpm-v | OpenBMB/MiniCPM-V | estelledc/MiniCPM-V | `8a2db6841e86` |
| minicpm-v-apps | OpenBMB/MiniCPM-V-Apps | estelledc/MiniCPM-V-Apps | `2b4049fd877b` |
| smollm | huggingface/smollm | estelledc/smollm | `a041759883ec` |
| moondream | m87-labs/moondream | estelledc/moondream | `6eccfceaf1aa` |
| mobile-o | Amshaker/Mobile-O | estelledc/Mobile-O | `91c255080a01` |
| vlmkit | john-rocky/VLMKit | estelledc/VLMKit | `d9089e72b2ad` |
| usls | jamjamjon/usls | estelledc/usls | `703be321cace` |
| sparsevlms | Gumpest/SparseVLMs | estelledc/SparseVLMs | `87fe4319430e` |
| llava-prumerge | 42Shawn/LLaVA-PruMerge | estelledc/LLaVA-PruMerge | `8989c4304db1` |
| fastv | pkunlp-icler/FastV | estelledc/FastV | `d1659729b5bf` |
| adaptvision | AdaptVision/AdaptVision | estelledc/AdaptVision | `1b53728f7453` |

完整 40 位 SHA 记录在 `explorations/_meta/<id>.md`。

## Sparse checkout 范围

| ID | 当前展开目录 |
|---|---|
| fastvlm | `app`, `llava`, `model_export` |
| fastvit | `models`, `misc` |
| mobileclip | `mobileclip`, `mobileclip2`, `training`, `eval`, `ios_app` |
| mobileclip-dr | `src`, `scripts`, `examples` |
| llava | `llava`, `scripts`, `docs` |
| mlx-vlm | `mlx_vlm`, `examples`, `docs` |
| mlx-swift-examples | `Applications`, `Libraries` |
| mlx-swift-lm | `Libraries`, `Tests` |
| llava-next | `llava`, `docs`, `scripts` |
| mobilevlm | `mobilevlm`, `mobilellama`, `scripts` |
| minicpm-v | `omnilmm`, `finetune`, `eval_mm`, `docs` |
| minicpm-v-apps | iOS/Android/HarmonyOS App 与 `scripts` |
| smollm | `vision`, `tools` |
| moondream | `moondream`, `recipes`, `tests`, `examples` |
| mobile-o | `mobileo`, `Mobile-O-App`, `eval`, `scripts` |
| vlmkit | `Sources`, `Tests`, `Examples` |
| usls | `src`, `examples`, `docs`, `tests` |
| sparsevlms | `llava`, `scripts`, `docs` |
| llava-prumerge | `llava`, `scripts`, `docs` |
| fastv | `src` |
| adaptvision | `patches`, `scripts`, `cookbooks` |

## 仓库规模与语言

统计来自 Git tree，不受 sparse checkout 当前展开范围影响。

| ID | 文件数 | 主要代码 |
|---|---:|---|
| fastvlm | 86 | Python 39, Swift 10 |
| fastvit | 26 | Python 11 |
| mobileclip | 116 | Python 26, Swift 18 |
| mobileclip-dr | 33 | Python 18 |
| llava | 175 | Python 61 |
| mlx-vlm | 905 | Python 781 |
| mlx-swift-examples | 194 | Swift 101 |
| mlx-swift-lm | 466 | Swift 334, C/C++ 61 |
| llava-next | 390 | Python 188 |
| mobilevlm | 39 | Python 17 |
| minicpm-v | 395 | Python 118 |
| minicpm-v-apps | 395 | Swift 86, C/C++ 14，另有 Kotlin/ArkTS |
| smollm | 711 | Python 428 |
| moondream | 90 | Python 53 |
| mobile-o | 1740 | Python 495, Swift 36 |
| vlmkit | 133 | Swift 124 |
| usls | 529 | Rust 409 |
| sparsevlms | 130 | Python 71 |
| llava-prumerge | 217 | Python 71 |
| fastv | 6854 | Python 5528，主要因 vendored Transformers |
| adaptvision | 233 | Python 212 |

## GitHub 快照

Star/fork 会变化，只用于理解社区体量，不作为技术质量结论。

| Upstream | Stars | Forks | Last push |
|---|---:|---:|---|
| apple/ml-fastvlm | 7385 | 557 | 2025-05-05 |
| apple/ml-fastvit | 2022 | 127 | 2023-11-30 |
| apple/ml-mobileclip | 1581 | 126 | 2026-04-15 |
| apple/ml-mobileclip-dr | 40 | 5 | 2026-03-12 |
| haotian-liu/LLaVA | 24922 | 2777 | 2024-08-12 |
| Blaizzy/mlx-vlm | 5166 | 670 | 2026-07-15 |
| ml-explore/mlx-swift-examples | 2634 | 416 | 2026-06-15 |
| ml-explore/mlx-swift-lm | 729 | 320 | 2026-07-15 |
| LLaVA-VL/LLaVA-NeXT | 4708 | 470 | 2026-06-15 |
| Meituan-AutoML/MobileVLM | 1363 | 89 | 2024-04-15 |
| OpenBMB/MiniCPM-V | 25901 | 2028 | 2026-06-25 |
| OpenBMB/MiniCPM-V-Apps | 342 | 50 | 2026-07-10 |
| huggingface/smollm | 3845 | 300 | 2026-05-26 |
| m87-labs/moondream | 9857 | 788 | 2026-04-20 |
| Amshaker/Mobile-O | 153 | 16 | 2026-04-13 |
| john-rocky/VLMKit | 9 | 1 | 2026-06-09 |
| jamjamjon/usls | 431 | 47 | 2026-07-06 |
| Gumpest/SparseVLMs | 265 | 23 | 2025-12-22 |
| 42Shawn/LLaVA-PruMerge | 173 | 14 | 2026-03-08 |
| pkunlp-icler/FastV | 592 | 31 | 2025-01-04 |
| AdaptVision/AdaptVision | 40 | 3 | 2026-04-27 |

## 许可证边界

GitHub API 对多个项目返回 `NOASSERTION`，因此不能只依赖 API 字段。需要阅读各仓根许可证及模型/数据附加条款。

已明确：

- LLaVA、LLaVA-NeXT、MobileVLM、MiniCPM-V、SmolLM、Moondream、SparseVLM、PruMerge、AdaptVision：根代码许可证常见为 Apache-2.0。
- MLX-VLM、MLX Swift Examples、MLX Swift LM、VLMKit、USLS：MIT。
- Apple 仓：代码、模型、数据存在不同 Apple 条款，GitHub API 多为 `NOASSERTION`。
- MiniCPM-V Apps、FastV：根许可证识别不清，必须逐文件/依赖核对。
- Mobile-O：存在 `LICENSE.txt`，但模型与依赖条款仍需单独核对。

任何商业使用前必须重新审计：

1. 代码许可证；
2. 模型权重条款；
3. 训练数据条款；
4. 第三方基础模型条款；
5. App/模型分发限制。

## 恢复示例

以 FastVLM 为例：

```bash
git clone --depth=1 --filter=blob:none --sparse \
  https://github.com/estelledc/ml-fastvlm.git \
  research-worktrees/fastvlm

git -C research-worktrees/fastvlm remote add upstream \
  https://github.com/apple/ml-fastvlm.git

git -C research-worktrees/fastvlm sparse-checkout set \
  app llava model_export
```

其他项目以对应 `_meta` 卡的 `clone_url`、`restore_path` 和 `upstream` 为准。

## 验证状态

已验证：

- fork parent；
- 本地 commit；
- shallow repository；
- sparse checkout；
- `origin/upstream`；
- 外部仓工作树 clean；
- 父仓 ignore；
- `_meta` 恢复字段。

未验证：

- 21 个项目各自完整依赖安装；
- 模型下载与 checksum；
- 单元测试/训练；
- Swift/Xcode/Android/HarmonyOS 构建；
- 真机性能与视觉质量。

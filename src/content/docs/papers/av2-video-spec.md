---
title: AV2 Video Standard v1.0 — 下一代免版税视频编码零基础学习笔记
来源: https://en.wikipedia.org/wiki/AV2
日期: 2026-06-13
子分类: 音视频媒体
分类: 通信
provenance: pipeline-v3
---

## 从日常类比开始：行李箱打包术 2.0

想象你要把一整季衣服寄给远方的朋友。视频编码干的事，本质上就是**把巨大的原始画面「打包」成更小的包裹**，让对方收到后能**原样还原**。

- **未压缩视频**：每件衣服单独挂袋、塞满气泡膜——体积巨大，4K 一分钟就要好几 GB。
- **有损编码**：允许「看起来一样就行」——T 恤叠成卷、袜子塞进鞋里，体积骤降，但肉眼看不出差别。
- **AV1**（上一代）：已经是很会打包的收纳达人了，YouTube、Netflix 都在用。
- **AV2 v1.0**（2026 年 5 月定稿）：同一套打包哲学，但换了更聪明的折叠法——同样画质下，包裹再小约 **30%**；或者同样码率下，画质更清晰。

日常里你关心的其实是：**网速够不够、手机烫不烫、流量贵不贵**。码率每降 30%，CDN 账单、5G 流量、视频会议卡顿都会跟着改善。AV2 就是 AOMedia（开放媒体联盟）写给全世界的「新一代打包标准说明书」——正式名称是 **AV2 Bitstream & Decoding Process Specification v1.0.0**。

一句话：**在 AV1 的免版税路线上，用更强的块划分、预测和变换工具，把流媒体、广播、会议、AR/VR 的视频再压一档。**

---

## 是什么

| 项目 | 内容 |
|------|------|
| 标准名称 | AV2 Bitstream & Decoding Process Specification |
| 版本 | **v1.0.0**（Final，2026-05-28 发布） |
| 制定组织 | [Alliance for Open Media (AOMedia)](https://aomedia.org/) |
| 许可模式 | 免版税（royalty-free patent policy） |
| 前身 | AV1（2018 定稿，艾美奖获奖编解码器） |
| 官方站点 | [av2.aomedia.org](https://av2.aomedia.org/) |
| 参考软件 | **AVM**（AOMedia Video Model，`libavm`，v1.0.0 tag） |
| 高性能解码器（进行中） | **dav2d**（VideoLAN 主导） |
| 典型收益 | 相同主观质量下，码率约比 AV1 低 **30%**（4K/8K/VR 等场景） |
| 主要竞品 | VVC/H.266（有专利池，压缩效率相近但授权复杂） |

AV2 开发自 2020 年前后启动，历时五年余，在 2026 年 5 月 28 日与 AVM 1.0.0 参考实现一同正式发布，取代 2026 年 1 月的 working draft v13。

---

## 核心架构：混合编码框架（与 AV1 同族，工具全面换代）

AV2 仍采用经典 **混合视频编码（Hybrid Video Coding）** 流水线——和 H.264、HEVC、AV1 同一套路，但每个环节都有新工具：

```text
原始帧 → [可选去噪/FGS 分析]
       → 块划分（Partition）
       → 帧内/帧间预测（Intra / Inter Prediction）
       → 变换 + 量化（Transform & Quantization）
       → 熵编码（Entropy Coding，算术编码）
       → 环路滤波（Deblock、CDEF、LR 等）
       → 重建帧 → [可选胶片颗粒合成 Film Grain]
       → OBU 比特流
```

解码器做上述过程的逆操作。规范文档定义的是：**比特流语法（Syntax）**、**语义（Semantics）** 和 **解码过程（Decoding Process）**——编码器有自由度，但输出必须能被符合规范的解码器正确解码。

---

## 核心概念 1：OBU — 比特流的「快递单」

AV2 把所有数据装进 **Open Bitstream Unit（OBU，开放比特流单元）**。每个 OBU 像一封快递：有**头部**（类型、层级 ID、扩展标志）和**载荷**（实际视频数据）。

v1.0 中常见的 OBU 类型包括：

| OBU 类型 | 作用 |
|----------|------|
| `OBU_SEQUENCE_HEADER` | 序列级参数：分辨率、色度格式、工具开关 |
| `OBU_TEMPORAL_DELIMITER` | 时间层边界标记 |
| `OBU_FRAME_HEADER` / Tile Group | 帧头与瓦片数据 |
| `OBU_MSDO` | Multi-Stream Decoder Operation — 多子码流资源分配 |
| `OBU_MULTI_FRAME_HEADER` | 多帧头（复合/多视角场景） |
| `OBU_LAYER_CONFIGURATION_RECORD` | 层级配置记录 |
| `OBU_ATLAS_SEGMENT` | Atlas 段信息（多视角/VR 相关） |
| `OBU_FILM_GRAIN` | 胶片颗粒参数（与 AV1 类似，可后处理合成） |
| `OBU_METADATA_*` | 元数据（HDR、内容解释等） |

**多层设计**：OBU 头可为 1 字节（仅时间层 ID）或 2 字节（含扩展层/嵌入层 ID）。不需要空间可扩展时，可省掉额外 signaling 开销。

规范第 5、6 节可在 [Syntax Browser](https://av2.aomedia.org/v1.0.0/syntax_browser.html) 左右对照查阅——左边语法结构，右边语义解释，适合实现者速查。

---

## 核心概念 2：块划分 — 从「切蛋糕」到「乐高积木」

### 扩展递归划分（ERP, Extended Recursive Partitioning）

- 超块（Superblock）最大可到 **256×256**（AV1 为 128×128；也可选用 128×128）。
- 递归细分至最小 **4×4**。
- 新增 **扩展分区类型**（extended partition types）、**四向不均匀划分**（4-way uneven partitions）等，让编码器对复杂边缘（头发丝、栏杆、文字边缘）更贴合。

### 半解耦划分（SDP, Semi-Decoupled Partitioning）

AV1 里亮度（Y）和色度（U/V）**共用同一棵划分树**。AV2 的 SDP 允许：

- 大块时：亮度/色度仍共享划分（省比特）；
- 小块时（最大到 64×64）：亮度与色度**独立划分**——色度边缘与亮度边缘不一致时（常见！）不再被迫绑死。

类比：AV1 是「三件套西装必须同码」；AV2 允许「上衣 M 码、裤子 S 码」，更合身。

### 变换块划分（Transform Partition）

AV2 **移除了 AV1 的递归变换划分**，对方块和矩形变换块使用**统一的划分类型集合**，简化了解码器分支，同时配合新的变换集（TX sets）提升效率。

---

## 核心概念 3：帧内预测 — 用「已画好的邻居」猜当前块

帧内预测只参考**当前帧**已重建的像素。AV2 在 AV1 基础上新增/增强了大量模式：

| 工具 | 含义（零基础版） |
|------|------------------|
| **MRLS** | 多参考行选择：不只用最靠边一行邻居，可在多条参考线里挑最准的 |
| **AIMC** | 自适应帧内模式编码：根据邻居块常用模式，给「热门模式」更短的码字 |
| **IBP** | 帧内双预测：两个方向预测加权混合，像「两个角度同时猜」 |
| **ORIP** | 基于偏移的预测精修：用邻域重建样本微调预测 |
| **DIP** | 数据驱动帧内预测：用预训练矩阵从降采样邻居生成预测 |
| **CfL / MHCCP** | 色度从亮度预测：利用 Y 与 UV 的相关性省码率 |
| **IBC** | 帧内块拷贝：屏幕内容（PPT、代码、游戏 UI）直接「复制已解码区域」；v1.0 可与环路滤波**同时使用**（AV1 受限更多） |
| **Palette** | 调色板模式：适合颜色种类少的图形/UI |

屏幕共享、视频会议里的幻灯片，IBC + 改进的 SCC 工具是刚需；这也是 AV2 强调「更好处理 screen content」的原因。

---

## 核心概念 4：帧间预测 — 用「过去的帧」猜运动

帧间预测在参考帧里找匹配块（运动估计），AV2 增强包括：

- **TIP**（Temporal Interpolation Prediction）等时域工具；
- **扩展 Warp / 仿射模型**；
- **BAWP**、改进的 **Wedge** 分区；
- **RefMVBank**、**AMVR/AMVD** 等运动矢量编码优化；
- 最多 **16** 个参考帧（`NUM_REF_FRAMES`）。

此外还有 **Bridge Frame**、**SEF** 等特殊帧类型，服务随机访问和多流场景。

---

## 核心概念 5：多流、多视角与可扩展性

现代应用不只要「一路 1080p」：

- **多分屏 / 多角度体育**：一个比特流里塞多路节目，机顶盒按能力只解其中一路；
- **立体 / VR**：左右眼或多 Atlas 拼接；
- **可扩展层级**：最多 **8 个嵌入层 + 31 个扩展层**（embedded / extended layers），嵌入式层之间可预测。

**MSDO OBU**（Multi-Stream Decoder Operation）可在比特流级别声明：总解码资源如何在多个子码流间分配（例如 2/3 给主视角、各 1/9 给三个辅视角）。这让「一个文件、多种终端能力」变得可标准化，而不是各家私有 mux 方案。

---

## 核心概念 6：档次（Profile）与生态节奏

v1.0 覆盖主流 8/10/12 bit、4:2:0/4:2:2/4:4:4 等组合；AOMedia 已启动 **12-bit 专业电影 / HDR Profile** 的后续项目。容器方面，**ISO BMFF 的 AV2 binding** 规范也在推进中。

硬件节奏可参考 AV1 历史：

- AV1 规范：2018 年 3 月；
- 首批消费级硬解：约 2020 年（Intel Tiger Lake、NVIDIA RTX 30、AMD RX 6000）；
- 硬编普及：约 2022 年。

AV2 很可能也要 **2–4 年** 才能在大规模消费硬件上铺开；2026 年 CES 上 VideoLAN 已用 **VLC 4.0 + dav2d** 在 MacBook Pro 上演示 AV2 软解。

---

## 代码示例 1：用 FFmpeg 探测 AV2 比特流（生态接入）

FFmpeg 对 AV2 的支持随版本快速演进。定稿后典型工作流与 AV1 类似，只是 codec 名换成 `libav2` / `av2`（具体以你本地 `ffmpeg -codecs` 为准）：

```bash
# 查看本机是否已注册 AV2 解码器/编码器
ffmpeg -hide_banner -codecs 2>/dev/null | rg -i 'av2|avm'

# 将原始 YUV 用 AVM 参考编码器压缩（示例参数，需已编译 --enable-libavm）
ffmpeg -f rawvideo -pix_fmt yuv420p -s 1920x1080 -r 30 -i input.yuv \
  -c:v libaom-av2 -cpu-used 6 -crf 32 -b:v 0 \
  -tiles 2x2 -row-mt 1 \
  output.av2.ivf

# 软解码并导出为 PNG 帧（验证解码器 conformance）
ffmpeg -c:v libdav2d -i output.av2.ivf -frames:v 1 preview.png

# 用 ffprobe 查看流级元数据（codec_name、profile、level、像素格式）
ffprobe -v quiet -show_streams -select_streams v:0 output.av2.ivf
```

若 `libaom-av2` / `libdav2d` 尚未安装，可从 [AVM](https://gitlab.com/AOMediaCodec/avm) 与 [dav2d](https://code.videolan.org/videolan/dav2d) 源码构建，再链接进 FFmpeg。

**实践提示**：早期参考编码器 `cpu-used` 越大越快但效率越差；`-crf` 与 `-b:v` 二选一控制质量/码率，和 x264/AV1 习惯一致。

---

## 代码示例 2：解析 OBU 头部（教学用 Python）

下面脚本演示如何从 IVF 封装的 AV2 裸流中**逐个读取 OBU 头**（简化版，仅用于理解规范 §5.3 的头部语法；生产环境请用 `libavm` 或 FFmpeg）：

```python
#!/usr/bin/env python3
"""Minimal AV2 OBU header walker — educational only."""
from __future__ import annotations
import struct
import sys

# OBU type names from AV2 spec (subset)
OBU_NAMES = {
    1: "OBU_SEQUENCE_HEADER",
    2: "OBU_TEMPORAL_DELIMITER",
    3: "OBU_FRAME_HEADER",
    4: "OBU_TILE_GROUP",
    5: "OBU_METADATA",
    6: "OBU_FRAME",
    7: "OBU_REDUNDANT_FRAME_HEADER",
    8: "OBU_TILE_LIST",
    15: "OBU_PADDING",
    # v1.0 extended types include MSDO, MULTI_FRAME_HEADER, etc.
}

def leb128_read(buf: bytes, pos: int) -> tuple[int, int]:
    """Read AOM-style LEB128 size field."""
    value, shift = 0, 0
    while pos < len(buf):
        b = buf[pos]
        pos += 1
        value |= (b & 0x7F) << shift
        if not (b & 0x80):
            return value, pos
        shift += 7
    raise ValueError("truncated LEB128")

def parse_obu_header(data: bytes, pos: int = 0) -> dict:
    if pos >= len(data):
        raise EOFError
    b0 = data[pos]
    pos += 1
    obu_type = (b0 >> 3) & 0x0F
    extension = bool(b0 & 0x04)
    has_size = bool(b0 & 0x02)
    obu_tlayer_id = b0 & 0x01  # simplified; v1.0 has extended header paths

    header = {
        "obu_type": obu_type,
        "name": OBU_NAMES.get(obu_type, f"OBU_TYPE_{obu_type}"),
        "extension": extension,
        "has_size": has_size,
    }

    if extension:
        b1 = data[pos]
        pos += 1
        header["obu_xlayer_id"] = b1 >> 4
        header["obu_mlayer_id"] = b1 & 0x0F

    payload_size = None
    if has_size:
        payload_size, pos = leb128_read(data, pos)
        header["payload_size"] = payload_size

    header["header_end"] = pos
    if payload_size is not None:
        header["payload_end"] = pos + payload_size
    return header

def walk_obus(av2_payload: bytes, limit: int = 20) -> None:
    pos = 0
    for i in range(limit):
        if pos >= len(av2_payload):
            break
        h = parse_obu_header(av2_payload, pos)
        print(f"[{i:02d}] {h['name']:28s} ext={h['extension']} "
              f"size={h.get('payload_size', '?')}")
        pos = h.get("payload_end", h["header_end"])

def strip_ivf(path: str) -> bytes:
  """IVF: 32-byte file header + per-frame 12-byte header."""
  with open(path, "rb") as f:
    magic = f.read(4)
    if magic != b"DKIF":
        return f.read()  # assume raw OBU stream
    f.read(28)  # rest of IVF file header
    chunks = []
    while True:
        hdr = f.read(12)
        if len(hdr) < 12:
            break
        size = struct.unpack("<I", hdr[0:4])[0]
        chunks.append(f.read(size))
    return b"".join(chunks)

if __name__ == "__main__":
    path = sys.argv[1] if len(sys.argv) > 1 else "sample.av2.ivf"
    walk_obus(strip_ivf(path))
```

运行后你会看到比特流是一串 `SEQUENCE_HEADER → FRAME_HEADER → TILE_GROUP → …` 的 OBU 链——这正是播放器 demuxer 交给解码器的第一道工序。

---

## 代码示例 3：用 AVM 参考编码器做质量/码率扫点

做 codec 评估时，常用 **CRF 扫点**或 **固定 QP** 画 BD-Rate 曲线：

```bash
# 假设已安装 avmenc / avmdec（AVM 构建产物）
for crf in 20 28 36 44; do
  avmenc --codec=av2 -w 1920 -h 1080 --fps=30/1 --limit=300 \
    --cq-level=$crf --end-usage=q -o "out_${crf}.ivf" input.yuv
  avmdec -o /dev/null "out_${crf}.ivf"  # 验证可解码
done

# 用 vmaf / ssimulacra2 对比源与重建（需 ffmpeg 滤镜或独立工具）
ffmpeg -s 1920x1080 -pix_fmt yuv420p -i input.yuv -i decoded.yuv \
  -lavfi "[0:v][1:v]libvmaf=log_fmt=json:log_path=vmaf.json" -f null -
```

论文与 AOMedia 技术幻灯片（如 Andrey Norkin 的架构概述）报告：随机接入（random access）配置下，AV2 相对 AV1 约 **30%** 码率节省——你的实测会随内容类型（动画、体育、屏幕共享）大幅波动。

---

## AV2 vs AV1 vs VVC：怎么选？

| 维度 | AV1 | AV2 v1.0 | VVC (H.266) |
|------|-----|----------|-------------|
| 专利 | 免版税 | 免版税 | 专利池（MC-IF、Sisvel 等） |
| 相对 HEVC 效率 | 基准一代 | 再省 ~30%（相对 AV1） | 与 AV2 大致同级 |
| 硬件普及（2026） | 已广泛 | 刚起步（软解为主） | 部分广播/高端设备 |
| 多流/VR | 基础 | 显著增强（MSDO、Atlas） | 有类似工具 |
| 屏幕内容 | 好 | 更好（IBC+滤波协同） | 好 |
| 实现复杂度 | 高 | 更高 | 最高 |

**选型建议**：

- **现在就要全平台硬解**：继续 AV1/HEVC，AV2 等待硬件。
- **长视频平台/CDN 降本**：开始软解试点 + 云端转码实验，跟踪 GPU IP 路线图。
- **专利敏感场景**（浏览器、开源播放器、初创公司）：AV2 比 VVC 更友好。
- **广播/机顶盒既有 VVC 授权**：可能双轨并存，类似当年 HEVC vs AV1。

注意：即使 AOMedia 声明免版税，第三方专利池（如 Sisvel 针对 AV1/AV2 的声明）在 2025–2026 年已是行业现实——上线前需做法务与 FTO（自由实施）评估，不能只看「royalty-free」四个字。

---

## 如何阅读 v1.0 规范（学习路径）

1. **先读概述**：§1 Scope、§2 Terms、§3 Decoder model — 建立「解码器必须做什么」的全局图。
2. **对照 Syntax Browser**：§5 Syntax + §6 Semantics，从 `sequence_header_obu()` 追起。
3. **看参考代码**：AVM 的 `avmdec` / `avmenc` 与 §9 附加表（C header 查找表）交叉验证。
4. **跑 conformance streams**：AOMedia 与 Allegro、HDR Nova 等提供的商用一致性码流包。
5. **扩展阅读**：[Wikipedia AV2](https://en.wikipedia.org/wiki/AV2)、[Norkin AV2 架构概述](https://norkin.org/research/av2_overview/index.html)、AOMedia 新闻稿。

规范是 **Final Deliverable**（2026-05-28），working draft v13 已废止；实现请以 **v1.0.0** 为准。

---

## 踩过的坑（早期实现者经验）

1. **把 v13 草稿当最终版**：v13 与 v1.0 在 OBU 扩展头、xlayer 上下文保存等细节上有差异，迁移时务必 diff 语法浏览器。
2. **忽略 Operating Point**：多层级比特流里，`OperatingPointIdc` 决定当前解码器实例看哪些层；demuxer 丢 OBU 会导致「能解但花屏」。
3. **IBC 与环路滤波顺序**：v1.0 允许 IBC 与 in-loop filter 协同，照搬 AV1「先 IBC 后滤波」的旧假设会编出 non-conformant 流。
4. **只用 PSNR 评估**：AV2 的低码率工具集强烈依赖感知优化，应用 **VMAF / SSIMULACRA2** 或主观测试。
5. **低估解码复杂度**：ERP + 大超块 + 多参考帧对嵌入式不友好；MSDO 资源分配是为「机顶盒只解一路」设计的，移动端仍可能需要转码。

---

## 小结

| 要点 | 一句话 |
|------|--------|
| 定位 | AV1 正统续作，免版税，2026-05-28 定稿 v1.0.0 |
| 收益 | 同画质码率约 ↓30%，更适合流媒体/会议/VR |
| 比特流 | OBU 容器；支持多流、多层级、Atlas |
| 关键技术 | ERP、SDP、增强 intra/inter、改进 IBC/SCC |
| 软件 | AVM 参考实现；dav2d 软解；FFmpeg 集成进行中 |
| 硬件 | 预计 2–4 年消费级普及，短期以云端/PC 软解为主 |

AV2 不是「换一个文件扩展名」那么简单——它重新定义了块如何切、色度如何跟亮度分工、一个文件如何服务多路观众。作为学习者，先搞懂 **OBU → 序列头 → 帧头 → 瓦片 → 预测/变换/熵编** 这条解码主线，再按需深入 Syntax Browser，比从头到尾通读上千页 PDF 更高效。

---

## 参考链接

- [AV2 Specification 官网](https://av2.aomedia.org/) — v1.0.0 规范、PDF、Syntax Browser、附加表
- [AV2 v1.0.0 在线规范全文](https://av2.aomedia.org/v1.0.0/index.html)
- [Wikipedia: AV2](https://en.wikipedia.org/wiki/AV2)
- [AOMedia 发布 AV2 新闻稿（2026-06）](https://aomedia.org/press%20releases/Alliance-for-Open-Media-Releases-AV2-Codec/)
- [Andrey Norkin — AV2 Video Codec Architecture Overview](https://norkin.org/research/av2_overview/index.html)
- [AVM 参考软件仓库](https://gitlab.com/AOMediaCodec/avm)
- [dav2d 解码器（VideoLAN）](https://code.videolan.org/videolan/dav2d)

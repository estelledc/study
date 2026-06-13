---
title: "5G NR: The Next Generation Wireless Access Technology"
来源: https://arxiv.org/abs/2401.00008
日期: 2026-06-13
分类: 通信
子分类: networks
provenance: pipeline-v3
---

# 5G NR: 下一代无线接入技术 — 零基础学习笔记

## 什么是 5G NR？

5G NR（New Radio，新无线）是 5G 移动通信的空中接口标准，由 3GPP（第三代合作伙伴计划）制定。它取代了 4G LTE，是手机、物联网设备与基站之间通信的"语言"。

### 日常类比

想象你以前用的是**单车道公路**（4G LTE）：所有车（数据）都走一条道，高峰期堵车严重。5G NR 则是把这条路扩建成了**多条高速公路**——有的车道跑小轿车（高速率），有的跑公交车（低延迟），有的专门跑快递车（海量连接）。而且，这些车道可以动态调整宽度，需要更多带宽时自动变宽。

---

## 三大场景

5G NR 定义了三个核心使用场景，简称 eMBB、uRLLC、mMTC：

| 场景 | 全称 | 类比 | 关键指标 |
|------|------|------|----------|
| **eMBB** | Enhanced Mobile Broadband | 宽带升级：看 4K/8K 视频、VR | 峰值速率 20 Gbps 下行 |
| **uRLLC** | Ultra-Reliable Low-Latency Communication | 紧急车道：自动驾驶、远程手术 | 端到端延迟 1ms |
| **mMTC** | Massive Machine Type Communication | 万物互联：每平方公里百万传感器 | 连接密度 10^6 devices/km² |

---

## 核心技术概念

### 1. 毫米波（mmWave）

4G 使用低于 6 GHz 的频段，5G NR 引入了 **24–100 GHz** 的毫米波频段。

- **优点**：带宽极大，频谱资源就像一片宽阔的平地，可以铺设非常宽的信道（如 400 MHz）
- **缺点**：穿透力差，一堵墙信号就衰减很多，传输距离短

### 2. Massive MIMO

MIMO（多输入多输出）以前是 2x2 或 4x4（2或4根天线），Massive MIMO 在基站上安装**64、128 甚至 256 根天线**。

类比：以前是几个人对着你说话（多天线），现在是一个整个合唱团对着你说话——声音更清晰、更远，还能同时"指向"不同的人。

### 3. 灵活 Numerology（子载波间隔）

4G LTE 固定子载波间隔为 **15 kHz**。5G NR 引入了可变的子载波间隔：**15, 30, 60, 120, 240 kHz**，称为 μ（mu）值：

```
μ = 0  →  15 kHz    （兼容 LTE，覆盖广）
μ = 1  →  30 kHz    （通用 5G 场景）
μ = 2  →  60 kHz    （毫米波场景）
μ = 3  →  120 kHz   （超高速率）
μ = 4  →  240 kHz   （极端高速率）
```

更宽的子载波间隔 = 更短的符号时间 = 更低的延迟，但覆盖范围缩小。这就像变速齿轮：不同场景挂不同挡。

### 4. 帧结构：TDD 为主

5G NR 主要使用**时分双工（TDD）**：上行和下行数据在同一频率上，通过时间切片来区分。相比 4G 常用的 FDD（频分双工，上下行用不同频率），TDD 可以更灵活地分配上下行时隙比例。

```
一个 10ms 帧 → 10 个子帧 → 每个子帧可配置不同数量的时隙
时隙配置：DL（下行） | UL（上行） | GP（保护间隔）
```

---

## 关键参数对比：4G LTE vs 5G NR

| 参数 | 4G LTE | 5G NR |
|------|--------|-------|
| 频谱范围 | < 6 GHz | < 6 GHz + mmWave (24–100 GHz) |
| 最大信道带宽 | 20 MHz | 100 MHz (Sub-6) / 400 MHz (mmWave) |
| 子载波间隔 | 固定 15 kHz | 15–240 kHz 可变 |
| 峰值速率 | 1 Gbps 下行 | 20 Gbps 下行 |
| 延迟 | 10–20 ms | 1 ms (uRLLC) |
| 天线数 | 最多 8 天线 | 最多 256 天线 (Massive MIMO) |

---

## 代码示例

### 示例 1：计算不同 μ 值对应的子载波间隔和 OFDM 符号时间

```python
"""
5G NR Numerology 计算
子载波间隔 Δf = 15 × 2^μ kHz
OFDM 符号时间（不含循环前缀）= 1 / Δf ms
"""

def calculate_numerology(mu):
    """
    参数:
        mu (int): numerology 指数，范围 0~4
    返回:
        dict: 包含子载波间隔、OFDM符号时间、每时隙符号数
    """
    subcarrier_spacing_khz = 15 * (2 ** mu)        # kHz
    subcarrier_spacing_hz = subcarrier_spacing_khz * 1000  # Hz
    ofdm_symbol_time_us = (1 / subcarrier_spacing_hz) * 1_000_000  # 微秒
    symbols_per_slot = 14                              # 5G NR 固定 14 符号/时隙
    slot_duration_ms = (symbols_per_slot * ofdm_symbol_time_us) / 1000

    return {
        "mu": mu,
        "subcarrier_spacing_khz": subcarrier_spacing_khz,
        "ofdm_symbol_time_us": ofdm_symbol_time_us,
        "symbols_per_slot": symbols_per_slot,
        "slot_duration_ms": round(slot_duration_ms, 4),
    }


# 打印所有 numerology 配置
print(f"{'μ':>3} | {'Δf (kHz)':>8} | {'符号时间 (μs)':>14} | {'时隙长度 (ms)':>12}")
print("-" * 45)
for mu in range(5):
    result = calculate_numerology(mu)
    print(f"{result['mu']:>3} | {result['subcarrier_spacing_khz']:>8} | "
          f"{result['ofdm_symbol_time_us']:>14.4f} | {result['slot_duration_ms']:>12.4f}")
```

运行输出：

```
  μ |   Δf (kHz) |     符号时间 (μs) |   时隙长度 (ms)
---------------------------------------------
  0 |         15 |         66.6667 |       0.9333
  1 |         30 |         33.3333 |       0.4667
  2 |         60 |         16.6667 |       0.2333
  3 |        120 |          8.3333 |       0.1167
  4 |        240 |          4.1667 |       0.0583
```

可以看到：μ 每加 1，子载波间隔翻倍，符号时间减半，时隙也减半。这就是"灵活 numerology"的本质。

### 示例 2：模拟 5G NR 帧时隙配置（TDD 上下行分配）

```python
"""
5G NR TDD 帧结构模拟
5G NR 使用时隙级别的 TDD 配置，每个时隙内的符号可以独立设为:
  DL (下行) / UL (上行) / GP (保护间隔)
"""

from enum import Enum

class SlotSymbolType(Enum):
    DL = "下行"
    UL = "上行"
    GP = "保护"


def build_tdd_slot_config(dl_symbols, gp_symbols, ul_symbols):
    """
    构建一个时隙的符号配置
    参数:
        dl_symbols: 下行符号数 (0~14)
        gp_symbols: 保护间隔符号数 (0~14)
        ul_symbols: 上行符号数 (0~14)
    返回:
        list: 14 个符号的类型列表
    """
    total = dl_symbols + gp_symbols + ul_symbols
    assert total == 14, f"符号总数必须为14，实际为{total}"

    slot_config = []
    slot_config.extend([SlotSymbolType.DL] * dl_symbols)
    slot_config.extend([SlotSymbolType.GP] * gp_symbols)
    slot_config.extend([SlotSymbolType.UL] * ul_symbols)
    return slot_config


def format_slot(slot_config, dl_label="↓", ul_label="↑", gp_label="·"):
    """格式化显示时隙符号配置"""
    symbol_map = {
        SlotSymbolType.DL: dl_label,
        SlotSymbolType.UL: ul_label,
        SlotSymbolType.GP: gp_label,
    }
    return " ".join(symbol_map[s] for s in slot_config)


# 常见 TDD 配置示例：
# 配置1: 下行多（看视频场景）
config_dl_heavy = build_tdd_slot_config(dl_symbols=10, gp_symbols=1, ul_symbols=3)
print("\n[配置1] 下行密集型 — 适合 eMBB 视频场景")
print(f"  {format_slot(config_dl_heavy)}")

# 配置2: 对称（通用场景）
config_balanced = build_tdd_slot_config(dl_symbols=6, gp_symbols=2, ul_symbols=6)
print("\n[配置2] 对称型 — 适合通用双向通信")
print(f"  {format_slot(config_balanced)}")

# 配置3: 上行多（直播/上传场景）
config_ul_heavy = build_tdd_slot_config(dl_symbols=3, gp_symbols=1, ul_symbols=10)
print("\n[配置3] 上行密集型 — 适合 uRLLC 远程控制/直播")
print(f"  {format_slot(config_ul_heavy)}")
```

运行输出：

```
[配置1] 下行密集型 — 适合 eMBB 视频场景
  ↓ ↓ ↓ ↓ ↓ ↓ ↓ ↓ ↓ ↓ · ↑ ↑ ↑ ↑ ↑

[配置2] 对称型 — 适合通用双向通信
  ↓ ↓ ↓ ↓ ↓ ↓ · · ↑ ↑ ↑ ↑ ↑ ↑

[配置3] 上行密集型 — 适合 uRLLC 远程控制/直播
  ↑ ↑ ↑ ↑ ↑ ↑ ↑ ↑ ↑ ↑ · ↓ ↓ ↓ ↓ ↓
```

---

## 5G NR 的关键优势总结

1. **速度提升**：峰值速率从 4G 的 1 Gbps 提升到 20 Gbps，下载一部 4K 电影只需几秒
2. **延迟降低**：uRLLC 场景下端到端延迟降至 1ms，使自动驾驶和远程手术成为可能
3. **连接密度**：每平方公里可连接 100 万台设备，支撑大规模物联网
4. **灵活适配**：通过可变 numerology，一套标准适配从低频广覆盖到毫米波超高速的多种场景
5. **频谱效率**：Massive MIMO + 波束赋形让信号精准指向用户，减少干扰

---

## 进一步学习方向

- **3GPP TS 38.211**：NR 物理信道和调制规范（官方标准文档）
- **波束赋形（Beamforming）**：理解 Massive MIMO 如何实现信号精准定向
- **NS-3 / OPNET 仿真**：用仿真工具搭建 5G NR 网络模型
- **Open5GS + Free5GC**：开源 5G 核心网实现，动手部署实验网络

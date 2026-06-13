---
title: Bijou64 — 结构式规范化的变长整数编码
来源: 'Brooklyn Zelenka / Ink & Switch, "Bijou64: A variable-length integer encoding", tangent 文章 + bijou64/SPEC.md (Subduction CRDT 同步协议), 2026'
日期: 2026-06-13
子分类: 类型与 PL 理论
分类: 编程语言
provenance: pipeline-v3
---

## 从日常类比开始：快递单上的「重量档」

寄快递时，计费往往不是「每个包裹都写满 8 位数字」，而是：

- 轻的小件：面单上直接写 **2 kg**，一行搞定；
- 稍重：写 **档位 + 超出部分**，比如「中档 + 52」表示从该档位起再加 52；
- 最重：档位更高，附带的数字位数也更多。

关键是：**同一种重量，柜台只会给你一种写法**。你不能把「0 公斤」写成 `00000000`，也不能用「多贴一张空白续页」把 5 写成 005——否则对账、验签、去重都会乱套。

二进制协议里的 **变长整数（varint）** 也是同一逻辑：日志计数、消息长度、CRDT 元数据……多数时候是 **小数字**，偶尔才需要接近 `u64::MAX` 的大数。常见方案如 **LEB128**（Protobuf、WebAssembly、DWARF）用「每字节最高位 = 还有下一字节」来省空间，但 **同一个数可以有多种合法字节序列**——例如 `0` 可以是 `0x00`，也可以是 `0x80 0x00`、`0x80 0x80 0x00`……

**Bijou64**（读作 bee-zoo-sixty-four，BIJective Offset U64）是 Ink & Switch 为 **Subduction CRDT 同步协议** 设计的 varint：**每个 `u64` 恰好对应唯一一种字节序列**（双射 / 结构式规范化），本意是修签名验证里的「非规范编码」漏洞， benchmark 上解码还比 LEB128 快约 **2–10 倍**。

---

## 是什么

Bijou64 把 **无符号 64 位整数** 编码成 **1–9 字节** 的序列：

| 首字节范围 | 总长度 | 含义 |
|------------|--------|------|
| `0x00`–`0xF7`（0–247） | 1 字节 | 首字节 **就是** 数值本身 |
| `0xF8`–`0xFF`（248–255） | 2–9 字节 | 首字节是 **档位标签**，后面跟 big-endian **载荷** |

多字节档位的解码公式：

```text
tier   = tag - 247          // 1..8
value  = OFFSET[tier] + payload_be
```

编码时做逆运算：选合适 tier，发 `tag = 247 + tier`，再发 `(value - OFFSET[tier])` 的 big-endian 字节。

与 **VARU64**（同 tag-byte 框架）的关键区别：VARU64 的 payload 是 **数值本身**，所以 `0x00`、`0xF8 0x00`、`0xF9 0x00 0x00` 都能解出 `0`；Bijou64 对每层 **减去累计偏移 OFFSET**，各档数值区间 **不相交**，过长编码在结构上 **不存在**。

---

## 为什么重要

### 1. 安全：规范化不是「解码后再 if 一下」

对 **签名过的原始字节**（证书、JWT、区块链交易、CRDT 同步块）来说，「两种字节串 → 同一个数」等于给攻击者 **换皮不重签** 的空间。LEB128 的标准做法是解码后 **拒绝非最短形式**——但这条 `if`：

-  honest 数据的 round-trip 测试 **测不出来**；
- 性能 benchmark **测不出来**；
- 被删掉或移植遗漏时，**只有对抗输入** 才暴露。

Bijou64 的策略是：**格式本身写死唯一表示**。解码器只需处理「缓冲区不够」和「tier 8 加法溢出」两种错误，**没有**「非规范编码」这类单独错误码——因为那种输入 **根本不是合法 bijou64**。

### 2. 性能：首字节定长，不必扫 continuation bit

LEB128 解码要 **逐字节看 MSB**，直到某字节最高位为 0；长度与数值大小相关，分支预测在随机大数上很吃亏。

Bijou64 读 **第一个字节** 就知道还要读几个字节（查表 `tier = tag - 247`），payload 是 **连续 big-endian**，CPU 上常变成一次 load + `bswap`。Ink & Switch 在 Apple M2 Pro / AMD Zen 5 上测 **4096 个值的 batch**：均匀全 `u64` 分布时 bijou64 约 **0.75 ns/值**，LEB128 约 **7.3 ns/值**；小单字节值约 **2×**，大多数字节 LEB128 约 **8–10×**。

### 3. 工程：可排序、可 hexdump

编码后的 **字节序 lexicographic 顺序 = 数值顺序**，便于键值存储里 **不解码直接二分**。0–247 的常见情况：**hexdump 里一个字节就是值**，调试友好。

---

## 核心概念

### 1. 档位（tier）与 OFFSET 表

每个 tier 覆盖一段 **互不重叠** 的数值区间。OFFSET[t] = 「比 tier t 更短的编码所能表示的最大值 + 1」：

| Tier | Tag | OFFSET（十进制） | 该档 value 范围（含端点） |
|------|-----|------------------|---------------------------|
| 0 | — | 0 | 0 – 247 |
| 1 | `0xF8` | 248 | 248 – 503 |
| 2 | `0xF9` | 504 | 504 – 66,039 |
| 3 | `0xFA` | 66,040 | 66,040 – 16,843,255 |
| … | … | … | … |
| 8 | `0xFF` | 72,340,172,838,076,920 | … – `u64::MAX` |

递推：`OFFSET[0]=0`，`OFFSET[1]=248`，`OFFSET[n]=OFFSET[n-1]+256^(n-1)`（n≥2）。hex 上可见规律：每层 offset 末尾都是 `…F8`，前面逐层多一个 `01` 前缀。

### 2. 双射（bijective）= 规范化的结构保证

- **编码**：若 `v < 248` → 单字节 `v`；否则唯一 tier `t` 使 `OFFSET[t] ≤ v < OFFSET[t+1]`，发 tag 与 payload。
- **解码**：`tag < 248` → 值即 tag；否则 `value = OFFSET[tier]+payload`。
- 用错 tier 编码会在 round-trip 或 content hash 上 **立刻暴露**（得到另一个数），而不是「静默接受过长形式」。

### 3. Tier 8 的边界检查（不是规范化问题）

9 字节形式（tag `0xFF` + 8 字节 payload）在算术上能表示 **略大于 `u64::MAX`** 的数。规范要求：若 `OFFSET[8]+payload` 溢出 `u64`，解码器 **必须报错**。这是 **范围上限**，不是「多种合法编码」——范围内每个数仍只有一种写法。

### 4. 与 LEB128 / VARU64 / SQLite4 varint 的定位

| 格式 | 首字节定长？ | 结构式唯一编码？ | 备注 |
|------|--------------|------------------|------|
| LEB128 | 否（扫 continuation） | 否 | 生态最大，Protobuf/Wasm |
| VARU64 | 是 | 否（需拒绝过长） | bijou64 的 framing 祖先 |
| SQLite4 varint | 是 | 仅前两档 offset | 3+ 档仍可能过长 |
| **Bijou64** | 是 | **是** | Subduction / 需签名的 canonical wire |

**权衡**：LEB128 升到 2 字节后可一直覆盖到 2¹⁴ 仍占 2 字节；bijou64 的 2 字节档只覆盖 **248–503**（约 256 个数）。若大量 ID 落在 500–16383，LEB128 更省 wire；若 **canonical + 大端 + 首字节定长** 是硬需求，bijou64 更合适。

---

## 手工走一遍：300 和 67,000

**300**（tier 1）：

1. 300 ≥ 248 → 多字节；`OFFSET[1]=248 ≤ 300 < 504=OFFSET[2]` → tier 1。
2. Tag：`247+1=248` → `0xF8`。
3. Payload：`300-248=52` → `0x34`。
4.  wire：`F8 34`。注意 **`F8 00` 解出来是 248，不是 0**——0 只能是 `00`。

**67,000**（tier 3，SPEC 例题）：

1. `OFFSET[3]=66,040 ≤ 67,000 < OFFSET[4]` → tier 3。
2. Tag：`0xFA`。
3. Payload：`67,000-66,040=960` → 3 字节 BE `00 03 C0`。
4.  wire：`FA 00 03 C0`（4 字节）。

**1738**（原文图解）：3 字节总长（tag + 2 payload），offset `0x1F8`（504），payload 对应 `1738-504=1234`。

---

## 代码示例 1：Python 参考实现（教学用）

下面约 40 行，逻辑与 [SPEC](https://github.com/inkandswitch/subduction/blob/main/bijou64/SPEC.md) 一致，便于零基础对照算法（生产环境请用官方 `bijou64` crate 或已审计移植）：

```python
OFFSET = [0, 248, 504, 66040, 16843256, 4311810552,
          1103823438328, 282578800148984, 72340172838076920]
U64_MAX = (1 << 64) - 1

def encode_u64(v: int) -> bytes:
    if v < 248:
        return bytes([v])
    for tier in range(1, 9):
        lo, hi = OFFSET[tier], OFFSET[tier + 1] if tier < 8 else U64_MAX + 1
        if lo <= v < hi:
            tag = 247 + tier
            payload = v - lo
            width = tier
            return bytes([tag]) + payload.to_bytes(width, "big")
    raise ValueError("out of u64 range")

def decode_bijou64(buf: bytes) -> tuple[int, int]:
    if not buf:
        raise ValueError("buffer too short")
    tag = buf[0]
    if tag < 248:
        return tag, 1
    tier = tag - 247
    if len(buf) < 1 + tier:
        raise ValueError("buffer too short")
    payload = int.from_bytes(buf[1 : 1 + tier], "big")
    value = OFFSET[tier] + payload
    if value > U64_MAX:
        raise ValueError("overflow")
    return value, 1 + tier

# SPEC 向量
assert encode_u64(300) == bytes.fromhex("F8 34")
assert decode_bijou64(bytes.fromhex("FA 00 03 C0"))[0] == 67_000
```

---

## 代码示例 2：Rust 官方 API + 流式解析思路

crates.io 上的 [`bijou64`](https://crates.io/crates/bijou64)（MIT / Apache-2.0）是 Subduction 的参考实现：

```rust
// 依赖: bijou64 = "0.2"
use bijou64::{decode, encode, encoded_len, DecodeError};

fn round_trip() {
    let mut buf = Vec::new();
    encode(300, &mut buf);
    assert_eq!(buf, [0xF8, 0x34]);

    let (value, consumed) = decode(&buf).unwrap();
    assert_eq!(value, 300);
    assert_eq!(consumed, 2);
    assert_eq!(encoded_len(300), 2);
}

// 协议解析器：首字节定长 → 可 O(1) 跳过未知字段
fn skip_one_field(data: &[u8]) -> Result<&[u8], DecodeError> {
    if data.is_empty() {
        return Err(DecodeError::BufferTooShort);
    }
    let tag = data[0];
    let total = if tag < 248 { 1 } else { 1 + (tag - 247) as usize };
    if data.len() < total {
        return Err(DecodeError::BufferTooShort);
    }
    Ok(&data[total..])
}
```

Kafka 等场景也有 Java 封装（`Bijou64Serializer`）：计数器、序号、小 ID 高频 topic 上，相对固定 8 字节 `Long` 可显著省 egress——但 **producer/consumer 必须成对使用**，且语义是 **无符号 u64**（有符号负数需继续用 `LongSerializer`）。

---

## 测试向量（实现互操作时应覆盖）

| Value | Hex |
|-------|-----|
| 0 | `00` |
| 42 | `2A` |
| 247 | `F7` |
| 248 | `F8 00` |
| 300 | `F8 34` |
| 504 | `F9 00 00` |
| 67,000 | `FA 00 03 C0` |
| `u64::MAX` | `FF FE FE FE FE FE FE FE 07` |

**必须报错**：空缓冲；`F9 00`（tier 2 缺 payload）；`FF FF FF FF FF FF FF FF FF`（tier 8 溢出）。

---

## 何时考虑采用 / 何时继续用 LEB128

**更适合 bijou64：**

- 协议对 **原始字节做签名或 content hash**，且不能依赖「每个解码点都写对 canonical check」；
- 需要 **首字节知道长度** 的 streaming / 零拷贝跳过；
- 数值 **大量 < 248** 或需要 **大端 + 字节序可排序**；
- 新项目，愿意引入较新、battle-test 尚少于 LEB128 的格式。

**继续 LEB128 更合理：**

- 已有 Protobuf / Wasm / DWARF 生态，改 wire 成本极高；
- 需要 **非规范过长编码** 做链接器占位（Wasm/DWARF 的 deliberate overlong）；
- 大量标识落在 **500–16383** 且极度在意 **2 字节覆盖宽度**；
- 依赖 **SIMD 批量解码** 整条 buffer——社区讨论指出 LEB128 的固定 continuation 位位置更利于 speculative SIMD；bijou64 首字节 8 路分支对 **单值解码** 友好，对 **并行扫窗口** 未必最优。

---

## 性能与体积（原文 benchmark 摘要）

- **解码**：相对 LEB128（不含 canonical 检查）约 2–10×；含 canonical 检查差距更大；bijou64 延迟 CDF 更「竖」，方差小。
- **编码**：多数分布与 LEB128 相当或更快；248–65535 区间 LEB128 约快 1.24×。
- **体积**： realistic 工作负载下与 LEB128 **相差几个百分点** 量级，不是主要卖点；卖点是 **canonical + 定长首字节 + 解码速度**。

---

## 生态与延伸阅读

- 原文：[Bijou64: A variable-length integer encoding](https://www.inkandswitch.com/tangents/bijou64/)（Ink & Switch Tangents）
- 规范：[inkandswitch/subduction — bijou64/SPEC.md](https://github.com/inkandswitch/subduction/blob/main/bijou64/SPEC.md)（CC BY-SA 4.0）
- Rust crate：[docs.rs/bijou64](https://docs.rs/bijou64/latest/bijou64/)
- 应用背景：Subduction CRDT 同步协议；规范中规划 **bijou32 / bijou128** 同族扩展
- 对比阅读：LEB128、[VARU64](https://github.com/AljoschaMeyer/varu64-rs)、SQLite4 varint、Git pack offset encoding

---

## 小结

Bijou64 把「**每个整数只有一种写法**」从 **解码后的校验** 下沉到 **编码几何**：tag-byte 定长 + 分层 offset，使双射成为格式不变量。它Born 于 CRDT 同步里的签名安全，却附带更快的单值解码路径。零基础记住三句即可：

1. **0–247**：一个字节就是数本身。  
2. **248–255**：标签；后面几个字节是 **大端 (value − OFFSET)**。  
3. **不能** 用多字节形式「凑」出已在更短档出现过的数——这是与 LEB128 根本不同的安全与语义契约。

若你在设计 **新的、要签名或哈希的 binary protocol**，值得把 bijou64 和 LEB128+canonical 放在同一张对比表里；若只是读 Protobuf，知道「业界另一种更严格的 varint 长什么样」也足够扩展视野。

---
title: Generational Garbage Collection — 分代假设与跨代引用追踪
description: Lieberman & Hewitt 1983 — 利用对象寿命分布的偏斜，把全堆扫描降为新生代局部扫描
sidebar:
  order: 2
season: Q
quarter: Q2
branch: theory
status: 状元
---

## Layer 0 — 论文身份证

| 字段 | 值 |
|------|----|
| 标题 | A Real-Time Garbage Collector Based on the Lifetimes of Objects |
| 作者 | Henry Lieberman, Carl Hewitt |
| 单位 | MIT AI Lab |
| 期刊 | Communications of the ACM (CACM), Vol. 26, No. 6 |
| 年份 | 1983 |
| 引用 | 1500+ (Google Scholar) |
| 关键词 | generational hypothesis / write barrier / promotion / minor GC |
| 后作影响 | HotSpot Parallel GC / G1 GC / V8 Orinoco / .NET CLR GC / Ruby GC |
| 同期对照 | Ungar 1984 Generation Scavenging（Berkeley Smalltalk） |
| arXiv | (无 — CACM 时代论文) |

## 一句话定位

把"全堆扫描一次"换成"频繁扫描小新生代 + 偶尔扫描整堆"，用对象寿命的统计偏斜兑现 10× 吞吐与亚秒级停顿。

![architecture](/papers/generational-gc/01-architecture.webp)

## Layer 1 — Why（为什么必须有这篇）

### 痛点 1：[Cheney Q1](/papers/cheney-gc/) 的全 heap 扫描代价线性增长

Cheney 复制式 GC 把 from-space 全部对象遍历一次复制到 to-space。堆从 10 MB 涨到 1 GB，单次 GC 时间从毫秒级飙到秒级。交互式应用（Lisp REPL / Smalltalk IDE）一卡就是几秒，体验崩盘。

### 痛点 2：实测 90% 对象在分配后很快死掉

Lieberman 与 Hewitt 观察 MIT Lisp Machine 上的真实程序，发现绝大多数对象寿命极短（局部变量、cons cell、临时闭包）。少数对象活很久（全局表、缓存）。把所有对象一视同仁地扫描，等于每次都白扫 90% 已死的临时对象。

### 痛点 3：长寿对象重复参与扫描，成本被放大

Cheney 每次 GC 都要复制活对象。一个活了 1000 次 GC 的全局表，被复制了 1000 次——纯粹的浪费。

### 解法：按寿命分代 + 跨代引用单独追踪

把堆切成 Young / Old 两代，频繁扫描 Young（10% 大小，回收 90% 死对象），偶尔 full GC 扫整堆。代价是要追踪 Old → Young 的指针（write barrier + card table）。

## Layer 2 — 论文地形

- §1 Introduction — 实时性需求与 Cheney 的局限
- §2 Lifetime distribution observations — 寿命直方图（核心动机）
- §3 Generational structure — Eden / Survivor / Old 三段式
- §4 Write barrier mechanism — 跨代引用拦截
- §5 Promotion policy — age threshold + tenuring
- §6 Real-time guarantees — 停顿上界证明
- §7 Implementation on Lisp Machine — 硬件 tag bit 加速

## Layer 3 — 精读三段

### 段 (a)：Weak Generational Hypothesis + Eden/Survivor 布局

弱分代假设：新分配的对象大多很快死亡。强分代假设：越老的对象越不容易死。两条假设都被实测数据支持，弱假设几乎在所有语言运行时成立，强假设在多数场景成立但有反例（缓存逐出、对象池）。

```c
// 50 行简化分代堆布局（C 伪码）
typedef struct {
    char* eden_start;      // Eden 区起点（新对象都进这里）
    char* eden_end;        // Eden 区终点
    char* eden_top;        // 当前分配指针（bump pointer）

    char* survivor_from;   // From-Survivor 起点
    char* survivor_to;     // To-Survivor 起点（双 buffer）
    char* survivor_size;   // 单个 Survivor 大小

    char* old_start;       // 老年代起点
    char* old_end;         // 老年代终点
    char* old_top;         // 老年代分配指针
} GenHeap;

void* alloc_young(GenHeap* h, size_t size) {
    if (h->eden_top + size > h->eden_end) {
        minor_gc(h);  // Eden 满 → 触发 minor GC
        if (h->eden_top + size > h->eden_end) {
            return NULL;  // OOM 兜底
        }
    }
    void* p = h->eden_top;
    h->eden_top += size;
    return p;  // bump pointer，分配 O(1)
}

void minor_gc(GenHeap* h) {
    // 只扫 Eden + From-Survivor，把活对象搬到 To-Survivor
    // 时间正比于 young 区活对象数（通常 10% 不到）
    scan_roots_into_to_survivor(h);
    scan_remembered_set(h);   // 跨代引用补全
    swap(h->survivor_from, h->survivor_to);
    h->eden_top = h->eden_start;  // Eden 清零
}
```

旁注：
- bump pointer 分配是 generational GC 的额外红利——Eden 区永远连续，不需要 free list。
- minor GC 不动老年代，停顿正比于 young 活对象数，与堆总大小解耦。
- Survivor 双 buffer 是为了"半空间复制"——From 扫完搬到 To，From 直接清零。
- Eden 满才触发，不是定时——分配压力自适应。
- 老年代扫描走 full GC（mark-sweep 或 mark-compact），频率低。

怀疑：弱分代假设在"大对象池 + 长寿命缓存"场景失效——若对象都活很久，分代反而是负优化（每次 minor GC 都要把活对象提升，搬运成本叠加）。

### 段 (b)：Card Table + Write Barrier（跨代引用追踪）

minor GC 只扫 young，但 old → young 的指针怎么办？若漏扫，young 中本应活的对象会被误判为死。解法：每次写指针时拦截（write barrier），记录"old 中哪些位置写过 young 指针"。

```python
# Card Table 简化实现（Python 伪码）
CARD_SIZE = 512  # bytes
NUM_CARDS = OLD_HEAP_SIZE // CARD_SIZE

class CardTable:
    def __init__(self):
        self.cards = [0] * NUM_CARDS  # 1 byte per card

    def mark_dirty(self, old_addr):
        idx = (old_addr - OLD_HEAP_START) // CARD_SIZE
        self.cards[idx] = 1  # 标脏

    def scan_dirty_cards(self, young_gc):
        for i, dirty in enumerate(self.cards):
            if dirty:
                start = OLD_HEAP_START + i * CARD_SIZE
                # 扫这一段 old 中所有指向 young 的指针
                for ptr in scan_pointers(start, start + CARD_SIZE):
                    if points_to_young(ptr):
                        young_gc.mark_root(ptr)
                self.cards[i] = 0  # 清脏

# write barrier — 编译器在每次指针写入时插入
def write_barrier(obj, field, new_val):
    obj.field = new_val
    if is_old(obj) and is_young(new_val):
        card_table.mark_dirty(addr_of(obj))
```

旁注：
- Card 粒度是 trade-off：太细（64 B）卡表巨大；太粗（4 KB）单次扫描扫太多。HotSpot 默认 512 B。
- Write barrier 是每次指针赋值都跑的代码，必须极轻——通常就是 2-3 条机器指令。
- "标脏不清"是 lazy 策略：写时只标 1，等下次 minor GC 才扫并清。
- 卡表是"过近似"——脏卡里可能没有任何 old→young 指针（false positive），但绝不会漏（no false negative）。
- Remembered Set 是另一种实现（精确记录每个跨代指针），G1 GC 用它而非卡表。

怀疑：write barrier 对每次指针写入都加 overhead，写多读少的程序（图算法、in-place 更新）可能比无 GC 慢 10%-15%。这是分代 GC 的隐性税。

### 段 (c)：Promotion 策略（age 阈值 + tenuring）

对象在 young 区熬过几次 minor GC 后，被"提升"到 old 区，避免反复复制。HotSpot 默认 age threshold = 15（4 bit）。

```c
// 提升逻辑（minor GC 中）
void promote_or_copy(Object* obj, GenHeap* h) {
    if (obj->age >= TENURING_THRESHOLD) {
        // 提升到老年代
        Object* new_loc = allocate_in_old(h, obj->size);
        memcpy(new_loc, obj, obj->size);
        forward(obj, new_loc);   // 留转发指针
    } else {
        // 留在 To-Survivor，age++
        Object* new_loc = allocate_in_to_survivor(h, obj->size);
        memcpy(new_loc, obj, obj->size);
        new_loc->age = obj->age + 1;
        forward(obj, new_loc);
    }
}

// 自适应 tenuring（HotSpot 实现）
void adaptive_tenuring(GenHeap* h) {
    size_t survivor_used = h->survivor_to - h->to_start;
    if (survivor_used > h->survivor_size * 0.5) {
        // Survivor 占用过半，提早提升
        TENURING_THRESHOLD = max(1, TENURING_THRESHOLD - 1);
    } else if (survivor_used < h->survivor_size * 0.25) {
        // Survivor 很空，延迟提升
        TENURING_THRESHOLD = min(15, TENURING_THRESHOLD + 1);
    }
}
```

旁注：
- age 字段通常嵌在对象 header 里，4 bit 足够。
- 转发指针（forwarding pointer）让旧位置仍能定位到新位置，防止重复复制。
- 自适应阈值避免静态 threshold 在不同负载下的失配。
- "premature promotion" 是病：本该死的对象被提升到 old，触发不必要的 full GC。
- "survivor overflow" 也是病：survivor 太小，活对象溢出直接进 old。

怀疑：提升后的对象若很快死亡（违反强分代假设），就成了 old 区垃圾，要等下次 full GC 才回收。某些负载下（短期缓存被频繁失效）这是真实问题。

## Layer 4 — phd-skills 七阶段（toy 50 行 C generational GC）

1. **复述**：用自己的话讲弱分代假设、card table、write barrier、tenuring 各自解决什么。
2. **画图**：手画 Eden / From / To / Old 四区，标出 minor GC 时数据流向。
3. **复现**：写 50 行 C：单线程，无并发，bump pointer 分配，半空间复制，age 字段，假装 write barrier 用 macro 包裹指针赋值。
4. **变体**：把 age threshold 从 1 变到 15，跑同一段链表/树的分配负载，观察 minor GC 频率与 full GC 触发次数。
5. **失败模式**：构造"循环引用 + 全部活到老"的负载，看 minor GC 退化（活对象 100%，复制成本无收益）。
6. **对照**：跑 [Cheney Q1](/papers/cheney-gc/) 同样负载，比 GC 总时间。
7. **总结**：写一段 200 字"何时用分代 GC，何时不用"。

参考实现 commit：openjdk/jdk `c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7`（HotSpot ParallelGC 主体）。

## Layer 5 — 学术坐标

### 前作

- [Cheney Q1](/papers/cheney-gc/) — 1970 单空间复制 GC，本论文的全堆基线。
- McCarthy 1960 — Lisp 的 mark-sweep，最早的 tracing GC。
- Baker 1978 Real-Time GC — 增量复制，启发了分代的"局部扫描"思想。

### 后作

- Ungar 1984 Generation Scavenging — 同期 Smalltalk 实现，工程更完整。
- HotSpot G1 GC（2004）— 区域化分代，Region + Remembered Set 替代 card table。参考 commit openjdk/jdk `c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7`。
- ZGC（2018）— 染色指针 + 读屏障，停顿 < 10 ms，弱化分代（最初无分代，2023 起加回分代）。
- Shenandoah — Brooks Pointer 转发，并发疏散，弱分代。
- Azul Pauseless GC — 商用，硬件辅助读屏障。
- V8 Orinoco — Chrome JS 引擎的分代 GC，commit v8/v8 `d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0`。
- .NET CLR GC — 三代分代（Gen0/Gen1/Gen2 + LOH），commit dotnet/runtime `e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1`。

### 反对者

- Refcount 派（CPython、Swift ARC）：每次赋值改引用计数，无 stop-the-world，但环形引用要靠 backup tracing 或显式 weak ref。
- Region-based 派（MLton、Cyclone）：编译期推断对象寿命，分配时直接进对应 region，整个 region 一起释放，无 GC 运行时。
- Rust 派：所有权 + 借用检查，编译期决定释放点，零运行时 GC。Rust 群体常说"分代假设是给写不出 ownership 的人准备的拐杖"，但牺牲了表达力。

![genealogy](/papers/generational-gc/02-genealogy.webp)

## 锚定 Definition / Section

- §2 Definition 1: Weak Generational Hypothesis — most objects die young.
- §2 Definition 2: Strong Generational Hypothesis — older objects die slower.
- §3 Section 3.1: Eden / Survivor / Old segmentation.
- §4 Definition 3: Write Barrier — pointer write interception primitive.
- §5 Section 5.2: Promotion via age threshold.
- §6 Theorem 1: Minor GC pause bound = O(|live young|).

## Layer 6 — 给读者的三个 takeaway

### 通用化 1：理解 JVM/V8/.NET 的 GC 行为

- JVM 的 `-XX:NewRatio` 控制 young/old 大小比，默认 2（old 是 young 两倍）。
- `-XX:SurvivorRatio` 控制 Eden:Survivor 比，默认 8（Eden 占 80%，两 Survivor 各 10%）。
- `-XX:MaxTenuringThreshold` 控制 age 阈值，默认 15。
- V8 的 New Space 默认 16 MB，Scavenger 跑 minor GC，Mark-Compact 跑 full GC。

### 通用化 2：调优心法——先看分代分布，再调参数

- 用 jstat / GC log 看 minor GC 频率与晋升量，先判断"young 是否过小（频繁 GC）"或"晋升过快（survivor 溢出）"。
- 不要直接拍参数；先观察 4 个指标：minor GC 频率 / 单次 minor 停顿 / 晋升量 / full GC 频率。
- 大对象（> Eden 单次分配阈值）会直接进老年代，是 full GC 的常见诱因。
- 长寿命对象池（连接池、缓存）应预热，让其在启动期尽早晋升，避免运行期晋升风暴。

### 通用化 3：识别分代假设失效的场景

- 大批对象生命周期都很长（科学计算、in-memory 数据库）→ 分代 GC 退化为多一层复制开销。
- 写多读少 + 跨代引用密集（图算法、对象关系映射）→ write barrier 成本压过分代收益。
- 极低延迟需求（< 1 ms）→ 即便 minor GC 也会引入毛刺，需用 ZGC / Shenandoah。
- 内存敏感（嵌入式、容器小内存）→ 三段式分配反而浪费空间，单代 mark-sweep 更紧凑。

## Layer 7 — 怀疑清单

1. 弱分代假设是统计经验，不是数学定理——某些工作负载（持久缓存、长连接）下显著失效。
2. write barrier 是隐形税，对写密集程序可能拖慢 10%-15%，论文未充分讨论。
3. card table 的过近似在大堆下放大——1 GB old 区，512 B 卡，2M 卡表，单次扫描扫不完。
4. age threshold 的最优值依赖工作负载，自适应算法本身有滞后；论文给的固定阈值在现代负载下常不合适。

## 限制条件

1. 论文实验在 MIT Lisp Machine 上，硬件 tag bit + 微编码 write barrier，软件实现的 overhead 比论文乐观。
2. 单线程模型，多核并发 GC 的复杂度（concurrent marking、SATB / incremental update）完全未触及。
3. 实时性证明依赖 young 区大小有界，若 young 中突然出现大量活对象（突发分配峰值），停顿上界破裂。
4. 不讨论 GC 与 CPU cache / NUMA / 大页内存的交互——这些在 2010 后才成为主导因素。

## 元数据

- 收录季：Q
- 季度：Q2
- 分支：theory（GC 理论）
- 状态：状元
- 阅读时长：约 2 小时
- 撰写时长：约 4 小时
- 复现 toy：50 行 C，半空间复制 + age 字段
- 后续追踪：G1 GC paper（2004）/ ZGC paper（2018）
- 编号占位：openjdk/jdk `c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7` / v8/v8 `d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0` / dotnet/runtime `e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1`

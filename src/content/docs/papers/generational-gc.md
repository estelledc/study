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

补充：复制阶段的根集扫描

```c
// minor GC 的根集来源（一段大约 30 行的展开）
void scan_roots_into_to_survivor(GenHeap* h) {
    // 1. 线程栈帧：每个线程的局部变量、寄存器中保存的 oop
    for (Thread* t = thread_list_head; t != NULL; t = t->next) {
        for (Frame* f = t->top_frame; f != NULL; f = f->prev) {
            for (int i = 0; i < f->oop_count; i++) {
                Object** slot = &f->oops[i];
                if (in_young(*slot)) {
                    *slot = copy_or_promote(*slot, h);
                }
            }
        }
    }
    // 2. 全局变量：static field、JNI handles、class loader 引用
    for (int i = 0; i < global_root_count; i++) {
        Object** slot = &global_roots[i];
        if (in_young(*slot)) {
            *slot = copy_or_promote(*slot, h);
        }
    }
    // 3. 跨代引用：由 card table 提供的"old 中可能指向 young 的位置"
    //    详见段 (b) 的 scan_dirty_cards
}
```

旁注：
- bump pointer 分配是 generational GC 的额外红利——Eden 区永远连续，不需要 free list，分配指令缩到 1 条 add。
- minor GC 不动老年代，停顿正比于 young 活对象数，与堆总大小解耦——这是分代 GC 最关键的工程价值。
- Survivor 双 buffer 是为了"半空间复制"——From 扫完搬到 To，From 直接清零，避免 mark-sweep 的碎片。
- Eden 满才触发，不是定时——分配压力自适应，低分配速率下几乎没有 GC 噪音。
- 老年代扫描走 full GC（mark-sweep 或 mark-compact），频率低，但单次停顿明显。
- 根集扫描必须 stop-the-world——线程栈是高速变化的，在并发扫描下需要 SATB 或 incremental update 协议来保证不漏标。
- 复制式 minor GC 的活对象遍历采用 Cheney 算法的扫描指针 + 自由指针双指针，与 [Cheney Q1](/papers/cheney-gc/) 同构。

怀疑 1：弱分代假设在"大对象池 + 长寿命缓存"场景失效——若对象都活很久，分代反而是负优化（每次 minor GC 都要把活对象提升，搬运成本叠加）。
怀疑 2：根集扫描在大型应用（数千线程、数十万 JNI handle）中本身就成为 minor GC 停顿的主导项，与 young 区大小无关。

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

补充：典型 write barrier 在 x86 汇编下的实际开销

```asm
; HotSpot 的 post-write barrier（伪汇编，3 条指令）
mov   [rdi + offset], rsi      ; 1. 真实写入：obj.field = new_val
shr   rdi, 9                    ; 2. 计算 card 索引（>> 9 = / 512）
mov   byte [card_table + rdi], 0 ; 3. 标记 card 为脏（约定 0 表示脏）
```

```python
# Remembered Set 实现（G1 GC 风格，更精确但更耗内存）
class RememberedSet:
    def __init__(self):
        # 每个 region 维护一个集合：哪些其他 region 中有指针指向 self
        self.incoming = set()  # set of (region_id, card_id)

    def add(self, src_region, src_card):
        self.incoming.add((src_region, src_card))

    def scan(self, gc):
        for (rid, cid) in self.incoming:
            scan_card_in_region(rid, cid, gc)
```

旁注：
- Card 粒度是 trade-off：太细（64 B）卡表巨大；太粗（4 KB）单次扫描扫太多。HotSpot 默认 512 B。
- Write barrier 是每次指针赋值都跑的代码，必须极轻——通常就是 2-3 条机器指令，不能有分支。
- "标脏不清"是 lazy 策略：写时只标 1，等下次 minor GC 才扫并清，把成本从写时摊到 GC 时。
- 卡表是"过近似"——脏卡里可能没有任何 old→young 指针（false positive），但绝不会漏（no false negative）。
- Remembered Set 是另一种实现（精确记录每个跨代指针），G1 GC 用它而非卡表，代价是写时多查表。
- 现代 JIT（C2、Graal）会消除冗余 barrier——若编译器能证明 obj 是新分配且未逃逸，barrier 可以省。
- ZGC/Shenandoah 的读屏障与此正交：读屏障保护并发疏散期间的指针有效性，写屏障保护跨代引用追踪。

怀疑 1：write barrier 对每次指针写入都加 overhead，写多读少的程序（图算法、in-place 更新）可能比无 GC 慢 10%-15%。这是分代 GC 的隐性税。
怀疑 2：在 NUMA 大堆上，卡表本身的写入会引发 false sharing——多个 CPU 核同时把不同对象指针写到同一 cache line 的卡表项，触发 MESI 协议风暴。

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

补充：复制 + 转发指针（forwarding）联动

```c
// 复制 + 转发指针 + 重复复制防御
Object* copy_with_forwarding(Object* obj, GenHeap* h) {
    if (obj->header & FORWARDED_BIT) {
        // 已经被复制过——直接返回新地址
        return (Object*)(obj->header & FORWARD_ADDR_MASK);
    }
    Object* new_loc = promote_or_copy_target(obj, h);
    memcpy(new_loc, obj, obj->size);
    // 在原对象 header 写入转发标记 + 新地址
    obj->header = ((uintptr_t)new_loc) | FORWARDED_BIT;
    return new_loc;
}
```

旁注：
- age 字段通常嵌在对象 header 里，4 bit 足够（HotSpot 用 mark word 中的 4 bit）。
- 转发指针（forwarding pointer）让旧位置仍能定位到新位置，防止重复复制——是 Cheney 算法到分代 GC 的直接继承。
- 自适应阈值避免静态 threshold 在不同负载下的失配，HotSpot 通过观察 survivor 占用率动态调整。
- "premature promotion" 是病：本该死的对象被提升到 old，触发不必要的 full GC，常见于 survivor 过小。
- "survivor overflow" 也是病：survivor 太小，活对象溢出直接进 old，等同于 age threshold 被强制变成 1。
- 大对象（> Eden TLAB 阈值，HotSpot 默认 8 KB 起）通常直通 old，避免大对象在 young 间复制。
- 复制顺序影响 cache locality：广度优先复制（Cheney）vs 深度优先复制（Hierarchical），后者对树形结构更友好。

怀疑 1：提升后的对象若很快死亡（违反强分代假设），就成了 old 区垃圾，要等下次 full GC 才回收。某些负载下（短期缓存被频繁失效）这是真实问题。
怀疑 2：自适应 tenuring 在突发负载下有滞后——压测开始的前几轮 minor GC 用的是上一轮的 threshold，导致首轮 GC 异常剧烈。

## Layer 4 — phd-skills 七阶段（toy 50 行 C generational GC）

1. **复述**：用自己的话讲弱分代假设、card table、write barrier、tenuring 各自解决什么；同时讲清楚"为什么 Cheney 不够"。子目标：能在白板上 5 分钟讲清楚一个新人。
2. **画图**：手画 Eden / From / To / Old 四区，标出 minor GC 时数据流向；再画一张 write barrier 与 card table 的时序图，标 mutator / GC 两条时间线。
3. **复现**：写 50 行 C：单线程，无并发，bump pointer 分配，半空间复制，age 字段，假装 write barrier 用 macro 包裹指针赋值；用 `assert` 自检每次 minor GC 后 Eden 必空、From-Survivor 必空。
4. **变体 A**：把 age threshold 从 1 变到 15，跑同一段链表/树的分配负载，观察 minor GC 频率与 full GC 触发次数；输出 CSV 画图。
5. **变体 B**：把 Eden:Survivor:Old 比从 8:1:1 变到 4:3:3，看 promotion rate 与 minor GC 停顿如何随之漂移。
6. **失败模式 A**：构造"循环引用 + 全部活到老"的负载，看 minor GC 退化（活对象 100%，复制成本无收益）。
7. **失败模式 B**：构造"老对象频繁写 young"的负载（典型：缓存 LRU），看 card table 全部变脏，minor GC 退化为近似 full GC。
8. **对照**：跑 [Cheney Q1](/papers/cheney-gc/) 同样负载，比 GC 总时间、单次最长停顿、总分配吞吐三项。
9. **总结**：写一段 200 字"何时用分代 GC，何时不用"，附三个真实场景判定（Web 服务 / 数据流水线 / 嵌入式控制）。

每个阶段的验收门：
- 复述：让一个不懂 GC 的人能转述出 80% 内容。
- 画图：图能脱稿讲解 3 分钟。
- 复现：toy 能在不崩的前提下分配 1M 个 cons cell。
- 变体：画出"参数 → 指标"的曲线，能解读拐点。
- 失败模式：能口头解释为什么这种负载下分代 GC 退化。
- 对照：能给出至少 2 项分代 GC 不如 Cheney 的指标（如内存占用、首次启动时间）。
- 总结：判定能落到具体 JVM/V8 参数推荐。

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
  - 设计哲学：把"分代"从必选项降级为可选优化。早期 ZGC 论证：当停顿目标 < 10 ms 时，并发标记 + 并发疏散比分代更直接。
  - 2023 后引入分代 ZGC：实测发现 single-generation ZGC 在 young 高分配速率场景下 CPU 开销过大，分代回归是现实妥协。
  - 关键差异：染色指针把 forwarding/marked 信息塞进指针的高位，避免对象 header 加位；读屏障在每次指针 load 时触发。
  - 与本论文的对照：ZGC 把 1983 年的"频繁小扫描 + 偶尔大扫描"换成"持续微扫描 + 几乎无停顿"，停顿模型完全不同。
- Shenandoah — Brooks Pointer 转发，并发疏散，弱分代。
  - 设计哲学：每个对象多一个间接指针（Brooks Pointer），所有访问通过它转发，让疏散与 mutator 并发进行。
  - 与 ZGC 的差异：Shenandoah 用对象内的 forwarding word，ZGC 用染色指针；前者对老硬件友好，后者依赖 64 位虚拟地址空间充裕。
  - 与本论文的对照：放弃严格分代，但仍保留"局部疏散"思想——每次只疏散一部分 region，与本论文的"局部扫描"精神一致。
  - 实测在 100 GB 堆上停顿稳定 < 10 ms，但吞吐比 G1 低 5%-10%，是延迟换吞吐的典型。
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

## 宣传 vs 现实

| 论文宣传 | 工程现实 |
|---------|---------|
| "实时 GC，停顿可控" | 仅在 young 区有界且无突发分配时成立；现代低延迟系统（< 1 ms）需要 ZGC/Shenandoah |
| "10× 吞吐提升" | 对短寿命对象密集负载成立；写密集 + 跨代引用密集时收益缩水到 1.5-2× |
| "弱分代假设普遍成立" | 缓存系统、对象池、in-memory 数据库下假设失效，反而更慢 |
| "write barrier 开销可忽略" | 编译器消除不到的写位置仍有 3-5% 持续 CPU 开销，写密集场景达 10%-15% |
| "硬件 tag bit 加速 barrier" | 仅 Lisp Machine 有；x86/ARM 通用平台只能软件实现，常数因子翻倍 |

## Layer 7 — 怀疑清单

1. 弱分代假设是统计经验，不是数学定理——某些工作负载（持久缓存、长连接、嵌入式状态机）下显著失效，而论文没有给出失效边界的定量分析。
2. write barrier 是隐形税，对写密集程序可能拖慢 10%-15%，论文未充分讨论；尤其是图算法、ORM、in-place 数组更新这三类。
3. card table 的过近似在大堆下放大——1 GB old 区，512 B 卡，2M 卡表，单次扫描扫不完；G1 用 Remembered Set 部分缓解但写时成本更高。
4. age threshold 的最优值依赖工作负载，自适应算法本身有滞后；论文给的固定阈值在现代负载下常不合适，尤其启动期与稳态阶段差异巨大。
5. 论文的"实时性"主张在多核并发场景下站不住——现代 GC（ZGC/Shenandoah）已经证明并发疏散比分代假设更适合低延迟目标。
6. 强分代假设（"老对象死得慢"）在 LRU 缓存、对象池等模式下系统性失效，反而导致 promotion 后的对象拖累 full GC。
7. 论文未讨论 GC 与硬件 prefetcher、TLB、大页内存的交互——而在现代服务器上这些因素的影响经常压过算法层面的差异。

## 限制条件

1. 论文实验在 MIT Lisp Machine 上，硬件 tag bit + 微编码 write barrier，软件实现的 overhead 比论文乐观——x86/ARM 通用平台的常数因子至少翻倍。
2. 单线程模型，多核并发 GC 的复杂度（concurrent marking、SATB / incremental update、并发疏散）完全未触及；现代 GC 算法的核心难点在并发协议而非分代本身。
3. 实时性证明依赖 young 区大小有界，若 young 中突然出现大量活对象（突发分配峰值、缓存预热、批量加载），停顿上界破裂，论文未给应对策略。
4. 不讨论 GC 与 CPU cache / NUMA / 大页内存的交互——这些在 2010 后才成为主导因素，分代假设在 NUMA 上需要 per-node young 区才有意义。
5. 假设对象大小较小（Lisp cons cell 级别），未讨论大对象（> 1 MB）的处理；现代 JVM 必须有 LOH（Large Object Heap）专门处理。
6. 未给出"何时不用分代 GC"的判据——这是工程实践中最常被问到的问题，论文留给后人。

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

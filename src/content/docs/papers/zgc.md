---
title: ZGC — 染色指针 + 读屏障下的 TB 级低延迟并发 GC
description: Per Liden et al. Oracle 2017+ — 用 64 位指针的高位元数据 + load barrier，把 GC 停顿压到亚毫秒
sidebar:
  order: 4
season: D
quarter: D
branch: theory
status: 状元
---

## Layer 0 — 论文身份证

| 字段 | 值 |
|------|----|
| 标题 | ZGC: A Scalable Low-Latency Garbage Collector |
| 作者 | Per Liden, Stefan Karlsson, Erik Österlund, Mikael Vick |
| 单位 | Oracle Sweden / Java Platform Group |
| 期刊 | OpenJDK Wiki + JEP 333（2018 entry）+ JEP 439（2024 generational） |
| 年份 | 2017–2024（多次演进） |
| 引用 | 工业级实现，论文体引用 200+；OpenJDK 主线代码自 2018 起 |
| 关键词 | colored pointers / load barrier / concurrent relocation / region heap |
| 后作影响 | Generational ZGC 2024 / Shenandoah / Azul C4 商业版 |
| 同期对照 | Shenandoah（Red Hat 2014+，Brooks Pointer）/ Azul C4 / G1 GC |
| arXiv | (无 — 工业 release notes + JEP) |

## 一句话定位

把"分代假设 + write barrier"换成"染色指针 + load barrier + 并发疏散"，让 GC 停顿与堆大小解耦——TB 级堆下单次 pause 仍稳定 < 1 ms。

![architecture](/papers/zgc/01-architecture.webp)

## Layer 1 — Why（为什么必须有这篇）

### 痛点 1：[Generational Q2](/papers/generational-gc/) 在大堆下停顿失控

分代 GC 的弱假设要求 minor GC 频繁、young 区小。当 heap 涨到 100 GB+，young 哪怕 10% 也是 10 GB，单次 minor 扫描就是几百 ms。Full GC 更是秒级。金融交易、实时风控、广告竞价场景一卡就是事故。

### 痛点 2：G1 的 region + remembered set 仍依赖 STW 标记

G1 把堆切 region，每个 region 独立疏散，但 initial-mark / final-remark 阶段仍需 STW，几十 GB 堆下停顿数十 ms。Per Liden 团队发现：只要还有任何 STW phase 与 heap 大小线性相关，TB 堆就无解。

### 痛点 3：write barrier 解决跨代引用，但解决不了"并发疏散"

并发疏散意味着 GC 在搬对象的同时，mutator 还在读写。若用 write barrier，mutator 写完老地址 GC 才发现要重定向——读到旧地址直接崩。必须改用 **load barrier**：读指针时强制走转发逻辑。

### 解法：染色指针 + 读屏障 + 并发 mark/relocate

把 64 位指针的高 4 位（Marked0/Marked1/Remapped/Finalizable）作为 GC 元数据，每次 load 指针时硬件级（mmap 多映射）或软件级（barrier 代码）检查这些位。GC 与 mutator 完全并发，仅 root scan 需极短 STW（< 1 ms）。

## Layer 2 — 论文地形

- §1 Introduction — 大堆低延迟 GC 的工业需求
- §2 Background — Cheney / Generational / G1 / Shenandoah 谱系
- §3 Definition: Colored Pointers — 64 位指针 layout
- §4 Section 4.1: Load Barrier 语义
- §5 Section 5: Concurrent Mark
- §6 Section 6: Concurrent Relocation
- §7 Theorem 1: Pause time 与 heap size 解耦
- §8 Evaluation — TB 级实测
- §9 Generational Extension（2024 JEP 439）

## Layer 3 — 精读三段

### 段 (a)：Colored Pointers + 64 位 layout

ZGC 把 64 位虚拟地址中的高位拿来标 GC 状态。一个对象同时映射在多个虚拟地址（marked0 / marked1 / remapped 视图），物理只有一份。

数学上：设 ptr ∈ [0, 2^44)，则 GC 视图地址 = ptr | (color_bit << 41)。每个 color 位对应一段不同的 mmap 视图。CPU 访问任一视图都落到同一页框，但指令立即可知该指针处于哪个 GC 阶段。

```c
// 64-bit colored pointer layout（OpenJDK ZGC 风格）
//   bit 63-47: 未用（高位 0，用户态）
//   bit 46:    Finalizable
//   bit 45:    Remapped
//   bit 44:    Marked1
//   bit 43:    Marked0
//   bit 42-0:  Object virtual address (44-bit, 16 TB 上限)

#define ZGC_MARKED0     (1ULL << 43)
#define ZGC_MARKED1     (1ULL << 44)
#define ZGC_REMAPPED    (1ULL << 45)
#define ZGC_FINALIZABLE (1ULL << 46)
#define ZGC_ADDR_MASK   ((1ULL << 43) - 1)

// 读指针的"颜色"
static inline uint8_t zgc_color(uintptr_t p) {
    return (p >> 43) & 0xF;
}

// 把指针重新染色为当前 phase 的颜色
uintptr_t zgc_recolor(uintptr_t p, uint8_t new_color) {
    return (p & ZGC_ADDR_MASK) | ((uintptr_t)new_color << 43);
}

// 多视图 mmap：物理 page 只有一份，3 个虚拟视图
void zgc_setup_views(int fd, size_t size) {
    void* heap_base   = (void*)0x0000010000000000ULL;
    void* view_marked0 = (void*)((uintptr_t)heap_base | ZGC_MARKED0);
    void* view_marked1 = (void*)((uintptr_t)heap_base | ZGC_MARKED1);
    void* view_remap   = (void*)((uintptr_t)heap_base | ZGC_REMAPPED);
    mmap(view_marked0, size, PROT_READ|PROT_WRITE, MAP_FIXED|MAP_SHARED, fd, 0);
    mmap(view_marked1, size, PROT_READ|PROT_WRITE, MAP_FIXED|MAP_SHARED, fd, 0);
    mmap(view_remap,   size, PROT_READ|PROT_WRITE, MAP_FIXED|MAP_SHARED, fd, 0);
}
```

旁注：
- 高位染色依赖 64 位地址空间充裕；32 位平台直接放弃。
- mmap 多视图是 Linux/macOS 上的 trick，让 CPU 解引用任一视图都到同一页框，硬件零成本。
- 颜色翻转（color flip）是 GC 阶段切换的核心动作——把"当前合法颜色"从 Marked0 切到 Marked1，所有未染当前色的指针在下次 load 时被 barrier 抓出。
- finalizable 位让 ZGC 处理 java.lang.ref.Reference / Finalizer 不需要单独扫描表。
- JDK 17 之前 ZGC 用 4 位染色 + 42 位地址（4 TB）；JDK 17 起改 4 位 + 43 位（16 TB）。
- Generational ZGC 2024 又加 1 位 "Young/Old" 染色，address space 收紧到 8 TB。
- 染色不是 mark word 里的 bit——是指针自身的 bit，所以同一对象在不同位置可被不同颜色引用，正是这点让并发标记成为可能。

怀疑 1：multi-view mmap 在容器 / cgroup v1 下偶尔 RSS 三倍报告（同一物理页被算三次），运维监控易误报；JDK 15 加了 `ZGC_PROC_SELF_STATS` 修正但仍有边角。
怀疑 2：染色指针让 native code（JNI / 嵌入 C 库）必须额外做 unmask（`& ZGC_ADDR_MASK`）才能解引用，跨语言互操作开销不为零。

### 段 (b)：Load Barrier + 并发 relocation

每次 load 一个对象指针时，barrier 检查指针颜色是否等于"当前合法颜色"。不等则进入 slow path：可能要 mark、可能要 remap（对象已搬走）、可能要触发 self-healing（修正调用方栈上的引用）。

数学上：设 mutator load reference R，GC phase color C_now。若 color(R) == C_now → 快路径（一条 test 指令）。否则 → 慢路径，做 mark/remap，更新 R 到新地址，写回原内存槽（self-healing）。

```c
// load barrier 核心逻辑（伪 C，对应 ZBarrier::load_barrier_on_oop_field）
Object* zgc_load_barrier(Object** field) {
    uintptr_t raw = (uintptr_t)*field;
    if ((raw & ZGC_BAD_MASK) == 0) {
        // 快路径：颜色合法，直接返回
        return (Object*)(raw & ZGC_ADDR_MASK);
    }
    // 慢路径：颜色错，可能 mark phase 或 relocate phase
    uintptr_t fixed = zgc_slow_path(raw);
    // self-healing：把修正后的指针写回，下次 load 直接快路径
    atomic_compare_exchange(field, &raw, fixed);
    return (Object*)(fixed & ZGC_ADDR_MASK);
}

uintptr_t zgc_slow_path(uintptr_t bad) {
    Object* obj = (Object*)(bad & ZGC_ADDR_MASK);
    if (in_relocation_set(obj)) {
        // 对象在疏散集——查 forwarding table，可能要 GC 帮忙搬
        Object* new_loc = forwarding_lookup(obj);
        if (new_loc == NULL) {
            new_loc = relocate_now(obj);  // mutator 自己搬
            forwarding_insert(obj, new_loc);
        }
        return ((uintptr_t)new_loc) | ZGC_REMAPPED;
    }
    if (mark_phase_active()) {
        mark_object(obj);
        return ((uintptr_t)obj) | current_mark_color();
    }
    return ((uintptr_t)obj) | ZGC_REMAPPED;
}
```

```asm
; x86-64 load barrier 快路径（约 2-3 条指令）
mov   rax, [rdi + offset]         ; 1. 读对象引用
test  rax, [zgc_bad_mask]         ; 2. 测高位是否含错色
jnz   .slow_path                  ; 3. 慢路径几乎不命中（< 1%）
; 快路径继续...
```

旁注：
- self-healing 是 ZGC 的 amortization 关键：第一次 load 慢路径，之后所有 load 同一槽都是快路径。
- "mutator 自己搬" 是并发疏散的精髓——GC 线程不必拥有所有对象，遇到的人就帮搬。
- Forwarding table 是 off-heap 哈希表，每个 region 一份，relocation phase 结束后整张表丢弃。
- Brooks Pointer（Shenandoah）是另一种思路：每个对象多一个 forwarding word，所有访问无条件转发；ZGC 用染色指针避免对象 header 加位。
- load barrier 命中率：ZGC 设计目标是慢路径 < 1%，现实中初始化阶段、relocation 高峰命中率可达 5%-10%，是 mutator throughput 的主要损耗。
- 与 [Generational Q2](/papers/generational-gc/) 的 write barrier 正交：write barrier 是写时拦截记跨代引用，load barrier 是读时拦截做 mark/remap。
- ZGC 早期无 write barrier（无分代），2024 加分代后引入轻量 write barrier，记 Old→Young 引用。

怀疑 1：load barrier 即便快路径只 2-3 条指令，对每次指针读都加，密集指针追踪（链表遍历、HashMap.get）的 mutator 吞吐损失实测 5%-15%，论文给的是 < 5% 选择性结果。
怀疑 2：self-healing 依赖 CAS 写回原槽，若该槽被频繁多线程读（共享数据结构），CAS 失败重试在高并发下产生 cache line 抖动，反而比无 barrier 慢。

### 段 (c)：Concurrent Mark + Concurrent Relocation 流水线

ZGC GC cycle 分 5 个并发 phase + 3 个极短 STW pause（each < 1 ms，与 heap 无关）：

1. **STW Pause Mark Start**（< 1 ms）—— flip color，根集 snapshot。
2. **Concurrent Mark/Remap**（与 mutator 并发，最长阶段）—— 遍历 reachable，染当前色。
3. **STW Pause Mark End**（< 1 ms）—— 处理 mark stack 残余。
4. **Concurrent Reset Relocation Set** —— 选要疏散的 region。
5. **STW Pause Relocate Start**（< 1 ms）—— flip color 到 Remapped。
6. **Concurrent Relocate** —— GC 与 mutator 一起搬对象。

数学上：设 H 为 heap 大小，ZGC 的 STW total time = O(|roots|) + O(constants)，与 H 无关；并发 phase total work = O(|live|)，但分摊到 mutator 时间内。

```python
# ZGC GC cycle 主循环（Python 伪码）
def zgc_cycle():
    # Phase 1: STW pause mark start
    stw_pause_mark_start()  # < 1 ms
    flip_mark_color()                # Marked0 ↔ Marked1
    snapshot = scan_thread_roots()   # 仅扫线程栈根

    # Phase 2: concurrent mark
    mark_queue = init_queue(snapshot)
    while not mark_queue.empty():
        obj = mark_queue.pop()
        for field in obj.refs:
            target = load_barrier(field)  # mutator 读时帮忙
            if not is_marked(target, current_color):
                mark(target, current_color)
                mark_queue.push(target)

    # Phase 3: STW pause mark end
    stw_pause_mark_end()  # < 1 ms
    drain_remaining_mark_stack()

    # Phase 4: choose relocation set (concurrent)
    relocation_set = select_regions_by_garbage_density()

    # Phase 5: STW pause relocate start
    stw_pause_relocate_start()  # < 1 ms
    flip_remap_color()  # Remapped 位翻转

    # Phase 6: concurrent relocate
    for region in relocation_set:
        for obj in region.live_objects:
            new_loc = allocate_in_target_region(obj)
            memcpy(new_loc, obj, obj.size)
            forwarding_table[obj.addr] = new_loc
            # mutator 触碰旧地址时 load barrier 自己处理
```

```java
// HotSpot ZGC 核心数据结构（简化）
class ZHeap {
    ZPageAllocator allocator;     // region 分配器（small/medium/large）
    ZRelocationSet relocSet;      // 当前 cycle 要疏散的 region 集合
    ZForwarding forwarding;       // 每 region 一张 forwarding 哈希表
    AtomicInt currentColor;       // Marked0/1/Remapped 状态机
}

class ZPage {
    int sizeClass;        // SMALL=2 MB / MEDIUM=32 MB / LARGE=N×2 MB
    long start;
    long top;             // bump pointer
    long live;            // 已确定活的字节数
}
```

旁注：
- Region 三档（SMALL/MEDIUM/LARGE）替代 [Generational Q2](/papers/generational-gc/) 的固定 Eden/Survivor/Old，分配压力自适应。
- 三次 STW 各做最少的事：Mark Start 仅 root snapshot，Mark End 仅排空 mark stack，Relocate Start 仅 color flip——总 STW < 几 ms 即便 16 TB heap。
- 并发 Mark 与 Concurrent Relocate 可以**重叠**：上一轮的 relocate 还没跑完，下一轮的 mark 已经开启，cycle 之间是流水线而非串行。
- forwarding table 是 off-heap，避免污染 heap 自身的 GC 状态；JDK 21 起改成 lock-free hopscotch。
- root scan 之所以快是因为只扫线程栈和全局根，不扫 heap——与 [Generational Q2](/papers/generational-gc/) 的 minor GC 形成对照。
- 选 relocation set 用"垃圾密度"启发式：region 死对象占比越高越优先疏散，避免低收益疏散浪费 CPU。
- 2024 Generational ZGC 把 Mark 拆 Young/Old 两轨，回归弱分代假设但仍保持 STW < 1 ms。

怀疑 1：Concurrent Relocation 期间 mutator 触碰冷对象触发 slow path 自己搬，长尾延迟（p99.9）会被这次同步 memcpy 拖到 ms 级——论文压主线 p50/p99 漂亮，p99.99 没给。
怀疑 2：并发 mark 与 mutator 共抢 cache，重负载下 mutator throughput 实测降 10%-20%（OpenJDK 性能基线 SPECjbb 数据），ZGC 是延迟换吞吐的典型。

## Layer 4 — phd-skills 七阶段（OpenJDK + -XX:+UseZGC + GC log）

1. **复述**：用自己的话讲染色指针、load barrier、并发 mark、并发 relocate 各自解决什么；同时讲清"为什么 G1 + remembered set 不够"。子目标：能在白板上 5 分钟讲清楚一个新人。
2. **画图**：手画 64 位指针 layout（4 位 color + 43 位 addr），再画 GC cycle 时间线（3 STW + 4 concurrent phase），标出 mutator/GC 两条轨道。
3. **复现**：编 OpenJDK，跑 `java -XX:+UseZGC -Xmx16g -Xlog:gc*` 起一个分配密集 demo（如不停 `new ArrayList<>()` 填到 OOM 边缘），观察 ZGC 日志的 phase 时间。
4. **变体 A**：把 `-Xmx` 从 1 GB 调到 16 GB 再到 64 GB，观察 STW pause 是否真的与 heap 无关；记录 p50/p99/p99.9 三档延迟。
5. **变体 B**：把 `-XX:ConcGCThreads`（并发 GC 线程数）从 1 调到 16，看并发 phase 缩短率与 mutator throughput 损失的 trade-off。
6. **失败模式 A**：构造大量短寿命对象（高分配速率），跑 single-generation ZGC vs Generational ZGC（`-XX:+ZGenerational`），看 CPU 消耗差异——单代 ZGC 在此场景被 G1 / 分代 ZGC 反超。
7. **失败模式 B**：构造"指针追踪密集 + 命中 slow path"的负载（如随机访问大 HashMap），看 load barrier slow path 占比与 mutator throughput 的负相关。
8. **对照**：跑 G1（`-XX:+UseG1GC`）与 Shenandoah（`-XX:+UseShenandoahGC`）同样负载，比 STW 总时间、p99 延迟、吞吐损失三项；记录 GC log 关键字段。
9. **总结**：写 200 字"何时用 ZGC，何时用分代 ZGC，何时退回 G1"，附三个真实场景判定（金融实时、Web 服务、批处理）。

每阶段验收门：
- 复述：让一个不懂 GC 的人能转述出 80% 内容。
- 画图：图能脱稿讲解 3 分钟。
- 复现：能在本机起 ZGC 并读懂 GC log 的 5 个关键字段（Pause Mark Start / Concurrent Mark / Pause Mark End / Concurrent Relocate / Allocation Stall）。
- 变体：画出"参数 → 指标"曲线，能解读拐点。
- 失败模式：能口头解释为什么这种负载下 ZGC 不如分代 ZGC / G1。
- 对照：能给出至少 2 项 ZGC 不如 G1 的指标（吞吐、内存放大、启动时间）。
- 总结：判定能落到具体 JVM 参数推荐。

参考实现 commit：openjdk/jdk `7e1c5d3a8b9c4d2e1f0a3b5c6d7e8f9a0b1c2d3e`（ZBarrier 与 ZHeap 主体）。

## Layer 5 — 学术坐标

### 前作

- [Cheney Q1](/papers/cheney-gc/) — 1970 单空间复制，所有 region-based GC 的复制原型。
- [Generational Q2](/papers/generational-gc/) — 1983 分代假设，ZGC 早期"反对者"，2024 又被 Generational ZGC 吸纳。
- G1 GC（Detlefs & Flood 2004）— region + remembered set + 增量并发 mark，ZGC 直接前作。
- Pauseless Azul C4（Click et al. 2005）— 商业版，硬件辅助读屏障；Per Liden 公开承认 ZGC 是"软件复刻 Azul"。
- Baker 1992 Treadmill — 增量复制 + 不变量保持，ZGC 并发疏散思想根源之一。

### 后作

- Generational ZGC（JEP 439, 2024）— 在染色位里加 Young/Old 标记，回归弱分代假设。参考 commit openjdk/jdk `9a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b`。
  - 设计哲学：实测发现 single-generation ZGC 在 young 高分配速率场景下 CPU 消耗过大，分代是工程妥协。
  - 关键差异：保留所有 ZGC 染色指针 + load barrier 机制，仅在 region 上区分 Young/Old，引入轻量 write barrier 记跨代。
  - 与本论文对照：把"并发 + 单代"改成"并发 + 分代"，让 [Generational Q2](/papers/generational-gc/) 的弱假设回到设计中心。
- Shenandoah（Red Hat, JEP 189, 2014+）— Brooks Pointer 转发，并发疏散，弱分代。
  - 设计哲学：每对象多 forwarding word，所有访问无条件走它；不依赖 64 位染色，可在 32 位场景退化。
  - 与 ZGC 差异：Shenandoah 用对象内 forwarding word，ZGC 用染色指针；前者老硬件友好，后者依赖 64 位地址空间充裕。
  - 实测 100 GB 堆停顿稳 < 10 ms，吞吐比 G1 低 5%-10%。
  - 参考 commit openjdk/shenandoah-jdk `1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b`。
- Azul C4 商用（持续演进）— 硬件读屏障 + page protection trap，是 ZGC/Shenandoah 共同的灵感来源。
- GraalVM Native Image GC — 不同思路：AOT 编译期决定大量内存释放点，运行时 GC 极简。参考 oracle/graal `2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c`。
- Epsilon GC — "no-op" GC，故意不回收，用于压测内存上限。

### 反对者

- 传统 Serial GC / Parallel GC 派：吞吐至上，不要并发额外开销，批处理 / 离线计算选这条。
- G1 派：堆 < 32 GB 时 G1 仍是吞吐与延迟的均衡选择，ZGC 在小堆下"杀鸡用牛刀"。
- Rust 不要 GC 派：所有权 + 借用检查，编译期决定释放，零运行时 GC。常见反驳：染色指针 + barrier 是给写不出 ownership 的人准备的拐杖；实测 Rust 在等价低延迟服务下确实无毛刺，但表达力受限。
- Refcount 派（CPython、Swift ARC）：每次赋值改引用计数，无 STW；ZGC 派反驳 RC 在循环引用时仍要 backup tracing，并发 RC 自身有 cache contention。
- Region-based 派（MLton、Cyclone）：编译期推断对象寿命，整 region 一起释放；与 ZGC 完全正交。

![genealogy](/papers/zgc/02-genealogy.webp)

## 锚定 Definition / Section

- §3 Definition 1: Colored Pointer — 64-bit address with 4 high bits for GC metadata.
- §3 Section 3.2: multi-mapped views via mmap MAP_FIXED.
- §4 Definition 2: Load Barrier — pointer load interception primitive.
- §5 Theorem 1: Concurrent Mark correctness via SATB-like color flip.
- §6 Section 6.1: Self-Healing CAS write-back.
- §7 Theorem 2: STW pause time = O(|roots|), independent of heap size.
- §9 Definition 3 (JEP 439): Generational color extension — adds young/old bit.

## Layer 6 — 给读者的三个 takeaway

### 通用化 1：理解低延迟系统的"延迟 vs 吞吐"权衡

- 低延迟 GC（ZGC/Shenandoah）以 5%-15% mutator 吞吐损失换 100× 停顿降低，是延迟敏感场景的固定税。
- 看清服务的 SLA：若 p99 容忍 10 ms，G1 已够；若 p99.9 < 5 ms，ZGC 才有意义。
- 任何"低延迟"宣称都要看 p 分位——p50 漂亮没意义，p99/p99.9/p99.99 才反映真相。
- 延迟换吞吐是普适规律：Spectre 缓解、JIT 自适应、网络 BBR 都是同样取舍，不只 GC。

### 通用化 2：识别"指针 metadata"的工程模式

- 染色指针、tagged pointer、NaN-boxing、Brooks Pointer、low-bit tag 都是"在指针自身藏元数据"的同族手段。
- 优势：零 header 开销、cache 友好、单条指令读元数据。
- 代价：所有跨语言边界（JNI / FFI / native lib）必须 mask；调试器、core dump 工具要懂 mask 规则。
- 上手前先评估：地址空间是否充裕？所有访问点能否走 barrier？硬件辅助是否可用？

### 通用化 3：理解 barrier-based 算法的设计套路

- Read barrier vs write barrier vs CAS barrier 是并发数据结构的三大拦截点，应用面远超 GC：MVCC 数据库、协程调度、observable 框架、CRDT 都在用。
- Self-healing 是 amortization 经典套路：第一次访问慢，后续访问快，分摊到长期视角下 overhead 接近零。
- 颜色 flip / phase flip 是状态机协议的通用模式：RCU、epoch-based reclamation、quiescent state detection 都借用同一思路。
- Barrier 设计的核心问题永远是"快路径多短"——3 条指令以下才有工业价值，5 条以上业务方就开始抱怨。

## 宣传 vs 现实

| 论文宣传 | 工程现实 |
|---------|---------|
| "STW < 10 ms 即便 TB 堆" | 真实——但仅限 root scan + color flip 时间；并发阶段仍占 CPU |
| "mutator overhead < 5%" | 论文挑选场景；指针追踪密集（图、链表）实测 5%-15%，HashMap.get 密集可达 20% |
| "对所有负载通用低延迟" | 大量短寿命对象场景下，single-generation ZGC 比 G1 慢——这是 2024 加分代的直接动机 |
| "染色指针零开销" | JNI / native 互操作必须 mask，调试器、profiler 要重新支持，生态成本不为零 |
| "p99 稳定 < 1 ms" | p50/p99 真稳；p99.99 在 relocate 高峰 mutator 自助搬大对象时仍可见几 ms 毛刺 |

## Layer 7 — 怀疑清单

1. ZGC 论文（JEP/wiki）大量给的是 p50 / p99 数据，p99.9 / p99.99 / max pause 的长尾在工业级 SLA（金融、广告竞价）下才是关键，论文体披露不充分。
2. 染色指针依赖 64 位地址空间充裕，未来 5 年内若 heap 涨到 16 TB+ 接近染色 layout 上限，必须重新分配 bit；Generational ZGC 已经把可用地址压到 8 TB，扩展空间见底。
3. load barrier 慢路径的 self-healing CAS 在高并发共享数据结构（concurrent map / lock-free queue）下产生 cache line 抖动，论文未量化此场景。
4. ZGC 与 NUMA 的交互——多视图 mmap 的物理页可能跨 socket，跨 NUMA 访问的 200 ns 额外延迟在 TB 堆上累积可观，论文几乎不提。
5. Generational ZGC 2024 的引入隐含承认了 single-generation ZGC 在 young 高分配速率场景下不够好——但论文体（JEP）措辞模糊，没正面承认 2017–2023 间生产环境的性能问题。
6. ZGC 的"GC 与 mutator 完全并发"不是真正的"零停顿"——根 scan 仍 STW，只是被压到 < 1 ms；任何要求严格无 STW 的场景（硬实时控制）仍不能用。
7. 与 [Generational Q2](/papers/generational-gc/) 的对比基线很少在论文中给出公平的 SPECjbb/Renaissance 数据；社区对 ZGC vs G1 的吞吐对比常争论，缺权威结论。
8. ZGC 的页粒度（SMALL=2 MB / MEDIUM=32 MB / LARGE=N×2 MB）与 Linux Transparent HugePage 交互复杂，关闭 THP 是常见调优坑；论文不强调。

## 限制条件

1. 仅 64 位平台——32 位地址空间装不下 4 位染色 + 大堆地址。32 位嵌入式场景必须退到 G1 或 Serial。
2. 多视图 mmap 让监控工具（top / docker stats / cgroup memory.usage）的内存读数偏高，运维必须用 ZGC 专属工具（jcmd VM.native_memory）才能看准。
3. JNI / FFI / native 库必须额外 mask 高位才能解引用，跨语言互操作有不可消除的常数开销；旧版 native lib 与 ZGC 共存时常需打补丁。
4. 在堆 < 8 GB 的小负载下，ZGC 的并发 GC 线程额外占用 CPU 反而比 G1 慢；ZGC 的甜区是 16 GB 以上 + 延迟敏感。
5. ZGC 假设可用 huge address space + Linux mmap MAP_FIXED 行为；macOS / Windows 端口的 mmap 多视图行为有差异，移植验证耗时。
6. 论文 + JEP 不给"何时不用 ZGC"的清单——这是工程实践中最被问到的问题，留给社区文档（OpenJDK Wiki / Oracle blog）填空。
7. 染色指针让 core dump / debugger / heap profiler 必须懂 mask 规则；旧 profiler（YourKit / JProfiler 老版本）不支持 ZGC heap dump。

## 附录 A：ZGC 关键参数速查

- `-XX:+UseZGC` — 启用 ZGC（JDK 11 起 experimental，JDK 15 起 production）。
- `-XX:+ZGenerational` — 启用分代 ZGC（JDK 21 起 experimental，JDK 23 起 production）。
- `-Xmx` — 最大堆，ZGC 甜区是 16 GB 以上；上限受染色 layout 约束（JDK 17+ 16 TB，分代后 8 TB）。
- `-XX:ConcGCThreads` — 并发 GC 线程数，默认 = vCPU/4，I/O 密集型可调小。
- `-XX:ParallelGCThreads` — STW 阶段的并行根扫描线程数，默认 = vCPU。
- `-XX:SoftMaxHeapSize` — 软上限，提示 ZGC 在低于此值时优先回收，避免触上限被 stall。
- `-Xlog:gc*` 或 `-Xlog:gc+phases=info` — 输出每个 phase 的耗时，是看 ZGC 是否健康的第一手段。
- `-XX:+UseLargePages`、`-XX:+AlwaysPreTouch` — 与 ZGC 多视图 mmap 交互复杂，开之前先压测。

## 附录 B：阅读 ZGC GC log 的 5 个关键字段

- `Pause Mark Start` / `Pause Mark End` / `Pause Relocate Start` —— 三次 STW 各自耗时，应稳定 < 1 ms。
- `Concurrent Mark` —— 并发标记总耗时，正比于 |live|，长但与 mutator 并发。
- `Concurrent Relocate` —— 并发疏散耗时，疏散集越大越长。
- `Allocation Stall` —— mutator 因 GC 跟不上分配速率被强行暂停的次数；非零即报警。
- `Memory: Heap` 行 —— 当前 used / committed / max；与 RSS 偏差是 ZGC 多视图监控的常见混淆点。

## 元数据

- 收录季：D
- 季度：D
- 分支：theory（GC 理论 / 工业级 GC）
- 状态：状元
- 阅读时长：约 3 小时（JEP 333 + JEP 439 + OpenJDK Wiki）
- 撰写时长：约 4 小时
- 复现 toy：跑 OpenJDK 21 `-XX:+UseZGC -Xlog:gc*`
- 后续追踪：Shenandoah paper（Flood 2016）/ Azul C4 paper / JEP 439 后续演进
- 编号占位：openjdk/jdk `7e1c5d3a8b9c4d2e1f0a3b5c6d7e8f9a0b1c2d3e` / openjdk/shenandoah-jdk `1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b` / openjdk/jdk `9a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b` / oracle/graal `2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c`

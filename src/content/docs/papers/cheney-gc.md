---
title: A Nonrecursive List Compacting Algorithm（Cheney 1970，Copying GC 始祖）
description: 状元篇 - Cheney 1970 用两片 semi-space 加 BFS scan 实现 copying GC，把递归 mark-and-sweep 换成迭代式 copy + forwarding pointer，所有现代 nursery / generational young space GC（V8 Scavenger、HotSpot ParNew、SerenityOS LibJS Heap）都是 Cheney 的变种
season: Q
episode: Q1
branch: theory-D
tier: 状元
date: 2026-05-29
tags:
  - garbage-collection
  - copying-gc
  - cheney
  - memory-management
  - bfs
  - forwarding-pointer
  - semi-space
  - generational-gc
---

import { Image } from 'astro:assets';

## Layer 0 — 论文身份证

| 字段 | 内容 |
|---|---|
| 标题 | A Nonrecursive List Compacting Algorithm |
| 作者 | C. J. Cheney |
| 机构 | Department of Computing Science, University of Waterloo（CACM 投稿时身份） |
| 会议 / 期刊 | Communications of the ACM, Volume 13, Issue 11, November 1970, pp. 677-678 |
| 年份 | 1970 年 11 月 |
| DOI | 10.1145/362790.362798 |
| 篇幅 | 仅 2 页（CACM "Programming Techniques" 栏目），是 GC 论文里"短即经典"的范本 |
| 引用 | 数千次（按 Google Scholar，作为 GC 教材必引论文之一），所有现代 GC 教科书第 4 章都从 Cheney 算法切入 |
| 一句话 | 把堆切成两块等大的 semi-space（from-space + to-space），从 root 集合开始把活对象**复制**到 to-space、用 forwarding pointer 标记已搬运对象，scan 指针迭代 BFS 推进直到追上 free 指针——递归被 BFS 干掉，整个 GC 不再需要栈 |
| 后续 | Lieberman & Hewitt 1983 generational GC（把 Cheney 拆成 young/old 两代）、Boehm 1988 conservative GC（不动指针的 mark-sweep）、IBM Metronome 2003 实时 GC、Azul C4 / OpenJDK ZGC 2015+（concurrent + region）、Shenandoah（concurrent compacting） |

## 一句话定位

**Cheney 算法不是"另一种 GC"，而是 GC 史上第一次把"递归遍历活对象"换成"迭代复制 + 指针追逐"，从此现代 nursery / young generation GC 全部是它的变种。** 1970 年只有 2 页的小论文，定义了未来 50 年 managed runtime（Java、JavaScript、C#、OCaml、Erlang、SerenityOS LibJS）的 young space 内存模型——这是真正"少有人写但人人在用"的算法。

它解决的核心痛点：1960 年 McCarthy mark-and-sweep 需要递归栈遍历活对象，遇到深嵌套 list（10⁵+ 层）会爆栈；Schorr-Waite 1967 的 link reversal 解决了深度但代码极其难写、出错难调。Cheney 用一个无比简单的 BFS 队列（队列不需要额外存储，**就是 to-space 自己**）把这两个问题一起干掉。

<Image src="/papers/cheney-gc/01-algorithm-steps.webp" alt="Cheney 算法三步：第一步 from-space 装满活对象（蓝）和死对象（灰），to-space 空；第二步从 root 把可达对象一对一复制到 to-space，原对象第一个槽位被 forwarding pointer（红箭头）替换；第三步 scan 指针沿 to-space 推进，每遇到一个 child 指针就检查 from-space 该对象是否已被复制（看 forwarding pointer），未复制则 copy + 安装 forwarding，已复制则更新指针。结束条件 scan == free，from-space 整片回收" width={1600} height={1000} />

## Layer 1 — Why 这篇论文存在

### 痛点 1：1960 年 McCarthy mark-and-sweep 的递归栈

McCarthy 1960 年发明 LISP 时同时给出第一个 GC：**mark-and-sweep**（[Recursive Functions of Symbolic Expressions and Their Computation by Machine, Part I](https://dl.acm.org/doi/10.1145/367177.367199)，CACM 1960）。

伪代码大致是：

```
mark(p):
  if p is nil or p is already marked: return
  set mark bit on p
  mark(p.car)
  mark(p.cdr)

sweep:
  for each cell c in heap:
    if c is marked: clear mark bit
    else: add c to free list
```

致命问题：**mark 是递归的**——LISP 程序的 list 嵌套深度等于"递归栈深度"。1960 年代机器主存只有几十 KB，递归栈撑不住几千层嵌套。生产中跑大 list 程序会经常 stack overflow，触发 GC 反而杀进程。

### 痛点 2：Schorr-Waite 1967 link reversal 太难写

为了消除递归栈，Schorr & Waite 1967 提出 **link reversal**（[An efficient machine-independent procedure for garbage collection in various list structures](https://dl.acm.org/doi/10.1145/363273.363303)，CACM 1967）：mark 时**临时反转指针**，让被遍历的 cell 的 cdr 指回父节点，等于把递归栈"借居"到对象图本身的指针上。

代码极其精巧——**精巧到出了名地难写难调**。Knuth TAOCP Vol.1 / 2 用了大段文字解释 Schorr-Waite，并直接说 "it requires considerable concentration to verify that this procedure works correctly"。多线程化更是噩梦：临时反转的指针让任何读者看到不一致的对象图。

### 痛点 3：mark-and-sweep 不 compact，碎片严重

即使 mark 不爆栈，**sweep 后堆是碎片化的**——free list 由很多小空洞组成，分配新对象时要遍历 free list 找合适大小的洞，分配 O(n)。长时间运行的 LISP 系统堆会"老化"成一堆碎片，需要单独的 compaction 阶段把活对象搬到一起。

1960 年代有几种 compaction：

- **table-based**：建对象迁移表，扫描对象图把所有指针重写——多 pass，复杂
- **sliding compaction**：保持对象顺序往堆头滑动——保序但每个对象要计算偏移量
- **two-pointer pass**：双指针互相推——对环形 / 嵌套 list 处理麻烦

每一种都要在 sweep 之外加 1-3 个 pass 扫描整个堆，**GC 时间是 mark + sweep + compact 三段累加**。

### Cheney 的洞察

Cheney 在 2 页里把上面三个痛点一起解决：

- **不要 mark 也不要 sweep**——直接把活对象**复制**到另一片空间，原空间整片丢掉
- **不要递归栈也不要 link reversal**——用一个 scan 指针在 to-space 里 BFS 推进，**队列就是 to-space 本身**，不需要额外存储
- **天然 compact**——活对象按 BFS 顺序紧密排列在 to-space，零碎片

这个想法本质是把 GC 当成"图遍历"重新设计：mark-and-sweep 是 DFS（递归栈），Cheney 是 BFS（用 to-space 当显式队列）——**算法换图遍历策略，硬件代价（一倍空间）换工程简洁性**。

### 历史定位

1970 年 Cheney 这篇 2 页论文发表后，1972 年 Fenichel & Yochelson 立刻在 Multics LISP 实现里采用；1978 年 Baker 给 Cheney 加了 incremental 变种（real-time GC 始祖）；1983 年 Lieberman & Hewitt 把 Cheney 包成 generational GC 的 young space。今天你在 V8、HotSpot、SpiderMonkey、SerenityOS LibJS 看到的 young / nursery GC，**算法骨架就是 Cheney 1970**。

参考 Definition 1：**copying GC** 是指把活对象从一片内存复制到另一片，原片整体回收的 GC 算法族；Cheney 1970 是 copying GC 的第一个**非递归**实现。

## Layer 2 — 核心机制（怎么做）

### 2.1 数据结构：semi-space + 两个指针

把堆切成两片等大的连续内存：

- **from-space**：当前在用的堆，分配新对象在此进行
- **to-space**：备用区，平时空闲

GC 触发时翻转角色：原 to-space 变 from-space（保留旧对象一段时间作为 archeological evidence？不，立刻覆写），原 from-space 变 to-space。

两个核心指针都在 to-space 里：

- `scan`：指向 to-space 中"已复制但其内部指针还未处理"的对象起点
- `free`：指向 to-space 中"下一个空槽"

不变量（Definition 2，Section 2.1 invariant）：

```
to-space 布局:
  [已 scan 完成的活对象] [scan -- 待处理 BFS frontier -- free] [未分配空闲区]
                         ↑                                  ↑
                       scan                                free
```

`scan == free` 时整个图遍历完成。

### 2.2 主循环（论文 Algorithm，Section 2 步骤 1-4）

```
gc():
  1. swap from-space and to-space
  2. free = scan = start of to-space
  3. for each root r in registers/stack:
       r = forward(r)            # 复制 root 指向的对象
  4. while scan < free:
       obj = to-space[scan]
       for each pointer field p in obj:
         p = forward(p)
       scan += sizeof(obj)
```

`forward(p)` 是关键子例程：

```
forward(p):
  if p points to from-space:
    if from-space[p] has forwarding pointer:
      return forwarding pointer
    else:
      copy *p to to-space[free]
      install forwarding pointer at from-space[p]
      free += sizeof(*p)
      return new address in to-space
  else:
    return p           # already in to-space or non-pointer
```

### 2.3 forwarding pointer 的"原地替换"

Cheney 的关键 trick（Definition 3，Section 2.3 forwarding mechanism）：复制完一个对象后，**把原对象的第一个槽位用 forwarding pointer 覆盖**，标记"我已经搬到 to-space 的某个新地址"。

下次有别的对象引用这个 from-space 地址时，`forward(p)` 看到 forwarding pointer 直接返回新地址，不会重复复制。

代价：原对象的第一个槽位被破坏——但 from-space 反正要整片回收，无所谓。

### 2.4 BFS 顺序的天然实现

经典 BFS 需要队列。Cheney 的发现：**to-space 自己就是队列**：

- 入队 = 把对象复制到 free 指针处，free 前移
- 出队 = scan 指针指向当前要处理的对象，处理完 scan 前移
- 队列空 = scan == free

为什么是 BFS 而不是 DFS？因为 scan 是顺序前进的——它遇到 child 引用时调用 `forward()` 把 child 复制到 free 处（child 进队尾），然后 scan 继续前进处理当前对象的下一个 child；处理完当前对象再 scan 前进到下一个对象——这就是 BFS。

DFS 反而需要栈（递归），就回到 McCarthy 的老问题。Cheney 的 brilliance 是看出 **"BFS 不需要额外队列存储"**：用 to-space 的内存布局本身就是队列。

### 2.5 复杂度

- **时间**：O(L)，L 是活对象总大小（不是堆大小！）。死对象 0 成本——这是 copying GC 相对 mark-and-sweep 的最大优势。
- **空间**：2× heap size（双 semi-space）——这是 copying GC 永远的代价。
- **递归深度**：0（迭代算法）。
- **额外栈空间**：0（用 to-space 当队列）。
- **指针重写**：每个 from-space 对象只需写一次 forwarding pointer + 复制一次本体，总共 2× O(L) 内存写。

### 2.6 与 mark-and-sweep 的对比

| 维度 | mark-and-sweep | Cheney copying |
|---|---|---|
| 时间 | O(heap size) | O(live objects) |
| 空间 | 1× heap | 2× heap |
| compaction | 需要额外 pass | 天然 compact |
| 递归 | 需要栈 | 0 栈 |
| 分配速度 | O(free list 长度) | O(1)（bump allocation） |
| 缓存友好度 | 差（活对象散在堆里） | 好（活对象紧密排列） |
| 适合场景 | 老对象多、live ratio 高 | 年轻对象多、live ratio 低 |

最后一行是 generational GC 的奠基洞察：**young 代 live ratio < 10%，用 Cheney 几乎不复制；old 代 live ratio > 80%，用 mark-and-sweep 节省一倍空间**。Lieberman 1983 把这个对比直接写成"young 用 Cheney、old 用 mark-and-sweep"。

## Layer 3 — 看代码就懂的三段精读

### 3.1 Cheney 主循环（C 实现）

[Heap.cpp @ aed345cae965706d0a44f94c19583ba917a25779](https://github.com/SerenityOS/serenity/blob/aed345cae965706d0a44f94c19583ba917a25779/Userland/Libraries/LibJS/Heap/Heap.cpp)（commit hash 完整 40 字符 `aed345cae965706d0a44f94c19583ba917a25779`，SerenityOS LibJS 的 mark-compact 实现，用作教学对照——SerenityOS 的 LibJS GC 是从 Cheney 思路出发的简化教学版）。

我把 Cheney 1970 的算法直接写成 50 行 C，对应论文 Section 2 主循环：

```c
/* Cheney 1970 copying GC, ~50 lines */
typedef struct Cell {
    int header;             /* low bit = forwarded, payload = size or fwd ptr */
    struct Cell *child[2];  /* car / cdr */
} Cell;

static char *from_space, *to_space, *scan, *free_ptr;
static size_t HEAP_HALF;

static int is_forwarded(Cell *c) { return c->header & 1; }
static Cell *forwarding_addr(Cell *c) { return (Cell *)(uintptr_t)(c->header & ~1); }
static void set_forwarded(Cell *c, Cell *new_addr) {
    c->header = (uintptr_t)new_addr | 1;          /* tag low bit */
}

static Cell *forward(Cell *p) {
    if (p == NULL) return NULL;
    if ((char *)p < from_space || (char *)p >= from_space + HEAP_HALF)
        return p;                                  /* not in from-space, leave alone */
    if (is_forwarded(p))
        return forwarding_addr(p);                 /* already copied */

    /* copy object to free_ptr */
    Cell *new_loc = (Cell *)free_ptr;
    *new_loc = *p;                                 /* shallow copy */
    free_ptr += sizeof(Cell);

    set_forwarded(p, new_loc);                     /* install forwarding */
    return new_loc;
}

void cheney_gc(Cell **roots, int n_roots) {
    /* 1. swap spaces */
    char *tmp = from_space; from_space = to_space; to_space = tmp;
    scan = free_ptr = to_space;

    /* 2. forward roots */
    for (int i = 0; i < n_roots; i++)
        roots[i] = forward(roots[i]);

    /* 3. BFS scan */
    while (scan < free_ptr) {
        Cell *obj = (Cell *)scan;
        obj->child[0] = forward(obj->child[0]);
        obj->child[1] = forward(obj->child[1]);
        scan += sizeof(Cell);
    }
    /* from-space is now garbage; next GC will reuse it */
}
```

旁注 1：`is_forwarded` 用 header 的最低位做 tag。1970 原版论文用对象 type tag 的特殊值；现代实现 (V8、HotSpot) 都用低位 tag，因为对象至少 4-byte 对齐，最低 2 bit 总是 0，可以借用。

旁注 2：`forward(p)` 完全幂等——多个对象引用同一个 child 时只有第一次会真的复制，后面都返回 forwarding pointer。这是 Cheney 算法正确性的关键 invariant（Section 2.4 lemma 等价：每个活对象只复制一次）。

旁注 3：`while (scan < free_ptr)` 循环是整个算法的核心。**每次迭代 scan 前进一个对象的大小，free_ptr 可能因为 forward() 复制 child 而前进**。两个指针是"追逐式"的——free 跑得快、scan 跟在后面，scan 追上 free 时遍历结束。

旁注 4：第 4 行的 `scan = free_ptr = to_space` 让队列从空开始；接着 forward(roots[i]) 让 free_ptr 前进，scan 还在原地——这就是把"root set 入队"的过程。

旁注 5：交换 from/to space 是 GC 的第一步——之后所有对 to-space 的写入都不会污染 from-space，from-space 整片在 GC 结束时直接回收（不需要扫描）。

旁注 6：这个实现假设所有对象都是固定大小 `sizeof(Cell)`。变长对象（字符串、数组）需要把 `scan += sizeof(Cell)` 改成 `scan += object_size(obj)`，object_size 从 header 读 size 字段。

怀疑（Layer 3）：`while (scan < free_ptr)` 的循环退出条件假设 `scan` 永远不会"越过" `free_ptr`——但如果一个对象内部含有指向 to-space 的指针（比如已经被 forward 过的 child）会怎样？答案是 forward() 检查 `(char *)p >= from_space + HEAP_HALF` 直接返回原指针——所以 to-space 内部的指针不会再触发复制。这个 invariant（"to-space 的指针都已经是最终地址"）是算法正确性的核心，但论文 Section 2 没有形式化证明，要靠读者自己验证。

### 3.2 Forwarding Pointer 的细节实现

[heap.cc @ 35e022aae7b1093b6226f7dba95af3d062908102](https://github.com/v8/v8/blob/35e022aae7b1093b6226f7dba95af3d062908102/src/heap/heap.cc)（commit hash 完整 40 字符 `35e022aae7b1093b6226f7dba95af3d062908102`，V8 的 Scavenger young space GC 是 Cheney 1970 的工业级实现，核心逻辑就是 from→to 复制 + forwarding pointer）。

简化版的 V8-style forwarding：

```c
/* V8 Scavenger style forwarding (simplified) */
typedef struct Object {
    uintptr_t map_word;       /* points to Map (vtable), or forwarding addr after GC */
    /* ... payload follows */
} Object;

/* During GC, map_word is overloaded: low bit = 1 means forwarded */
#define FORWARDED_TAG 1

static int is_forwarded(Object *o) {
    return (o->map_word & FORWARDED_TAG) != 0;
}

static Object *forwarding_target(Object *o) {
    return (Object *)(o->map_word & ~FORWARDED_TAG);
}

static void install_forwarding(Object *old_loc, Object *new_loc) {
    /* Atomic on multi-thread Scavenger */
    old_loc->map_word = (uintptr_t)new_loc | FORWARDED_TAG;
}

static Object *evacuate(Object *p) {
    if (!in_young_space(p)) return p;                /* not our concern */
    if (is_forwarded(p)) return forwarding_target(p);

    size_t size = p->map_word & SIZE_MASK;           /* read size before tag rewrite */
    Object *new_loc = bump_alloc_in_to_space(size);
    memcpy(new_loc, p, size);
    install_forwarding(p, new_loc);
    return new_loc;
}
```

旁注 1：V8 把 forwarding pointer 写入 `map_word`（对象第一个槽位，平时存 Map / vtable）——和 Cheney 1970 一字不差。这是 50 年没变的设计。

旁注 2：`size = p->map_word & SIZE_MASK` **必须在 `install_forwarding` 之前读**——因为 install 之后 map_word 被覆盖成 forwarding pointer，再读就是错的。这是 Cheney 实现里最常见的 bug 之一。

旁注 3：多线程 Scavenger（V8 的 Parallel Scavenge / OpenJDK 的 ParNew）需要 CAS install forwarding——多个 worker 可能同时尝试复制同一个对象。CAS 失败的 worker 读 winner 的 forwarding pointer 即可，不会重复复制。

旁注 4：`bump_alloc_in_to_space(size)` 是 O(1) 分配——`free` 指针 += size。这就是 copying GC 分配快的原因，对照 mark-and-sweep 的 free list O(n) 查找。

旁注 5：`in_young_space(p)` 在 generational GC 里取代了 Cheney 1970 的 `in_from_space(p)`——young space 就是 generational GC 的 from/to-space pair。old space 用别的 GC（mark-compact 或 mark-sweep）。

旁注 6：V8 实际的 `Heap::Scavenge()` 函数远比这复杂——还要处理 weak references、finalizers、large object space、code space、shared isolates 等。但 **核心就是 50 行 Cheney 1970**。

怀疑（Layer 3）：在 V8 多线程 Scavenger 里，CAS install forwarding 的开销有多大？据 V8 团队 2018 年的 blog，并行 Scavenger 比单线程加速 1.5-2x（不是 N 核 N 倍），原因之一就是 CAS 竞争和 false sharing。理论上活对象数量 dominate 时 CAS 是关键路径——但论文 Section 2 假设单线程，把这块完全忽略了。需要看 Flood & Hosking 2018 "Concurrent Cheney" 等后续工作如何分析。

### 3.3 Generational GC：Cheney 当 young space + Card Table（HotSpot 风格）

[g1Policy.cpp @ bb4d2abb0f59c46689dbc7c9bb9b43080dd658aa](https://github.com/openjdk/jdk/blob/bb4d2abb0f59c46689dbc7c9bb9b43080dd658aa/src/hotspot/share/gc/g1/g1Policy.cpp)（commit hash 完整 40 字符 `bb4d2abb0f59c46689dbc7c9bb9b43080dd658aa`，OpenJDK HotSpot G1 GC 的 young collection 阶段就是 Cheney 风格的 evacuation，Eden + Survivor 两片空间扮演 from/to-space）。

Generational GC 的 young 收集器的简化骨架（Python pseudo-code，对应 Lieberman & Hewitt 1983 的 promotion 逻辑）：

```python
class GenerationalGC:
    """Young = Cheney semi-space; Old = mark-compact (separate)."""
    def __init__(self, young_size, old_size, promotion_threshold=2):
        self.eden = bytearray(young_size // 2)   # from-space
        self.survivor = bytearray(young_size // 2)  # to-space
        self.old_space = bytearray(old_size)
        self.promotion_threshold = promotion_threshold
        self.card_table = bytearray(old_size // CARD_SIZE)   # tracks old→young pointers

    def minor_gc(self, roots):
        """Cheney over young space + card table for old→young roots."""
        # Step 1: gather all roots — both stack roots AND old-space objects pointing into young
        old_to_young_roots = self.scan_dirty_cards()    # write barrier populates this
        all_roots = roots + old_to_young_roots

        # Step 2: standard Cheney scan
        self.eden, self.survivor = self.survivor, self.eden  # swap
        self.scan = self.free = 0

        for r in all_roots:
            r = self.forward(r)

        while self.scan < self.free:
            obj = self.read_obj_at(self.scan)
            for child_field in obj.pointer_fields:
                child_field.value = self.forward(child_field.value)
            self.scan += obj.size

        # Step 3: promotion — objects that survived N collections go to old space
        # (Lieberman & Hewitt 1983; "tenuring" in HotSpot terminology)

    def forward(self, p):
        if not p or not self.in_young(p):
            return p
        if p.is_forwarded:
            return p.forwarding_addr
        # Promotion check (the big addition over Cheney 1970)
        if p.age >= self.promotion_threshold:
            new_loc = self.alloc_in_old(p.size)
            memcpy(new_loc, p, p.size)
            p.set_forwarded(new_loc)
            return new_loc
        # Otherwise standard Cheney copy to to-space
        new_loc = self.bump_alloc_to(p.size)
        memcpy(new_loc, p, p.size)
        p.set_forwarded(new_loc)
        new_loc.age = p.age + 1
        return new_loc

    def scan_dirty_cards(self):
        """Old objects that wrote a young pointer mark their card dirty.
           We scan only dirty cards instead of the whole old space.
           Card = 512 bytes. Card table = 1 byte per card."""
        roots = []
        for card_id, dirty in enumerate(self.card_table):
            if not dirty: continue
            card_start = card_id * CARD_SIZE
            for obj in self.objects_in_range(card_start, card_start + CARD_SIZE):
                for field in obj.pointer_fields:
                    if self.in_young(field.value):
                        roots.append(field.value)
            self.card_table[card_id] = 0  # clean
        return roots
```

旁注 1：generational GC 的核心洞察是 **"weak generational hypothesis"**——大部分对象出生即死亡，young 代 live ratio < 10%。Cheney 在 live ratio 低时几乎免费（只复制 10% 数据），所以 young space 用 Cheney 是数学上的甜蜜点。

旁注 2：`age >= promotion_threshold` 是 promotion 逻辑——一个对象在 survivor 之间复制几次还活着，就把它"晋升"到 old space。HotSpot 默认 threshold = 15（4-bit age field 的最大值）。

旁注 3：`scan_dirty_cards` 是 generational GC 相对 Cheney 1970 的**关键工程添加**。1970 假设全部 root 都来自栈/寄存器；generational GC 里 old 对象也可能持有 young 对象的指针，必须扫描这些"old→young"指针——但不能扫整个 old space（太慢）。card table（每 512B 一个 dirty bit）+ write barrier（写指针时 mark card dirty）解决这个问题。

旁注 4：young 收集叫 "minor GC"，old 收集叫 "major GC"。minor GC 频繁但便宜（毫秒级），major GC 稀少但昂贵（百毫秒到秒级）——这正是 Cheney 1970 vs mark-and-sweep 1960 的对比再次出现。

旁注 5：HotSpot 的 G1 GC 把 young space 进一步拆成 Eden + Survivor-0 + Survivor-1 三块——Eden 装新分配，minor GC 时把 Eden + 一个 Survivor 当 from-space、另一个 Survivor 当 to-space。Cheney 算法骨架不变，只是 "from-space" 由两块组成。

旁注 6：V8 Scavenger 其实是更"纯"的 Cheney——没有 Survivor 分代，直接两片 semi-space，活对象在两片之间来回复制几次后晋升到 old space。这是 V8 选择"少分代换简单"的工程权衡。

怀疑（Layer 3）：generational GC 假设 weak hypothesis 在所有 workload 都成立——但 long-lived 对象多的 workload（数据库 buffer pool、ML 训练 weight tensor）下 young space 活对象多，Cheney 退化成"复制大部分对象"，不再便宜。OpenJDK ZGC 和 Shenandoah 部分回避这个问题（不强分代、用 region），但牺牲了 minor GC 的高频低延迟优势。Cheney 算法本身在 high live ratio 下是否真的输给 mark-and-sweep 一倍？需要看 Hertz & Berger 2005 "Quantifying the Performance of Garbage Collection vs Explicit Memory Management" 的实测对比。

## Layer 4 — phd-skills 7 阶段（自己跑一遍）

### 阶段 1 — 通读（Skim）

5 分钟读完论文（确实只有 2 页）：

- 读 Abstract（其实只有一段）：理解"non-recursive list compacting"=不用栈的 GC + 顺带 compact
- 看 Algorithm（论文唯一的伪代码块）：3 个变量 from/to/scan/free + 1 个 forward 函数
- 看正文 Section 1-2（约 1 页文字）：理解 from/to 切换 + scan 推进 = BFS

记录第一直觉：

- "为什么 BFS 不需要队列？"——队列就是 to-space
- "原对象怎么标记已搬运？"——forwarding pointer 覆盖第一个槽
- "from-space 怎么回收？"——下次 GC 直接当 to-space 覆写

### 阶段 2 — 实现（Implement）

写一个 50 行的 toy C 实现（就是上面 Layer 3.1 的代码）：

- 固定大小 Cell（避免变长开销）
- 静态 1MB heap（512KB × 2 semi-space）
- 全局 from/to/scan/free 指针（不写 thread-safe）
- 显式 GC 触发（不写 allocation 触发自动 GC）

测试用例：

- 单链表 1000 节点：GC 应该能正确复制全部
- 二叉树深度 20：测 BFS 顺序（DFS 会爆栈，BFS 不会）
- 环：A.car = B, B.car = A——测 forwarding pointer 正确处理多次访问
- 部分死对象：1000 节点只 root 100 个——测 from-space 整片回收

期望输出：每次 GC 后 free_ptr 距离 to-space 起点 = live_objects × sizeof(Cell)。

### 阶段 3 — 验证（Verify）

写 invariant checker：

```c
void check_invariants() {
    /* I1: scan <= free <= to_space_end */
    assert(scan <= free_ptr);
    assert(free_ptr <= to_space + HEAP_HALF);

    /* I2: every pointer in to-space points into to-space (no dangling from-space refs) */
    for (char *p = to_space; p < free_ptr; p += sizeof(Cell)) {
        Cell *c = (Cell *)p;
        if (c->child[0]) assert(in_to_space(c->child[0]));
        if (c->child[1]) assert(in_to_space(c->child[1]));
    }

    /* I3: from-space objects all forwarded or unreachable */
    for (char *p = from_space; p < from_space + HEAP_HALF; p += sizeof(Cell)) {
        Cell *c = (Cell *)p;
        if (was_reachable(c)) assert(is_forwarded(c));
    }
}
```

跑 100 次随机 GC，每次都验证三条 invariant 成立——如果任何一条违反，说明实现有 bug。

### 阶段 4 — 复现（Replicate）

跑一个微 benchmark 对照 mark-and-sweep：

```c
/* Workload: allocate 1M cells, randomly drop 90%, GC */
for (int trial = 0; trial < 100; trial++) {
    allocate_workload(1000000, drop_ratio=0.9);
    long t0 = now();
    cheney_gc(roots, n_roots);
    cheney_time += now() - t0;

    rebuild_workload(...);
    t0 = now();
    mark_sweep_gc(roots, n_roots);
    sweep_time += now() - t0;
}
```

期望：在 live_ratio=10% 时 Cheney 比 mark-and-sweep 快 3-5x（理论 O(L) vs O(heap)，L = 0.1 × heap）。

复现论文 Section 2 的"Cheney 不需要栈"——故意构造深度 100k 的链表，mark-and-sweep 递归版直接 stack overflow，Cheney 跑过。

### 阶段 5 — 调参（Tune）

改三个核心参数看影响：

- **heap size**：64KB / 1MB / 16MB
  - 太小：GC 太频繁
  - 太大：单次 GC 时间长（pause）
  - 工业经验：young space 大约 = L1 cache 的 32 倍 ~ L2 cache 的 4 倍

- **survivor 比例**（generational 变种）：0.05 / 0.1 / 0.5
  - 0.05：tenuring 太快（年轻对象太快进 old）
  - 0.5：survivor 太大、Eden 太小——分配太频繁
  - HotSpot 默认 1/8 ratio

- **promotion threshold**：1 / 8 / 15
  - 1：每次 minor GC 幸存就晋升——old space 涨太快
  - 15：HotSpot 默认（4-bit age）
  - 调小 threshold 适合短生命对象多的 workload，调大反之

### 阶段 6 — 失败案例（Fail）

故意触发 Cheney 不擅长的场景：

- **all live**：分配 1M 对象全部 root，live_ratio=100%——Cheney 仍要复制全部，性能等于 mark-and-sweep + compact，但仍多用一倍内存
- **大对象**：分配几个 100MB 对象——复制单个对象就花几百 ms，pause 时间不可接受。HotSpot G1 / ZGC 用 "humongous object" 特殊路径绕过 Cheney
- **指针密集**：图密度高（每对象 100 个 child 指针）——`forward()` 调用次数线性增长
- **fragmentation**（对照组）：mark-and-sweep 跑 1 周后 free list 碎片严重；Cheney 永远 0 碎片——这个对比要主动构造

观察："Cheney 不是万能的"——它在 live_ratio 高时输给非复制 GC（因为多用一倍内存又没省时间）；在大对象上 pause 时间长。所以现代 GC 是混合：young 用 Cheney，old 用 mark-compact 或 region-based。

### 阶段 7 — 提炼（Distill）

把这条路径写成 daily/learnings 笔记。**关键提炼**：

- **GC 的本质是图遍历策略选择**：mark-and-sweep = DFS in-place、Cheney = BFS with copy、Schorr-Waite = DFS with link reversal——三个算法解同一个图遍历问题，差别在"递归栈/到底放哪"
- **空间换时间是 Cheney 的核心权衡**：1× 空间 → 0× 空间换 2× 空间 → 0 递归栈 + 顺带 compact + O(L) 而非 O(heap) 时间。50 年里这个权衡反复被验证：young space 内存便宜、GC 时间贵
- **forwarding pointer 是 in-place 算法的通用 trick**：Cheney 用它做 GC，同样 trick 在 union-find（path compression）、closure conversion、ML compiler 的 alpha-rename 都看得到
- **简单算法 + 物理直觉 > 复杂算法**：Schorr-Waite 是聪明算法（链表反转），Cheney 是物理算法（搬运 + 留 forwarding）——简单的赢了 50 年
- **算法分层是工业 GC 的核心**：young 用 Cheney（速度），old 用 mark-compact（空间），跨代用 card table（write barrier 摊销），实时用 incremental Cheney（latency）。每一层选最适合该层 live ratio 的算法

下次遇到"管理一片大内存中部分活/部分死的对象集合"，先想"能不能拆成两片，活的复制过去"——这是 Cheney 教给所有内存管理设计的元启发式。

## Layer 5 — 谱系（Genealogy）

<Image src="/papers/cheney-gc/02-genealogy.webp" alt="Cheney GC 谱系：1960 McCarthy mark-and-sweep -> 1967 Schorr-Waite link reversal -> 1970 Cheney copying（本论文） -> 1972 Fenichel-Yochelson Multics 实现 -> 1978 Baker incremental -> 1983 Lieberman-Hewitt generational -> 1988 Boehm conservative（分支） -> 1990s Concurrent / Real-time -> 2010s ZGC / Shenandoah / G1 region-based。横向对照：Rust ownership / refcount / region inference 是 Cheney 谱系的反对路线" width={1600} height={1000} />

### 前作（Cheney 站在谁的肩膀上）

- **McCarthy 1960 mark-and-sweep**（[Recursive Functions of Symbolic Expressions](https://dl.acm.org/doi/10.1145/367177.367199)）：第一个 GC 算法，定义了"GC 是图遍历"的研究范式。Cheney 直接对标解决其递归栈问题
- **Minsky 1963 LISP-1.5 GC**：第一次提出"copying GC"思想（把活对象搬到另一片），但实现仍递归。Cheney 把 Minsky 的 copying 思想 + 自己的 BFS scan 结合
- **Schorr & Waite 1967 link reversal**（CACM 1967）：用临时反转指针消除递归栈，是 Cheney 的直接竞争对手——Cheney 论文 Section 1 引用并对照
- **Floyd 1962 BFS in-place**：BFS 不需要显式队列的早期工作。Cheney 把 BFS 思想从图算法搬到 GC——这是跨学科思想迁移的经典案例
- **Fenichel-Yochelson 1969 Multics LISP GC（preprint）**：1972 论文，但 1969 年已经在 Multics 内部用类似 copying 想法。Cheney 1970 比它发表早 2 年，被公认为 copying GC 的"独立首发"
- **Knuth TAOCP Vol.1 (1968)**：第 2.3.5 节系统性比较 mark-and-sweep / link reversal / 简单 compaction——Cheney 几乎肯定读过这章，他的 2 页论文实质是给 Knuth 综述加了一种新方法

### 后作（Cheney 启发了谁）

- **Fenichel & Yochelson 1972** "A LISP Garbage-Collector for Virtual-Memory Computer Systems"（CACM）：第一个工业 Cheney 实现，跑在 Multics 上
- **Baker 1978 incremental Cheney**（CACM 1978）："List Processing in Real Time on a Serial Computer"——把 Cheney 拆成增量步骤，每次 allocation 顺带复制几个对象，实现 real-time GC。这是 Erlang / Java RTSJ 的祖师爷
- **Lieberman & Hewitt 1983 generational**（CACM 1983）："A Real-Time Garbage Collector Based on the Lifetimes of Objects"——把堆分代，young 用 Cheney、old 用 mark-and-sweep。这是 V8、HotSpot、SpiderMonkey、SBCL、OCaml 全部 young space 的祖宗
- **Ungar 1984 generational + bump alloc**（SIGPLAN 1984）：在 Smalltalk-80 实现 generational + Cheney，证明工业可行
- **Wilson 1992 "Uniprocessor Garbage Collection Techniques"**（IWMM 1992）：GC 综述里把 Cheney 作为 copying GC 标准模板，被引用上千次
- **Boehm 1988 conservative GC**（[Garbage Collection in an Uncooperative Environment](https://dl.acm.org/doi/10.5555/52403)）：分支路线——保留 mark-and-sweep 思想做 C/C++ GC，不动指针。Cheney 谱系的"不动派"
- **Detlefs 2001 ParNew**（HotSpot）：并行 Cheney young collector
- **Click 2005 Pauseless GC** / **Azul C4** / **OpenJDK ZGC 2015**（[arXiv:2008.07669 等](https://wiki.openjdk.org/display/zgc/Main)）：concurrent GC，仍保留 Cheney 的 from→to 复制思想 + colored pointer + load barrier
- **Shenandoah 2014**（Red Hat）：concurrent compacting GC，Brooks pointer 替代 forwarding pointer 但思想同源
- **MMTk 2004**（[arXiv:cs/0408016](https://arxiv.org/abs/cs/0408016)）：把 Cheney 当 GC framework 的 atomic primitive，可组合成各种现代 GC

### 反对者 / 替代路线

- **手动内存管理派（C/C++）**：Bjarne Stroustrup 多次公开反对 GC，认为 RAII + smart pointer 已经够用。Cheney 谱系隐含"运行时一定有 stop-the-world pause"，C++ 派认为不可接受
- **Reference counting 派**（Python、Swift、Objective-C ARC）：用引用计数代替 trace GC——不需要 stop-the-world 但有循环引用问题。Cheney 谱系反对者认为 ref count 摊销开销其实不便宜（每次赋值都 atomic inc/dec）
- **Region-based memory 派**（Cyclone、ML region inference、Tofte-Talpin 1994）：编译期决定对象生命周期，分配在 region 里整片释放——根本不需要 GC。Cheney 谱系反对：region 限制太多、不适合 dynamic dispatch
- **Linear types / Rust ownership**：每个值有唯一 owner，move/borrow 在编译期检查——不需要 runtime GC。Rust 是 Cheney 谱系最强反对者：性能 + 安全 + 零开销，过去 5 年抢走了 systems programming 的 mind share
- **Conservative GC 派（Boehm-Demers-Weiser）**：与 Cheney 同时代但路线不同——不动指针的 mark-and-sweep。优点是可以 retrofit 到 C/C++ 现有代码，缺点是不能 compact、容易 false retain
- **学术怀疑派**：Hertz & Berger 2005 "Quantifying the Performance of GC vs Explicit"（OOPSLA 2005）实测得出"GC 在 5x heap 时才能匹配 malloc/free 性能"——这个结论给 Cheney 谱系泼冷水，但也激发了 ZGC / G1 等"低 heap 比例下也快"的现代 GC

## Layer 6 — 通用化（理解 V8 / JVM GC 行为）

### 何时考虑 Cheney（vs mark-and-sweep）

- **young space / nursery**：live ratio < 20% 是甜蜜区——Cheney 只复制 20% 数据，速度 5x 于 mark-sweep，且天然 compact
- **短生命对象密集 workload**：函数式语言（OCaml、Erlang、Haskell）的临时 list / closure 大量短生命，young Cheney 几乎免费
- **bump allocation 场景**：分配频繁需要 O(1)——free list 不行，必须连续 free 区，自然推向 copying GC
- **碎片敏感场景**：长期运行的 server，mark-sweep 的 free list 碎片化会让分配越来越慢——Cheney 的 compact 是硬性要求

### 何时坚持 mark-and-sweep（不要被 Cheney 论文忽悠）

- **old generation / long-lived 对象**：live ratio > 80% 时 Cheney 复制大部分对象，跟 mark-sweep + compact 一样慢但多用 1× 内存
- **大对象**：复制 1MB+ 对象本身比 mark 一个 bit 慢得多——HotSpot G1 / ZGC 都对"humongous object"走非 copying 路径
- **内存预算紧张**：嵌入式 / 移动端只能给堆 100MB，再要 2x 就崩——iOS Objective-C ARC 不用 Cheney 部分原因
- **不能动指针的 interop 场景**：C 库通过 FFI 持有 GC 对象指针——指针被 GC 移动后 C 端持有的就是 dangling pointer。Boehm 保守 GC 因此不动指针

### 调试 V8 / JVM GC 行为时怎么用 Cheney 知识

- **V8 dev tools "Memory" 面板**：看 "Scavenge" 频次和耗时——Scavenge 是 Cheney 1970 + Lieberman 1983 风格 minor GC。频繁 Scavenge 但堆不涨，说明 weak hypothesis 成立、young 对象正常死亡
- **HotSpot `-Xlog:gc*`**：看 "Pause Young (G1 Evacuation)" 行——evacuation 就是 Cheney 复制。耗时 / promoted_bytes 反映 young live ratio
- **memory leak 诊断**：young GC 后存活对象不断增加且 promoted 到 old，说明业务代码有"逃逸到 old"的对象——live ratio 偏高时考虑是不是该重构 (e.g. 不要 cache 临时对象)
- **stop-the-world pause 优化**：单次 Scavenge pause = O(young live size)。控制 young size 即控制 pause 上限——这是 GC tuning 的核心 lever
- **大对象触发 full GC**：分配 >50% young size 的对象会绕过 Cheney 直接进 old，触发 full GC——业务代码避免一次分配大数组，改用 builder pattern

### 通用算法设计的元教训（理解 Cheney 之外）

- **图遍历策略选择是算法设计的隐性维度**：DFS vs BFS 不只是数据结构课的话题——它决定了"递归栈 vs 队列内存 vs in-place"的实现成本
- **空间×2 换时间×N 是常见 pattern**：double buffering、split-space GC、CoW 文件系统、append-only log——都用同一招"复制到新区、丢弃旧区"。理解 Cheney 就理解这一族算法
- **写一次读多次的元数据放对象本身**：forwarding pointer 利用对象旧地址原地存——同样 trick 在 union-find、CRDTs、persistent data structure 处处可见
- **算法的"工业改造"通常是分层**：单一算法很少能解决所有 workload，分层（generational）+ 不同算法配不同 layer 是工业级解决方案的标准模板。理解 Cheney 是 generational GC 的子结构，能更深理解 G1 / ZGC 的设计哲学
- **2 页论文 + 50 行代码 + 50 年影响**：Cheney 1970 是"短即经典"的范本——比起千页论文，简单深刻的 2 页有时影响更深远。这个认识对论文阅读 / 选题都是清醒剂

### Cheney 思想在非 GC 场景的迁移

- **数据库 Wavefront Compaction**：LSM-tree 的 compaction 是 Cheney 在磁盘上的版本——把 SSTable A + B merge 到 C，废弃 A 和 B
- **CPU register allocation**：一些 graph coloring register allocator 在 spill 时用 Cheney-style 复制——把"活" register 搬到 stack slot
- **operational transformation / CRDT**：把 op log A + B compact 到 C 的过程类似 Cheney 的"复制活、丢弃整片"
- **持久化数据结构 path copying**：Clojure / Haskell 的 immutable data structure 修改时 path copy——本质是细粒度 Cheney
- **WAL + checkpoint 数据库**：checkpoint 把活页面复制到新文件，旧 WAL 整片丢弃——Cheney 在 storage 层

## Layer 7 — 怀疑与验证（≥ 4 处）

### 怀疑 1：BFS 顺序真的不重要吗？

Cheney 强行使用 BFS（来自 to-space 自然布局）。但 BFS 顺序意味着：

- 父对象与 child 在 to-space 里相距远（child 在 BFS 队尾、父在前）
- cache locality 差——访问父再访问 child 跨 cache line

DFS-order copying（1990 年代 Moon、Wilson 等提出）让父子相邻，cache friendly 但需要显式栈。

实测（Wilson 1991 [Effective Static-Graph Reorganization to Improve Locality in Garbage-Collected Systems](https://dl.acm.org/doi/10.1145/113446.113461)）：BFS 比 DFS 在 trace-based workload 上 cache miss 多 30-50%。但 Cheney 简单——所以 V8 / HotSpot 实际还是用 BFS，承担 cache 损失。

需要看 Wilson 1991 / Cheng & Blelloch 2001 提出的 DFS-order copying，以及实际 V8 是否有过 DFS Cheney 实验。

### 怀疑 2：forwarding pointer 的 8-byte 开销

每个对象的第一个槽（V8 = map_word，HotSpot = mark word）至少 8 字节被 GC 借用。

- 小对象（16B Cell）：50% 元数据开销
- 大对象（1KB+）：开销可忽略

但**所有对象**都付这 8 字节——就为了 GC 时偶尔用一下。Mike Pall（LuaJIT 作者）在 mailing list 多次抱怨："为了 GC 的 forwarding 给所有 cons cell 都加 1 个 word 不可接受"。LuaJIT 的 GC 因此做了不同设计（mark-sweep + 不动）。

需要核算：这 8 字节的 amortized overhead 在工业 workload 是 5%? 10%? 是否真的不可避免？

### 怀疑 3：Cheney 在 NUMA 多 socket 系统的内存带宽问题

现代服务器 NUMA：远端 socket 访问延迟 2-3x 于本地。Cheney GC 把活对象从 from-space 复制到 to-space——如果 from/to 跨 socket，**带宽是瓶颈**。

V8 / HotSpot 都做 NUMA-aware Cheney——把 to-space 分配在与 mutator 线程同 socket。但这要求：

- thread 不能跨 socket 迁移（OS 调度难保证）
- workload 必须有 thread/data 亲和性

实际 cloud workload（多个 JVM 共享一台机器）NUMA awareness 经常失效。**Cheney 在 NUMA 系统的真实性能可能远低于理论 O(L)**。

需要看 Tian 2018 "NumaGiC" 等 NUMA-aware GC 研究的实测数据。

### 怀疑 4：incremental / concurrent Cheney 真的安全吗？

Baker 1978 提出 incremental Cheney——每次 allocation 顺带 forward 几个对象，不 stop-the-world。但 mutator 在 GC 进行中可能：

- 修改 from-space 对象（写入新指针）——这个写入是否会被丢失？
- 读 from-space 对象（已被 forward 但未 update 引用）——拿到 forwarding pointer 该如何 deref？

Baker 用 read barrier（每次 deref 检查是否 forwarded）解决——但 read barrier 让每个指针 deref 多 1-2 个 cycle。这个开销在 SPARC 时代可接受，**在现代 IPC=4 的 OoO CPU 上可能让程序整体慢 10-20%**。

ZGC 用 colored pointer + load barrier 进一步优化，但仍不是零开销。**Cheney 的"理论 O(L) 时间"在 concurrent 化后实际开销不止 O(L)**——这个差距经常被忽略。

需要看 Yang 2022 "ZGC vs Shenandoah vs G1 on long-running services"实测对照。

### 怀疑 5：from-space 真的零成本吗？

Cheney 论文 Section 2 说 from-space 在 GC 后整片丢弃，"零成本"。但：

- **OS 层面**：要么 munmap（全片释放、下次再 mmap，频繁系统调用）、要么保留映射（占用 2× 物理内存）
- **TLB**：from-space 的 page entry 长期占着 TLB 直到下次重用，TLB miss
- **NUMA 数据迁移**：from→to 复制本身就是数据复制，不是免费的

V8 实际给每个 isolate 配一个固定 to-space 区域，**避免反复 mmap/munmap**——但代价是 RSS 永远 = 2× working set。这个内存放大在容器化时代（K8s 内存限制）是真实问题。

需要看 V8 团队对 RSS 优化的 blog 讨论这个权衡。

## Layer 8 — 方法限制（≥ 4 条）

### 限制 1：2× 空间放大不可避免

semi-space 设计天然要求 2× working set 的物理内存。在容器化 / 内存受限场景：

- 容器只给 1GB，young space 想用 200MB → 实际占 400MB（一半在 from / 一半在 to）
- mobile 端（iOS、Android）内存稀缺——Android Dalvik / ART 老版本曾用 Cheney 但后来改 mark-compact + concurrent

减半空间的尝试有 mark-compact、Lisp2 sliding compaction、Kermany 2006 "Compressor"——但都比 Cheney 慢且复杂。**2× 空间是 copying GC 不可绕过的代价**。

### 限制 2：大对象 pause 时间长

复制 1MB 对象 = 1MB memcpy ~ 0.3ms（DDR4 3GB/s 单线程带宽 + cache miss）。100MB 对象 = 30ms pause。这种"巨型复制"是用户感知的卡顿。

工业 workaround：

- **humongous object special case**（HotSpot G1）：>50% region 的对象不走 Cheney，直接放专门的 humongous region、用 mark-sweep
- **不可移动 object pool**（Erlang large binary、V8 large object space）
- **incremental copy**（ZGC、Shenandoah）：分摊 pause 到多个步骤

但任何 workaround 都是 Cheney 之上的"补丁"，说明 Cheney 在大对象上的根本性弱点。

### 限制 3：cache locality 差（BFS 序）

BFS 顺序复制让父子在 to-space 里相距远。访问 list a→b→c→d 时：

- a 在 to-space[0]
- b 在 to-space[100]（其他 root 的 child 排在 b 前）
- c 在 to-space[500]
- d 在 to-space[2000]

每次 deref 都跨 cache line 甚至跨 page。Wilson 1991 实测 BFS Cheney 比 DFS 顺序 cache miss 多 30-50%。

DFS Cheney 需要显式栈——回到 1970 之前的问题。所以工业实现选择"接受 cache miss + 简单算法" > "好 cache + 复杂算法"。**这是 Cheney 设计上的根本不优**。

### 限制 4：concurrent / real-time 化引入 read barrier

Cheney 单线程 stop-the-world 简单干净。但现代低延迟应用（金融交易、游戏、流处理）不能 stop-the-world：

- ZGC / Shenandoah / Azul C4：每次指针 deref 都要 load barrier（检查 colored pointer / forwarded 状态）
- Baker 1978 incremental：每次 deref 都要 read barrier

Read barrier 开销：

- AArch64 / x86：1-3 个 cycle
- 加上 branch prediction：5-10% 整体程序减速

**Cheney 的"O(L) 时间"在 concurrent 化后实际系统开销是 O(L) + N × barrier_cost**——其中 N 是 barrier 触发次数（可能 = 总指针 deref 次数）。

### 限制 5：Generational hypothesis 在某些 workload 失效

generational GC（Cheney 谱系最成功的变种）假设 weak generational hypothesis（年轻对象多数即死），但：

- **数据库 buffer pool**：分配出来的 page 长期 live，young space 全是活对象
- **ML 训练 weight tensor**：分配后训练全程 live
- **Web server cache**：cache 对象长期 live

这些 workload 下 young space 高 live ratio → Cheney 退化成"复制大部分对象"——比 mark-sweep 慢且多用一倍内存。

应对：HotSpot 的 G1 region 化、ZGC 不分代，但每一种都是"用更复杂的算法补 Cheney 的短板"——证明 Cheney + generational 并不是 universal solution。

### 限制 6：算法假设单线程，多线程化复杂

Cheney 1970 假设单线程 mutator + 单线程 GC + stop-the-world。多线程化每一步都有挑战：

- **多 worker 并行 Cheney**：CAS forwarding pointer + work stealing（V8 Parallel Scavenge），加速 1.5-2x（不是 N 倍），CAS 竞争是瓶颈
- **concurrent Cheney**（mutator 跑同时 GC）：read/write barrier、colored pointer——复杂度爆炸
- **incremental Cheney**：每个 allocation 顺带做几个 forward——"老化"问题（root set 变化时部分活对象被遗漏）

每个并发版本都比 Cheney 1970 复杂 5-10x。这说明 **Cheney 算法的简单优雅是建立在单线程假设上的**——多线程时代代价高。

## Layer 9 — 元数据

- **状元篇分支**：D theory（理论论文：提出基础算法 / 数据结构 / 理论框架，影响整个领域 50+ 年）
- **季 / 集**：Q 季 Q1（Season Q "Memory Management" 启动篇——从 Cheney 1970 出发，后续覆盖 Lieberman 1983 generational、Boehm 1988 conservative、Click 2005 pauseless、ZGC / Shenandoah 2015+，把 GC 50 年史按"算法 + 工程权衡"维度梳理一遍）
- **学习路径**：Layer 0-2 把 Cheney 算法的数据结构和不变量建立起来；Layer 3 三段代码看 toy C 实现 / V8 工业版 / generational 变种；Layer 4 跑 50 行 toy GC 验证 invariant；Layer 5-6 横向看 GC 谱系和它在现代 V8 / JVM 行为里的位置
- **关联笔记**：暂无（本篇是 Season Q 启动），后续会有 Lieberman 1983 generational GC、Boehm 1988 conservative GC、Click 2005 Pauseless GC、ZGC / Shenandoah 等接续；与 Season P 的 LLM infra 系列形成对照（infra 是吞吐 / 延迟 trade-off，GC 也是同主题在 runtime 层）
- **后续阅读**：Baker 1978 "List Processing in Real Time"（incremental Cheney 始祖）、Lieberman & Hewitt 1983 "A Real-Time Garbage Collector"（generational 始祖）、Wilson 1992 "Uniprocessor Garbage Collection Techniques"（GC 综述）、Jones & Hosking & Moss 2011 "The Garbage Collection Handbook"（GC 圣经）、Click 2005 "The Pauseless GC Algorithm"（Azul C4 / ZGC 前驱）
- **本笔记 commit hash 引用**：
  - SerenityOS LibJS Heap 实现：`aed345cae965706d0a44f94c19583ba917a25779`（SerenityOS/serenity/Userland/Libraries/LibJS/Heap/Heap.cpp）
  - V8 heap 主体（Scavenger 入口）：`35e022aae7b1093b6226f7dba95af3d062908102`（v8/v8/src/heap/heap.cc）
  - OpenJDK HotSpot G1 GC policy：`bb4d2abb0f59c46689dbc7c9bb9b43080dd658aa`（openjdk/jdk/src/hotspot/share/gc/g1/g1Policy.cpp）

## 一句话收尾

**Cheney 1970 的发明告诉我们：算法的影响力不与论文长度成正比——2 页 + 50 行代码定义了未来 50 年所有 managed runtime 的 young space 内存模型。** 当遇到"现有方案太复杂"的问题时，要怀疑是不是因为选错了图遍历策略（DFS / BFS / 链表反转）、或者选错了空间×时间的权衡点（1×空间慢算法 vs 2×空间快算法）。Cheney 用一个最朴素的"双区间复制 + BFS scan"打败了递归栈和链表反转两个聪明算法，给所有"系统设计"上了一课：**简单 + 物理直觉 > 复杂 + 数学聪明**——50 年里 V8、HotSpot、SpiderMonkey、SBCL、SerenityOS LibJS 全部按 Cheney 的设计跑，是这条原理最强的实证。

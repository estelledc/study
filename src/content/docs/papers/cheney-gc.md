---
title: Cheney 1970 — 把活对象复制走，原地丢弃整片堆
来源: 'C. J. Cheney, "A Nonrecursive List Compacting Algorithm", CACM 1970'
日期: 2026-05-30
分类: 系统
难度: 中级
---

## 是什么

Cheney 1970 是一种 **GC 算法**——程序运行时由它来决定哪些内存可以回收。日常类比：搬家。把还要用的东西（活对象）搬到新房子（to-space），旧房子（from-space）整片不要了，连带垃圾一起扔。

它最妙的一招是"**搬完原地留张便条**"——原对象的第一格被覆盖成"我已经搬到新地址 X"的指示，叫 forwarding pointer。下次有别人问"你搬哪去了"，看便条就行，不会重复搬。

```
gc():
  swap from-space and to-space
  scan = free = 起点(to-space)
  for each root r: r = forward(r)        # 把 root 指向的对象复制过去
  while scan < free:
    obj = to-space[scan]
    for each pointer p in obj:
      p = forward(p)                     # child 也复制过去
    scan += sizeof(obj)
```

整个算法**不用递归栈、不用链表反转、不用额外队列**——队列就是 to-space 自己。这是 1970 年那篇 2 页论文最反直觉也最强的发现。

## 为什么重要

不理解 Cheney，下面这些事都没法解释：

- 为什么 V8 / HotSpot / OCaml 的 young 代 GC 都是"两片空间来回搬"——它们都是 Cheney 1970 的变种
- 为什么 GC 论文里反复提"O(活对象) 而非 O(堆大小)"——Cheney 是第一个做到这点的算法
- 为什么 Java 容器内存设置 `-Xmx1g` 实际 RSS 经常翻倍——semi-space 天然 2 倍空间放大
- 为什么 50 年来 GC 设计反复回到"复制 + 留 forwarding pointer"——这个思路简单到无可替代

## 核心要点

整个算法可以拆成 **三步**：

1. **切两片**：把堆切成等大的 from-space 和 to-space。GC 触发时角色翻转——原 to 变 from，原 from 变 to。类比：两间一样大的房子，搬家时选一间当目的地。

2. **复制 + 留便条**：从 root 出发，把每个活对象**复制**到 to-space 的 free 指针处，free 前移；同时把原对象第一格覆盖成"已搬到 X"的 forwarding pointer。下次再访问到这个原地址，看便条直接拿新地址，不重复复制。

3. **BFS 追逐**：scan 指针在 to-space 里推进，每遇到一个对象就把它的 child 指针也走一遍 forward——child 进队尾（被复制到 free 处），scan 接着前进。**scan 追上 free 时遍历完成**。to-space 自己就是 BFS 队列，不需要额外存储。

## 实践案例

### 案例 1：50 行 C 跑通 Cheney 主循环

```c
#include <stdint.h>

typedef struct Cell { uintptr_t header; struct Cell *child[2]; } Cell;
static char *from_space, *to_space, *scan, *free_ptr;

static Cell *forward(Cell *p) {
  if (!p || (char *)p < from_space || (char *)p >= from_space + HEAP_HALF)
    return p;                           /* 不在 from-space，原样返回 */
  if (p->header & 1) return (Cell *)(p->header & ~1);   /* 已 forwarded */
  Cell *new_loc = (Cell *)free_ptr;
  *new_loc = *p;                        /* shallow copy */
  free_ptr += sizeof(Cell);
  p->header = (uintptr_t)new_loc | 1;   /* 装 forwarding pointer */
  return new_loc;
}
```

`forward()` 完全幂等：多个对象引用同一个 child 时只有第一次会真复制，后面看 forwarding pointer 直接返回新地址。这是 Cheney 算法正确性的关键。

### 案例 2：V8 Scavenger 把 forwarding pointer 写进 map_word

V8 给每个对象第一个字段叫 `map_word`，平时存 Map（vtable）指针，**GC 时被借去存 forwarding 地址**——靠最低位 tag 区分两种状态。和 Cheney 1970 一字不差，50 年没变。

```c
size_t size = p->map_word & SIZE_MASK;     /* 必须先读 size，再装 forwarding */
Object *new_loc = bump_alloc_in_to_space(size);
memcpy(new_loc, p, size);
p->map_word = (uintptr_t)new_loc | FORWARDED_TAG;
```

注意第一行：**必须在装 forwarding pointer 之前读 size**——一旦覆盖，再读就是新地址。这是 Cheney 实现里最常见的 bug。

### 案例 3：young 代用 Cheney + old 代用 mark-compact

generational GC 的核心洞察：**大部分对象出生即死亡**（weak generational hypothesis）。young 代 live ratio < 10%，Cheney 只复制 10% 数据几乎免费；old 代 live ratio > 80%，复制成本太高，改用 mark-compact 不动指针。

```python
def minor_gc(self, roots):
    self.eden, self.survivor = self.survivor, self.eden     # swap
    for r in roots: r = self.forward(r)
    while self.scan < self.free:
        obj = self.read_obj_at(self.scan)
        for f in obj.pointer_fields: f.value = self.forward(f.value)
        self.scan += obj.size
```

这就是 V8 Scavenger / HotSpot ParNew / G1 young collection 的骨架——young space 用纯 Cheney，old space 是另外的算法。

## 踩过的坑

1. **size 必须在装 forwarding 之前读完**：forwarding pointer 会覆盖对象第一个槽位，包括存在 header 里的 size 字段；写顺序错了就 memcpy 错长度。
2. **BFS 顺序让 cache miss 多**：父子对象在 to-space 里相距远（child 在队尾），访问父再访问 child 跨 cache line；Wilson 1991 实测比 DFS 顺序 cache miss 多 30-50%。
3. **2 倍空间放大不可避免**：semi-space 天然要求 2× working set，容器内存受限场景（K8s pod、移动端）会直接崩。
4. **大对象 pause 长**：复制 100MB 对象 = 30ms+ 的 memcpy，HotSpot G1 / ZGC 都给 humongous object 走非 copying 旁路。

## 适用 vs 不适用场景

**适用**：

- young 代 / nursery：live ratio < 20% 是甜蜜区，Cheney 几乎免费
- 短生命对象密集的函数式语言（OCaml / Erlang / Haskell）的临时 list / closure
- bump allocation 场景：分配频繁要 O(1)，free list 不行
- 长期运行的 server：Cheney 永远 0 碎片，mark-sweep 跑久了 free list 碎到分配变慢

**不适用**：

- old 代 / long-lived 对象：live ratio > 80% 时 Cheney 复制大部分对象，跟 mark-sweep + compact 一样慢但多用一倍内存
- 大对象（1MB+）：复制本身就是用户感知的卡顿，必须走 humongous 旁路
- 内存预算紧张（嵌入式 / 移动端）：2× 空间放大不可接受
- 不能动指针的 FFI 互操作场景：C 库持有的指针被移动后变 dangling

## 历史小故事（可跳过）

- **1960 年**：McCarthy 在 CACM 发明 LISP 同时给出第一个 GC——递归 mark-and-sweep。深嵌套 list 会爆栈。
- **1967 年**：Schorr & Waite 用链表反转消除递归——把递归栈"借居"到对象图本身的指针上。代码精巧到出名地难写。
- **1970 年 11 月**：Cheney 在 CACM 发 2 页论文，用 BFS 复制一举把递归栈和链表反转都干掉。
- **1972 年**：Fenichel & Yochelson 在 Multics LISP 落地工业版 Cheney。
- **1978 年**：Baker 加 incremental 变种，每次 allocation 顺带 forward 几个对象，实时 GC 始祖。
- **1983 年**：Lieberman & Hewitt 把 Cheney 包进 generational GC 的 young space——之后 V8 / HotSpot / SpiderMonkey 全部沿用。

## 学到什么

1. **GC 的本质是图遍历策略选择**：mark-and-sweep 是 DFS（递归栈），Cheney 是 BFS（用 to-space 当队列），Schorr-Waite 是 DFS + 链表反转——三个算法解同一个图遍历问题
2. **空间换时间是 Cheney 的核心权衡**：花 2× 空间换 0 递归栈 + 顺带 compact + O(活对象) 时间——50 年里这个权衡反复被验证
3. **forwarding pointer 是 in-place 算法的通用 trick**：union-find 的 path compression、closure conversion 的 alpha-rename 都是同一招——"复制 + 原地留新地址"
4. **2 页论文 + 50 行代码 + 50 年影响**：简单算法配物理直觉打败聪明算法（链表反转）——这是论文阅读和系统设计的清醒剂

## 延伸阅读

- 视频教程：[Crafting Interpreters - Garbage Collection](https://craftinginterpreters.com/garbage-collection.html)（先讲 mark-sweep，再讲 Cheney 思路对照）
- GC 圣经：Jones & Hosking & Moss 2011《The Garbage Collection Handbook》第 4 章 Copying Collection
- 后续工作：Baker 1978 "List Processing in Real Time on a Serial Computer"（incremental Cheney）
- 论文 2 页 PDF：Cheney 1970 "A Nonrecursive List Compacting Algorithm" CACM 13(11)
- [[mccarthy-lisp]] —— Cheney 解决的就是 McCarthy 1960 mark-sweep 的递归栈问题
- [[knuth-taocp]] —— Vol.1 第 2.3.5 节系统比较 mark-sweep / 链表反转 / compaction，Cheney 几乎肯定读过

## 关联

- [[mccarthy-lisp]] —— Cheney 直接对标 McCarthy 1960 mark-sweep 解决其递归栈痛点
- [[boehm-gc]] —— 1988 conservative GC 的对照路线：保留 mark-sweep 思想做 C/C++ GC，不动指针
- [[generational-gc]] —— Lieberman-Hewitt 1983 把 Cheney 包进 young space 的工业级变种
- [[zgc]] —— OpenJDK ZGC 用 colored pointer + load barrier，仍保留 Cheney 的 from→to 复制思想
- [[lambda-calculus]] —— LISP 求值产生的临时 cons cell 是 Cheney 最早服务的对象
- [[knuth-taocp]] —— Vol.1 第 2.3.5 节比较各种 GC，Cheney 的 2 页论文实质是给 Knuth 综述加一种新方法
- [[erlang-otp]] —— Erlang 进程级 Cheney + per-process heap 是 Baker incremental 的现代继承

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[boehm-gc]] —— Boehm-Weiser 保守式垃圾回收 — 不改编译器也能给 C 加 GC
- [[g1-collector]] —— G1 Garbage-First — 给暂停时间设个预算的垃圾回收器
- [[generational-gc]] —— Generational GC — 把全堆扫描换成"频繁扫小区，偶尔扫整堆"
- [[immix-mark-region]] —— Immix — 把"扫"和"搬"两种垃圾回收揉成一个
- [[lieberman-realtime-gc]] —— Lieberman-Hewitt 1983 — 把对象寿命统计偏斜兑换成有界停顿
- [[tofte-talpin-regions]] —— Tofte-Talpin Regions — 让类型系统替你管内存生命周期
- [[zgc]] —— ZGC — 让 GC 停顿与堆大小解耦的低延迟回收器

---
title: ZGC — 让 GC 停顿与堆大小解耦的低延迟回收器
来源: 'Per Liden et al., "JEP 333: ZGC A Scalable Low-Latency Garbage Collector", OpenJDK 2018+'
日期: 2026-05-30
分类: 编程语言
难度: 高级
---

## 是什么

ZGC（**Z Garbage Collector**）是 Java 的一种**垃圾回收器**，它的卖点是：**不管堆有多大，GC 暂停时间都稳定在 1 毫秒以下**。日常类比：传统 GC 像清洁工要把所有人赶出商场再打扫，ZGC 像一边营业一边打扫——顾客买单时偶尔让一下路，整体不停业。

JVM 跑久了会产生大量"死对象"，必须有人定期清理。老一代 GC 在清扫时会暂停整个 Java 进程（Stop-The-World，简称 STW），堆越大暂停越久。一个 100 GB 的堆，老 GC 可能停 1 秒——金融下单、广告竞价都崩。

ZGC 的解法：**让 GC 几乎全程与应用并发**，只在头尾各暂停一下扫"根"（线程栈），暂停时间只跟"根"数量相关，跟堆大小无关。即便堆涨到 16 TB，停顿仍 < 1 ms。

## 为什么重要

不理解 ZGC，下面这些事都没法解释：

- 为什么金融、广告、实时风控的 Java 服务这几年纷纷从 G1 切到 ZGC——p99.9 延迟差一个数量级
- 为什么"64 位指针"里其实只用了 48 位甚至更少——剩下的高位被 GC、tagged pointer 这些机制偷偷征用
- 为什么 OpenJDK 21 起又出了"分代 ZGC"——纯并发不够，弱分代假设被请回来
- 为什么 Rust / 无 GC 派看 Java 总觉得"凭空多了 5%-15% 开销"——load barrier 是延迟换吞吐的固定税

## 核心要点

ZGC 的设计可以拆成 **三招**：

1. **染色指针（colored pointers）**：把 64 位指针的高 4 位拿来标 GC 状态——Marked0 / Marked1 / Remapped / Finalizable。类比：给每条线索贴彩色便利贴，看一眼就知道这条线索现在属于哪个调查阶段。

2. **load barrier（读屏障）**：每次代码读一个对象引用时，JIT 编译器塞 2-3 条指令做"颜色检查"（OpenJDK ZGC 是软件屏障，不是 Azul C4 那种硬件屏障）。颜色对就走快路径，颜色错就走慢路径修正。类比：进商场前保安瞄一眼工牌，绝大多数直接放行，少数需要补办。

3. **并发 mark + 并发 relocate**：标记活对象、搬迁活对象，全部与应用线程并发跑。只在头尾各 STW 不到 1 ms 扫根。类比：擦地的工人和顾客同时在场，工人擦哪块地哪块湿，顾客遇到湿地自己绕一下，最后地擦完了顾客也没停。

三招合起来，让 STW 时间 = O(|roots|)，与堆大小完全解耦。

## 实践案例

### 案例 1：染色指针的 64 位 layout

```c
// 64-bit colored pointer（OpenJDK ZGC 风格示意）
//   高 4 位颜色：Finalizable / Remapped / Marked1 / Marked0
//   低位：对象地址偏移（实现约 42–44 位；堆上限约 16 TB）

#define ZGC_MARKED0  (1ULL << 43)
#define ZGC_REMAPPED (1ULL << 45)
#define ADDR_MASK    ((1ULL << 43) - 1)

uintptr_t recolor(uintptr_t p, uint8_t c) {
    return (p & ADDR_MASK) | ((uintptr_t)c << 43);
}
```

**逐部分解释**：低位存对象在哪，高 4 位贴 GC 颜色。多视图 mmap 像同一间仓库开三扇门——物理页只一份，但 marked0 / marked1 / remapped 三个虚拟入口；CPU 走哪扇门都到同一页，却能立刻看出指针处于哪个 GC 阶段。

### 案例 2：load barrier 快路径汇编

```asm
; mutator 读对象引用时编译器自动插入：
mov   rax, [rdi + offset]   ; 1. 读对象引用
test  rax, [zgc_bad_mask]   ; 2. 测高位是否含错色
jnz   .slow_path            ; 3. 慢路径 < 1% 命中
; 快路径继续
```

**逐部分解释**：`zgc_bad_mask` 是当前 phase 不该出现的颜色。绝大多数 load 颜色对，3 条指令就过；颜色错才进慢路径——慢路径会把对象搬走，再用 CAS（原子地"比对后改写"，像多人同时改同一格表格时只许一人成功）写回原槽，这叫 self-healing：下次再 load 同一槽就直接快路径。

### 案例 3：完整 GC cycle 流水线

```python
def zgc_cycle():
    stw_pause_mark_start()      # < 1 ms：flip color，扫线程根
    flip_mark_color()
    concurrent_mark()           # 与应用并发，最长阶段
    stw_pause_mark_end()        # < 1 ms：排空 mark stack
    relocation_set = pick_high_garbage_regions()
    stw_pause_relocate_start()  # < 1 ms：flip 到 Remapped
    concurrent_relocate()       # 与应用一起搬对象
```

**逐部分解释**：3 次 STW 各做最少的事——color flip、root snapshot、mark stack 排空——总共 < 几 ms 即便 16 TB 堆。中间的 concurrent 阶段才是大头工作量，但与应用并发不影响延迟。GC 与 mutator 像两条流水线交替前进，每个阶段都被设计成"可中断、可恢复"。

跑起来用：

```bash
java -XX:+UseZGC -Xmx16g -Xlog:gc*:file=gc.log:time,level,tags MyApp
# JDK 21 以上启分代 ZGC：
java -XX:+UseZGC -XX:+ZGenerational -Xmx32g MyApp
```

读 gc.log 关注 5 个字段：`Pause Mark Start` / `Concurrent Mark` / `Pause Mark End` / `Concurrent Relocate` / `Allocation Stall`。三次 Pause 应稳 < 1 ms；Allocation Stall 非零就是 GC 跟不上分配速率的报警。

## 踩过的坑

1. **染色指针吃掉地址空间**：64 位指针看似充裕，但 4 位染色 + 内核保留 + huge page 对齐后，单堆上限被压到 16 TB（分代 ZGC 进一步压到 8 TB）；嵌入式或 32 位平台直接不能用。

2. **多视图 mmap 让监控数据失真**：`top`、`docker stats`、cgroup memory.usage 看到的 RSS 是三个视图相加的虚高值，运维以为 OOM 实际还早；必须用 `jcmd <pid> VM.native_memory` 才看得准。

3. **小堆下并发开销得不偿失**：堆 < 8 GB 时 ZGC 的并发 GC 线程持续占 CPU，比 G1 慢且耗能；ZGC 甜区是 16 GB 以上 + 延迟敏感场景。

4. **JNI / FFI 必须 mask 高位**：原生代码拿到带颜色的指针直接解引用就崩，所有跨语言边界要写 mask 转换；旧版 profiler / heap dump 工具不懂染色规则，给 ZGC heap 出错误结果。

## 适用 vs 不适用场景

**适用**：
- 堆 ≥ 16 GB 且 p99.9 延迟要求 < 5 ms（金融实时、广告竞价、风控）
- 长寿命对象多的服务（在线机器学习推理、缓存层、KV store）
- 64 位 Linux + huge address space + 较新 JDK（17+ 推荐）

**不适用**：
- 小堆（< 8 GB）短寿命密集分配 → 用 G1 或分代 ZGC
- 32 位平台或地址空间紧张的嵌入式 → 用 Serial / Parallel GC
- 吞吐至上的离线批处理（Spark / 数仓 ETL） → Parallel GC 更省 CPU
- 硬实时控制系统 → 任何带 STW 的 GC 都不达标，要无 GC 语言或 RTSJ

## 历史小故事（可跳过）

- **2005 年**：Azul Systems 推出商业 JVM 的 C4（Continuously Concurrent Compacting Collector），用专用硬件做读屏障，这是 ZGC 的精神原型——Per Liden 公开承认。
- **2014 年**：Red Hat 的 Christine Flood 启动 Shenandoah（JEP 189），用 Brooks Pointer 实现并发疏散，与 ZGC 并行竞争。
- **2017 年**：Per Liden 团队在 Oracle Sweden 启动 ZGC，选择"染色指针 + 多视图 mmap"路线避开 Brooks Pointer 的对象 header 加位。
- **2018 年**：JEP 333，ZGC 以 experimental 入 OpenJDK 11 主线；2020 年 JDK 15 转 production。
- **2024 年**：JEP 439 分代 ZGC 进 JDK 21（experimental），JDK 23 转 production——承认纯并发不够，请回弱分代假设。

## 学到什么

1. **延迟 vs 吞吐永远在权衡**——ZGC 用 5%-15% mutator 吞吐换 100× 停顿降低，是延迟敏感场景的固定税；任何"低延迟"宣传都要看 p99.9 / p99.99 才反映真相。
2. **指针的高位是宝贵 bit**——染色指针、tagged pointer、NaN-boxing 是同族手段，"在指针里藏元数据"是工业级数据结构的常见招式。
3. **barrier 是并发数据结构的通用拦截点**——读屏障 / 写屏障 / CAS 屏障的应用面远超 GC，MVCC、协程调度、CRDT 都在用。
4. **工程妥协会回头**——纯并发 ZGC 跑 6 年后还是请回了分代假设，提醒人："反对的旧假设"未必错，可能是被场景重新选中。

## 延伸阅读

- 视频教程：[Per Liden — ZGC: A Scalable Low-Latency GC（Devoxx 2018）](https://www.youtube.com/watch?v=Hjyv2bzGQ-c)（作者本人 1 小时讲透设计动机）
- 文档：[OpenJDK Wiki — Main ZGC Page](https://wiki.openjdk.org/display/zgc/Main)（最权威的实现细节入口）
- JEP 原文：[JEP 333: ZGC A Scalable Low-Latency Garbage Collector](https://openjdk.org/jeps/333) 与 [JEP 439: Generational ZGC](https://openjdk.org/jeps/439)
- 视频：[Erik Osterlund — Generational ZGC Design](https://www.youtube.com/watch?v=KXJ7lwIGz74)（分代 ZGC 设计动机）
- [[generational-gc]] —— ZGC 早期反对的弱分代假设，2024 又重新吸纳

## 关联

- [[generational-gc]] —— 弱分代假设是 ZGC 早期反对、2024 年又拥抱的对象
- [[cheney-gc]] —— 1970 单空间复制是所有 region-based GC 的复制原型
- [[peyton-jones-stg]] —— 同样在做"运行时 + 编译器协同"的工程，不过 STG 优化吞吐而非延迟
- [[tigerbeetle]] —— 金融领域选 Zig 无 GC 的另一条路，与 ZGC 形成对照
- [[llvm]] —— 现代编译器后端，与 ZGC 同样靠"编译期 + 运行时"协作
- [[standard-ml]] —— 函数式语言的 GC 选择题更早就讨论过类似权衡

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[boehm-gc]] —— Boehm-Weiser 保守式垃圾回收 — 不改编译器也能给 C 加 GC
- [[cheney-gc]] —— Cheney 1970 — 把活对象复制走，原地丢弃整片堆
- [[g1-collector]] —— G1 Garbage-First — 给暂停时间设个预算的垃圾回收器
- [[generational-gc]] —— Generational GC — 把全堆扫描换成"频繁扫小区，偶尔扫整堆"
- [[lieberman-realtime-gc]] —— Lieberman-Hewitt 1983 — 把对象寿命统计偏斜兑换成有界停顿
- [[tofte-talpin-regions]] —— Tofte-Talpin Regions — 让类型系统替你管内存生命周期

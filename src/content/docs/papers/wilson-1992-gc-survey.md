---
title: 单处理器垃圾回收技术——一篇经典综述的零基础解读
来源: https://www.cs.cmu.edu/~fp/courses/15411-f09/misc/wilson92survey.pdf
日期: 2026-06-13
分类: 编程语言
子分类: 类型与 PL 理论
provenance: pipeline-v3
---

# 单处理器垃圾回收技术 —— Wilson 1992 综述笔记

## 一、垃圾回收到底是什么？

想象你在整理一间房间。你有很多玩具（对象），它们之间用绳子连接（引用）。比如积木 A 上拴着一根绳到积木 B，表示"A 引用了 B"。

现在你决定把地上的玩具全部收进箱子。但规则是：**只有被"手"（栈）或者"地板"（全局变量）直接抓着的玩具才能收**。如果某个玩具没有任何绳子通向手或地板，那它就是没人要的（不可达的），应该扔进垃圾桶。

垃圾回收（GC）就是自动做这件事的程序：找出所有"没人要的玩具"，把它们回收，腾出空间给新玩具。

在编程语言里，这省去了程序员手动 `malloc` / `free` 的麻烦，也避免了忘记释放导致的内存泄漏。

---

## 二、Wilson 这篇论文在说什么？

Paul R. Wilson 的 *Uniprocessor Garbage Collection Techniques*（1992）是 GC 领域被引用最多的综述论文之一。它做了三件事：

1. **系统化分类**：把当时已有的垃圾回收算法分成清晰的类别
2. **实证比较**：在真实的 C 程序上运行各种 GC，测量它们的内存开销和时间开销
3. **给出实用建议**：告诉开发者不同场景下该选哪种算法

注意标题里的"Uniprocessor"——它只讨论单核 CPU 的情况。多线程 GC 是后来才发展的。

---

## 三、核心概念：标记-清除（Mark-Sweep）

这是所有 GC 的"Hello World"。分两步：

**第一步：标记（Mark）**
从根节点（栈上的局部变量、全局变量）出发，沿着引用链，把所有能到达的对象打个"活着"的标签。

**第二步：清除（Sweep）**
遍历整个堆，把所有没被打标签的对象全部释放。

```python
# 伪代码：标记-清除 GC 的核心逻辑

class Object:
    def __init__(self, ref=None):
        self.ref = ref      # 引用指向另一个对象
        self.marked = False # 是否还活着

def mark_from_roots(roots):
    """从根节点出发，标记所有可达对象"""
    stack = list(roots)
    while stack:
        obj = stack.pop()
        if obj and not obj.marked:
            obj.marked = True
            stack.append(obj.ref)  # 跟进它的引用

def sweep(heap):
    """清除堆中所有未标记的对象"""
    alive = []
    for obj in heap:
        if obj.marked:
            obj.marked = False   # 重置标记，为下一次准备
            alive.append(obj)
        # 未标记的对象被丢弃（释放）
    return alive
```

**类比**：标记 = 用荧光笔画出所有还在用的东西；清除 = 把没画到的废纸扔掉。

**缺点**：标记和清除是两步操作，中间如果程序继续分配内存，可能会浪费空间（碎片化）。

---

## 四、核心概念：引用计数（Reference Counting）

另一种思路：**每个对象维护一个计数器**，记录有多少地方引用了它。计数器归零时立即回收。

```python
# 伪代码：引用计数 GC

class RCObject:
    def __init__(self):
        self.ref_count = 0
        self.refs_to = []  # 我引用的其他对象

    def add_ref(self):
        self.ref_count += 1

    def release_ref(self):
        self.ref_count -= 1
        if self.ref_count == 0:
            # 立即回收！
            for ref in self.refs_to:
                ref.release_ref()  # 级联释放
            del self  # 真正的内存释放
```

**优点**：即时回收，不需要停顿整个程序。
**缺点**：无法处理循环引用（A 引用 B，B 引用 A，两者计数都不为零）。

**类比**：就像接力赛中的火炬。每个人手里拿着火炬就算"拥有"。当最后一个人放下火炬，火炬就消失了。但如果两个人互相传递火炬（循环），火炬永远不会消失。

---

## 五、Wilson 的主要发现

Wilson 在真实 C 程序上跑了大量实验，得出几个关键结论：

### 5.1 标记-清除的变体很多

论文区分了多种 Mark-Sweep 的实现方式：

- **位图标记**：在堆旁边维护一张位图，标记过的对象对应位设为 1
- **栈式标记**：用栈来跟踪递归深度，避免栈溢出
- **增量标记**：把标记过程拆成小块，穿插在正常程序执行中

### 5.2 生成式 GC（Generational GC）最实用

Wilson 发现了一个经验规律——**"弱生代假说"**：大多数对象都是"短命"的，很快就被回收；只有少数对象能活很久。

基于这个观察，生成式 GC 把堆分成"年轻代"和"老年代"：

- 新对象放在年轻代，频繁回收（快）
- 活下来的移到老年代，回收频率低（慢但对象少）

这就是为什么现代语言（Java、JavaScript、Ruby）几乎都用生成式 GC。

### 5.3 内存开销与时间开销的权衡

| 算法 | 时间开销 | 内存开销 | 停顿时间 |
|------|---------|---------|---------|
| 引用计数 | 每次分配都有开销 | 每个对象多存一个计数器 | 几乎无停顿 |
| 标记-清除 | 周期性大停顿 | 需要标记位图 | 长停顿 |
| 复制式 GC | 对象移动开销 | 需要空闲空间翻倍 | 中等停顿 |

---

## 六、核心概念：复制式 GC（Copying GC）

把堆分成两半：From 和 To。活跃对象从 From 复制到 To，然后两半交换角色。

```python
# 伪代码：复制式 GC 的核心逻辑

class CopyingCollector:
    def __init__(self):
        self.from_space = []   # 当前使用的半区
        self.to_space = []     # 空闲半区
        self.next_free = 0     # to_space 中的分配指针

    def allocate(self, size):
        """分配时检查是否需要 GC"""
        if self.next_free + size > len(self.to_space):
            self.collect()       # 触发回收
        obj = Object(size)
        self.to_space[self.next_free:self.next_free + size] = [obj]
        self.next_free += size
        return obj

    def collect(self):
        """从根节点出发，复制所有存活对象到 to_space"""
        # 1. 扫描根节点，把可达对象复制到 to_space
        for root in get_roots():
            copied = self.copy(root)
            self.to_space.append(copied)

        # 2. 递归处理刚复制的对象
        i = 0
        while i < len(self.to_space):
            obj = self.to_space[i]
            if obj.ref:
                copied = self.copy(obj.ref)
                self.to_space.append(copied)
            i += 1

        # 3. 交换 from/to，to_space 清空
        self.from_space, self.to_space = self.to_space, self.from_space
        self.to_space.clear()
        self.next_free = 0

    def copy(self, obj):
        """复制单个对象，处理重复引用"""
        if hasattr(obj, 'forwarding_address'):
            return obj.forwarding_address  # 已经复制过了
        new_obj = Object(obj.size)
        new_obj.forwarding_address = new_obj
        new_obj.data = obj.data
        return new_obj
```

**类比**：就像搬家。你把旧房子（From）里还在用的家具搬到新房子（To），搬完后旧房子清空，新房子变成旧房子，准备下一轮。

**优点**：天然消除碎片，分配只需一个指针递增（极快）。
**缺点**：需要两倍的堆空间。

---

## 七、Wilson 综述的结构概览

论文大致按以下脉络组织：

1. **背景**：为什么需要 GC
2. **离线 GC**：早期无法在运行时工作的方法
3. **在线 GC**：
   - 引用计数
   - 标记-清除及变体
   - 复制式
   - 扫描式（Scavenging）
4. **增量 GC**：把回收分散到多次执行
5. **实验评估**：在真实程序上的性能数据
6. **结论与建议**

---

## 八、为什么这篇 1992 年的论文今天仍值得读？

1. **分类框架至今有效**：现代 GC 论文仍然在用 Wilson 建立的分类体系来定位自己的工作
2. **实证精神**：不是空谈理论，而是在真实 workload 上测量，这种态度在今天仍然稀缺
3. **生代假说的预见性**：当时的数据已经清晰指向生成式 GC 是最实用的路线，今天的 JVM、V8、CRuby 都在验证这一点
4. **增量 GC 的挑战**：Wilson 指出增量 GC 难以同时兼顾低停顿和低开销，这个问题到今天仍然是研究热点

---

## 九、延伸阅读

- **Chen & Morrisett, 2003** — "Lazy Baker": 惰性复制 GC，结合复制式和标记清除的优点
- **Boehm GC** — 一种近似引用计数的 GC，能处理循环引用
- **Modern Generational GC** — Java 的 G1、ZGC，JavaScript 的 V8 引擎

---

## 十、一句话总结

> Wilson 1992 告诉我们：**没有最好的 GC，只有最适合 workload 的 GC**。大多数对象的寿命都很短——抓住这个事实，就能设计出高效的回收器。

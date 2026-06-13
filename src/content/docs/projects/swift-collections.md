---
title: swift-collections — Apple 官方 Swift 数据结构补充包
来源: https://github.com/apple/swift-collections
日期: 2026-06-13
分类: 后端 API
子分类: 移动端
provenance: pipeline-v3
---

## 是什么

**swift-collections** 是 Apple 开源的 Swift Package，在标准库 `Array`、`Set`、`Dictionary` 之外，提供一批**生产级**、**值语义**、**带完整文档与基准测试**的数据结构实现。仓库地址：[apple/swift-collections](https://github.com/apple/swift-collections)，Apache-2.0 协议，当前稳定版约 1.4.x，要求 Swift 6.0+。

日常类比：

- 标准库的 `Array` / `Set` / `Dictionary` 像宜家**三件套基础家具**——家家都有，够用，但款式固定。
- **swift-collections** 像同一品牌的**扩展配件柜**：双头进出的「传送带队列」、按插入顺序排队的「有序名单」、专门存 0/1 的「密实开关墙」、能随时取最小/最大值的「优先级转盘」——都是和基础款**同一设计语言**（`Collection` 协议、值类型、Copy-on-Write），但针对特定场景把性能或语义打磨得更顺手。

最小接入方式（Swift Package Manager）：

```swift
// Package.swift
dependencies: [
    .package(url: "https://github.com/apple/swift-collections.git", from: "1.4.0"),
],
targets: [
    .target(name: "MyApp", dependencies: [
        .product(name: "Collections", package: "swift-collections"),
    ]),
]
```

应用代码里通常一行导入常用类型：

```swift
import Collections  // Deque, OrderedSet, OrderedDictionary, Heap, BitSet, BitArray …
```

## 为什么重要

零基础学 Swift / iOS / 服务端（[[vapor]]、[[swift-nio]]）时，迟早会遇到标准库「差一点」的场景：

| 痛点 | 标准库行为 | swift-collections 的补位 |
|------|------------|---------------------------|
| 队列：两端频繁插入删除 | `Array` 在**头部**插入要整体挪动，O(n) | `Deque` 环形缓冲区，两端摊还 O(1) |
| 需要唯一元素，又要**保持插入顺序** | `Set` 无序；`Array` 去重慢 | `OrderedSet`：唯一 + 有序 + O(1) 成员检测 |
| 字典要**稳定遍历顺序**（配置、表单、LRU 键列表） | `Dictionary` 顺序未定义 | `OrderedDictionary`：键值对按插入顺序排列 |
| 大量 `Set<Int>` 或 `Array<Bool>` | 每个元素占完整机器字，浪费 | `BitSet` / `BitArray` 按位打包 |
| 优先级队列、定时器、Top-K | 手写堆或引入第三方 | `Heap`：min-max 堆，O(1) 取极值 |

它是 Apple 自家维护、与 Swift 语言演进同步的库，被 Swift 标准库团队用作**新容器设计的试验田**；许多 API 风格会反哺未来 Swift 标准库。学它等于学「Swift 官方认可的容器写法」。

## 包结构与模块

不必一次学完所有模块。按用途记下面这张表即可：

| 模块 | 主要类型 | 一句话 |
|------|----------|--------|
| `Collections` | 聚合导出 | 日常开发**只 import 这个** |
| `DequeModule` | `Deque` | 双端队列 |
| `OrderedCollections` | `OrderedSet`, `OrderedDictionary` | 保序集合/字典 |
| `BitCollections` | `BitSet`, `BitArray` | 紧凑位图 |
| `HeapModule` | `Heap` | 优先级队列（min-max 堆） |
| `HashTreeCollections` | `TreeSet`, `TreeDictionary` | 持久化/共享友好的哈希树（较新） |
| `BasicContainers` | `UniqueArray` 等 | 底层/进阶容器原语 |

此外还有带 `Unstable*` trait 的实验特性（排序容器预览等），生产环境先用**稳定**模块即可。

## 核心概念

### 1. 值语义与 Copy-on-Write（COW）

与 `Array` 一样，`Deque`、`OrderedSet` 等默认是**结构体 + 值语义**：赋值产生逻辑副本，但底层存储在「只读共享」时可延迟复制。修改其中一个副本时才真正拷贝缓冲区。多线程下仍要注意：两个线程同时写**同一个**变量需要同步；各自持有副本则互不影响。

### 2. Deque — 双端队列（环形缓冲区）

`Deque<Element>`（读作 "deck"）实现**两端高效**插入与删除。内部是**环形数组**：逻辑上的「队头」可以在物理数组任意位置，避免 `Array.insert(at: 0, …)` 时全体元素平移。

- 接口接近 `Array`：下标、`append`、`remove(at:)`、`RandomAccessCollection`
- 额外强调队头操作：`prepend`、`popFirst`、`prepend(contentsOf:)`
- **头部**插入/删除：Deque 远快于 Array；**随机下标读**：两者接近，Array 有时略胜
- 不暴露稳定 `capacity`（与 `Array` 不同），容量是实现细节

典型场景：BFS 队列、撤销栈+重做栈、滑动窗口、任何「两头动、中间少动」的缓冲。

### 3. OrderedSet — 唯一 + 插入顺序

`OrderedSet<Element>` 同时提供：

- 像 `Set`：`contains` 均摊 O(1)
- 像 `Array`：按插入顺序遍历、下标访问、`elements` 导出为 `Array`

实现上：**一个 `Array` 存元素 + 一张哈希表存「元素 → 数组下标」**。因此：

- 在**尾部**增删：接近 O(1)
- 在**中间/头部**增删：要挪动数组并更新哈希表，O(n)——与 `Array` 类似，**不像** `Set` 那样任意位置都是 O(1)

适合：标签列表、去重且保序的 ID 流、需要 `OrderedSet` 当 `Array` 用但又怕重复键的业务。

### 4. OrderedDictionary — 保序键值对

`OrderedDictionary<Key, Value>` 在 `Dictionary` 的哈希查找能力上，**保证键值对按插入顺序排列**，并支持按整数下标随机访问（通过 `values` 集合或专用视图）。

注意：为避免「下标到底是 key 还是 index」的歧义，它**不直接** conform `Collection`，而是提供 `elements` 等视图做随机访问。

`keys` 视图类型是 `OrderedSet<Key>`；`values` 是可变的随机访问集合。实现 = `OrderedSet` 管键顺序 + `Array` 平行存值。

适合：JSON 式配置（顺序有意义）、表单字段、按插入顺序展示的缓存键列表。

### 5. BitSet / BitArray — 位压缩

- `BitSet`：非负 `Int` 集合的紧凑表示，类似 `Set<Int>` 但省内存
- `BitArray`：类似 `[Bool]`，每位一个布尔，适合大规模标志位、布隆过滤器底层、位图索引

当元素本质是「整数 ID 或 0/1」且规模大时，优先考虑。

### 6. Heap — min-max 优先级队列

`Heap<Element: Comparable>` 基于**数组实现的 min-max 堆**（Atkinson et al. 1986）：

| 操作 | 复杂度 |
|------|--------|
| `min` / `max` | O(1) |
| `insert` | O(log n) |
| `popMin` / `popMax` | O(log n) |

同一结构里既能快速取**最小**也能取**最大**，适合事件调度、合并 K 路有序流、需要偶尔 peek 两端的算法。`Heap` 本身不是 `Sequence`，避免「遍历顺序」语义混乱；需要无序扫一遍可用 `unordered` 视图。

## 代码示例

### 示例 1：用 Deque 实现浏览历史（后退 / 前进）

```swift
import Collections

struct BrowserHistory {
    private var back: Deque<URL> = []
    private var forward: Deque<URL> = []

  mutating func visit(_ url: URL) {
        back.append(url)
        forward.removeAll()  // 新访问清空前进栈
    }

  mutating func goBack() -> URL? {
        guard back.count > 1 else { return nil }
        let current = back.removeLast()
        forward.append(current)
        return back.last
    }

  mutating func goForward() -> URL? {
        guard let next = forward.popLast() else { return nil }
        back.append(next)
        return next
    }
}
```

若在 `Array` 上频繁 `removeFirst()` / `insert(..., at: 0)`，每次 O(n)；`Deque` 在两端操作是摊还常数时间，滑动窗口和 BFS 同理。

### 示例 2：OrderedDictionary 保持配置项顺序

```swift
import Collections

var settings: OrderedDictionary<String, String> = [
    "theme": "dark",
    "language": "zh-Hans",
    "fontSize": "16",
]

// 哈希查找仍然 O(1)
if settings["theme"] == "dark" {
    settings["accent"] = "blue"  // 新键追加在末尾
}

// 按插入顺序导出给 UI 列表
for (key, value) in settings {
    print("\(key) = \(value)")
}
// theme → language → fontSize → accent

// 需要纯数组 API 时
let keys: OrderedSet<String> = settings.keys
let values: [String] = Array(settings.values)
```

若用 `Dictionary`，`for (k, v) in dict` 的顺序**不保证**跨运行一致；做「设置页」「manifest」类 UI 时，`OrderedDictionary` 省掉自己维护 `keys: [String]` 的胶水代码。

### 示例 3：Heap 驱动简易任务调度

```swift
import Collections

struct Task: Comparable {
    let deadline: Date
    let name: String
    static func < (lhs: Task, rhs: Task) -> Bool { lhs.deadline < rhs.deadline }
}

var queue = Heap([
    Task(deadline: .now + 60, name: "backup"),
    Task(deadline: .now + 5, name: "ping"),
    Task(deadline: .now + 30, name: "sync"),
])

while let urgent = queue.popMin() {
    run(urgent)
}
// 总是先执行 deadline 最早的任务
```

`popMin` 与 `popMax` 让你在同一堆里兼顾「下一个最早」和「下一个最晚」，比手写 `Array` 排序或维护两个堆更省事。

## 与标准库怎么选

```text
需要唯一？ ──否──► Array / Deque
    │
    是
    │
需要稳定顺序？ ──否──► Set / Dictionary
    │
    是
    │
OrderedSet / OrderedDictionary

两端频繁增删？ ──是──► Deque（而不是 Array）

只要优先级？ ──是──► Heap

元素是 Int 集合或 Bool 向量且很密？ ──是──► BitSet / BitArray
```

经验法则：**没有测量就不要过早优化**；先用 `Array` + `Dictionary` 写对逻辑，Profiler 显示热点在容器操作上，再换成 swift-collections 里对应类型。

## 性能与测试文化

仓库自带 **swift-collections-benchmark** 目标，用可复现图表对比 `Array`/`Set`/`Deque` 等在各操作上的吞吐。文档里常见「在 M 系列 MacBook 上 Release 构建测得」一类说明——含义是：**性能特征受实现版本影响**，升级 minor 版本后若容器在热路径上，值得重跑基准。

复杂度上记住几条就够：

- `Deque`：两端 `append`/`pop` 摊还 O(1)；中间插入 O(n)
- `OrderedSet` / `OrderedDictionary`：尾部增删 O(1) 级；中间增删 O(n)；`contains` 均摊 O(1)
- `Heap`：见上表
- `BitSet`：位运算友好的成员与集合操作，具体常数因子看稀疏/稠密

## 常见误区

1. **把 OrderedSet 当成「任意位置 O(1) 的 Set」** — 中间插入仍贵，和数组类似。
2. **以为 OrderedDictionary 下标可以用 Int 直接取键** — 键下标是 `Key`；按下标访问要用文档里的 `elements` 等视图，避免与 `Dictionary` 习惯混淆。
3. **在 Deque 上假设连续内存** — 环形缓冲可能两段不连续，与 `Array.withUnsafeBufferPointer` 一类优化交互时要读文档。
4. **忽略模块粒度** — 只想用 `Deque` 时可 `import DequeModule` 减少编译依赖；应用层 `import Collections` 最省心。

## 生态与相关项目

- **服务端**：[[vapor]]、[[swift-nio]] 生态里的中间件、连接池、缓冲队列常借 Deque 做无锁单线程缓冲。
- **客户端**：列表差分、撤销栈、播放队列（「上一首 / 下一首」）是 Deque 主场。
- **跨语言 CRDT**：[[automerge]] 等有 Swift 绑定；本地优先应用里 Ordered* 类型常和「稳定序列化顺序」一起出现。
- **标准库未来**：swift-collections 中成熟的 API 有机会进入 Swift 标准库；早学可减少日后迁移摩擦。

## 学习路径建议

1. **第一天**：`import Collections`，用 `Deque` 替换一个 `Array` 队列，用 `OrderedDictionary` 做一个有序设置页。
2. **第二天**：读官方 [Deque](https://github.com/apple/swift-collections/blob/main/Documentation/Deque.md)、[OrderedSet](https://github.com/apple/swift-collections/blob/main/Documentation/OrderedSet.md) 文档里的复杂度说明。
3. **第三天**：在热路径用 Instruments 或 benchmark 对比 `Array` vs `Deque`；若做调度器，实现一版 `Heap` 定时器。
4. **进阶**：按需阅读 `HashTreeCollections`（持久化共享）、`BasicContainers`（`UniqueArray` 等非拷贝容器方向）。

## 小结

swift-collections 不是替代标准库，而是 Apple 提供的**官方扩展工具箱**：在保持 Swift 值类型与协议一致的前提下，补齐**双端队列、保序集合/字典、位图、堆**等缺口。零基础记住三句话即可上手：

1. 两头动的队列用 **Deque**。
2. 要唯一或键值对且**顺序有意义**用 **OrderedSet / OrderedDictionary**。
3. 要反复取最小/最大用 **Heap**。

仓库文档齐全、带基准测试，适合作为学习 Swift 集合抽象与工程化容器实现的第一站。

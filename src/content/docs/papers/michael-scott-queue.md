---
title: Michael-Scott Queue — 用 CAS 做高性能并发队列
来源: 'Maged M. Michael, Michael L. Scott, "Simple, Fast, and Practical Non-Blocking and Blocking Concurrent Queue Algorithms", PODC 1996'
日期: 2026-05-29
分类: 操作系统
难度: 中级
---

## 是什么

Michael-Scott Queue 是一个**让很多线程同时安全排队、取号，而且尽量不互相卡住**的 FIFO 队列算法。日常类比：像快递驿站有两个门，前门取件、后门入库；大家只在自己那扇门短暂确认一下，不需要全店暂停。

传统队列最容易写成“一把大锁”：谁要入队或出队，先拿同一把锁。它正确但粗暴，某个线程被操作系统暂停时，其他线程也可能只能等。

这篇论文的主角是一个 lock-free 队列：它用 `CAS`（compare-and-swap）和一个 dummy node，把入队和出队拆到 `Tail` 与 `Head` 两端。只要系统里还有线程在运行，就总有某个操作能继续推进。

论文也给了一个 two-lock 队列：入队拿尾锁，出队拿头锁。它不是无锁，但比单锁队列更细，适合没有通用 CAS 的机器。

## 为什么重要

不理解 Michael-Scott Queue，下面这些事都没法解释：

- 为什么很多运行时、消息队列、线程池会用 “MPSC / MPMC lock-free queue” 作为基础积木
- 为什么“无锁”不是“不需要同步”，而是把等待锁换成不断尝试原子更新
- 为什么 dummy node 能让空队列、单元素队列这些边界情况突然简单很多
- 为什么性能实验要特意测 multiprogramming，因为线程被抢占会放大锁的坏处

## 核心要点

Michael-Scott Queue 可以拆成 **三件事**：

1. **dummy node 让队列永远有一个垫脚石**。类比：电影院排队入口永远放一根栏杆，队伍空不空都先看栏杆后面有没有人。`Head` 指向 dummy，真正的第一个值在 `Head.next`。

2. **入队先接链，再尽量挪 Tail**。类比：快递员先把新箱子扣到货架最后一个箱子后面，再把“最后一个箱子”的牌子往后挪。就算第二步失败，别的线程也能发现并帮忙挪。

3. **出队先读值，再 CAS 挪 Head**。类比：取件员先看清下一个包裹标签，再把入口栏杆往后搬。读值必须发生在 CAS 前，因为 CAS 成功后旧 dummy 可能被释放。

## 实践案例

### 案例 1：单锁队列为什么会拖慢所有人

```ts
class LockedQueue<T> {
  private items: T[] = []
  enqueue(x: T) {
    lock()
    this.items.push(x)
    unlock()
  }
  dequeue(): T | undefined {
    lock()
    const x = this.items.shift()
    unlock()
    return x
  }
}
```

**逐部分解释**：

- `enqueue` 和 `dequeue` 抢同一把锁，入队和出队不能并行
- 如果拿锁线程被抢占，其他线程即使只想操作另一端也会等
- 这就是论文要避开的 blocking 问题：慢线程可以挡住快线程

### 案例 2：MS 队列入队的核心动作

```ts
function enqueue(q, node) {
  node.next = null
  while (true) {
    const tail = q.tail
    const next = tail.next
    if (tail !== q.tail) continue
    if (next === null && CAS(tail, "next", null, node)) break
    if (next !== null) CAS(q, "tail", tail, next)
  }
  CAS(q, "tail", q.tail, node)
}
```

**逐部分解释**：

- `tail` 和 `next` 是一次快照，后面要确认 `tail` 没变
- `CAS(tail, "next", null, node)` 是真正的线性化点：新节点被接入队尾
- 如果发现 `Tail` 落后，线程不会等别人，而是顺手帮队列把 `Tail` 往后推

### 案例 3：出队为什么要先读 value

```ts
function dequeue(q) {
  while (true) {
    const head = q.head
    const tail = q.tail
    const next = head.next
    if (head !== q.head) continue
    if (head === tail && next === null) return undefined
    if (head === tail) CAS(q, "tail", tail, next)
    else {
      const value = next.value
      if (CAS(q, "head", head, next)) return value
    }
  }
}
```

**逐部分解释**：

- `head === tail && next === null` 才是真的空队列
- `head === tail && next !== null` 说明 `Tail` 落后，需要帮忙推进
- `value` 在挪 `Head` 前读，是为了避免旧 dummy 被别的线程回收后再访问悬空内存

## 踩过的坑

1. **把 lock-free 理解成每个线程都能马上完成**：MS Queue 保证系统整体前进，不保证单个倒霉线程不重试。
2. **忘记 dummy node 的角色**：`Head` 指向的是占位节点，不是当前队首值，直接读 `Head.value` 会错。
3. **以为 CAS 成功就不用管 ABA**：同一个地址可能被释放又复用，论文用 pointer + count 降低误判概率。
4. **忽略内存回收**：节点能不能释放不是小细节，尾指针落后或本地变量还拿着指针都会导致悬空引用。

## 适用 vs 不适用场景

**适用**：

- 多生产者、多消费者共享一个 FIFO 队列，且队列操作很频繁
- 线程可能被抢占、停顿、page fault 打断的操作系统或运行时环境
- 机器提供 CAS 或 LL/SC 这类通用原子原语
- 想学习 lock-free 数据结构、linearizability、ABA 问题的最小经典样本

**不适用**：

- 单线程或低并发场景，普通数组队列更简单
- 只支持 test-and-set、没有 CAS 的老硬件，此时 two-lock 版本更现实
- 需要严格 wait-free 保证的实时系统，MS Queue 只保证 lock-free
- 没有安全内存回收方案的语言或运行时，直接照搬会踩悬空指针

## 历史小故事（可跳过）

- **1991-1995 年**：已有多个 concurrent queue，但常见问题是边界条件复杂、内存回收难、或慢线程会挡住别人。
- **1995 年**：Michael 和 Scott 先修正了 Valois lock-free 数据结构的内存管理竞态，意识到“能回收节点”是队列算法的硬问题。
- **1996 年**：两人在 PODC 发表这篇论文，给出 lock-free queue 和 two-lock queue，并在 12 处理器 SGI Challenge 上实测。
- **后来**：这个算法成为教材、运行时和并发库里反复出现的 MPMC queue 基础版本。

## 学到什么

1. **无锁不是无同步**：核心仍然是原子指令，只是失败时重试或帮助推进，而不是睡在锁门口。
2. **正确性要找线性化点**：入队生效在接上 `tail.next`，出队生效在 `Head` 挪到下一个节点。
3. **dummy node 是工程简化器**：它把空队列和单元素队列统一成同一套路径，少掉大量特殊分支。
4. **性能来自减少互相等待**：实验显示在多处理器和多程序混跑时，lock-free 版本比单锁和旧算法更稳。

## 延伸阅读

- 论文 PDF：[Michael & Scott 1996 — Concurrent Queue Algorithms](https://www.cs.rochester.edu/u/scott/papers/1996_PODC_queues.pdf)
- DOI 页面：[ACM PODC 1996 论文记录](https://doi.org/10.1145/248052.248106)
- [[linearizability-1990]] —— 判断并发队列“看起来像顺序执行”的标准
- [[stm-shavit-touitou]] —— 同样用 CAS 和 helping 思路处理非阻塞并发
- [[correction-memory-management-method-lock-free-data-1995]] —— 论文前置背景，专门修补 lock-free 内存回收竞态

## 关联

- [[linearizability-1990]] —— MS Queue 的正确性依赖每个操作能找到一个瞬间生效点
- [[stm-shavit-touitou]] —— 两者都用 CAS 失败后的重试和 helping 换取系统整体前进
- [[herlihy-moss-tm]] —— 从硬件事务内存角度看，MS Queue 是手写原子更新的对照组
- [[io-uring]] —— 都是高性能系统里围绕队列、并发和内核交互做设计
- [[mips-1981]] —— 论文实验用 LL/SC 模拟 CAS，背后依赖 RISC 机器的原子原语
- [[l4-1995]] —— 同属高性能系统论文，强调用真实硬件成本约束抽象设计

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

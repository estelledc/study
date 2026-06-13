---
title: Communicating Sequential Processes — Hoare 1978 零基础学习笔记
来源: https://www.cs.cmu.edu/~crary/819-f09/Hoare78.pdf
日期: 2026-06-13
子分类: 类型与 PL 理论
分类: 编程语言
provenance: pipeline-v3
---

## 日常类比：接力赛里的传棒，不是抢同一块白板

想象一场 **4×100 米接力**。每位选手有自己的跑道和号码布（**局部状态**），**不能**跑到隔壁赛道改别人的成绩。要把接力棒交给下一位，必须 **两人同时伸手在交接区会合**——你举着棒等，对方也得伸手接；任何一方没到，另一方就 **一直等**。棒不会 magically 出现在终点：没有「共享内存里的缓冲区」自动帮你存着。

C. A. R. Hoare 在 1978 年发表于 *Communications of the ACM* 的 [Communicating Sequential Processes](https://www.cs.cmu.edu/~crary/819-f09/Hoare78.pdf)（Vol. 21 No. 8，pp. 666–677，DOI [10.1145/359576.359585](https://dl.acm.org/doi/10.1145/359576.359585)）主张：并发程序也该这样组织——

- **进程（process）** 是只会顺序执行自己指令的「选手」；
- **输入 `?` 与输出 `!`** 是像传棒一样的基本原语；
- **`||` 并行组合** 让多个选手同时跑，但数据只通过 **点名 channel 会合** 流动。

论文把 Dijkstra 的 **守卫命令（guarded command）** 搬进来：`*[ 条件 → 动作 ]` 表示循环，多路 `[]` 表示 **谁先满足条件就先执行谁**——天然支持 **非确定性选择**。于是 coroutine、信号量、monitor、有界缓冲区、甚至筛法求素数，都能用 **极小的语法** 拼出来，而不必先发明锁和条件变量。

一句话：**别抢共享白板；约好名字，在传棒区会合。**

## 这篇论文在说什么

| 维度 | 内容 |
|------|------|
| 作者 | **C. A. R. Hoare**（Queen's University of Belfast） |
| 发表 | CACM，**1978 年 8 月** |
| 页数 | 约 11 页 |
| 关键词 | 并行编程、输入输出、守卫命令、非确定性、coroutine、monitor、条件临界区 |
| CR 分类 | 4.20, 4.22, 4.32 |
| 直接后继 | occam、Ada task、Erlang、**Go**（channel + `select`）、Rust channel、CSP 代数（Brookes–Hoare–Roscoe 1984） |

论文的 **激进主张** 有三条：

1. **I/O 应与赋值、分支同级**，是语言内置原语，而不是 `read()`/`write()` 库函数事后补丁。
2. **并行组合** `||` 应和顺序组合一样基础，用来 **结构化** 并发，而不是 `fork` + 共享变量 + `pthread_mutex` 大杂烩。
3. **同步通信（rendezvous）** 默认 **无缓冲**：发送与接收必须 **同时就绪** 才完成一次传递；延迟对进程 **不可见**（像阻塞在 I/O 上一样自然）。

1978 版 CSP 是 **静态** 语言：进程个数在源码里固定，**没有** 进程值变量和递归进程（后来 1984 理论论文才系统处理递归与失败语义）。但正因为限制多，论文里的例子 **特别干净**，适合零基础建立并发直觉。

## 核心概念

### 1. 进程与并行组合 `||`

一个 CSP 程序由若干 **顺序进程** 组成。语法上，方括号里的进程 **同时开始、并行执行**：

```
[ P || Q || R ]
```

- 每个进程有 **自己的局部变量**，互不可见。
- 并行命令 **成功结束** 当且仅当 **所有** 子进程都结束。
- 语言 **不规定** 各进程相对速度——调度是 **抽象** 的，只保证通信语义。

日常类比：三位选手同时起跑，各自跑自己的圈；全队成绩要等 **最慢的那位** 冲线。

### 2. 输入 `?` 与输出 `!`（会合通信）

若进程 `COPY` 要从 `SOURCE` 读、向 `SINK` 写，论文写法类似：

```
COPY ::
  [ SOURCE?x → SINK!x ]
```

读作：`SOURCE` **输出** 一个值时，`COPY` **输入** 到 `x`，再 **输出** 给 `SINK`。关键规则（论文第 2 节）：

| 规则 | 含义 |
|------|------|
| **双向阻塞** | `A!v` 要等 `B?x`（且 `A` 指 `B`、`B` 指 `A`）配对才完成 |
| **无自动缓冲** | 没有隐式队列；慢的一方会让快的一方 **等着** |
| **延迟不可见** | 被阻塞的进程感觉不到「等了多久」，只感觉像一次普通 I/O |
| **按名连接** | 谁和谁通信由 **进程名** 写死在协议里 |

这就是 **rendezvous（会合）**：传棒区里 **双方同时伸手** 才算一次成功传递。

### 3. 守卫命令与重复构造

Dijkstra 的守卫命令在 CSP 里承担 **条件、循环、非确定性**：

```
< 重复命令 > ::= * [ < 守卫> → < 命令> { [] < 守卫> → < 命令> } ]
< 选择命令 > ::=   [ < 守卫> → < 命令> { [] < 守卫> → < 命令> } ]
```

- `G → S`：仅当守卫 `G` 为真才执行 `S`。
- 多个分支用 `[]` 分隔；若 **多个守卫同时为真**，选哪一个 **未规定**（**非确定性**）——实现可以公平，但 **语义不保证**。
- `*[ ... ]`：重复执行，直到 **所有** 守卫都为假（或输入源终止，见下）。

### 4. 输入守卫（input guard）

CSP 的创新之一：**channel 上有没有人送数据** 本身可以当守卫：

```
[ producer?x → 处理 x
[] consumer!y → 送出 y ]
```

- 仅当 `producer` **已准备好** 对应 `output` 时，第一条可选；
- 若 **多条输入守卫** 同时就绪，**任选一条**（又是非确定性）；
- 在 `*[ ... ]` 里，若某输入守卫的 **源进程已终止**，该守卫永久为假；**所有** 输入守卫的源都终止时，整个重复命令 **结束**。

这让 **有界缓冲区、服务器、多路复用** 不需要显式 `mutex`：「等生产者」和「等消费者」是 **两条守卫**，谁先来服务谁。

### 5. 与共享内存模型的对比

| 维度 | 共享内存 + 锁 | CSP（1978） |
|------|----------------|-------------|
| 数据交换 | 读写同一地址 | 仅 `!` / `?` |
| 同步 | 锁、条件变量、信号量 | 会合本身即同步 |
| 典型 bug | 数据竞争、死锁、忘记解锁 | 协议死锁（环形等待 channel） |
| 组合方式 | 线程 + 全局堆 | 进程网络 + 命名 channel |

Hoare 并非否认 monitor（他自己 1974 年刚发表过 [Monitors](/papers/hoare-monitors-1974)），而是证明：**用通信 + 守卫就能表达 monitor 能表达的一大类结构**，且推理时 **不必追踪整个堆上的别名**。

### 6. 静态进程网络

1978 论文里的程序 **进程名与拓扑在编译期固定**。好处：

- 易于在 **单机上用调度器模拟**，也可映射到 **多处理器 + 物理链路**；
- 便于 **人工验证** 协议（后来发展成 CSP 代数与 model checker FDR）。

代价：不能 `spawn` 任意多个 worker——那是后来 **π-演算（Milner）** 和 **带递归的 CSP** 要解决的问题。

## 代码示例

### 示例 1：COPY — 论文中最小的管道

**CSP 伪代码**（对应论文 copy process）：

```
COPY ::
  *[ SOURCE?x → SINK!x ]
```

**Go 等价实现**（channel 即命名会合点）：

```go
package main

import "fmt"

func copyProcess(source <-chan int, sink chan<- int) {
	for x := range source { // 等价于 * [ source?x → ... ]
		sink <- x            // sink!x；无缓冲时与对端同时就绪才完成
	}
}

func main() {
	source := make(chan int) // 无缓冲 channel ≈ CSP 会合
	sink := make(chan int)
	go func() {
		for _, v := range []int{1, 2, 3} {
			source <- v
		}
		close(source)
	}()
	go copyProcess(source, sink)
	for v := range sink {
		fmt.Println(v)
	}
}
```

要点：`source <- v` 与 `x := range source` 构成 **双向阻塞**；`copyProcess` 里没有锁，只有 **「有输入才转发」** 的协议。

### 示例 2：有界缓冲区 — 用输入守卫代替条件变量

论文用 **一个进程** 持环形缓冲，两个守卫分别服务生产者与消费者（容量 `N`）：

```
BUFFER ::
  [ buf: (0..N-1) integer; in, out: integer;
    in := 0; out := 0;
    *[ in < out + N; producer?buf[in mod N] → in := in + 1
    [] out < in; consumer!buf[out mod N] → out := out + 1
    ]
  ]
```

**Python + 伪同步**（用 `queue.Queue(maxsize=N)` 展示 **背压**：满则生产者阻塞，空则消费者阻塞——语义上接近 CSP 无缓冲会合链，只是标准库在底层用了锁）：

```python
from queue import Queue
from threading import Thread

def producer(q: Queue, items):
    for x in items:
        q.put(x)  # 队列满时阻塞 ≈ consumer 未就绪，producer! 无法完成

def consumer(q: Queue):
    while True:
        x = q.get()  # 队列空时阻塞 ≈ producer 未就绪
        print("got", x)
        q.task_done()

def main():
    q = Queue(maxsize=3)  # N = 3
    Thread(target=producer, args=(q, range(10))).start()
    Thread(target=consumer, args=(q,)).start()

if __name__ == "__main__":
    main()
```

CSP 版本 **没有** `Queue` 对象在进程外：缓冲索引 `in`/`out` 是 **BUFFER 进程的内部变量**，生产者、消费者是 **别的进程**，只通过 `producer?` / `consumer!` 与 BUFFER **会合**。对比可见：CSP 把「队列 + 两个条件变量」压成 **一个事件循环 + 两个输入守卫**。

### 示例 3：守卫选择 — 多路 `select`

论文语法：

```
[ clock?tick → 处理超时
[] worker?job → 处理任务
]
```

**Go 的 `select`** 几乎一一对应（且常用来避免 goroutine 泄漏）：

```go
select {
case <-clock:
    handleTimeout()
case job := <-worker:
    handleJob(job)
}
```

若 `clock` 与 `worker` **同时就绪**，Go **伪随机** 选一个——与 CSP **非确定性** 语义一致：你不能假设公平性，除非自己写额外协议。

## 论文中的经典构造（读懂目录就懂一半历史）

| 构造 | CSP 思路 | 你或许见过 |
|------|----------|------------|
| **Coroutine** | 两个进程互相 `?`/`!` 交替 | Python `yield` 协作（概念相近） |
| **Subroutine** | 调用方 `!` 参数、被调方 `?` 后再 `!` 结果 | 远程过程调用的极简版 |
| **Bounded buffer** | 单进程 + 双输入守卫 | Java `BlockingQueue` |
| **Monitor** | 入口进程 + 内部状态进程 | Java `synchronized` |
| **Sieve of Eratosthenes** | 筛子链：每个素数一个进程，倍数过滤 | Go 并发教程常举 |
| **Conditional critical region** | 用守卫表达「仅当条件成立才进临界区」 | 后来较少直接用，思想进了 monitor |

**筛法** 特别能体现 CSP 风味：每个筛子进程从左边读整数，若通过素数测试就 **向右传递**，否则丢弃；新素数 **spawn 新筛子** 在 1978 静态语法里要预先展开，但 **管道拓扑** 的思想影响深远。

## 实现与语义上要注意的坑

1. **死锁**：进程环 `A! → B? → B! → C? → C! → A?` 若缓冲为零且顺序不对，全体永久阻塞——与死锁四条件类似，但 **只从 channel 协议** 就能分析。
2. **非确定性**：多个就绪守卫时 **不要写依赖调度顺序** 的正确性；需要确定性时加 **额外握手或优先级协议**。
3. **无缓冲的代价**：每次传递都同步，吞吐可能低；工程上常加 **有界缓冲 channel**（Go 带容量 channel、Erlang mailbox 上限）——那是 **实现优化**，1978 语义层仍用会合理解。
4. **与 π-演算的区别**：CSP 早期 **channel 名静态**；π 演算允许 **传递 channel 名本身**，适合移动进程与动态拓扑。
5. **与 Actor 的区别**：Actor 典型是 **异步邮箱**（发完就走）；CSP 默认 **同步会合**（发者等收者）。语义和可推理性都不同。

## 历史影响（为什么 1978 仍值得读）

- **Go**（Rob Pike 等）把 slogan 写在官网上：*Don't communicate by sharing memory; share memory by communicating*——几乎是这篇论文的脚注。
- **occam**（INMOS Transputer）把 CSP 做成 **可运行语言**，`PAR`/`ALT` 关键字影响一代嵌入式并发。
- **Ada task** 的 rendezvous 直接标注受 CSP 启发。
- **Erlang**「进程 + 消息」与 CSP **精神亲缘**（虽异步为主）。
- **CSP/FDR、Promela/SPIN** 等验证工具，把 **进程代数** 用于工业级协议检查。
- **C.A.R. Hoare** 本人因程序设计语言与形式方法的工作获 **1980 年图灵奖**；CSP 是其中 **最常被引用的并发模型之一**。

若你只读过共享内存多线程，读 1978 CSP 会像 **换了一副眼镜**：并发不再是「防止别人踩我的变量」，而是 **设计传棒协议**。

## 延伸阅读

| 资源 | 说明 |
|------|------|
| [Hoare 1978 PDF](https://www.cs.cmu.edu/~crary/819-f09/Hoare78.pdf) | 原文，含完整语法与习题解答 |
| [Brookes, Hoare, Roscoe 1984 — A Theory of CSP](https://dl.acm.org/doi/10.1145/828.833) | 失败集合、递归、隐藏运算符的数学基础 |
| [PRG-14 CSP 教程 (Oxford)](https://www.cs.ox.ac.uk/files/3236/PRG14.pdf) | 逐章对照 Algol 60 的入门讲义 |
| 本库 [CSP 速记](/papers/csp-hoare-1978) | 更短的姊妹篇 |
| 本库 [Monitors Hoare 1974](/papers/hoare-monitors-1974) | 共享内存路线对照 |
| [The Go Programming Language — Concurrency](https://go.dev/blog/codelab-share) | 现代 channel 实践 |

## 自测题

1. 为什么 CSP 说 **无自动缓冲**？若强行加无限缓冲，会合语义会丢什么？
2. 写出两条输入守卫同时就绪时，CSP 允许实现做什么？对程序员意味着什么？
3. 用 `?`/`!` 描述「函数调用」：调用方如何传参、如何拿回返回值？
4. Go 带缓冲 `make(chan int, 10)` 与 1978 CSP 的差别在哪里？仍能用会合直觉理解吗？
5. 有界缓冲区 CSP 版为何不需要 `wait`/`signal`？

---

*学习路径建议：先读本文建立传棒直觉 → 读原文 Section 3–5 看语法 → 用 Go channel 写 COPY 与 worker pool → 再读 1984 理论论文理解 failures/divergence。*

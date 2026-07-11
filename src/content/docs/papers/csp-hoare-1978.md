---
title: CSP — 进程之间只许喊话不许共用内存
来源: 'C.A.R. Hoare, "Communicating Sequential Processes", CACM 1978'
日期: 2026-05-30
分类: compilers-pl
难度: 中级
---

## 是什么

CSP（Communicating Sequential Processes）是 Hoare 在 1978 年提出的一套**并发编程的最小原语**：把程序拆成一堆**独立的顺序进程**，进程之间**绝不共用内存**，只能通过**点对点喊话**来交换数据。

日常类比：两个人在房间两端各坐一桌，桌上各有自己的纸笔（不共用）。要传数据，必须 A 高声喊"嘿 B，我给你一个 5"，B 这时也得正在喊"嘿 A，我等你给"，两人**对上话**才完成一次传递。任何一个人没在喊话，另一个就一直等。

```
A: B!5         (我把 5 发给 B)
B: A?x         (我从 A 读一个值到 x)
```

A 和 B 同时执行到这两行，传输瞬间完成、`x = 5`。这种"必须双方对齐"的传递叫**会合**（rendezvous）。

## 为什么重要

不理解 CSP 这套原语，下面这些事都没法解释：

- 为什么 Go 口号是 "Don't communicate by sharing memory; share memory by communicating"——这是 Rob Pike 等对 CSP 思想的概括，不是 1978 论文原文
- 为什么 goroutine + channel + `select` 看起来又简单又强大——无缓冲 channel 的会合语义直接来自 CSP
- 为什么 Erlang / occam / Ada task / Rust async channel 都长得像兄弟——共同祖宗是这篇论文
- 为什么 Unix `cat | grep | wc` 这种管道能优雅串起来——pipe 是同步传递的退化版

## 核心要点

CSP 的全部秘密压在 **三个原语**里：

1. **进程**：写法 `[P || Q || R]` 表示三个进程并行跑，各自有局部变量，互不可见。类比：三个人在三张独立桌子上各干各的，纸笔不共用。

2. **通信原语 `!` 和 `?`**：`B!x` 意思"把 x 发给进程 B"，`A?y` 意思"从进程 A 读一个值存到 y"。两个原语**双向阻塞**——发的人等收的人，收的人等发的人，对上才放行。类比：传球，没人接你就一直举着球。

3. **守卫选择**：写法 `[ A?x → S1 [] B?y → S2 ]`，意思"哪个 channel 先有人来送数据，就执行哪条分支"。类比：你同时盯着两个门，谁先敲门就开谁的。这套机制在 Go 里就是 `select`。

三件套合起来就足够表达任何并发模式——coroutine、信号量、monitor、流水线，全能拼出来。

## 实践案例

### 案例 1：bounded buffer（容量 10 的队列）

经典生产者-消费者，CSP 写法：

```
buffer :: [
  buf: (0..9) integer; in, out: integer;
  in := 0; out := 0;
  *[ in < out + 10; producer?buf[in mod 10] → in := in + 1
  [] out < in; consumer!buf[out mod 10] → out := out + 1 ]
]
```

逐部分读：`*[ ... ]` 是无限循环，里面是守卫选择。第一条守卫"队列没满 + producer 来送"就收一个；第二条"队列非空 + consumer 来取"就给一个。**没有锁、没有条件变量**——只有"两个 channel 谁先来谁先服务"。

### 案例 2：Go 里的 CSP 直接落地

```go
ch := make(chan int)
go func() { ch <- 5 }()       // 进程 1：发 5
v := <-ch                      // 进程 2：收
fmt.Println(v)                 // 5
```

`ch <- 5` 对应 CSP 的 `B!5`，`<-ch` 对应 `?`。注意：无缓冲 channel 才是 1978 的会合；`make(chan int, N)` 有缓冲后发送方可先返回，已是工程扩展。Go 仍允许共享内存 + 锁，并非纯 CSP。

带守卫选择：

```go
select {
case v := <-chA: handleA(v)
case v := <-chB: handleB(v)
}
```

哪个 channel 先就绪就走哪条，贴近论文 `[ A?x → ... [] B?y → ... ]`。

### 案例 3：素数筛（CSP 经典示范）

每个素数一个过滤进程，整数从 2 灌进流水线：

```
filter(p) :: *[ west?n → [ n mod p ≠ 0 → east!n ] ]
```

读：从左边 `west` 收 n；若不能被 p 整除就发给右边 `east`。串起来：

```
2 → [filter(2)] → 3 → [filter(3)] → 5 → ...
```

**N 个进程并发筛 N 个素数**——论文用它说明"流水线即并发"。

## 踩过的坑

1. **死锁**：A 想发给 B、B 想发给 A，两个都在等对方先动 → 永久卡住。CSP 给了守卫选择缓解，但**没消除**——程序员自己得设计无环依赖。

2. **方向词反着读**：`B!x` 里 B 是接收方，`A?y` 里 A 是发送方——名字写的都是"对面是谁"。新人常写成"我是谁"，编译器不报错但通信对不上。

3. **进程数在编译时固定**：1978 论文里进程是用数组声明的，跑起来后**不能 spawn 新进程**。动态进程是 1985 年的书才加的。Go 的 `go` 关键字相当于补了这个缺。

4. **守卫不允许输出命令**：可以写 `[A?x → ...]` 但**不能**写 `[B!5 → ...]`。原因是匹配会有歧义。"谁先准备好我就发给谁"这种自然写法被禁，得绕路用辅助进程。

## 适用 vs 不适用场景

**适用**：

- 进程边界清晰、通信路径少（pipe / 流水线 / 少量 channel）
- 需要可推理的并发——CSP 代数能做死锁等形式化检查
- 无缓冲会合可接受（延迟换简单语义）；吞吐不够再加有界缓冲（如 Go `chan` 容量 64–1024）

**不适用**：

- 大量共享只读数据（每次 copy 进 channel 太慢）→ 共享内存 + 锁
- 要"发出去就不等"的异步邮箱 → Erlang actor；纯 CSP 是同步会合
- 纳秒级热路径（rendezvous 同步开销大）→ lock-free / SPSC ring buffer
- 进程拓扑频繁动态变化 → 1978 原版不行，用 Go / π-calculus 变种

## 历史小故事（可跳过）

- **1968 年**：Dijkstra 提出信号量（semaphore），第一次给并发一个"原语"。
- **1975 年**：Dijkstra 又提出守卫命令（guarded commands）——"哪个条件成立就走哪条"。
- **1969 年**：Hoare 自己写了 [[hoare-logic]]，给程序正确性一套数学。
- **1978 年**：Hoare 把上面两个想法 + 进程通信揉成 CSP，CACM 论文 12 页。
- **1985 年**：Hoare 出书《Communicating Sequential Processes》，把 CSP 重做成代数（process algebra），能形式化验证。
- **2009 年**：Google 发布 Go，goroutine + channel 把 CSP 1978 翻译成现代语法，让百万开发者用上。

## 学到什么

1. **共享变量不是并发的必要条件**——只用消息传递就够了，且更好推理。
2. **三个原语就够**：进程 + 同步通信 + 守卫选择。复杂模式都是这三件套的组合。
3. **同步 vs 异步是设计选择**：CSP 选同步（rendezvous），换来的是简单语义；actor 选异步，换来的是松耦合。
4. **理论 → 语言 → 工业**这条路很长：1978 论文 → 1983 occam → 2009 Go，30 年才走完一轮。

## 延伸阅读

- 论文 PDF：[Hoare 1978 CACM 原文](https://dl.acm.org/doi/10.1145/359576.359585)（12 页，符号有点古老但读得懂）
- 书：[Communicating Sequential Processes (1985 free PDF)](http://www.usingcsp.com/cspbook.pdf)（代数版完整重写，285 页）
- 视频：[Rob Pike — Concurrency is not Parallelism](https://www.youtube.com/watch?v=oV9rvDllKEg)（Go 设计者讲 CSP 思想，30 分钟）
- [[erlang-otp]] —— actor 模型，CSP 的异步表亲
- [[lamport-1978]] —— 同年的逻辑时钟，分布式系统并发的另一支

## 关联

- [[erlang-otp]] —— Erlang 把 CSP 的同步会合放宽成异步邮箱，但进程隔离思想一致
- [[hoare-logic]] —— 同一个 Hoare 1969 年的另一项贡献，给顺序程序正确性一套数学
- [[dijkstra-goto]] —— Dijkstra 1968 论文，CSP 的守卫选择直接继承自他
- [[lamport-1978]] —— 同年发表，CSP 管单机内进程，Lamport 管跨机器的时序
- [[lambda-calculus]] —— 顺序计算的最简模型，CSP 是"并发版"的同等地位尝试
- [[tcp]] —— TCP socket 收发也是同步阻塞模型，工程化实现 CSP 通信原语

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[boogie-2005]] —— Boogie — 写一次验证后端，多种证明语言复用
- [[clarke-emerson-1981]] —— Clarke-Emerson 1981 — 让机器自己检查并发程序对不对
- [[easycrypt-2011]] —— EasyCrypt — 让密码学家的安全证明能被机器自动检查
- [[hewitt-actor-model]] —— Hewitt Actor 模型 — 把计算拆成一群只会发消息的小邮筒
- [[hoare-csp-1978]] —— Hoare CSP 1978 — 把并发看成会对话的小程序
- [[hoare-logic]] —— Hoare Logic — 把"程序对不对"变成"数学证明对不对"
- [[hoare-monitors-1974]] —— Hoare Monitors 1974 — 把锁和等待队列封进一个房间
- [[holzmann-spin-1997]] —— SPIN — 让计算机帮你穷举并发程序的所有可能执行
- [[milner-pi-calculus]] —— π-演算 — 让通道名本身能在通道里流动
- [[monitors-1974]] —— Hoare Monitors 1974 — 把锁藏进对象里，让并发代码读起来像普通函数
- [[multics-1965]] —— MULTICS 1965 — 把计算机做成像电力一样的公共服务
- [[pnueli-temporal-1977]] —— Pnueli 时序逻辑 — 给"永远不死锁""请求最终被响应"找一套数学语言
- [[stm-shavit-touitou]] —— STM Shavit-Touitou — 把"加锁"改成"事务"的源头
- [[unix-1974]] —— UNIX 1974 — 用极小内核做出能用的分时系统
- [[vcc-2009]] —— VCC — 给并发 C 加注解，让 SMT 自动证它对
- [[freertos]] —— FreeRTOS-Kernel — KB 级 RAM 跑得动的可抢占多任务内核

---
title: π-演算 — 让通道名本身能在通道里流动
来源: Milner, Parrow, Walker, "A Calculus of Mobile Processes I+II", Information and Computation 1992
日期: 2026-05-30
分类: 编程语言
难度: 中级
---

## 是什么

**π-演算**（pi-calculus）是一套**描述并发进程怎么通信**的极小数学语言，特点是**通道名本身可以作为消息被传递**。日常类比：以前的并发模型像**有线电话总机**——A 和 B 要通话必须先把线接好；π-演算像**手机号短信**——你可以把别人的号码发给第三个人，对方拿到号就能立刻拨过去。

最小例子（伪代码）：

```
A: 通过通道 c 发送通道名 d 给 B
B: 从通道 c 收到一个名字（叫它 x），然后用 x 给 C 发消息
```

B 收到的"x"现在指向 d——**新的通信关系凭空出现**。这就是 mobility（移动性），也是 π-演算的灵魂。

这套理论是 Erlang/Actor 形式化、session types、安全协议验证（spi-calculus）的共同祖先。

## 为什么重要

不理解 π-演算，下面这些事都讲不清：

- 为什么 Erlang `Pid ! Msg` 能把一个进程 ID 发给另一个进程，对方就能"插队"通信——这就是 mobility
- 为什么 OAuth / TLS 这类协议能被"机器证明安全"——spi-calculus 在 π 上加密码原语
- 为什么 Go channel、Erlang/Akka actor 看起来不一样，但形式化分析时常落到同一套“通道/名字传递”理论
- 为什么 1992 年的纯数学论文，30 年后还在影响微服务、区块链智能合约的并发模型

## 核心要点

π-演算的语法只有 **6 条**（极简）。先把符号当日常物件看：

- `x(y).P`：在信箱 x **收**一个名字，装进变量 y，再继续做 P（像等人把手机号发你）。
- `x̄y.P`：顶杠表示**发**——在信箱 x 上把名字 y 寄出去，再做 P。
- `(νx)P`：ν 读作“new”——**新建一个外人不知道的私有号码** x，只在 P 里能用（像临时小号）。
- `!P`：不是 while 循环，而是**同时复印无穷多份 P 并行跑**（像开无穷个相同窗口）。

```
P ::= 0              (什么都不做)
   | x(y).P          (从通道 x 收一个名字，存到 y，再做 P)
   | x̄y.P            (在通道 x 上发名字 y，再做 P)
   | P | Q           (P 和 Q 并发执行)
   | (νx)P           (创建私有新名字 x，只在 P 里可见)
   | !P              (无限多份 P 同时跑)
```

最关键一条 **reduction 规则**（"通信发生时世界怎么变"）：

```
x̄y.P  |  x(z).Q   →   P  |  Q[y/z]
（左边发 y，右边收成 z；通信后右边把 Q 里所有 z 替换成 y）
```

注意"`Q[y/z]`"——这就是 mobility：右边接下来用的不是抽象的 z，而是**真的 y 这个名字**。如果 y 本身是个通道，右边马上能通过 y 跟别人讲话。

互模拟（bisimulation）：两个进程"行为等价"的判定标准——不是 trace 一样，而是**每一步对方都能跟得上**。后面会讲为什么这条比 trace 严。
## 实践案例

### 案例 1：用 π-演算建模 HTTP 重定向

```
Server = c(req).c̄ d.0      // 在 c 上收请求，把新地址 d 发回去
Client = c̄ req.c(addr).addr̄ data.0  // 发请求、收新地址、用新地址发数据
NewHost = d(data).0
```

**逐部分解释**：

- 第一次通信：Client 在 c 上发 `req`，Server 把新通道 `d` 通过 c 发回去
- 第二次通信：Client 拿着收到的 `addr`（其实就是 d），用 `addr̄ data` 发数据——**通信目标在运行时变了**
- 这种"通道名作为值传递"在 CSP / CCS 里写不出来

### 案例 2：bisimulation 比 trace 严在哪

考虑两个进程：

```
P = a.(b + c)       // 先做 a，再选 b 或 c
Q = a.b + a.c       // 先选支线 1（a 后做 b）或支线 2（a 后做 c）
```

**trace 看**：两边都能产生 `a→b` 或 `a→c`，**trace 集合相同**。
**bisimulation 看**：P 做完 a 后**还能选** b 或 c；Q 做完 a 后**已经定了**走哪边。这两个进程对外部观察者其实**不等价**——bisimulation 拒绝把它们认作相等。这一区别在分析死锁、安全协议时是关键。

### 案例 3：Erlang `spawn + !` 的 π-演算视角

```erlang
Pid = spawn(fun() -> loop() end),
Pid ! {get, self()}
```

翻译成 π：

- `spawn` ≈ `(νp)(! p(req).Body)`——创建私有通道 p 给一个无限响应进程
- `Pid ! Msg` ≈ `p̄ msg.0`——在 p 上发消息

**注意**：Erlang mailbox 是**异步**的（发了就走），π 默认是**同步 rendezvous**（双方必须同时在）。完全建模 Erlang 要用 asynchronous π-calculus（Honda-Tokoro 1991）。

## 踩过的坑

1. **把 π-演算当 CSP 加强版**——CSP 通道是静态命名的，名字写在源码里；π 通道是**值**，可以被发送、接收、私有化（ν），整个连接图运行时不断变。这两个哲学完全不同。

2. **bisimulation ≠ trace 等价**——上面案例 2 的反例。新人常用 trace 论证两进程"一样"，被审稿人打回。

3. **`!P` 不是 while 循环**——`!P` 展开是 `P | !P | !P | ...` 无穷多份**并行**副本。想表达"循环 do-while"得用递归名字 + 通道触发，不能直接 `!P`。

4. **scope extrusion 容易写错**：私有名 `(νx)P` 在 P 里发出去后，"私有"边界会**外推**——`(νx)(x̄y.0 | Q) | R`，如果 Q 把 x 发给 R，作用域要重写为 `(νx)((...) | R)`。新人手算 reduction 时忘记重写边界，得出错误结论。

## 适用 vs 不适用场景

**适用**：
- 形式化验证有动态拓扑的并发协议（OAuth / TLS handshake / Raft 的 leader change）
- 给 Erlang / Akka / Go channel 做语义参考——尤其是分析"通道句柄被发送"这种场景
- 类型系统研究：session types / linear types 直接以 π 为底
- 安全协议验证（spi-calculus / applied π-calculus 是 ProVerif 的基础）

**不适用**：
- 工程师每天写并发代码——π 太底层，写出来的 spec 比代码还长
- 表达共享内存并发（lock / atomic）——π 是消息传递哲学，共享内存得另请高明（[[hoare-logic]] 系列）
- 实时系统时序约束——π 没"时间"概念，要用 timed π / process algebras with time

## 历史小故事（可跳过）

- **1980 年**：Robin Milner 在爱丁堡写 CCS（Calculus of Communicating Systems），代数化版的 [[csp-hoare-1978]]，但通信拓扑静态。
- **1989 年**：Engberg-Nielsen 提出 ECCS 引入名字传递的雏形，证明可行但不够干净。
- **1992 年**：Milner、Parrow、Walker 把这思路打磨成两篇 Information and Computation 论文（Part I 给语法语义，Part II 给互模拟代数）。
- **1991 年**：Milner 已因 LCF / ML / CCS 拿图灵奖；π-演算是他后期代表作，影响延续到 session types（Honda 1993）、ambient calculus（Cardelli-Gordon 1998）、ProVerif（Blanchet 2001）。

之后 30 年，所有"通道是值"的并发理论都是 π 的徒孙。

## 学到什么

1. **mobility 是分布式系统的本质**——能不能把"和谁通话"这个关系作为一等值传递，决定了系统能不能在运行时重组拓扑
2. **6 条语法规则可以编码 lambda-演算**——意味着 π 的并发足够强大，能模拟函数式计算（[[lambda-calculus]] 是它的子集表达力）
3. **bisimulation 给了"等价"一个对称的、可机器判定的定义**——比 trace 严，是后续并发等价理论的基石
4. **理论 → 工具链 → 工业** 隔了 20 年：1992 论文 → 2001 ProVerif → 2010s OAuth / TLS 形式化验证

## 延伸阅读

- 入门视频：[Robin Milner — Pi Calculus](https://www.youtube.com/results?search_query=pi+calculus+milner)（爱丁堡课程录像，从 CCS 讲到 π）
- 论文 PDF：[Milner-Parrow-Walker 1992 Part I](https://homepages.inf.ed.ac.uk/wadler/papers/papers-we-love/milner-parrow-walker-mobile-processes-i.pdf)
- 教材：Davide Sangiorgi & David Walker, *The π-Calculus: A Theory of Mobile Processes*（剑桥大学出版社，π 圣经）
- 工具：[ProVerif](https://bblanche.gitlabpages.inria.fr/proverif/) — 基于 applied π-calculus 的协议验证器
- [[csp-hoare-1978]] —— π 的兄长，静态通道版
- [[lambda-calculus]] —— π 能编码它，证明并发 ≥ 函数计算

## 关联

- [[csp-hoare-1978]] —— Hoare CSP，π 的直接前身（同步通信 + 静态通道）
- [[lambda-calculus]] —— π 能编码 λ，函数式与并发统一
- [[erlang-otp]] —— Erlang 进程模型 ≈ asynchronous π-calculus
- [[hindley-milner]] —— Milner 的另一杰作，类型推导（π 是他的并发面）
- [[standard-ml]] —— Milner 设计的 ML 是 LCF 的元语言，与 π 同根
- [[linear-types]] —— 线性 π-演算用线性类型保证通道资源不被复用
- [[plotkin-sos]] —— π 的语义就是用 Plotkin 的 SOS 风格写的
- [[lamport-1978]] —— 分布式因果序与 π 的 reduction 序对照
- [[hoare-logic]] —— 共享内存并发的另一极，与 π 的消息哲学互补

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[cryptoverif-2008]] —— CryptoVerif — 让计算机直接证密码协议在真实计算模型下安全
- [[hewitt-actor-model]] —— Hewitt Actor 模型 — 把计算拆成一群只会发消息的小邮筒
- [[hoare-csp-1978]] —— Hoare CSP 1978 — 把并发看成会对话的小程序
- [[holzmann-spin-1997]] —— SPIN — 让计算机帮你穷举并发程序的所有可能执行
- [[stm-shavit-touitou]] —— STM Shavit-Touitou — 把"加锁"改成"事务"的源头
- [[ejabberd]] —— ejabberd — Erlang 写的电信级 XMPP/MQTT 多协议服务器

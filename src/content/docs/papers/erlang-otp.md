---
title: Erlang OTP — 容错并发系统设计
来源: 'Joe Armstrong, "Making Reliable Distributed Systems in the Presence of Software Errors", PhD thesis 2003'
日期: 2026-05-29
分类: 编程语言 / 分布式系统
难度: 中级
---

## 是什么

Erlang/OTP 是 Joe Armstrong 1980 年代在爱立信发明的一套**用 actor 模型 + supervisor 树构建电话交换机软件**的语言-运行时-标准库三件套。

日常类比：像一家大型公司的团队建制——

- 每个员工（process）只做一件事，不和别人共用桌子（独立内存）
- 同事之间靠发邮件沟通（message passing），不互相借笔记本
- 出错了有直属经理（supervisor）救场，经理自己挂了还有总监接住

你写：

```erlang
spawn(fun() ->
  receive
    {hello, From} -> From ! world
  end
end).
```

一行 `spawn` 创建一个轻量进程，几百字节内存、几微秒开销，单台机器上可以跑几百万个。每个进程崩溃了别人不受影响——这是 BEAM 虚拟机在底层强制保证的。

这套思想驱动了 WhatsApp（单机 200 万连接）、Discord、RabbitMQ、爱立信电话交换机背后整张网。

## 为什么重要

不理解 Erlang/OTP，下面几件事都没法解释：

- **9 个 9 可靠性怎么来的**：电话交换机 99.9999999% 可用 = 一年宕机不到 31 毫秒；不是靠某段超神代码，是靠"让崩溃成为日常 + 系统自动恢复"
- **actor 模型为什么能活下来**：[[smalltalk-80]] 是面向对象的起源，Erlang 是 actor 模型的工业起源；后来的 Akka / Elixir / Pony 都在抄它
- **"Let it crash" 哲学**：传统编程教你 try/catch 防御一切错误；Erlang 反过来——别防御，崩了就重启，从已知干净状态开始
- **WhatsApp 56 个工程师服务 9 亿用户**：靠的不是巧合，是 Erlang 把"高并发 + 容错"做成了语言原生能力

## 核心要点

Erlang/OTP 的工程哲学落在 **3 件事**上：

1. **Process（进程）= 独立小宇宙**：每个进程有自己的 heap、stack、mailbox，**不与任何人共享内存**。创建一个进程 ≈ 几百字节 + 几微秒，比 OS 线程便宜约 1000 倍。单 BEAM VM 跑百万级进程没问题。

2. **Message passing（消息传递）= 写邮件不是共用桌子**：进程间唯一交互方式是异步消息。发的人不等收的人处理完，收的人在 `receive` 时按模式匹配取消息。**没有锁、没有共享变量、没有原子操作**。

3. **Supervisor tree（监督树）= 公司层级救场**：把进程组织成树形结构，非叶子节点是 supervisor，叶子是 worker。worker 崩了 supervisor 按预设策略重启它——只重启它 / 重启所有兄弟 / 重启它和它后面启动的兄弟。

三件事加起来就是 **"Let it crash"**：与其在每个 worker 里写防御代码兜底，不如让它崩，让 supervisor 把它重启到初始状态——干净、可信、一定能跑。

## 实践案例

### 案例 1：最简 Erlang 进程

```erlang
loop() ->
  receive
    {hello, From} -> From ! world, loop();
    stop -> ok
  end.

Pid = spawn(fun loop/0).
Pid ! {hello, self()}.        %% 发消息
receive world -> done end.    %% 收回应
```

读懂要点：

- `spawn` 创建一个独立进程跑 `loop/0`
- `receive ... end` 阻塞等消息，按模式匹配处理不同消息
- `Pid ! Msg` 把 Msg 异步塞进 Pid 的 mailbox，发送方不阻塞
- 处理完一条消息递归调用 `loop()` 继续等下一条

整个过程**没有锁也没有共享内存**。

### 案例 2：Supervisor 兜住 worker 崩溃

```erlang
init([]) ->
  SupFlags = #{strategy => one_for_one, intensity => 5, period => 60},
  Worker = #{id => counter,
             start => {counter, start_link, []},
             restart => permanent},
  {ok, {SupFlags, [Worker]}}.
```

读懂要点：

- `one_for_one` = 单个 worker 崩只重启它，兄弟不动
- `intensity=5, period=60` = 60 秒内最多重启 5 次；超过这个频率 supervisor 自己也死，由它的上级处理
- `restart => permanent` = 这个 worker 一定要活着，崩了无条件重启

工程意义：counter 进程**任何**异常崩溃都会在毫秒内被拉起来，状态回到初始值。代价是丢失 counter 的内存状态，收益是整个系统不会因为一个 bug 死掉。

### 案例 3：热代码替换（不停机升级）

```erlang
%% 旧版 counter.erl
handle_call(get, _, State) -> {reply, State, State}.

%% 改代码 → 编译 → c(counter).
%% 运行中的进程下次远程调用时自动跳到新版逻辑

%% 新版 counter.erl
handle_call(get, _, State) -> {reply, {value, State}, State}.
```

电话交换机绝不能停机（一停 = 整个城市电话中断），所以 Erlang VM 原生支持运行时替换模块。Java 的 hot reload 只能改方法体，Node 的 nodemon 是重启不是 reload——只有 Erlang BEAM 把"不停机升级"做到语言级。

## 踩过的坑

1. **process 不是 OS 进程**：很多人第一次写 Erlang 误以为 spawn 创建的是操作系统进程，每个几 MB 内存。其实是 BEAM 虚拟机内部的轻量调度单元，几百字节，可以创建百万个。

2. **mailbox 会无限增长**：发送是异步非阻塞，如果生产者快于消费者，mailbox 会撑爆 BEAM 的 heap → OOM。生产实战要给 mailbox 加水位监控或用 backpressure。

3. **Let it crash ≠ 不写错误处理**：业务边界上仍要校验输入、记录日志，**只是 worker 内部**不写防御性 try/catch。让"已知错误"变成正常返回，让"未知错误"直接崩。

4. **supervisor 重启策略选错代价高**：把 `one_for_one` 写成 `one_for_all`，一个无关 worker 崩会把全部兄弟拉下水；策略选错比不写 supervisor 还糟糕。

## 适用 vs 不适用场景

**适用**：

- 高并发网络服务（IM / 推送 / WebSocket / 游戏服务器）
- 高可用分布式系统（电信交换机 / 支付网关 / 金融交易）
- 软实时系统（监控 / 告警 / 实时数据管道）

**不适用**：

- CPU 密集计算（数值 / 机器学习）—— BEAM 解释执行慢，比 NumPy 慢 10-100 倍
- 硬实时（飞控 / 自动驾驶）—— 虽然 GC 是 per-process 但仍然存在不可控暂停
- 单机 CLI 工具 / 数据脚本 —— actor 隔离的好处用不上，启动开销不划算
- GPU 计算 / 深度学习训练 —— 生态远落后 PyTorch / JAX

## 历史小故事（可跳过）

- **1986 年**：Joe Armstrong 在爱立信和 Robert Virding、Mike Williams 启动 Erlang 项目，目标是找一种"比 Prolog 适合电信的语言"
- **1991 年**：Erlang 在爱立信内部首次产品化，跑在电话交换机上
- **1998 年**：Erlang 开源（OTP R1），业界开始关注
- **2003 年**：Joe Armstrong 在 KTH 提交博士论文，把 17 年实战提炼成 295 页理论
- **2007 年**：Joe 出版《Programming Erlang》，把 Erlang 带到 Web 工程师视野
- **2011 年**：[[elixir]] 0.1 发布，José Valim 在 BEAM 上做 Ruby 风格语法 + 现代生态
- **2019 年**：Joe Armstrong 去世（68 岁），社区一片悼念；Phoenix LiveView / WhatsApp 继续把 Erlang 思想推进

## 学到什么

1. **崩溃是构造性而不是希望性**：传统 try/catch 修复腐蚀状态是"希望"修对了；let it crash 重启到初始状态是"保证"干净——区别是工程可证 vs 不可证
2. **隔离是底层强制不是规范约束**：BEAM 在 VM 层给每个进程独立 heap，崩溃影响不可能传播；这种保证靠语言或库做不到，必须在运行时层面做
3. **可靠性来自简单组合**：进程隔离 + 消息传递 + supervisor 重启 = 9 个 9——三件事都不复杂，组合起来威力惊人
4. **30 年实战 → 1 篇博士论文**：Erlang 1986 开始用，2003 年 Armstrong 才把它写成博士论文。理论是工程的事后总结，不是工程的起点

## 延伸阅读

- 演讲：[Joe Armstrong — The Mess We're In](https://www.youtube.com/watch?v=lKXe3HUG2l4)（30 分钟，Erlang 哲学的最佳入门）
- 入门书：Joe Armstrong《Programming Erlang》（含 actor / OTP / 部署，250 页）
- 进阶书：Cesarini & Vinoski《Designing for Scalability with Erlang/OTP》（OTP 设计模式深度，450 页）
- 在线教材：[Learn You Some Erlang for Great Good!](https://learnyousomeerlang.com/)（免费，从语法到 OTP 全覆盖）
- [[smalltalk-80]] —— 面向对象的起源，与 Erlang 同代但走了完全不同的路
- [[elixir]] —— Erlang VM 上的现代化语法，让 Erlang 思想进入 Web 时代

## 关联

- [[smalltalk-80]] —— 同代不同路：Smalltalk 把消息传递做成"对象内部方法调用"，Erlang 把消息传递做成"独立进程异步通信"
- [[elixir]] —— 跑在同一个 BEAM VM 上，actor / supervisor 全套继承；区别只在语法和生态
- [[lambda-calculus]] —— Erlang 是函数式语言（不可变值、模式匹配、高阶函数），底层范式来自 λ
- [[hindley-milner]] —— Erlang 选了"动态类型 + 模式匹配"路线而不是 HM；这是它和 OCaml/Haskell 的根本分歧

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[actix-web]] —— Actix Web — Rust 上长期占据 TechEmpower 榜首的 web 框架
- [[cheney-gc]] —— Cheney 1970 — 把活对象复制走，原地丢弃整片堆
- [[couchdb]] —— Apache CouchDB — Erlang 写的文档数据库
- [[csp-hoare-1978]] —— CSP — 进程之间只许喊话不许共用内存
- [[ejabberd]] —— ejabberd — Erlang 写的电信级 XMPP/MQTT 多协议服务器
- [[emqx]] —— EMQX — 单集群千万连接的 MQTT 物联网消息总线
- [[freertos]] —— FreeRTOS-Kernel — KB 级 RAM 跑得动的可抢占多任务内核
- [[hewitt-actor-model]] —— Hewitt Actor 模型 — 把计算拆成一群只会发消息的小邮筒
- [[hindley-milner]] —— Hindley-Milner — 编译器自己猜变量类型
- [[lambda-calculus]] —— λ-演算 — 用三条规则表达所有可计算函数
- [[milner-pi-calculus]] —— π-演算 — 让通道名本身能在通道里流动
- [[orleans]] —— Orleans — 让分布式服务写起来像单机对象
- [[phoenix]] —— Phoenix — Elixir/OTP 上的实时 web 框架
- [[rabbitmq-server]] —— RabbitMQ — 用 Erlang 写的多协议消息总线
- [[robyn]] —— Robyn — Rust 内核驱动的 Python 高性能 Web 框架
- [[smalltalk-80]] —— Smalltalk-80
- [[xstate]] —— XState — 把状态画成图，让矛盾写不出来


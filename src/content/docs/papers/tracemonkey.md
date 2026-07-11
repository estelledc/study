---
title: TraceMonkey — 只编"真的走过的那一条路"
来源: Gal et al., "Trace-based Just-in-Time Type Specialization for Dynamic Languages", PLDI 2009
日期: 2026-05-30
分类: 编译器与程序设计语言
难度: 中级
---

## 是什么

TraceMonkey 是 Mozilla 2009 年给 Firefox 3.5 做的 JavaScript JIT。它的思路和当时主流 JIT 完全相反：

- 主流（Java HotSpot）：把**整个方法**编译成原生码
- TraceMonkey：只录**实际跑过的那一条直线指令序列**编译成原生码

日常类比：你在大型超市买东西，传统 JIT 像是"先把整张地图所有过道都铺成快车道"；TraceMonkey 是"看你这次走的是哪一条路径，把这条路径铺平就行，其它过道仍然走原路"。

这条被录下来的直线路径叫一条 **trace**。如果某个 for 循环每次都走相同分支，解释器先跑几圈确认"这条路真热"，再录成 trace；之后每圈都直接跑原生码。

为什么对动态语言（JavaScript / Lua / Python）特别有效？因为这些语言里同一个变量 `x` 既可能是整数也可能是字符串，静态看不出来。但**运行时实际看一圈**就能确认"这个循环里 x 一直是整数"，于是按整数生成机器码。

## 为什么重要

不理解 trace JIT，下面这些问题就讲不清：

- 为什么 Firefox 3.5 发布时被吹成"JS 提速 30 倍"，但几年后 Mozilla 自己又把它换掉了
- 为什么 LuaJIT 2.0 在 2026 年仍是跑得最快的 Lua 实现，靠的就是这套思路
- 为什么 PyPy 不直接给 Python 写 JIT，而是给"解释器"加 trace JIT，所有用它的语言一起加速
- 为什么 V8 / 现代 SpiderMonkey 选择**回到方法 JIT**，trace 路线在 JS 上没赢到底

## 核心要点

TraceMonkey 把"动态语言慢"的问题拆成两个观察：

1. **绝大多数时间花在循环里**（80/20 法则），所以**只优化循环**就够了
2. **循环里的类型其实是稳定的**，只是静态推不出来——那就**运行时观测一次**

基于这两点，整套机制是：

1. **解释执行 + 计数**：每条**回边**（循环末尾跳回开头的那一跳）经过几次就累计计数——像超市入口的客流计数器
2. **触发录制**：某个回边热度超过阈值（比如连续几圈），开始录这条循环里实际执行的指令序列
3. **特化编译**：录制时记下每个变量的具体类型，按这个类型生成原生码；每个类型假设都插一个 **guard**（运行时检查）。生成码里常先 **unbox**（拆开 JS 包装取出裸整数）再算
4. **执行 trace**：下次走到这个循环头，直接跳进原生码跑
5. **side exit**：guard 失败（比如 `x` 突然是字符串），从这条 trace 退出回到解释器
6. **trace tree**：同一个循环头如果有多种走法，每种走法各成一条 trace，挂成一棵树

整套关键词：**热点循环 + 录制 trace + 类型特化 + guard 守护 + side exit 退出**。

## 实践案例

### 案例 1：trace 录的到底是什么

JavaScript 源码：

```js
function sum(n) {
  let s = 0
  for (let i = 0; i < n; i++) s += i
  return s
}
```

第一次调用 `sum(1000000)`，解释器跑了几圈后开始录 trace。录到的不是 JS 源码，是**这一圈实际执行的指令序列**，大致像：

```
guard(typeof i === 'int32')      // 类型守护：不是 int32 就退出
guard(typeof s === 'int32')
i_int = unbox(i)                 // 拆开包装，取出裸整数
s_int = unbox(s)
s_int = s_int + i_int            // 直接整数加法，不再反复装箱
i_int = i_int + 1
guard(i_int < n_int)             // 循环条件守护
goto loop_head
```

每个 `guard` 不通过就 side exit 回解释器。如果 100 万圈都通过，**整个循环就只跑原生整数加法**，比解释器快 10-100 倍。

### 案例 2：guard 失败时发生什么

```js
function process(arr) {
  let total = 0
  for (let x of arr) total += x   // 录成 trace 时假设 x 是 int32
  return total
}
process([1, 2, 3, "hello"])       // 第 4 个元素是字符串
```

走到 `"hello"` 时，`guard(typeof x === 'int32')` 失败，**side exit**：

1. 把寄存器里的 `total_int` **box** 回 JS 值（重新包上类型标签）
2. 跳回解释器栈帧，把 **PC**（解释器"下一步读哪条指令"的指针）设到对应字节码
3. 解释器接着跑，处理字符串相加（变成 `"6hello"`）

side exit 不是免费的——它要还原寄存器、重建栈帧。如果一条 trace 频繁 side exit，TraceMonkey 会把它**加入黑名单**（blacklist）不再录制，因为录了反而更慢。

### 案例 3：trace tree 怎么长

```js
for (let i = 0; i < n; i++) {
  if (i % 2 === 0) doA(i)
  else doB(i)
}
```

第一条 trace 录到偶数分支 `doA`，第二圈 `i=1` 走 else，guard 失败 side exit。如果这条侧路也热，就把 else 录成第二条 trace，挂在第一条的 side exit 下，形成 **trace tree**：

```
loop_head
├─ even → doA → 回 loop_head
└─ odd  → doB → 回 loop_head   // 挂在 even 的 side exit 下
```

分支扇出一大，树会爆炸——这是后来被替代的重要原因。

## 踩过的坑

1. **把 trace 当 method 的子集来想**：错。method 是程序静态结构，trace 是程序动态执行。同一个 method 可能产生很多条 trace，反过来一条 trace 也可能跨多个 method（inline）。

2. **以为 type specialization == 静态类型推导**：完全不同。HM/TypeScript 是看代码推；trace JIT 是**先跑一遍看实际值**再特化。前者编译期，后者运行时。

3. **以为 guard 和 if 一样便宜**：错。`if` 是普通分支，CPU 分支预测器友好；`guard` 失败要做完整状态还原（解释器栈帧重建），代价 100+ 周期。设计 trace 时核心目标就是**让 guard 极少失败**。

4. **以为 trace JIT 全面优于 method JIT**：现代 V8 / SpiderMonkey 都用 method JIT + 类型反馈。trace 在分支密集的真实业务代码上不稳；Firefox 先经 JaegerMonkey，再由 IonMonkey 取代 TraceMonkey。

## 适用 vs 不适用场景

**适用**：

- 数值循环密集、分支少、类型稳定：游戏脚本、科学计算、DSL 解释器——这时 guard 几乎不失败，加速最明显
- Lua（LuaJIT 至今最快 Lua）、嵌入式 JS、配置脚本
- 需要"用解释器写、自动得 JIT" 的场景（PyPy meta-tracing）

**不适用**：

- 分支扇出大或类型常变的业务逻辑（前端框架、ORM）— side exit / blacklist 会吃掉加速，trace tree 也易爆炸
- 已经静态类型的语言（Java / C#）— 没有 unbox 红利，方法 JIT 更稳
- 深层多态调用（OOP 重的代码）— 每个 receiver type 一条 trace，难合并

## 历史小故事（可跳过）

- **约 1996 年起 / 2000 年论文**：HP 实验室 Dynamo 证明可在二进制层面录 trace 做优化
- **2006 年**：Andreas Gal 博士论文 HotpathVM 把 trace 思路搬到嵌入式 Java
- **2009 年**：Gal 加入 Mozilla，做成 TraceMonkey，集成到 Firefox 3.5（PLDI 2009）
- **2010 年**：LuaJIT 2.0（Mike Pall）把 trace JIT 推到极致，性能逼近 C
- **2010–2013**：Firefox 4 先上 JaegerMonkey（方法 JIT），再由 IonMonkey 完全取代 TraceMonkey；2013 年 trace 路径下线
- **2014 年起**：PyPy 把"meta-tracing"（不录用户程序，录解释器）发展成完整体系

## 学到什么

1. **静态看不出来，那就动态看一眼**——这是 trace JIT 最朴素也最深刻的洞见
2. **优化要顺着 80/20**：循环占 80% 时间，那就只优化循环；guard 必须便宜，不便宜就别守
3. **没有银弹**：trace 在数值循环上赢，在分支业务代码上输；技术选型要看实际负载形状
4. **失败的方案也是历史**：TraceMonkey 在 JS 上输了，但思想被 LuaJIT / PyPy 接住，反而比赢家活得久

## 延伸阅读

- 论文 PDF：[Gal et al. PLDI 2009](https://dl.acm.org/doi/10.1145/1542476.1542528)（约 12 页，前 4 页是动机和概念，足够入门）
- LuaJIT 作者 Mike Pall 写的 [LuaJIT 2.0 Wiki](http://wiki.luajit.org/Optimizations)（生产级 trace JIT 的工程细节）
- 视频：[Andreas Gal 的 PLDI 2009 演讲](https://www.youtube.com/results?search_query=tracemonkey+pldi+2009)
- [[pypy-tracing-jit]] —— meta-tracing：把 trace JIT 推广到"任意解释器"
- [[hotspot-server-compiler]] —— 方法 JIT 的代表，与 TraceMonkey 路线相反
- [[graalvm-truffle]] —— 第三条路：partial evaluation 把解释器特化为 JIT

## 关联

- [[hotspot-server-compiler]] —— 方法级 JIT，对照组
- [[pypy-tracing-jit]] —— 直接接班的 meta-tracing 体系
- [[graalvm-truffle]] —— partial evaluation 路线，思路相邻但起点不同
- [[self-pic]] —— 早于 TraceMonkey 的动态类型加速方案（内联缓存）
- [[strongtalk]] —— 早期给 Smalltalk 做类型反馈的尝试
- [[hindley-milner]] —— 静态类型推导，与 trace JIT 的"动态观测"形成对照

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[branch-prediction-yeh-patt-1991]] —— Yeh-Patt 1991 — 用最近 12 条分支的历史给 CPU 算命
- [[tomasulo-1967]] —— Tomasulo 算法 — 让 CPU 自己决定指令的执行顺序
